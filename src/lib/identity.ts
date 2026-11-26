import { signal } from '@preact/signals';

const DEVICE_NAME_KEY = 'poordrops_device_name';
const LAST_ROOM_KEY = 'poordrops_last_room';

const ADJECTIVES = [
  'Cardboard',
  'Bubblewrap',
  'Airmail',
  'Parcel',
  'Thermal',
  'Kraft',
  'Express',
  'Tape',
  'Fragile',
  'Customs',
  'Stamped',
  'Postage',
];

const ANIMALS = [
  'Cat',
  'Pigeon',
  'Capybara',
  'Tortoise',
  'Badger',
  'Penguin',
  'Otter',
  'Gecko',
  'Hamster',
  'Duck',
  'Fox',
  'Wombat',
];

export interface LastRoomInfo {
  pin: string;
  peerName?: string;
  timestamp: number;
}

function randomInt(max: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function generateCargoAlias(): string {
  const adj = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const animal = ANIMALS[randomInt(ANIMALS.length)];
  const num = 10 + randomInt(90);
  return `${adj}-${animal}-${num}`;
}

export function generatePin(): string {
  return String(1000 + randomInt(9000));
}

function loadDeviceName(): string {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved && saved.trim().length > 0) return saved.trim().slice(0, 32);
  } catch {
    // ignore
  }
  const fresh = generateCargoAlias();
  try {
    localStorage.setItem(DEVICE_NAME_KEY, fresh);
  } catch {
    // ignore
  }
  return fresh;
}

function loadLastRoom(): LastRoomInfo | null {
  try {
    const raw = localStorage.getItem(LAST_ROOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastRoomInfo;
    if (parsed && /^\d{4}$/.test(parsed.pin)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export const deviceName = signal<string>(loadDeviceName());
export const lastRoom = signal<LastRoomInfo | null>(loadLastRoom());

export function updateDeviceName(next: string): string {
  const cleaned = next.trim().replace(/\s+/g, '-').slice(0, 32) || generateCargoAlias();
  deviceName.value = cleaned;
  try {
    localStorage.setItem(DEVICE_NAME_KEY, cleaned);
  } catch {
    // ignore
  }
  return cleaned;
}

export function saveLastRoom(pin: string, peerName?: string) {
  if (!/^\d{4}$/.test(pin)) return;
  const info: LastRoomInfo = { pin, peerName, timestamp: Date.now() };
  lastRoom.value = info;
  try {
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(info));
  } catch {
    // ignore
  }
}

export function extractPinFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const param = url.searchParams.get('pin');
    if (param && /^\d{4}$/.test(param)) return param;
  } catch {
    // fallback regex for partial strings or custom URLs
  }
  const match = trimmed.match(/[?&]pin=(\d{4})\b/) || trimmed.match(/\b(\d{4})\b/);
  return match ? match[1] : null;
}
