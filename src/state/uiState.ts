import { signal } from '@preact/signals';

export type TransferMode = 'radar' | 'qr' | 'bluetooth';

function detectInitialMode(): TransferMode {
  if (typeof window === 'undefined') return 'radar';
  const p = new URLSearchParams(window.location.search).get('pin');
  return p && /^\d{4}$/.test(p) ? 'qr' : 'radar';
}

export const activeMode = signal<TransferMode>(detectInitialMode());

export function setActiveMode(mode: TransferMode) {
  activeMode.value = mode;
}
