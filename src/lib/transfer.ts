import { computeSha256Hex } from './crypto';
import { dict, locale } from './i18n';
import {
  deviceName,
  localDeviceKind,
  localOsBadge,
} from './identity';
import {
  getAllActiveBundles,
  getPeerConnection,
  getPeerTransportContext,
  registerP2PActionHook,
  registerRelayMessageHandler,
  resolveClientId,
  type ClipPayload,
  type OfferPayload,
  type OfferReplyPayload,
  type RoomBundle,
  type TransferAckPayload,
  type TransferCancelPayload,
  type TransferMetaPayload,
} from './p2p';
import { base64ToBytes, bytesToBase64, type RelayEnvelope } from './relayTunnel';
import { playChime, playStamp } from './sound';
import { peerList, peers } from '../state/p2pState';
import {
  addManifestItem,
  autoAcceptEnabled,
  autoCopyEnabled,
  autoCopyWarning,
  clipboardMeta,
  clipboardText,
  enqueueIncomingOffer,
  outgoingOfferStatus,
  pendingOffer,
  relaySizeNotice,
  removeActiveTransfer,
  shiftIncomingOffer,
  updateManifestVerification,
  upsertActiveTransfer,
} from '../state/transferState';

export const CHUNK_SIZE = 64 * 1024; // 64KB direct WebRTC chunks
const RELAY_CHUNK_SIZE = 16 * 1024; // 16KB encrypted MQTT relay chunks
const RELAY_CHUNK_DELAY_MS = 25;
const RELAY_LARGE_FILE_BYTES = 25 * 1024 * 1024;
const BUFFERED_LOW_THRESHOLD = 64 * 1024;
const BUFFERED_HIGH_WATER = 512 * 1024;
const BULK_CHANNEL_ID = 777;
const HEADER_BYTES = 40;
const OFFER_TIMEOUT_MS = 45000;

interface IncomingTransferBuffer {
  meta: TransferMetaPayload;
  clientId: string;
  peerName: string;
  chunks: Array<Uint8Array | undefined>;
  receivedCount: number;
  receivedBytes: number;
  startedAt: number;
  cancelled: boolean;
}

interface PendingOutgoingOfferResolver {
  resolve: (accepted: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

const incomingMap = new Map<string, IncomingTransferBuffer>();
const cancelledOutgoing = new Set<string>();
const bulkChannels = new Map<string, RTCDataChannel>();
const outgoingOfferResolvers = new Map<string, PendingOutgoingOfferResolver>();
const hookedBundles = new WeakSet<RoomBundle>();
const seenClipIds = new Set<string>();
const seenOfferIds = new Set<string>();
let engineInitialized = false;

function getPeerName(clientId: string): string {
  return peers.value[clientId]?.name || `Courier-${clientId.slice(0, 4)}`;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(16).slice(2).padEnd(32, '0').slice(0, 32);
  return `${rand.slice(0, 8)}-${rand.slice(8, 12)}-${rand.slice(12, 16)}-${rand.slice(16, 20)}-${rand.slice(20, 32)}`;
}

function packBinaryFrame(transferId: string, chunkIndex: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(transferId.padEnd(36, ' ').slice(0, 36));
  frame.set(idBytes, 0);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(36, chunkIndex, false);
  frame.set(payload, HEADER_BYTES);
  return frame;
}

function unpackBinaryFrame(buffer: ArrayBuffer): {
  transferId: string;
  chunkIndex: number;
  payload: Uint8Array;
} | null {
  if (buffer.byteLength < HEADER_BYTES) return null;
  const view = new DataView(buffer);
  const idBytes = new Uint8Array(buffer, 0, 36);
  const transferId = new TextDecoder().decode(idBytes).trim();
  const chunkIndex = view.getUint32(36, false);
  const payload = new Uint8Array(buffer, HEADER_BYTES);
  return { transferId, chunkIndex, payload };
}

function ensureBulkDataChannel(clientId: string): RTCDataChannel | null {
  const existing = bulkChannels.get(clientId);
  if (existing && existing.readyState !== 'closed') {
    return existing;
  }
  const pc = getPeerConnection(clientId);
  if (!pc || pc.connectionState === 'closed') return null;

  try {
    const dc = pc.createDataChannel('poordrops-bulk', {
      negotiated: true,
      id: BULK_CHANNEL_ID,
      ordered: true,
    });
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = BUFFERED_LOW_THRESHOLD;
    dc.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const parsed = unpackBinaryFrame(ev.data);
        if (parsed) {
          handleIncomingChunk(parsed.transferId, parsed.chunkIndex, parsed.payload);
        }
      }
    };
    dc.onclose = () => {
      if (bulkChannels.get(clientId) === dc) {
        bulkChannels.delete(clientId);
      }
    };
    bulkChannels.set(clientId, dc);
    return dc;
  } catch {
    return null;
  }
}

async function waitForBufferDrain(dc: RTCDataChannel): Promise<void> {
  if (dc.bufferedAmount <= BUFFERED_HIGH_WATER || dc.readyState !== 'open') {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      dc.removeEventListener('bufferedamountlow', done);
      dc.removeEventListener('close', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 1500);
    dc.addEventListener('bufferedamountlow', done, { once: true });
    dc.addEventListener('close', done, { once: true });
  });
}

function triggerAutoSave(objectUrl: string, fileName: string) {
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // non-fatal
  }
}

async function handleIncomingClip(payload: ClipPayload, senderClientId: string) {
  if (!payload || typeof payload.text !== 'string') return;
  if (payload.id && seenClipIds.has(payload.id)) return;
  if (payload.id) {
    seenClipIds.add(payload.id);
    if (seenClipIds.size > 100) {
      const first = seenClipIds.values().next().value;
      if (first) seenClipIds.delete(first);
    }
  }

  const sender = payload.senderName || getPeerName(senderClientId);
  clipboardText.value = payload.text;
  clipboardMeta.value = {
    senderName: sender,
    receivedAt: payload.sentAt || Date.now(),
    isRemote: true,
  };

  if (autoCopyEnabled.value && payload.text.length > 0) {
    try {
      await navigator.clipboard.writeText(payload.text);
      autoCopyWarning.value = null;
    } catch {
      autoCopyWarning.value = 'blocked';
    }
  }
}

function handleIncomingOffer(bundle: RoomBundle, offer: OfferPayload, senderClientId: string) {
  if (!offer || !offer.offerId) return;
  if (seenOfferIds.has(offer.offerId)) return;
  seenOfferIds.add(offer.offerId);
  if (seenOfferIds.size > 100) {
    const first = seenOfferIds.values().next().value;
    if (first) seenOfferIds.delete(first);
  }

  if (autoAcceptEnabled.value) {
    sendReplyToPeer(bundle, senderClientId, { offerId: offer.offerId, accepted: true });
    return;
  }

  playChime();
  enqueueIncomingOffer({
    offerId: offer.offerId,
    peerId: senderClientId,
    peerName: offer.senderName || getPeerName(senderClientId),
    peerKind: offer.senderKind || 'desktop',
    peerOs: offer.senderOs || 'Web',
    files: offer.files || [],
    totalSize: offer.totalSize || 0,
    isZipBundle: offer.isZipBundle,
    receivedAt: Date.now(),
  });
}

function handleIncomingOfferReply(reply: OfferReplyPayload) {
  if (!reply?.offerId) return;
  const pending = outgoingOfferResolvers.get(reply.offerId);
  if (!pending) return;
  clearTimeout(pending.timer);
  outgoingOfferResolvers.delete(reply.offerId);
  pending.resolve(Boolean(reply.accepted));
}

function handleIncomingMeta(meta: TransferMetaPayload, senderClientId: string) {
  if (!meta || !meta.transferId || incomingMap.has(meta.transferId)) return;
  const peerName = getPeerName(senderClientId);
  incomingMap.set(meta.transferId, {
    meta,
    clientId: senderClientId,
    peerName,
    chunks: new Array<Uint8Array | undefined>(meta.totalChunks),
    receivedCount: 0,
    receivedBytes: 0,
    startedAt: Date.now(),
    cancelled: false,
  });

  upsertActiveTransfer({
    id: meta.transferId,
    direction: 'recv',
    name: meta.name,
    size: meta.size,
    transferredBytes: 0,
    speedMBps: 0,
    etaSeconds: 0,
    peerName,
  });
}

function handleIncomingChunk(transferId: string, chunkIndex: number, payload: Uint8Array) {
  const entry = incomingMap.get(transferId);
  if (!entry || entry.cancelled) return;
  if (chunkIndex < 0 || chunkIndex >= entry.meta.totalChunks) return;

  if (!entry.chunks[chunkIndex]) {
    const copy = new Uint8Array(payload.byteLength);
    copy.set(payload);
    entry.chunks[chunkIndex] = copy;
    entry.receivedCount += 1;
    entry.receivedBytes += copy.byteLength;
  }

  const elapsedSec = Math.max(0.05, (Date.now() - entry.startedAt) / 1000);
  const bytesPerSec = entry.receivedBytes / elapsedSec;
  const speedMBps = bytesPerSec / (1024 * 1024);
  const remainingBytes = Math.max(0, entry.meta.size - entry.receivedBytes);
  const etaSeconds = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;

  upsertActiveTransfer({
    id: transferId,
    direction: 'recv',
    name: entry.meta.name,
    size: entry.meta.size,
    transferredBytes: entry.receivedBytes,
    speedMBps,
    etaSeconds,
    peerName: entry.peerName,
  });

  if (entry.receivedCount >= entry.meta.totalChunks) {
    finalizeIncomingTransfer(transferId, speedMBps);
  }
}

function handleIncomingAck(ack: TransferAckPayload) {
  if (!ack?.transferId || !ack.done) return;
  updateManifestVerification(
    ack.transferId,
    ack.verified ? 'verified' : ack.sha256 ? 'mismatch' : 'unverified',
    ack.sha256
  );
  if (ack.verified) playStamp();
}

function handleIncomingCancel(payload: TransferCancelPayload) {
  if (!payload?.transferId) return;
  cancelledOutgoing.add(payload.transferId);
  const inc = incomingMap.get(payload.transferId);
  if (inc) {
    inc.cancelled = true;
    incomingMap.delete(payload.transferId);
  }
  removeActiveTransfer(payload.transferId);
}

async function finalizeIncomingTransfer(transferId: string, speedMBps: number) {
  const entry = incomingMap.get(transferId);
  if (!entry) return;
  incomingMap.delete(transferId);
  removeActiveTransfer(transferId);

  const orderedChunks = entry.chunks.map((c) => c ?? new Uint8Array(0));
  const blobParts: BlobPart[] = orderedChunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });

  const mime = entry.meta.mime || 'application/octet-stream';
  const blob = new Blob(blobParts, { type: mime });
  const localHash = await computeSha256Hex(blob);

  let verification: 'verified' | 'mismatch' | 'unverified' = 'unverified';
  if (localHash && entry.meta.sha256) {
    verification = localHash === entry.meta.sha256 ? 'verified' : 'mismatch';
  }

  const objectUrl = URL.createObjectURL(blob);

  addManifestItem({
    id: transferId,
    direction: 'recv',
    name: entry.meta.name,
    size: entry.meta.size,
    mime,
    sha256: localHash ?? entry.meta.sha256,
    verification,
    speedMBps,
    timestamp: Date.now(),
    peerName: entry.peerName,
    objectUrl,
    isZipBundle: entry.meta.isZipBundle,
  });

  if (verification === 'verified') {
    playStamp();
  }

  triggerAutoSave(objectUrl, entry.meta.name);

  const ackPayload: TransferAckPayload = {
    transferId,
    done: true,
    verified: verification === 'verified',
    sha256: localHash,
  };

  const ctx = getPeerTransportContext(entry.clientId);
  if (ctx?.mode === 'direct' && ctx.trysteroPeerId) {
    ctx.bundle.actions.ack.send(ackPayload, { target: ctx.trysteroPeerId }).catch(() => {});
  } else if (ctx) {
    ctx.bundle.relay.send('ack', ackPayload, entry.clientId).catch(() => {});
  }
}

function sendReplyToPeer(bundle: RoomBundle, clientId: string, reply: OfferReplyPayload) {
  const ctx = getPeerTransportContext(clientId);
  if (ctx?.mode === 'direct' && ctx.trysteroPeerId) {
    ctx.bundle.actions.offerReply.send(reply, { target: ctx.trysteroPeerId }).catch(() => {});
  } else {
    bundle.relay.send('offerReply', reply, clientId).catch(() => {});
  }
}

function attachRoomTransferListeners(bundle: RoomBundle) {
  if (hookedBundles.has(bundle)) return;
  hookedBundles.add(bundle);

  const { room, actions } = bundle;

  room.onPeerJoin(
    ({ peerId }) => {
      const cid = resolveClientId(peerId);
      ensureBulkDataChannel(cid);
    },
    { replay: true }
  );

  room.onPeerLeave(({ peerId }) => {
    const cid = resolveClientId(peerId);
    const dc = bulkChannels.get(cid);
    if (dc) {
      try {
        dc.close();
      } catch {
        // ignore
      }
      bulkChannels.delete(cid);
    }
  });

  actions.clip.onMessage((payload, { peerId }) => {
    handleIncomingClip(payload, resolveClientId(peerId));
  });

  actions.offer.onMessage((offer, { peerId }) => {
    handleIncomingOffer(bundle, offer, resolveClientId(peerId));
  });

  actions.offerReply.onMessage((reply) => {
    handleIncomingOfferReply(reply);
  });

  actions.meta.onMessage((meta, { peerId }) => {
    handleIncomingMeta(meta, resolveClientId(peerId));
  });

  actions.chunk.onMessage((bytes, { metadata }) => {
    const metaObj = metadata as { t?: string; i?: number } | undefined;
    if (!metaObj?.t || typeof metaObj.i !== 'number') return;
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    handleIncomingChunk(metaObj.t, metaObj.i, payload);
  });

  actions.ack.onMessage((ack) => {
    handleIncomingAck(ack);
  });

  actions.cancel.onMessage((payload) => {
    handleIncomingCancel(payload);
  });
}

function handleRelayTransferMessage(bundle: RoomBundle, envelope: RelayEnvelope) {
  const senderClientId = envelope.from;
  switch (envelope.type) {
    case 'clip':
      handleIncomingClip(envelope.payload as ClipPayload, senderClientId);
      break;
    case 'offer':
      handleIncomingOffer(bundle, envelope.payload as OfferPayload, senderClientId);
      break;
    case 'offerReply':
      handleIncomingOfferReply(envelope.payload as OfferReplyPayload);
      break;
    case 'meta':
      handleIncomingMeta(envelope.payload as TransferMetaPayload, senderClientId);
      break;
    case 'chunk': {
      const p = envelope.payload as { t?: string; i?: number; b64?: string } | null;
      if (p?.t && typeof p.i === 'number' && typeof p.b64 === 'string') {
        handleIncomingChunk(p.t, p.i, base64ToBytes(p.b64));
      }
      break;
    }
    case 'ack':
      handleIncomingAck(envelope.payload as TransferAckPayload);
      break;
    case 'cancel':
      handleIncomingCancel(envelope.payload as TransferCancelPayload);
      break;
  }
}

export function initTransferEngine() {
  if (engineInitialized) return;
  engineInitialized = true;
  registerRelayMessageHandler(handleRelayTransferMessage);
  registerP2PActionHook(attachRoomTransferListeners);
}

export function respondToPendingOffer(accepted: boolean) {
  const current = pendingOffer.value;
  if (!current) return;
  shiftIncomingOffer();

  const ctx = getPeerTransportContext(current.peerId);
  if (!ctx) return;
  sendReplyToPeer(ctx.bundle, current.peerId, {
    offerId: current.offerId,
    accepted,
  });
}

export async function pushClipboardText(text: string) {
  const bundles = getAllActiveBundles();
  if (bundles.length === 0 || peerList.value.length === 0) return;

  clipboardMeta.value = {
    senderName: deviceName.value,
    receivedAt: Date.now(),
    isRemote: false,
  };

  const payload: ClipPayload = {
    id: makeId(),
    text,
    senderName: deviceName.value,
    sentAt: Date.now(),
  };

  await Promise.all(
    bundles.flatMap((b) => [
      b.actions.clip.send(payload).catch(() => {}),
      b.relay.send('clip', payload).catch(() => {}),
    ])
  );
}

export async function pushClipboardToPeer(clientId: string, text: string) {
  const ctx = getPeerTransportContext(clientId);
  if (!ctx || !text) return;

  clipboardMeta.value = {
    senderName: deviceName.value,
    receivedAt: Date.now(),
    isRemote: false,
  };

  const payload: ClipPayload = {
    id: makeId(),
    text,
    senderName: deviceName.value,
    sentAt: Date.now(),
  };

  if (ctx.mode === 'direct' && ctx.trysteroPeerId) {
    await ctx.bundle.actions.clip
      .send(payload, { target: ctx.trysteroPeerId })
      .catch(() => {});
  } else {
    await ctx.bundle.relay.send('clip', payload, clientId).catch(() => {});
  }
}

export function cancelTransfer(transferId: string) {
  cancelledOutgoing.add(transferId);
  const inc = incomingMap.get(transferId);
  if (inc) {
    inc.cancelled = true;
    incomingMap.delete(transferId);
  }
  removeActiveTransfer(transferId);
  for (const b of getAllActiveBundles()) {
    b.actions.cancel.send({ transferId }).catch(() => {});
    b.relay.send('cancel', { transferId }).catch(() => {});
  }
}

async function requestOfferApproval(
  clientId: string,
  peerName: string,
  files: File[],
  isZipBundle: boolean
): Promise<'accepted' | 'declined' | 'timeout'> {
  const ctx = getPeerTransportContext(clientId);
  if (!ctx) return 'declined';

  const offerId = makeId();
  const payload: OfferPayload = {
    offerId,
    senderName: deviceName.value,
    senderKind: localDeviceKind,
    senderOs: localOsBadge,
    files: files.map((f) => ({
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
    })),
    totalSize: files.reduce((acc, f) => acc + f.size, 0),
    isZipBundle,
  };

  outgoingOfferStatus.value = { peerName, state: 'waiting' };

  const decision = await new Promise<'accepted' | 'declined' | 'timeout'>((resolve) => {
    const timer = setTimeout(() => {
      outgoingOfferResolvers.delete(offerId);
      resolve('timeout');
    }, OFFER_TIMEOUT_MS);

    outgoingOfferResolvers.set(offerId, {
      timer,
      resolve: (accepted) => resolve(accepted ? 'accepted' : 'declined'),
    });

    const sendPromise =
      ctx.mode === 'direct' && ctx.trysteroPeerId
        ? ctx.bundle.actions.offer.send(payload, { target: ctx.trysteroPeerId })
        : ctx.bundle.relay.send('offer', payload, clientId);

    sendPromise.catch(() => {
      clearTimeout(timer);
      outgoingOfferResolvers.delete(offerId);
      resolve('declined');
    });
  });

  if (decision === 'accepted') {
    outgoingOfferStatus.value = null;
  } else {
    outgoingOfferStatus.value = { peerName, state: decision };
    setTimeout(() => {
      if (outgoingOfferStatus.value?.peerName === peerName) {
        outgoingOfferStatus.value = null;
      }
    }, 3200);
  }

  return decision;
}

export async function sendFilesToPeers(
  files: File[],
  options?: { targetPeerIds?: string[]; isZipBundle?: boolean }
): Promise<void> {
  if (files.length === 0) return;

  const candidateIds = options?.targetPeerIds?.length
    ? options.targetPeerIds
    : peerList.value.map((p) => p.id);

  const uniqueTargets = Array.from(new Set(candidateIds)).filter((id) => Boolean(peers.value[id]));
  if (uniqueTargets.length === 0) return;

  const acceptedPeers: string[] = [];
  await Promise.all(
    uniqueTargets.map(async (clientId) => {
      const peerName = getPeerName(clientId);
      const decision = await requestOfferApproval(
        clientId,
        peerName,
        files,
        Boolean(options?.isZipBundle)
      );
      if (decision === 'accepted') {
        acceptedPeers.push(clientId);
      }
    })
  );

  if (acceptedPeers.length === 0) return;

  for (const file of files) {
    const sha256 = await computeSha256Hex(file);
    const mime = file.type || 'application/octet-stream';

    for (const clientId of acceptedPeers) {
      const ctx = getPeerTransportContext(clientId);
      if (!ctx) continue;

      const useDirect = ctx.mode === 'direct' && Boolean(ctx.trysteroPeerId);
      const chunkBytesSize = useDirect ? CHUNK_SIZE : RELAY_CHUNK_SIZE;
      const totalChunks = Math.max(1, Math.ceil(file.size / chunkBytesSize));

      if (!useDirect && file.size > RELAY_LARGE_FILE_BYTES) {
        relaySizeNotice.value = dict[locale.value].radar.relayLargeFileHint;
      }

      const peerName = getPeerName(clientId);
      const transferId = makeId();
      const startedAt = Date.now();
      const dc = useDirect ? ensureBulkDataChannel(clientId) : null;

      const meta: TransferMetaPayload = {
        transferId,
        name: file.name,
        size: file.size,
        mime,
        totalChunks,
        sha256,
        isZipBundle: options?.isZipBundle,
      };

      upsertActiveTransfer({
        id: transferId,
        direction: 'send',
        name: file.name,
        size: file.size,
        transferredBytes: 0,
        speedMBps: 0,
        etaSeconds: 0,
        peerName,
      });

      if (useDirect && ctx.trysteroPeerId) {
        await ctx.bundle.actions.meta.send(meta, { target: ctx.trysteroPeerId });
      } else {
        await ctx.bundle.relay.send('meta', meta, clientId);
      }

      let sentBytes = 0;
      let aborted = false;

      for (let i = 0; i < totalChunks; i++) {
        if (cancelledOutgoing.has(transferId)) {
          aborted = true;
          break;
        }

        const start = i * chunkBytesSize;
        const end = Math.min(file.size, start + chunkBytesSize);
        const sliceBuf =
          file.size === 0 ? new ArrayBuffer(0) : await file.slice(start, end).arrayBuffer();
        const chunkBytes = new Uint8Array(sliceBuf);

        if (useDirect && dc && dc.readyState === 'open') {
          await waitForBufferDrain(dc);
          if (cancelledOutgoing.has(transferId)) {
            aborted = true;
            break;
          }
          const frame = packBinaryFrame(transferId, i, chunkBytes);
          const sendCopy = new Uint8Array(frame.byteLength);
          sendCopy.set(frame);
          dc.send(sendCopy.buffer);
        } else if (useDirect && ctx.trysteroPeerId) {
          await ctx.bundle.actions.chunk.send(chunkBytes, {
            target: ctx.trysteroPeerId,
            metadata: { t: transferId, i },
          });
        } else {
          await ctx.bundle.relay.send(
            'chunk',
            { t: transferId, i, b64: bytesToBase64(chunkBytes) },
            clientId
          );
          await new Promise<void>((r) => setTimeout(r, RELAY_CHUNK_DELAY_MS));
        }

        sentBytes += chunkBytes.byteLength;
        const elapsedSec = Math.max(0.05, (Date.now() - startedAt) / 1000);
        const bytesPerSec = sentBytes / elapsedSec;
        const speedMBps = bytesPerSec / (1024 * 1024);
        const remainingBytes = Math.max(0, file.size - sentBytes);
        const etaSeconds = bytesPerSec > 0 ? remainingBytes / bytesPerSec : 0;

        upsertActiveTransfer({
          id: transferId,
          direction: 'send',
          name: file.name,
          size: file.size,
          transferredBytes: sentBytes,
          speedMBps,
          etaSeconds,
          peerName,
        });
      }

      removeActiveTransfer(transferId);

      if (aborted) {
        cancelledOutgoing.delete(transferId);
        continue;
      }

      const totalElapsed = Math.max(0.05, (Date.now() - startedAt) / 1000);
      const finalSpeedMBps = file.size / totalElapsed / (1024 * 1024);
      const objectUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

      addManifestItem({
        id: transferId,
        direction: 'send',
        name: file.name,
        size: file.size,
        mime,
        sha256,
        verification: sha256 ? 'verified' : 'unverified',
        speedMBps: finalSpeedMBps,
        timestamp: Date.now(),
        peerName,
        objectUrl,
        isZipBundle: options?.isZipBundle,
      });
      playStamp();
    }
  }
}

export const sendFiles = sendFilesToPeers;
