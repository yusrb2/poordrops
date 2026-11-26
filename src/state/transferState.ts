import { signal } from '@preact/signals';
import { playShred } from '../lib/sound';

const AUTOCOPY_KEY = 'poordrops_autocopy';

function loadAutoCopy(): boolean {
  try {
    return localStorage.getItem(AUTOCOPY_KEY) === '1';
  } catch {
    return false;
  }
}

export interface ClipboardMeta {
  senderName: string;
  receivedAt: number;
  isRemote: boolean;
}

export interface ActiveTransfer {
  id: string;
  direction: 'send' | 'recv';
  name: string;
  size: number;
  transferredBytes: number;
  speedMBps: number;
  etaSeconds: number;
  peerName: string;
}

export type VerificationStatus = 'verified' | 'mismatch' | 'unverified';

export interface ManifestItem {
  id: string;
  direction: 'send' | 'recv';
  name: string;
  size: number;
  mime: string;
  sha256: string | null;
  verification: VerificationStatus;
  speedMBps: number;
  timestamp: number;
  peerName: string;
  objectUrl?: string;
  isZipBundle?: boolean;
}

export const clipboardText = signal<string>('');
export const clipboardMeta = signal<ClipboardMeta | null>(null);
export const autoCopyEnabled = signal<boolean>(loadAutoCopy());
export const autoCopyWarning = signal<string | null>(null);

export const activeTransfers = signal<ActiveTransfer[]>([]);
export const manifestItems = signal<ManifestItem[]>([]);

export function setAutoCopy(next: boolean) {
  autoCopyEnabled.value = next;
  autoCopyWarning.value = null;
  try {
    localStorage.setItem(AUTOCOPY_KEY, next ? '1' : '0');
  } catch {
    // ignore
  }
}

export function upsertActiveTransfer(item: ActiveTransfer) {
  const list = activeTransfers.value;
  const idx = list.findIndex((t) => t.id === item.id);
  if (idx === -1) {
    activeTransfers.value = [item, ...list];
  } else {
    const next = [...list];
    next[idx] = item;
    activeTransfers.value = next;
  }
}

export function removeActiveTransfer(id: string) {
  activeTransfers.value = activeTransfers.value.filter((t) => t.id !== id);
}

export function addManifestItem(item: ManifestItem) {
  manifestItems.value = [item, ...manifestItems.value];
}

export function updateManifestVerification(
  id: string,
  verification: VerificationStatus,
  sha256?: string | null
) {
  manifestItems.value = manifestItems.value.map((item) =>
    item.id === id
      ? { ...item, verification, sha256: sha256 !== undefined ? sha256 : item.sha256 }
      : item
  );
}

export function shredManifest() {
  for (const item of manifestItems.value) {
    if (item.objectUrl) {
      URL.revokeObjectURL(item.objectUrl);
    }
  }
  manifestItems.value = [];
  playShred();
}
