import { App as CapApp } from '@capacitor/app';
import {
  getRelaySockets,
  joinRoom,
  type MessageAction,
  type Room,
} from '@trystero-p2p/mqtt';
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
  isRescanning,
  lastRescanAt,
  nearbyPeers,
  nearbyScope,
  nearbyStatus,
  p2pError,
  pinPeers,
  selfPeerId,
  signalingBrokerCount,
  type PeerMeta,
} from '../state/p2pState';

export interface HelloPayload {
  peerId: string;
  name: string;
  kind: DeviceKind;
  deviceType: DeviceKind;
  os: OsBadge;
  ready: boolean;
  timestamp: number;
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
const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 4,
};

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HEARTBEAT_MS = 2000;
const STALE_PEER_MS = 7000;
const GRACE_OFFLINE_MS = 5000;

let nearbyBundle: RoomBundle | null = null;
let nearbyGeneration = 0;
let nearbyStartedAt = 0;
let pinBundle: RoomBundle | null = null;
let pinGeneration = 0;
let nearbyHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let actionHook: RoomHook | null = null;
let lifecycleRegistered = false;
let lastWakeActionAt = 0;

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
    peerId: selfPeerId.value,
    name: deviceName.value,
    kind: localDeviceKind,
    deviceType: localDeviceKind,
    os: localOsBadge,
    ready: true,
    timestamp: Date.now(),
  };
}

function countOpenRelaySockets(): number {
  try {
    const sockets = getRelaySockets();
    let open = 0;
    for (const ws of Object.values(sockets)) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        open += 1;
      }
    }
    return open;
  } catch {
    return 0;
  }
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

function pruneStaleNearbyPeers() {
  const now = Date.now();
  const current = nearbyPeers.value;
  let changed = false;
  const next: Record<string, PeerMeta> = {};

  for (const [id, peer] of Object.entries(current)) {
    if (now - peer.lastSeen <= STALE_PEER_MS) {
      next[id] = peer;
    } else {
      changed = true;
    }
  }

  if (changed) {
    nearbyPeers.value = next;
  }
}

async function fetchIpv4WithTimeout(
  url: string,
  parse: (res: Response) => Promise<string | null>,
  timeoutMs = 1500
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const raw = (await parse(res))?.trim() ?? '';
    return IPV4_REGEX.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function resolveNearbyRoomId(): Promise<{ roomId: string; scope: 'wifi' | 'lobby' }> {
  // Force IPv4-only endpoints so phones (often IPv6) and laptops (IPv4) match on the same Wi-Fi router
  const ip =
    (await fetchIpv4WithTimeout('https://api4.ipify.org?format=json', async (res) => {
      const data = (await res.json()) as { ip?: string };
      return data?.ip ?? null;
    })) ??
    (await fetchIpv4WithTimeout('https://ipv4.icanhazip.com', async (res) => res.text()));

  if (ip) {
    const buf = new TextEncoder().encode(`poordrops-ipv4:${ip}`);
    const hash = await computeSha256Hex(buf.buffer);
    if (hash) {
      return {
        roomId: `poordrops-wifi-v2-${hash.slice(0, 14)}`,
        scope: 'wifi',
      };
    }
    return {
      roomId: `poordrops-wifi-v2-${ip.replace(/\./g, '-')}`,
      scope: 'wifi',
    };
  }

  // Fallback: timezone + language + shared local mesh lobby
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    tz = 'UTC';
  }
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en')
    .slice(0, 2)
    .toLowerCase();
  const seed = `poordrops-local-mesh-v2:${tz}:${lang}`;
  const hash = await computeSha256Hex(new TextEncoder().encode(seed).buffer);
  const suffix = hash ? hash.slice(0, 12) : `${tz}-${lang}`.replace(/[^a-zA-Z0-9-]/g, '_');

  return {
    roomId: `poordrops-mesh-v2-${suffix}`,
    scope: 'lobby',
  };
}

async function teardownNearbyRoom() {
  nearbyGeneration += 1;
  if (nearbyHeartbeatTimer) {
    clearInterval(nearbyHeartbeatTimer);
    nearbyHeartbeatTimer = null;
  }
  const prev = nearbyBundle;
  nearbyBundle = null;
  nearbyPeers.value = {};
  if (prev) {
    try {
      await prev.room.leave();
    } catch {
      // ignore teardown errors
    }
  }
}

export async function initNearbyDiscovery(options?: { force?: boolean }) {
  if (nearbyBundle && !options?.force) return;

  if (options?.force) {
    await teardownNearbyRoom();
  }

  const gen = ++nearbyGeneration;
  nearbyStartedAt = Date.now();
  nearbyStatus.value = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'scanning';

  const { roomId, scope } = await resolveNearbyRoomId();
  if (gen !== nearbyGeneration) return;
  nearbyScope.value = scope;

  try {
    const room = joinRoom(
      {
        appId: APP_ID,
        identity: 'none',
        password: `${roomId}-secret`,
        relayConfig: { urls: MQTT_BROKERS },
        rtcConfig: RTC_CONFIG,
        trickleIce: true,
      },
      roomId
    );

    if (gen !== nearbyGeneration) {
      room.leave().catch(() => {});
      return;
    }

    const actions = buildActions(room);
    const bundle: RoomBundle = { source: 'nearby', room, actions };
    nearbyBundle = bundle;

    room.getSelf().then((self) => {
      if (gen === nearbyGeneration && !selfPeerId.value) {
        selfPeerId.value = self.peerId;
      }
    }).catch(() => {});

    room.ready
      .then(() => {
        if (gen !== nearbyGeneration) return;
        nearbyStatus.value = 'ready';
        isRescanning.value = false;
        signalingBrokerCount.value = countOpenRelaySockets();
        actions.hello.send(makeHelloPayload()).catch(() => {});
      })
      .catch(() => {
        if (gen === nearbyGeneration) {
          isRescanning.value = false;
        }
      });

    actions.hello.onMessage((payload, { peerId }) => {
      if (gen !== nearbyGeneration || !payload) return;
      updatePeerRecord('nearby', peerId, {
        name: (payload.name || '').trim() || undefined,
        kind: payload.deviceType || payload.kind,
        os: payload.os,
        ready: payload.ready,
      });
      nearbyStatus.value = 'ready';
    });

    room.onPeerJoin(({ peerId }) => {
      if (gen !== nearbyGeneration) return;
      const wasEmpty = Object.keys(nearbyPeers.value).length === 0;
      updatePeerRecord('nearby', peerId, {});
      nearbyStatus.value = 'ready';
      isRescanning.value = false;
      if (wasEmpty) playConnect();
      // Immediate presence beacon to the newly joined peer
      actions.hello.send(makeHelloPayload(), { target: peerId }).catch(() => {});
    });

    room.onPeerLeave(({ peerId }) => {
      if (gen !== nearbyGeneration) return;
      removePeerRecord('nearby', peerId);
    });

    room.onError((err) => {
      if (gen !== nearbyGeneration) return;
      if (err.code === 'relay-failed' && Object.keys(nearbyPeers.value).length === 0) {
        nearbyStatus.value = 'offline';
        isRescanning.value = false;
      }
    });

    if (nearbyHeartbeatTimer) clearInterval(nearbyHeartbeatTimer);
    nearbyHeartbeatTimer = setInterval(() => {
      if (gen !== nearbyGeneration || !nearbyBundle) return;

      pruneStaleNearbyPeers();

      const openCount = countOpenRelaySockets();
      signalingBrokerCount.value = openCount;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        nearbyStatus.value = 'offline';
      } else if (openCount > 0 || Object.keys(nearbyPeers.value).length > 0) {
        nearbyStatus.value = 'ready';
      } else if (Date.now() - nearbyStartedAt > GRACE_OFFLINE_MS) {
        nearbyStatus.value = 'offline';
      }

      if (openCount > 0 || Object.keys(nearbyPeers.value).length > 0) {
        nearbyBundle.actions.hello.send(makeHelloPayload()).catch(() => {});
      }
    }, HEARTBEAT_MS);

    if (actionHook) {
      actionHook(bundle);
    }
  } catch {
    nearbyStatus.value = 'offline';
    isRescanning.value = false;
  }
}

export async function rescanNearbyDiscovery(options?: { forceReconnect?: boolean }) {
  const now = Date.now();
  if (!options?.forceReconnect && now - lastRescanAt.value < 1200) {
    return;
  }
  lastRescanAt.value = now;
  isRescanning.value = true;
  nearbyStatus.value = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'scanning';

  try {
    await initNearbyDiscovery({ force: true });
    if (pinBundle) {
      pinBundle.actions.hello.send(makeHelloPayload()).catch(() => {});
    }
  } finally {
    setTimeout(() => {
      isRescanning.value = false;
    }, 1500);
  }
}

function handleWakeResume() {
  const now = Date.now();
  if (now - lastWakeActionAt < 1200) return;
  lastWakeActionAt = now;

  const openCount = countOpenRelaySockets();
  if (
    !nearbyBundle ||
    openCount === 0 ||
    nearbyStatus.value === 'offline'
  ) {
    rescanNearbyDiscovery({ forceReconnect: true });
  } else {
    nearbyBundle.actions.hello.send(makeHelloPayload()).catch(() => {});
    if (pinBundle) {
      pinBundle.actions.hello.send(makeHelloPayload()).catch(() => {});
    }
  }
}

export function registerLifecycleListeners() {
  if (lifecycleRegistered || typeof window === 'undefined') return;
  lifecycleRegistered = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleWakeResume();
    }
  });

  window.addEventListener('online', () => {
    rescanNearbyDiscovery({ forceReconnect: true });
  });

  window.addEventListener('offline', () => {
    nearbyStatus.value = 'offline';
    signalingBrokerCount.value = 0;
  });

  try {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        handleWakeResume();
      }
    }).catch(() => {});
    CapApp.addListener('resume', () => {
      handleWakeResume();
    }).catch(() => {});
  } catch {
    // Non-Capacitor web environment
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
        relayConfig: { urls: MQTT_BROKERS },
        rtcConfig: RTC_CONFIG,
        trickleIce: true,
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
        kind: payload.deviceType || payload.kind,
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
  registerLifecycleListeners();
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
