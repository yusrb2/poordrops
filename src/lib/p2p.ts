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
  iceState,
  isRescanning,
  lastError,
  lastRescanAt,
  lobbyId,
  nearbyPeers,
  nearbyScope,
  nearbyStatus,
  p2pError,
  pinPeers,
  selfPeerId,
  signalingBrokerCount,
  signalingState,
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

const APP_ID = 'poordrops-p2p-v1';
const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 6,
};

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HEARTBEAT_MS = 2000;
const STALE_PEER_MS = 7000;
const GRACE_OFFLINE_MS = 5500;

let nearbyBundle: RoomBundle | null = null;
let nearbyGeneration = 0;
let nearbyStartedAt = 0;
let pinBundle: RoomBundle | null = null;
let pinGeneration = 0;
let nearbyHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let actionHook: RoomHook | null = null;
let lifecycleRegistered = false;
let lastWakeActionAt = 0;

const monitoredPcs = new WeakSet<RTCPeerConnection>();

function attachIceMonitor(pc: RTCPeerConnection | null | undefined) {
  if (!pc) return;
  iceState.value = pc.iceConnectionState;
  if (monitoredPcs.has(pc)) return;
  monitoredPcs.add(pc);
  pc.addEventListener('iceconnectionstatechange', () => {
    iceState.value = pc.iceConnectionState;
    if (pc.iceConnectionState === 'failed') {
      lastError.value = 'ICE negotiation failed (check firewall or retry TURN).';
    } else if (
      pc.iceConnectionState === 'connected' ||
      pc.iceConnectionState === 'completed'
    ) {
      lastError.value = null;
    }
  });
}

function scanRoomConnections(room: Room | null | undefined) {
  if (!room) return;
  try {
    const peerMap = room.getPeers();
    for (const info of Object.values(peerMap)) {
      if (info?.connection) {
        attachIceMonitor(info.connection);
      }
    }
  } catch {
    // ignore
  }
}

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

export async function pingPeer(peerId: string): Promise<number | null> {
  const ctx = getPeerRoomContext(peerId);
  if (!ctx) return null;
  try {
    const ms = await Promise.race<number | null>([
      ctx.bundle.room.ping(peerId).then((r) => Math.max(1, Math.round(r))),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    return ms;
  } catch {
    return null;
  }
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

export async function getLocalRadarRoomId(): Promise<{
  roomId: string;
  displayLobbyId: string;
  scope: 'wifi' | 'lobby';
}> {
  // Primary: Cloudflare 1.1.1.1 IPv4 trace (fast, edge-cached, identical across mobile & desktop on same router)
  const ip =
    (await fetchIpv4WithTimeout('https://1.1.1.1/cdn-cgi/trace', async (res) => {
      const text = await res.text();
      const match = text.match(/^ip=([^\r\n]+)$/m);
      return match ? match[1] : null;
    })) ??
    (await fetchIpv4WithTimeout('https://api4.ipify.org?format=json', async (res) => {
      const data = (await res.json()) as { ip?: string };
      return data?.ip ?? null;
    }));

  if (ip) {
    const buf = new TextEncoder().encode(`poordrops-ipv4:${ip}`);
    const hash = await computeSha256Hex(buf.buffer);
    if (hash) {
      return {
        roomId: `poordrops-lobby-${hash.slice(0, 12)}`,
        displayLobbyId: `LOBBY-${hash.slice(0, 4).toUpperCase()}`,
        scope: 'wifi',
      };
    }
    const compact = ip.split('.').slice(-2).join('');
    return {
      roomId: `poordrops-lobby-${ip.replace(/\./g, '-')}`,
      displayLobbyId: `LOBBY-${compact}`,
      scope: 'wifi',
    };
  }

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
    roomId: `poordrops-mesh-${suffix}`,
    displayLobbyId: `MESH-${suffix.slice(0, 4).toUpperCase()}`,
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
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;
  nearbyStatus.value = isOnline ? 'scanning' : 'offline';
  signalingState.value = isOnline ? 'connecting' : 'error';
  lastError.value = isOnline ? null : 'Device is offline.';

  const { roomId, displayLobbyId, scope } = await getLocalRadarRoomId();
  if (gen !== nearbyGeneration) return;
  nearbyScope.value = scope;
  lobbyId.value = displayLobbyId;

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
        signalingState.value = 'connected';
        isRescanning.value = false;
        signalingBrokerCount.value = countOpenRelaySockets();
        actions.hello.send(makeHelloPayload()).catch(() => {});
      })
      .catch((err) => {
        if (gen === nearbyGeneration) {
          isRescanning.value = false;
          signalingState.value = 'error';
          lastError.value = err instanceof Error ? err.message : 'Signaling ready failed.';
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
      signalingState.value = 'connected';
    });

    room.onPeerJoin(({ peerId }) => {
      if (gen !== nearbyGeneration) return;
      const wasEmpty = Object.keys(nearbyPeers.value).length === 0;
      updatePeerRecord('nearby', peerId, {});
      nearbyStatus.value = 'ready';
      signalingState.value = 'connected';
      isRescanning.value = false;
      lastError.value = null;
      scanRoomConnections(room);
      if (wasEmpty) playConnect();
      actions.hello.send(makeHelloPayload(), { target: peerId }).catch(() => {});
    });

    room.onPeerLeave(({ peerId }) => {
      if (gen !== nearbyGeneration) return;
      removePeerRecord('nearby', peerId);
    });

    room.onError((err) => {
      if (gen !== nearbyGeneration) return;
      lastError.value = err.message || err.code;
      if (err.code === 'relay-failed') {
        signalingState.value = 'error';
        if (Object.keys(nearbyPeers.value).length === 0) {
          nearbyStatus.value = 'offline';
          isRescanning.value = false;
        }
      } else if (err.code === 'peer-connect-failed') {
        iceState.value = 'failed';
      }
    });

    if (nearbyHeartbeatTimer) clearInterval(nearbyHeartbeatTimer);
    nearbyHeartbeatTimer = setInterval(() => {
      if (gen !== nearbyGeneration || !nearbyBundle) return;

      pruneStaleNearbyPeers();
      scanRoomConnections(nearbyBundle.room);
      scanRoomConnections(pinBundle?.room);

      const openCount = countOpenRelaySockets();
      signalingBrokerCount.value = openCount;

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        nearbyStatus.value = 'offline';
        signalingState.value = 'error';
      } else if (openCount > 0 || Object.keys(nearbyPeers.value).length > 0) {
        nearbyStatus.value = 'ready';
        signalingState.value = 'connected';
      } else if (Date.now() - nearbyStartedAt > GRACE_OFFLINE_MS) {
        nearbyStatus.value = 'offline';
        signalingState.value = 'error';
        if (!lastError.value) {
          lastError.value = 'Unable to reach MQTT signaling brokers.';
        }
      }

      if (openCount > 0 || Object.keys(nearbyPeers.value).length > 0) {
        nearbyBundle.actions.hello.send(makeHelloPayload()).catch(() => {});
      }
    }, HEARTBEAT_MS);

    if (actionHook) {
      actionHook(bundle);
    }
  } catch (err) {
    nearbyStatus.value = 'offline';
    signalingState.value = 'error';
    lastError.value = err instanceof Error ? err.message : 'Nearby discovery failed.';
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
  iceState.value = 'new';
  lastError.value = null;
  nearbyStatus.value = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'scanning';
  signalingState.value = typeof navigator !== 'undefined' && !navigator.onLine ? 'error' : 'connecting';

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
    nearbyStatus.value === 'offline' ||
    signalingState.value === 'error'
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
    signalingState.value = 'error';
    signalingBrokerCount.value = 0;
    lastError.value = 'Network connection lost.';
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
      lastError.value = null;
      scanRoomConnections(room);
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
      p2pError.value = err.message;
      lastError.value = err.message || err.code;
      if (err.code === 'relay-failed') {
        if (Object.keys(pinPeers.value).length === 0) {
          connectionState.value = 'error';
        }
      } else if (err.code === 'peer-connect-failed') {
        iceState.value = 'failed';
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
