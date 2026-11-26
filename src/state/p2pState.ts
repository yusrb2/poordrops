import { computed, signal } from '@preact/signals';

export type ConnectionState = 'idle' | 'waiting' | 'connecting' | 'connected' | 'error';

export interface PeerMeta {
  id: string;
  name: string;
  joinedAt: number;
}

export const currentPin = signal<string>('');
export const connectionState = signal<ConnectionState>('idle');
export const peers = signal<Record<string, PeerMeta>>({});
export const p2pError = signal<string | null>(null);
export const selfPeerId = signal<string>('');

export const peerList = computed(() => Object.values(peers.value));
export const peerCount = computed(() => Object.keys(peers.value).length);
export const isConnected = computed(() => peerCount.value > 0);
