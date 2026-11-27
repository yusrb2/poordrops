import { signal } from '@preact/signals';

const TRUSTED_KEY = 'poordrops_trusted_couriers';

function loadTrusted(): string[] {
  try {
    const raw = localStorage.getItem(TRUSTED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export const trustedCouriers = signal<string[]>(loadTrusted());

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function isTrustedCourier(peerName?: string, peerId?: string): boolean {
  const list = trustedCouriers.value;
  if (peerName && list.includes(normalizeName(peerName))) return true;
  if (peerId && list.includes(normalizeName(peerId))) return true;
  return false;
}

export function setCourierTrusted(peerName: string, trusted: boolean) {
  const key = normalizeName(peerName);
  if (!key) return;
  const current = trustedCouriers.value;
  const next = trusted
    ? Array.from(new Set([...current, key]))
    : current.filter((item) => item !== key);
  trustedCouriers.value = next;
  try {
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function toggleTrustedCourier(peerName: string): boolean {
  const nextState = !isTrustedCourier(peerName);
  setCourierTrusted(peerName, nextState);
  return nextState;
}
