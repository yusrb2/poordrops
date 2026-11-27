import { computed, signal } from '@preact/signals';
import type { DeviceKind, OsBadge } from '../lib/identity';
import { playShred } from '../lib/sound';

const AUTOCOPY_KEY = 'poordrops_autocopy';
const AUTOACCEPT_KEY = 'poordrops_auto_accept';

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === null) return fallback;
    return val === '1';
  } catch {
    return fallback;
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
  textContent?: string;
  isZipBundle?: boolean;
}

export interface OfferFileSummary {
  name: string;
  size: number;
  mime: string;
}

export interface IncomingOffer {
  offerId: string;
  peerId: string;
  peerName: string;
  peerKind: DeviceKind;
  peerOs: OsBadge;
  files: OfferFileSummary[];
  totalSize: number;
  isZipBundle?: boolean;
  receivedAt: number;
}

export interface OutgoingOfferStatus {
  peerName: string;
  state: 'waiting' | 'declined' | 'timeout';
}

export const stagedFiles = signal<File[]>([]);
export const sharedNotice = signal<string | null>(null);
export const sharedArrival = signal<{ fileCount: number; hasText: boolean } | null>(null);
export const relaySizeNotice = signal<string | null>(null);

export const clipboardText = signal<string>('');
export const clipboardMeta = signal<ClipboardMeta | null>(null);
export const autoCopyEnabled = signal<boolean>(loadBool(AUTOCOPY_KEY, false));
export const autoCopyWarning = signal<string | null>(null);

export const autoAcceptEnabled = signal<boolean>(loadBool(AUTOACCEPT_KEY, false));
export const pendingOffers = signal<IncomingOffer[]>([]);
export const pendingOffer = computed(() => pendingOffers.value[0] ?? null);
export const outgoingOfferStatus = signal<OutgoingOfferStatus | null>(null);

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

export function setAutoAccept(next: boolean) {
  autoAcceptEnabled.value = next;
  try {
    localStorage.setItem(AUTOACCEPT_KEY, next ? '1' : '0');
  } catch {
    // ignore
  }
}

export function addStagedFiles(files: File[]) {
  if (files.length === 0) return;
  stagedFiles.value = [...stagedFiles.value, ...files];
}

export function removeStagedFile(index: number) {
  stagedFiles.value = stagedFiles.value.filter((_, idx) => idx !== index);
}

export function clearStagedFiles() {
  stagedFiles.value = [];
}

export function enqueueIncomingOffer(offer: IncomingOffer) {
  pendingOffers.value = [...pendingOffers.value, offer];
}

export function shiftIncomingOffer(): IncomingOffer | null {
  const [first, ...rest] = pendingOffers.value;
  pendingOffers.value = rest;
  return first ?? null;
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
