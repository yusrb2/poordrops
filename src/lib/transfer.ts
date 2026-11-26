import type { Room } from 'trystero';
import { computeSha256Hex } from './crypto';
import { deviceName } from './identity';
import {
  getActiveActions,
  getPeerConnection,
  registerP2PActionHook,
  type P2PActions,
  type TransferMetaPayload,
} from './p2p';
import { playStamp } from './sound';
import { peerList } from '../state/p2pState';
import {
  addManifestItem,
  autoCopyEnabled,
  autoCopyWarning,
  clipboardMeta,
  clipboardText,
  removeActiveTransfer,
  updateManifestVerification,
  upsertActiveTransfer,
} from '../state/transferState';

export const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const BUFFERED_LOW_THRESHOLD = 64 * 1024; // 64KB
const BUFFERED_HIGH_WATER = 512 * 1024; // 512KB backpressure ceiling
const BULK_CHANNEL_ID = 777;
const HEADER_BYTES = 40; // 36-byte UUID + 4-byte uint32 chunk index

interface IncomingTransferBuffer {
  meta: TransferMetaPayload;
  peerId: string;
  peerName: string;
  chunks: Array<Uint8Array | undefined>;
  receivedCount: number;
  receivedBytes: number;
  startedAt: number;
  cancelled: boolean;
}

const incomingMap = new Map<string, IncomingTransferBuffer>();
const cancelledOutgoing = new Set<string>();
const bulkChannels = new Map<string, RTCDataChannel>();
let engineInitialized = false;

function getPeerName(peerId: string): string {
  const found = peerList.value.find((p) => p.id === peerId);
  return found?.name || `Courier-${peerId.slice(0, 4)}`;
}

function makeTransferId(): string {
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

function ensureBulkDataChannel(peerId: string): RTCDataChannel | null {
  const existing = bulkChannels.get(peerId);
  if (existing && existing.readyState !== 'closed') {
    return existing;
  }
  const pc = getPeerConnection(peerId);
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
      if (bulkChannels.get(peerId) === dc) {
        bulkChannels.delete(peerId);
      }
    };
    bulkChannels.set(peerId, dc);
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

  const actions = getActiveActions();
  if (actions) {
    actions.ack
      .send(
        {
          transferId,
          done: true,
          verified: verification === 'verified',
          sha256: localHash,
        },
        { target: entry.peerId }
      )
      .catch(() => {});
  }
}

function attachRoomTransferListeners(room: Room, actions: P2PActions) {
  bulkChannels.clear();

  room.onPeerJoin(
    ({ peerId }) => {
      ensureBulkDataChannel(peerId);
    },
    { replay: true }
  );

  room.onPeerLeave(({ peerId }) => {
    const dc = bulkChannels.get(peerId);
    if (dc) {
      try {
        dc.close();
      } catch {
        // ignore
      }
      bulkChannels.delete(peerId);
    }
  });

  actions.clip.onMessage(async (payload, { peerId }) => {
    if (!payload || typeof payload.text !== 'string') return;
    const sender = payload.senderName || getPeerName(peerId);
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
  });

  actions.meta.onMessage((meta, { peerId }) => {
    if (!meta || !meta.transferId) return;
    const peerName = getPeerName(peerId);
    incomingMap.set(meta.transferId, {
      meta,
      peerId,
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
  });

  actions.chunk.onMessage((bytes, { metadata }) => {
    const metaObj = metadata as { t?: string; i?: number } | undefined;
    if (!metaObj?.t || typeof metaObj.i !== 'number') return;
    const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    handleIncomingChunk(metaObj.t, metaObj.i, payload);
  });

  actions.ack.onMessage((ack) => {
    if (!ack?.transferId || !ack.done) return;
    updateManifestVerification(
      ack.transferId,
      ack.verified ? 'verified' : ack.sha256 ? 'mismatch' : 'unverified',
      ack.sha256
    );
    if (ack.verified) playStamp();
  });

  actions.cancel.onMessage((payload) => {
    if (!payload?.transferId) return;
    cancelledOutgoing.add(payload.transferId);
    const inc = incomingMap.get(payload.transferId);
    if (inc) {
      inc.cancelled = true;
      incomingMap.delete(payload.transferId);
    }
    removeActiveTransfer(payload.transferId);
  });
}

export function initTransferEngine() {
  if (engineInitialized) return;
  engineInitialized = true;
  registerP2PActionHook(attachRoomTransferListeners);
}

export async function pushClipboardText(text: string) {
  const actions = getActiveActions();
  if (!actions || peerList.value.length === 0) return;
  clipboardMeta.value = {
    senderName: deviceName.value,
    receivedAt: Date.now(),
    isRemote: false,
  };
  await actions.clip
    .send({
      id: makeTransferId(),
      text,
      senderName: deviceName.value,
      sentAt: Date.now(),
    })
    .catch(() => {});
}

export function cancelTransfer(transferId: string) {
  cancelledOutgoing.add(transferId);
  const inc = incomingMap.get(transferId);
  if (inc) {
    inc.cancelled = true;
    incomingMap.delete(transferId);
  }
  removeActiveTransfer(transferId);
  const actions = getActiveActions();
  if (actions) {
    actions.cancel.send({ transferId }).catch(() => {});
  }
}

export async function sendFiles(
  files: File[],
  options?: { isZipBundle?: boolean }
): Promise<void> {
  const actions = getActiveActions();
  const targets = peerList.value;
  if (!actions || targets.length === 0 || files.length === 0) return;

  for (const file of files) {
    const sha256 = await computeSha256Hex(file);
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const mime = file.type || 'application/octet-stream';

    for (const target of targets) {
      const transferId = makeTransferId();
      const startedAt = Date.now();
      const dc = ensureBulkDataChannel(target.id);

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
        peerName: target.name,
      });

      await actions.meta.send(meta, { target: target.id });

      let sentBytes = 0;
      let aborted = false;

      for (let i = 0; i < totalChunks; i++) {
        if (cancelledOutgoing.has(transferId)) {
          aborted = true;
          break;
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const sliceBuf = file.size === 0 ? new ArrayBuffer(0) : await file.slice(start, end).arrayBuffer();
        const chunkBytes = new Uint8Array(sliceBuf);

        if (dc && dc.readyState === 'open') {
          await waitForBufferDrain(dc);
          if (cancelledOutgoing.has(transferId)) {
            aborted = true;
            break;
          }
          const frame = packBinaryFrame(transferId, i, chunkBytes);
          const sendCopy = new Uint8Array(frame.byteLength);
          sendCopy.set(frame);
          dc.send(sendCopy.buffer);
        } else {
          await actions.chunk.send(chunkBytes, {
            target: target.id,
            metadata: { t: transferId, i },
          });
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
          peerName: target.name,
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
        peerName: target.name,
        objectUrl,
        isZipBundle: options?.isZipBundle,
      });
      playStamp();
    }
  }
}
