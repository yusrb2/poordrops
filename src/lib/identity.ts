import { signal } from '@preact/signals';

const DEVICE_NAME_KEY = 'poordrops_device_name';
const DEVICE_STAMP_KEY = 'poordrops_avatar_stamp';
const LAST_ROOM_KEY = 'poordrops_last_room';

export type DeviceKind = 'mobile' | 'desktop';
export type OsBadge = 'Android' | 'iOS' | 'Windows' | 'macOS' | 'Linux' | 'Web';
export type AvatarStampId = 'package' | 'send' | 'compass' | 'truck' | 'mail' | 'stamp';

const VALID_STAMPS: AvatarStampId[] = ['package', 'send', 'compass', 'truck', 'mail', 'stamp'];

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

function detectDeviceProfile(): { kind: DeviceKind; os: OsBadge } {
  if (typeof navigator === 'undefined') {
    return { kind: 'desktop', os: 'Web' };
  }
  const ua = navigator.userAgent || '';
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    '';
  const combined = `${ua} ${platform}`;

  let os: OsBadge = 'Web';
  if (/Android/i.test(combined)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(combined)) os = 'iOS';
  else if (/Win/i.test(combined)) os = 'Windows';
  else if (/Mac/i.test(combined)) os = 'macOS';
  else if (/Linux/i.test(combined)) os = 'Linux';

  const isMobile = os === 'Android' || os === 'iOS' || /Mobi|Tablet/i.test(ua);

  return {
    kind: isMobile ? 'mobile' : 'desktop',
    os,
  };
}

function makeClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

const detected = detectDeviceProfile();
export const localDeviceKind: DeviceKind = detected.kind;
export const localOsBadge: OsBadge = detected.os;
export const localClientId: string = makeClientId();

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

function loadDeviceStamp(): AvatarStampId {
  try {
    const saved = localStorage.getItem(DEVICE_STAMP_KEY) as AvatarStampId | null;
    if (saved && VALID_STAMPS.includes(saved)) return saved;
  } catch {
    // ignore
  }
  return 'package';
}

export const deviceName = signal<string>(loadDeviceName());
export const deviceStamp = signal<AvatarStampId>(loadDeviceStamp());
export const lastRoom = signal<LastRoomInfo | null>(loadLastRoom());

export function updateDeviceStamp(stamp: AvatarStampId) {
  deviceStamp.value = stamp;
  try {
    localStorage.setItem(DEVICE_STAMP_KEY, stamp);
  } catch {
    // ignore
  }
}

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
