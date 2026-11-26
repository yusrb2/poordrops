import { joinRoom, type MessageAction, type Room } from 'trystero';
import { computeSha256Hex } from './crypto';
import {
  deviceName,
  generatePin,
  localDeviceKind,
  localOsBadge,
  saveLastRoom,
  type DeviceKind,
  type OsBadge,
} from './identity';
import { playConnect } from './sound';
import {
  connectionState,
  currentPin,
  nearbyPeers,
  nearbyScope,
  nearbyStatus,
  p2pError,
  pinPeers,
  selfPeerId,
  type PeerMeta,
} from '../state/p2pState';

export interface HelloPayload {
  name: string;
  kind: DeviceKind;
  os: OsBadge;
  ready: boolean;
}

export interface ClipPayload {
  id: string;
  text: string;
  senderName: string;
  sentAt: number;
}

export interface OfferFileInfo {
  name: string;
  size: number;
  mime: string;
}

export interface OfferPayload {
  offerId: string;
  senderName: string;
  senderKind: DeviceKind;
  senderOs: OsBadge;
  files: OfferFileInfo[];
  totalSize: number;
  isZipBundle: boolean;
}

export interface OfferReplyPayload {
  offerId: string;
  accepted: boolean;
}

export interface TransferMetaPayload {
  transferId: string;
  name: string;
  size: number;
  mime: string;
  totalChunks: number;
  sha256: string | null;
  isZipBundle?: boolean;
}

export interface TransferAckPayload {
  transferId: string;
  receivedIndex?: number;
  done?: boolean;
  verified?: boolean;
  sha256?: string | null;
}

export interface TransferCancelPayload {
  transferId: string;
}

export interface P2PActions {
  hello: MessageAction<HelloPayload>;
  clip: MessageAction<ClipPayload>;
  offer: MessageAction<OfferPayload>;
  offerReply: MessageAction<OfferReplyPayload>;
  meta: MessageAction<TransferMetaPayload>;
  chunk: MessageAction<Uint8Array>;
  ack: MessageAction<TransferAckPayload>;
  cancel: MessageAction<TransferCancelPayload>;
}

export interface RoomBundle {
  source: 'nearby' | 'pin';
  room: Room;
  actions: P2PActions;
}

type RoomHook = (bundle: RoomBundle) => void;

const APP_ID = 'com.poordrops.app';

let nearbyBundle: RoomBundle | null = null;
let pinBundle: RoomBundle | null = null;
let pinGeneration = 0;
let nearbyHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let actionHook: RoomHook | null = null;

function buildActions(room: Room): P2PActions {
  return {
    hello: room.makeAction<HelloPayload>('hello'),
    clip: room.makeAction<ClipPayload>('clip'),
    offer: room.makeAction<OfferPayload>('offer'),
    offerReply: room.makeAction<OfferReplyPayload>('offerReply'),
    meta: room.makeAction<TransferMetaPayload>('meta'),
    chunk: room.makeAction<Uint8Array>('chunk'),
    ack: room.makeAction<TransferAckPayload>('ack'),
    cancel: room.makeAction<TransferCancelPayload>('cancel'),
  };
}

function makeHelloPayload(): HelloPayload {
  return {
    name: deviceName.value,
    kind: localDeviceKind,
    os: localOsBadge,
    ready: true,
  };
}

export function registerP2PActionHook(hook: RoomHook) {
  actionHook = hook;
  if (nearbyBundle) hook(nearbyBundle);
  if (pinBundle) hook(pinBundle);
}

export function getAllActiveBundles(): RoomBundle[] {
  const list: RoomBundle[] = [];
  if (nearbyBundle) list.push(nearbyBundle);
  if (pinBundle) list.push(pinBundle);
  return list;
}

export function getPeerRoomContext(peerId: string): {
  bundle: RoomBundle;
  connection: RTCPeerConnection | null;
} | null {
  if (pinBundle) {
    const info = pinBundle.room.getPeers()[peerId];
    if (info) {
      return { bundle: pinBundle, connection: info.connection ?? null };
    }
  }
  if (nearbyBundle) {
    const info = nearbyBundle.room.getPeers()[peerId];
    if (info) {
      return { bundle: nearbyBundle, connection: info.connection ?? null };
    }
  }
  return null;
}

export function getPeerConnection(peerId: string): RTCPeerConnection | null {
  return getPeerRoomContext(peerId)?.connection ?? null;
}

export function buildShareUrl(pin: string): string {
  if (typeof window === 'undefined') return `?pin=${pin}`;
  const url = new URL(window.location.href);
  url.searchParams.set('pin', pin);
  return url.toString();
}

export function broadcastAlias(name?: string) {
  const payload: HelloPayload = {
    ...makeHelloPayload(),
    name: name ?? deviceName.value,
  };
  if (nearbyBundle) {
    nearbyBundle.actions.hello.send(payload).catch(() => {});
  }
  if (pinBundle) {
    pinBundle.actions.hello.send(payload).catch(() => {});
  }
}

function updatePeerRecord(
  source: 'nearby' | 'pin',
  peerId: string,
  patch: Partial<PeerMeta>
) {
  const targetSignal = source === 'nearby' ? nearbyPeers : pinPeers;
  const current = targetSignal.value;
  const existing = current[peerId];
  const now = Date.now();
  const nextRecord: PeerMeta = {
    id: peerId,
    name: patch.name || existing?.name || `Courier-${peerId.slice(0, 4)}`,
    kind: patch.kind || existing?.kind || 'desktop',
    os: patch.os || existing?.os || 'Web',
    ready: patch.ready ?? existing?.ready ?? true,
    source,
    joinedAt: existing?.joinedAt ?? now,
    lastSeen: now,
  };
  targetSignal.value = {
    ...current,
    [peerId]: nextRecord,
  };
}

function removePeerRecord(source: 'nearby' | 'pin', peerId: string) {
  const targetSignal = source === 'nearby' ? nearbyPeers : pinPeers;
  if (!targetSignal.value[peerId]) return;
  const next = { ...targetSignal.value };
  delete next[peerId];
  targetSignal.value = next;
}

async function resolveNearbyRoomId(): Promise<{ roomId: string; scope: 'wifi' | 'lobby' }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1600);
    const res = await fetch('https://api64.ipify.org?format=json', {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as { ip?: string };
      if (data?.ip) {
        const buf = new TextEncoder().encode(`poordrops-net:${data.ip}`);
        const hash = await computeSha256Hex(buf.buffer);
        if (hash) {
          return {
            roomId: `poordrops-nearby-v1-${hash.slice(0, 14)}`,
            scope: 'wifi',
          };
        }
      }
    }
  } catch {
    // Fallback cleanly to shared lobby
  }
  return {
    roomId: 'poordrops-nearby-v1-shared-lobby',
    scope: 'lobby',
  };
}

export async function initNearbyDiscovery() {
  if (nearbyBundle) return;
  nearbyStatus.value = 'scanning';

  const { roomId, scope } = await resolveNearbyRoomId();
  nearbyScope.value = scope;

  try {
    const room = joinRoom(
      {
        appId: APP_ID,
        identity: 'none',
        password: `${roomId}-secret`,
      },
      roomId
    );
    const actions = buildActions(room);
    const bundle: RoomBundle = { source: 'nearby', room, actions };
    nearbyBundle = bundle;

    room.getSelf().then((self) => {
      if (!selfPeerId.value) selfPeerId.value = self.peerId;
    }).catch(() => {});

    room.ready.then(() => {
      nearbyStatus.value = 'ready';
    }).catch(() => {});

    actions.hello.onMessage((payload, { peerId }) => {
      if (!payload) return;
      updatePeerRecord('nearby', peerId, {
        name: (payload.name || '').trim() || undefined,
        kind: payload.kind,
        os: payload.os,
        ready: payload.ready,
      });
    });

    room.onPeerJoin(({ peerId }) => {
      const wasEmpty = Object.keys(nearbyPeers.value).length === 0;
      updatePeerRecord('nearby', peerId, {});
      nearbyStatus.value = 'ready';
      if (wasEmpty) playConnect();
      actions.hello.send(makeHelloPayload(), { target: peerId }).catch(() => {});
    });

    room.onPeerLeave(({ peerId }) => {
      removePeerRecord('nearby', peerId);
    });

    room.onError((err) => {
      if (err.code === 'relay-failed' && Object.keys(nearbyPeers.value).length === 0) {
        nearbyStatus.value = 'error';
      }
    });

    if (nearbyHeartbeatTimer) clearInterval(nearbyHeartbeatTimer);
    nearbyHeartbeatTimer = setInterval(() => {
      if (nearbyBundle && Object.keys(nearbyPeers.value).length > 0) {
        nearbyBundle.actions.hello.send(makeHelloPayload()).catch(() => {});
      }
    }, 5000);

    if (actionHook) {
      actionHook(bundle);
    }
  } catch {
    nearbyStatus.value = 'error';
  }
}

export async function leaveRoom() {
  pinGeneration += 1;
  const prev = pinBundle;
  pinBundle = null;
  pinPeers.value = {};
  p2pError.value = null;
  connectionState.value = 'idle';
  if (prev) {
    try {
      await prev.room.leave();
    } catch {
      // ignore teardown errors
    }
  }
}

export async function joinPin(pin: string) {
  const cleanPin = pin.trim();
  if (!/^\d{4}$/.test(cleanPin)) return;

  await leaveRoom();
  const gen = ++pinGeneration;

  currentPin.value = cleanPin;
  connectionState.value = 'connecting';
  p2pError.value = null;

  try {
    const room = joinRoom(
      {
        appId: APP_ID,
        identity: 'none',
        password: `poordrops-pin-${cleanPin}`,
      },
      `poordrops-v1-${cleanPin}`
    );

    if (gen !== pinGeneration) {
      room.leave().catch(() => {});
      return;
    }

    const actions = buildActions(room);
    const bundle: RoomBundle = { source: 'pin', room, actions };
    pinBundle = bundle;

    room.getSelf().then((self) => {
      if (gen === pinGeneration) {
        selfPeerId.value = self.peerId;
      }
    }).catch(() => {});

    room.ready.then(() => {
      if (gen === pinGeneration && Object.keys(pinPeers.value).length === 0) {
        connectionState.value = 'waiting';
      }
    }).catch(() => {});

    actions.hello.onMessage((payload, { peerId }) => {
      if (gen !== pinGeneration || !payload) return;
      const nextName = (payload.name || '').trim() || `Courier-${peerId.slice(0, 4)}`;
      updatePeerRecord('pin', peerId, {
        name: nextName,
        kind: payload.kind,
        os: payload.os,
        ready: payload.ready,
      });
      saveLastRoom(cleanPin, nextName);
    });

    room.onPeerJoin(({ peerId }) => {
      if (gen !== pinGeneration) return;
      const firstConnect = Object.keys(pinPeers.value).length === 0;
      updatePeerRecord('pin', peerId, {});
      connectionState.value = 'connected';
      saveLastRoom(cleanPin, pinPeers.value[peerId]?.name);
      if (firstConnect) playConnect();
      actions.hello.send(makeHelloPayload(), { target: peerId }).catch(() => {});
    });

    room.onPeerLeave(({ peerId }) => {
      if (gen !== pinGeneration) return;
      removePeerRecord('pin', peerId);
      if (Object.keys(pinPeers.value).length === 0) {
        connectionState.value = 'waiting';
      }
    });

    room.onError((err) => {
      if (gen !== pinGeneration) return;
      if (err.code === 'relay-failed') {
        p2pError.value = err.message;
        if (Object.keys(pinPeers.value).length === 0) {
          connectionState.value = 'error';
        }
      }
    });

    if (actionHook) {
      actionHook(bundle);
    }

    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('pin', cleanPin);
      window.history.replaceState(null, '', nextUrl.toString());
    }
  } catch (err) {
    p2pError.value = err instanceof Error ? err.message : String(err);
    connectionState.value = 'error';
  }
}

export async function createFreshRoom() {
  let next = generatePin();
  if (next === currentPin.value) {
    next = generatePin();
  }
  await joinPin(next);
}

export function initPairingFromUrl() {
  initNearbyDiscovery();

  if (typeof window === 'undefined') {
    createFreshRoom();
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const urlPin = params.get('pin');
  if (urlPin && /^\d{4}$/.test(urlPin)) {
    joinPin(urlPin);
  } else {
    createFreshRoom();
  }
}
