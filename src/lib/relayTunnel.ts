import mqtt, { type MqttClient } from 'mqtt';
import { computeSha256Hex } from './crypto';
import { localClientId } from './identity';

export type RelayMessageType =
  | 'hello'
  | 'ping'
  | 'pong'
  | 'clip'
  | 'offer'
  | 'offerReply'
  | 'meta'
  | 'chunk'
  | 'ack'
  | 'cancel';

export interface RelayEnvelope {
  mid: string;
  from: string;
  to?: string | null;
  type: RelayMessageType;
  payload: unknown;
}

interface WirePacket {
  e: 0 | 1;
  iv?: string;
  d?: string;
  m?: RelayEnvelope;
}

export interface RelayTunnel {
  send: (type: RelayMessageType, payload: unknown, targetClientId?: string) => Promise<void>;
  isConnected: () => boolean;
  openCount: () => number;
  close: () => void;
}

const RELAY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const MAX_SEEN_MIDS = 500;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 8192;
  for (let i = 0; i < bytes.length; i += step) {
    const slice = bytes.subarray(i, i + step);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function makeMsgId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${localClientId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function deriveRoomAesKey(roomId: string): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const rawSeed = new TextEncoder().encode(`poordrops-e2ee-v1:${roomId}`);
    const hash = await crypto.subtle.digest('SHA-256', rawSeed);
    return await crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

async function encryptEnvelope(
  envelope: RelayEnvelope,
  key: CryptoKey | null
): Promise<string> {
  if (!key || typeof crypto === 'undefined' || !crypto.subtle) {
    return JSON.stringify({ e: 0, m: envelope } satisfies WirePacket);
  }
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  const packet: WirePacket = {
    e: 1,
    iv: bytesToBase64(iv),
    d: bytesToBase64(new Uint8Array(cipherBuf)),
  };
  return JSON.stringify(packet);
}

async function decryptEnvelope(
  rawText: string,
  key: CryptoKey | null
): Promise<RelayEnvelope | null> {
  try {
    const parsed = JSON.parse(rawText) as WirePacket;
    if (parsed.e === 0 && parsed.m) {
      return parsed.m;
    }
    if (parsed.e === 1 && parsed.iv && parsed.d && key && crypto.subtle) {
      const ivBytes = base64ToBytes(parsed.iv);
      const cipherBytes = base64ToBytes(parsed.d);
      const ivCopy = new Uint8Array(ivBytes.byteLength);
      ivCopy.set(ivBytes);
      const cipherCopy = new Uint8Array(cipherBytes.byteLength);
      cipherCopy.set(cipherBytes);

      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivCopy },
        key,
        cipherCopy
      );
      const jsonStr = new TextDecoder().decode(plainBuf);
      return JSON.parse(jsonStr) as RelayEnvelope;
    }
  } catch {
    // ignore malformed or cross-key packets
  }
  return null;
}

export async function createRelayTunnel(
  roomId: string,
  onMessage: (envelope: RelayEnvelope) => void,
  onStatusChange?: (openBrokers: number) => void
): Promise<RelayTunnel> {
  const hash = await computeSha256Hex(new TextEncoder().encode(roomId).buffer);
  const topicSuffix = hash ? hash.slice(0, 16) : roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const topic = `poordrops/r1/${topicSuffix}`;
  const aesKey = await deriveRoomAesKey(roomId);

  const clients: MqttClient[] = [];
  const seenMids = new Set<string>();
  let closed = false;

  const markSeen = (mid: string): boolean => {
    if (seenMids.has(mid)) return false;
    seenMids.add(mid);
    if (seenMids.size > MAX_SEEN_MIDS) {
      const first = seenMids.values().next().value;
      if (first) seenMids.delete(first);
    }
    return true;
  };

  const countOpen = () => clients.filter((c) => c.connected).length;

  const notifyStatus = () => {
    if (!closed) {
      onStatusChange?.(countOpen());
    }
  };

  for (const url of RELAY_BROKERS) {
    try {
      const client = mqtt.connect(url, {
        clean: true,
        reconnectPeriod: 2500,
        connectTimeout: 6000,
        keepalive: 30,
      });

      client.on('connect', () => {
        if (closed) {
          client.end(true);
          return;
        }
        client.subscribe(topic, { qos: 0 }, () => {
          notifyStatus();
        });
      });

      client.on('reconnect', () => notifyStatus());
      client.on('close', () => notifyStatus());
      client.on('offline', () => notifyStatus());
      client.on('error', () => notifyStatus());

      client.on('message', async (recvTopic, buf) => {
        if (closed || recvTopic !== topic) return;
        const envelope = await decryptEnvelope(buf.toString(), aesKey);
        if (!envelope || !envelope.mid || !envelope.from) return;
        if (envelope.from === localClientId) return;
        if (envelope.to && envelope.to !== localClientId) return;
        if (!markSeen(envelope.mid)) return;
        onMessage(envelope);
      });

      clients.push(client);
    } catch {
      // ignore invalid broker init
    }
  }

  return {
    send: async (type, payload, targetClientId) => {
      if (closed) return;
      const envelope: RelayEnvelope = {
        mid: makeMsgId(),
        from: localClientId,
        to: targetClientId ?? null,
        type,
        payload,
      };
      const encoded = await encryptEnvelope(envelope, aesKey);
      for (const c of clients) {
        if (c.connected) {
          c.publish(topic, encoded, { qos: 0 });
        }
      }
    },
    isConnected: () => countOpen() > 0,
    openCount: countOpen,
    close: () => {
      closed = true;
      for (const c of clients) {
        try {
          c.end(true);
        } catch {
          // ignore
        }
      }
      clients.length = 0;
    },
  };
}
