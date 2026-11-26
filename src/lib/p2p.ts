import { joinRoom, type MessageAction, type Room } from 'trystero';
import {
  deviceName,
  generatePin,
  saveLastRoom,
} from './identity';
import { playConnect } from './sound';
import {
  connectionState,
  currentPin,
  p2pError,
  peers,
  selfPeerId,
} from '../state/p2pState';

export interface HelloPayload {
  name: string;
}

export interface ClipPayload {
  id: string;
  text: string;
  senderName: string;
  sentAt: number;
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
  meta: MessageAction<TransferMetaPayload>;
  chunk: MessageAction<Uint8Array>;
  ack: MessageAction<TransferAckPayload>;
  cancel: MessageAction<TransferCancelPayload>;
}

type ActionListenersSetup = (room: Room, actions: P2PActions) => void;

const APP_ID = 'com.poordrops.app';

let activeRoom: Room | null = null;
let activeActions: P2PActions | null = null;
let joinGeneration = 0;
let extraSetupHook: ActionListenersSetup | null = null;

export function registerP2PActionHook(hook: ActionListenersSetup) {
  extraSetupHook = hook;
  if (activeRoom && activeActions) {
    hook(activeRoom, activeActions);
  }
}

export function getActiveRoom(): Room | null {
  return activeRoom;
}

export function getActiveActions(): P2PActions | null {
  return activeActions;
}

export function getPeerConnection(peerId: string): RTCPeerConnection | null {
  if (!activeRoom) return null;
  const info = activeRoom.getPeers()[peerId];
  return info?.connection ?? null;
}

export function buildShareUrl(pin: string): string {
  if (typeof window === 'undefined') return `?pin=${pin}`;
  const url = new URL(window.location.href);
  url.searchParams.set('pin', pin);
  return url.toString();
}

export function broadcastAlias(name?: string) {
  const alias = name ?? deviceName.value;
  if (!activeActions) return;
  activeActions.hello.send({ name: alias }).catch(() => {});
}

export async function leaveRoom() {
  joinGeneration += 1;
  const prev = activeRoom;
  activeRoom = null;
  activeActions = null;
  peers.value = {};
  p2pError.value = null;
  connectionState.value = 'idle';
  if (prev) {
    try {
      await prev.leave();
    } catch {
      // ignore teardown errors
    }
  }
}

export async function joinPin(pin: string) {
  const cleanPin = pin.trim();
  if (!/^\d{4}$/.test(cleanPin)) return;

  await leaveRoom();
  const gen = ++joinGeneration;

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

    if (gen !== joinGeneration) {
      room.leave().catch(() => {});
      return;
    }

    activeRoom = room;

    const actions: P2PActions = {
      hello: room.makeAction<HelloPayload>('hello'),
      clip: room.makeAction<ClipPayload>('clip'),
      meta: room.makeAction<TransferMetaPayload>('meta'),
      chunk: room.makeAction<Uint8Array>('chunk'),
      ack: room.makeAction<TransferAckPayload>('ack'),
      cancel: room.makeAction<TransferCancelPayload>('cancel'),
    };
    activeActions = actions;

    room.getSelf().then((self) => {
      if (gen === joinGeneration) {
        selfPeerId.value = self.peerId;
      }
    }).catch(() => {});

    room.ready.then(() => {
      if (gen === joinGeneration && Object.keys(peers.value).length === 0) {
        connectionState.value = 'waiting';
      }
    }).catch(() => {});

    actions.hello.onMessage((payload, { peerId }) => {
      if (gen !== joinGeneration) return;
      const existing = peers.value[peerId];
      const nextName = (payload?.name || '').trim() || existing?.name || `Courier-${peerId.slice(0, 4)}`;
      peers.value = {
        ...peers.value,
        [peerId]: {
          id: peerId,
          name: nextName,
          joinedAt: existing?.joinedAt ?? Date.now(),
        },
      };
      saveLastRoom(cleanPin, nextName);
    });

    room.onPeerJoin(({ peerId }) => {
      if (gen !== joinGeneration) return;
      const firstConnect = Object.keys(peers.value).length === 0;
      const placeholderName = peers.value[peerId]?.name ?? `Courier-${peerId.slice(0, 4)}`;
      peers.value = {
        ...peers.value,
        [peerId]: {
          id: peerId,
          name: placeholderName,
          joinedAt: Date.now(),
        },
      };
      connectionState.value = 'connected';
      saveLastRoom(cleanPin, placeholderName);
      if (firstConnect) playConnect();
      actions.hello.send({ name: deviceName.value }, { target: peerId }).catch(() => {});
    });

    room.onPeerLeave(({ peerId }) => {
      if (gen !== joinGeneration) return;
      const next = { ...peers.value };
      delete next[peerId];
      peers.value = next;
      if (Object.keys(next).length === 0) {
        connectionState.value = 'waiting';
      }
    });

    room.onError((err) => {
      if (gen !== joinGeneration) return;
      if (err.code === 'relay-failed') {
        p2pError.value = err.message;
        if (Object.keys(peers.value).length === 0) {
          connectionState.value = 'error';
        }
      }
    });

    if (extraSetupHook) {
      extraSetupHook(room, actions);
    }

    // Update browser URL cleanly without reloading so refresh keeps the room
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
