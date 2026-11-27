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
  localClientId,
  localDeviceKind,
  localOsBadge,
  saveLastRoom,
  type DeviceKind,
  type OsBadge,
} from './identity';
import {
  createRelayTunnel,
  type RelayEnvelope,
  type RelayTunnel,
} from './relayTunnel';
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
  peers,
  pinPeers,
  selfPeerId,
  signalingBrokerCount,
  signalingState,
  type PeerMeta,
  type TransportMode,
} from '../state/p2pState';

export interface HelloPayload {
  clientId: string;
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
  roomId: string;
  room: Room;
  actions: P2PActions;
  relay: RelayTunnel;
}

type RoomHook = (bundle: RoomBundle) => void;
type RelayHandler = (bundle: RoomBundle, envelope: RelayEnvelope) => void;

const APP_ID = 'poordrops-p2p-v1';
const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:a.relay.metered.ca:80',
        'turn:a.relay.metered.ca:443',
        'turn:a.relay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 8,
};

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const HEARTBEAT_MS = 2000;
const STALE_PEER_MS = 10000;
const RELAY_FALLBACK_MS = 4500;
const GRACE_OFFLINE_MS = 6000;

let nearbyBundle: RoomBundle | null = null;
let nearbyGeneration = 0;
let nearbyStartedAt = 0;
let pinBundle: RoomBundle | null = null;
let pinGeneration = 0;
let nearbyHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let actionHook: RoomHook | null = null;
let relayMessageHook: RelayHandler | null = null;
let lifecycleRegistered = false;
let lastWakeActionAt = 0;
let pruneSuspendedUntil = 0;

const monitoredPcs = new WeakSet<RTCPeerConnection>();
const trysteroIdToClient = new Map<string, string>();
const pendingRelayPings = new Map<string, (ms: number | null) => void>();

export function resolveClientId(trysteroPeerId: string): string {
  return trysteroIdToClient.get(trysteroPeerId) ?? trysteroPeerId;
}

function attachIceMonitor(pc: RTCPeerConnection | null | undefined) {
  if (!pc) return;
  iceState.value = pc.iceConnectionState;
  if (monitoredPcs.has(pc)) return;
  monitoredPcs.add(pc);
  pc.addEventListener('iceconnectionstatechange', () => {
    iceState.value = pc.iceConnectionState;
    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
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
    clientId: localClientId,
    peerId: selfPeerId.value || localClientId,
    name: deviceName.value,
    kind: localDeviceKind,
    deviceType: localDeviceKind,
    os: localOsBadge,
    ready: true,
    timestamp: Date.now(),
  };
}

function countOpenRelaySockets(): number {
  let open = 0;
  try {
    const sockets = getRelaySockets();
    for (const ws of Object.values(sockets)) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        open += 1;
      }
    }
  } catch {
    // ignore
  }
  if (nearbyBundle) {
    open = Math.max(open, nearbyBundle.relay.openCount());
  }
  if (pinBundle) {
    open = Math.max(open, pinBundle.relay.openCount());
  }
  return open;
}

export function registerP2PActionHook(hook: RoomHook) {
  actionHook = hook;
  if (nearbyBundle) hook(nearbyBundle);
  if (pinBundle) hook(pinBundle);
}

export function registerRelayMessageHandler(handler: RelayHandler) {
  relayMessageHook = handler;
}

export function getAllActiveBundles(): RoomBundle[] {
  const list: RoomBundle[] = [];
  if (nearbyBundle) list.push(nearbyBundle);
  if (pinBundle) list.push(pinBundle);
  return list;
}

export function getPeerTransportContext(clientId: string): {
  bundle: RoomBundle;
  peerMeta: PeerMeta;
  trysteroPeerId?: string;
  connection: RTCPeerConnection | null;
  mode: TransportMode;
} | null {
  const pinMeta = pinPeers.value[clientId];
  if (pinMeta && pinBundle) {
    const tId = pinMeta.trysteroPeerId;
    const conn = tId ? pinBundle.room.getPeers()[tId]?.connection ?? null : null;
    const directLive = Boolean(tId && pinBundle.room.getPeers()[tId]);
    return {
      bundle: pinBundle,
      peerMeta: pinMeta,
      trysteroPeerId: directLive ? tId : undefined,
      connection: conn,
      mode: directLive && pinMeta.transportMode === 'direct' ? 'direct' : 'relay',
    };
  }

  const nearMeta = nearbyPeers.value[clientId];
  if (nearMeta && nearbyBundle) {
    const tId = nearMeta.trysteroPeerId;
    const conn = tId ? nearbyBundle.room.getPeers()[tId]?.connection ?? null : null;
    const directLive = Boolean(tId && nearbyBundle.room.getPeers()[tId]);
    return {
      bundle: nearbyBundle,
      peerMeta: nearMeta,
      trysteroPeerId: directLive ? tId : undefined,
      connection: conn,
      mode: directLive && nearMeta.transportMode === 'direct' ? 'direct' : 'relay',
    };
  }

  return null;
}

export function getPeerConnection(clientId: string): RTCPeerConnection | null {
  return getPeerTransportContext(clientId)?.connection ?? null;
}

export async function pingPeer(clientId: string): Promise<number | null> {
  const ctx = getPeerTransportContext(clientId);
  if (!ctx) return null;

  if (ctx.mode === 'direct' && ctx.trysteroPeerId) {
    try {
      const ms = await Promise.race<number | null>([
        ctx.bundle.room.ping(ctx.trysteroPeerId).then((r) => Math.max(1, Math.round(r))),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
      ]);
      if (ms !== null) return ms;
    } catch {
      // fall through to relay ping
    }
  }

  const pingId = `${localClientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = performance.now();
  return new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      pendingRelayPings.delete(pingId);
      resolve(null);
    }, 4500);

    pendingRelayPings.set(pingId, (ms) => {
      clearTimeout(timer);
      resolve(ms);
    });

    ctx.bundle.relay
      .send('ping', { id: pingId, sentAt: startedAt }, clientId)
      .catch(() => {
        clearTimeout(timer);
        pendingRelayPings.delete(pingId);
        resolve(null);
      });
  });
}

export function buildShareUrl(pin: string): string {
  if (typeof window === 'undefined') return `?pin=${pin}`;
  const url = new URL(window.location.href);
  url.searchParams.set('pin', pin);
  return url.toString();
}

function sendBeaconToBundle(bundle: RoomBundle | null, targetTrysteroId?: string) {
  if (!bundle) return;
  const payload = makeHelloPayload();
  bundle.actions.hello
    .send(payload, targetTrysteroId ? { target: targetTrysteroId } : undefined)
    .catch(() => {});
  bundle.relay.send('hello', payload).catch(() => {});
}

export function broadcastAlias(name?: string) {
  const payload: HelloPayload = {
    ...makeHelloPayload(),
    name: name ?? deviceName.value,
  };
  if (nearbyBundle) {
    nearbyBundle.actions.hello.send(payload).catch(() => {});
    nearbyBundle.relay.send('hello', payload).catch(() => {});
  }
  if (pinBundle) {
    pinBundle.actions.hello.send(payload).catch(() => {});
    pinBundle.relay.send('hello', payload).catch(() => {});
  }
}

function updatePeerRecord(
  source: 'nearby' | 'pin',
  clientId: string,
  patch: Partial<PeerMeta>
) {
  const targetSignal = source === 'nearby' ? nearbyPeers : pinPeers;
  const current = targetSignal.value;
  const existing = current[clientId];
  const now = Date.now();
  const isNew = !existing;
  const nextRecord: PeerMeta = {
    id: clientId,
    trysteroPeerId: patch.trysteroPeerId ?? existing?.trysteroPeerId,
    name: patch.name || existing?.name || `Courier-${clientId.slice(0, 4)}`,
    kind: patch.kind || existing?.kind || 'desktop',
    os: patch.os || existing?.os || 'Web',
    ready: patch.ready ?? existing?.ready ?? true,
    source,
    transportMode: patch.transportMode ?? existing?.transportMode ?? 'relay',
    relayReady:
      patch.relayReady ??
      existing?.relayReady ??
      (now - (existing?.discoveredAt ?? now) >= RELAY_FALLBACK_MS),
    discoveredAt: existing?.discoveredAt ?? now,
    joinedAt: existing?.joinedAt ?? now,
    lastSeen: now,
  };
  targetSignal.value = {
    ...current,
    [clientId]: nextRecord,
  };
  if (isNew) {
    playConnect();
  }
}

function removePeerRecord(source: 'nearby' | 'pin', clientId: string) {
  const targetSignal = source === 'nearby' ? nearbyPeers : pinPeers;
  if (!targetSignal.value[clientId]) return;
  const next = { ...targetSignal.value };
  delete next[clientId];
  targetSignal.value = next;
}

function pruneStaleNearbyPeers() {
  const now = Date.now();
  if (now < pruneSuspendedUntil) return;

  const current = nearbyPeers.value;
  let changed = false;
  const next: Record<string, PeerMeta> = {};

  for (const [id, peer] of Object.entries(current)) {
    const activeDirect = Boolean(
      peer.trysteroPeerId && nearbyBundle?.room.getPeers()[peer.trysteroPeerId]
    );
    if (activeDirect || now - peer.lastSeen <= STALE_PEER_MS) {
      if (!activeDirect && peer.transportMode === 'relay' && !peer.relayReady && now - peer.discoveredAt >= RELAY_FALLBACK_MS) {
        next[id] = { ...peer, relayReady: true };
        changed = true;
      } else {
        next[id] = peer;
      }
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

function handleRelayEnvelope(bundle: RoomBundle, envelope: RelayEnvelope) {
  if (envelope.type === 'hello') {
    const p = envelope.payload as Partial<HelloPayload> | null;
    if (!p) return;
    const cid = p.clientId || envelope.from;
    const targetMap = bundle.source === 'nearby' ? nearbyPeers.value : pinPeers.value;
    const existing = targetMap[cid];
    const directAlive = Boolean(
      existing?.trysteroPeerId && bundle.room.getPeers()[existing.trysteroPeerId]
    );
    updatePeerRecord(bundle.source, cid, {
      name: (p.name || '').trim() || undefined,
      kind: p.deviceType || p.kind,
      os: p.os,
      ready: p.ready,
      transportMode: directAlive ? 'direct' : 'relay',
    });
    if (bundle.source === 'nearby') {
      nearbyStatus.value = 'ready';
      signalingState.value = 'connected';
      isRescanning.value = false;
    } else {
      connectionState.value = 'connected';
    }
    return;
  }

  if (envelope.type === 'ping') {
    const p = envelope.payload as { id?: string; sentAt?: number } | null;
    if (p?.id) {
      bundle.relay.send('pong', { id: p.id, sentAt: p.sentAt }, envelope.from).catch(() => {});
    }
    return;
  }

  if (envelope.type === 'pong') {
    const p = envelope.payload as { id?: string; sentAt?: number } | null;
    if (p?.id) {
      const resolver = pendingRelayPings.get(p.id);
      if (resolver) {
        pendingRelayPings.delete(p.id);
        const elapsed =
          typeof p.sentAt === 'number'
            ? Math.max(1, Math.round(performance.now() - p.sentAt))
            : 1;
        resolver(elapsed);
      }
    }
    return;
  }

  relayMessageHook?.(bundle, envelope);
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
    prev.relay.close();
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

    const actions = buildActions(room);
    const bundle: RoomBundle = {
      source: 'nearby',
      roomId,
      room,
      actions,
      relay: await createRelayTunnel(
        roomId,
        (env) => {
          if (gen === nearbyGeneration) handleRelayEnvelope(bundle, env);
        },
        (openBrokers) => {
          if (gen !== nearbyGeneration) return;
          if (openBrokers > 0) {
            nearbyStatus.value = 'ready';
            signalingState.value = 'connected';
            isRescanning.value = false;
            bundle.relay.send('hello', makeHelloPayload()).catch(() => {});
          }
        }
      ),
    };

    if (gen !== nearbyGeneration) {
      bundle.relay.close();
      room.leave().catch(() => {});
      return;
    }

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
        sendBeaconToBundle(bundle);
      })
      .catch(() => {
        if (gen === nearbyGeneration && bundle.relay.isConnected()) {
          nearbyStatus.value = 'ready';
          signalingState.value = 'connected';
          isRescanning.value = false;
        }
      });

    actions.hello.onMessage((payload, { peerId }) => {
      if (gen !== nearbyGeneration || !payload) return;
      const cid = payload.clientId || peerId;
      trysteroIdToClient.set(peerId, cid);
      updatePeerRecord('nearby', cid, {
        trysteroPeerId: peerId,
        name: (payload.name || '').trim() || undefined,
        kind: payload.deviceType || payload.kind,
        os: payload.os,
        ready: payload.ready,
        transportMode: 'direct',
        relayReady: true,
      });
      nearbyStatus.value = 'ready';
      signalingState.value = 'connected';
      scanRoomConnections(room);
    });

    room.onPeerJoin(({ peerId }) => {
      if (gen !== nearbyGeneration) return;
      nearbyStatus.value = 'ready';
      signalingState.value = 'connected';
      isRescanning.value = false;
      lastError.value = null;
      scanRoomConnections(room);
      sendBeaconToBundle(bundle, peerId);
    });

    room.onPeerLeave(({ peerId }) => {
      if (gen !== nearbyGeneration) return;
      const cid = trysteroIdToClient.get(peerId);
      trysteroIdToClient.delete(peerId);
      if (cid && nearbyPeers.value[cid]) {
        // Keep peer alive on Relay Active if relay is still connected
        if (bundle.relay.isConnected()) {
          updatePeerRecord('nearby', cid, {
            trysteroPeerId: undefined,
            transportMode: 'relay',
            relayReady: true,
          });
        } else {
          removePeerRecord('nearby', cid);
        }
      }
    });

    room.onError((err) => {
      if (gen !== nearbyGeneration) return;
      lastError.value = err.message || err.code;
      if (err.code === 'peer-connect-failed') {
        // Symmetric NAT blocked direct WebRTC; peers seamlessly stay on Relay Active
        iceState.value = 'disconnected';
      } else if (err.code === 'relay-failed' && !bundle.relay.isConnected()) {
        signalingState.value = 'error';
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
      } else if (openCount > 0 || Object.keys(peers.value).length > 0) {
        nearbyStatus.value = 'ready';
        signalingState.value = 'connected';
      } else if (Date.now() - nearbyStartedAt > GRACE_OFFLINE_MS) {
        nearbyStatus.value = 'offline';
        signalingState.value = 'error';
      }

      if (openCount > 0) {
        sendBeaconToBundle(nearbyBundle);
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
      sendBeaconToBundle(pinBundle);
    }
  } finally {
    setTimeout(() => {
      isRescanning.value = false;
    }, 1500);
  }
}

function handleWakeResume() {
  const now = Date.now();
  pruneSuspendedUntil = now + 6000;
  if (now - lastWakeActionAt < 900) return;
  lastWakeActionAt = now;

  const openCount = countOpenRelaySockets();
  if (!nearbyBundle || (openCount === 0 && !nearbyBundle.relay.isConnected())) {
    rescanNearbyDiscovery({ forceReconnect: true });
  } else {
    sendBeaconToBundle(nearbyBundle);
    sendBeaconToBundle(pinBundle);
  }
}

export function registerLifecycleListeners() {
  if (lifecycleRegistered || typeof window === 'undefined') return;
  lifecycleRegistered = true;

  // Never call room.leave() on visibilitychange/pagehide (Android file picker triggers temporary backgrounding)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pruneSuspendedUntil = Date.now() + 20000;
    } else if (document.visibilityState === 'visible') {
      handleWakeResume();
    }
  });

  window.addEventListener('pagehide', () => {
    pruneSuspendedUntil = Date.now() + 20000;
  });

  window.addEventListener('online', () => {
    rescanNearbyDiscovery({ forceReconnect: true });
  });

  window.addEventListener('offline', () => {
    nearbyStatus.value = 'offline';
    signalingState.value = 'error';
    signalingBrokerCount.value = 0;
  });

  try {
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        pruneSuspendedUntil = Date.now() + 20000;
      } else {
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
    prev.relay.close();
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
  const roomId = `poordrops-v1-${cleanPin}`;

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
      roomId
    );

    const actions = buildActions(room);
    const bundle: RoomBundle = {
      source: 'pin',
      roomId,
      room,
      actions,
      relay: await createRelayTunnel(
        roomId,
        (env) => {
          if (gen === pinGeneration) handleRelayEnvelope(bundle, env);
        },
        (openBrokers) => {
          if (gen !== pinGeneration) return;
          if (openBrokers > 0) {
            bundle.relay.send('hello', makeHelloPayload()).catch(() => {});
          }
        }
      ),
    };

    if (gen !== pinGeneration) {
      bundle.relay.close();
      room.leave().catch(() => {});
      return;
    }

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
      sendBeaconToBundle(bundle);
    }).catch(() => {});

    actions.hello.onMessage((payload, { peerId }) => {
      if (gen !== pinGeneration || !payload) return;
      const cid = payload.clientId || peerId;
      trysteroIdToClient.set(peerId, cid);
      const nextName = (payload.name || '').trim() || `Courier-${cid.slice(0, 4)}`;
      updatePeerRecord('pin', cid, {
        trysteroPeerId: peerId,
        name: nextName,
        kind: payload.deviceType || payload.kind,
        os: payload.os,
        ready: payload.ready,
        transportMode: 'direct',
        relayReady: true,
      });
      connectionState.value = 'connected';
      saveLastRoom(cleanPin, nextName);
      scanRoomConnections(room);
    });

    room.onPeerJoin(({ peerId }) => {
      if (gen !== pinGeneration) return;
      connectionState.value = 'connected';
      lastError.value = null;
      scanRoomConnections(room);
      sendBeaconToBundle(bundle, peerId);
    });

    room.onPeerLeave(({ peerId }) => {
      if (gen !== pinGeneration) return;
      const cid = trysteroIdToClient.get(peerId);
      trysteroIdToClient.delete(peerId);
      if (cid && pinPeers.value[cid]) {
        if (bundle.relay.isConnected()) {
          updatePeerRecord('pin', cid, {
            trysteroPeerId: undefined,
            transportMode: 'relay',
            relayReady: true,
          });
        } else {
          removePeerRecord('pin', cid);
        }
      }
      if (Object.keys(pinPeers.value).length === 0) {
        connectionState.value = 'waiting';
      }
    });

    room.onError((err) => {
      if (gen !== pinGeneration) return;
      p2pError.value = err.message;
      lastError.value = err.message || err.code;
      if (err.code === 'peer-connect-failed') {
        iceState.value = 'disconnected';
      } else if (err.code === 'relay-failed' && !bundle.relay.isConnected()) {
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
