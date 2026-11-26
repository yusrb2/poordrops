import { computed, signal } from '@preact/signals';
import type { DeviceKind, OsBadge } from '../lib/identity';

export type ConnectionState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'error';
export type NearbyScope = 'wifi' | 'lobby';
export type NearbyStatus = 'scanning' | 'ready' | 'error';

export interface PeerMeta {
  id: string;
  name: string;
  kind: DeviceKind;
  os: OsBadge;
  ready: boolean;
  source: 'nearby' | 'pin';
  joinedAt: number;
  lastSeen: number;
}

export const currentPin = signal<string>('');
export const connectionState = signal<ConnectionState>('idle');
export const p2pError = signal<string | null>(null);
export const selfPeerId = signal<string>('');

export const nearbyPeers = signal<Record<string, PeerMeta>>({});
export const pinPeers = signal<Record<string, PeerMeta>>({});
export const nearbyStatus = signal<NearbyStatus>('scanning');
export const nearbyScope = signal<NearbyScope>('wifi');

export const peers = computed<Record<string, PeerMeta>>(() => ({
  ...nearbyPeers.value,
  ...pinPeers.value,
}));

export const nearbyPeerList = computed(() => Object.values(nearbyPeers.value));
export const pinPeerList = computed(() => Object.values(pinPeers.value));
export const peerList = computed(() => Object.values(peers.value));
export const peerCount = computed(() => peerList.value.length);
export const isConnected = computed(() => peerCount.value > 0);
