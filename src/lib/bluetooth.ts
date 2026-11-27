import { Capacitor, registerPlugin } from '@capacitor/core';
import { bytesToBase64 } from './relayTunnel';

export interface BleDeviceItem {
  id: string;
  name: string;
  rssi: number;
  bonded: boolean;
}

export interface BluetoothStatus {
  isNativeAndroid: boolean;
  webBluetoothSupported: boolean;
  available: boolean;
  enabled: boolean;
  hasPermission: boolean;
}

interface BluetoothTransferPluginNative {
  checkStatus: () => Promise<{ available: boolean; enabled: boolean; hasPermission: boolean }>;
  requestBluetoothPermissions: () => Promise<{ granted: boolean }>;
  shareViaBluetooth: (options: {
    text?: string;
    files?: Array<{ name: string; mime: string; dataBase64: string }>;
  }) => Promise<{ launched: boolean; directBluetooth: boolean }>;
  scanBleDevices: () => Promise<{ devices: BleDeviceItem[] }>;
  sendBleText: (options: { deviceId: string; text: string }) => Promise<{ sent: boolean }>;
}

interface WebBluetoothGattCharacteristic {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValueWithResponse?: (val: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (val: BufferSource) => Promise<void>;
  writeValue?: (val: BufferSource) => Promise<void>;
}

interface WebBluetoothGattService {
  getCharacteristics: () => Promise<WebBluetoothGattCharacteristic[]>;
}

interface WebBluetoothServer {
  connect: () => Promise<{
    getPrimaryServices: () => Promise<WebBluetoothGattService[]>;
    disconnect: () => void;
  }>;
}

interface WebBluetoothDevice {
  id: string;
  name?: string;
  gatt?: WebBluetoothServer;
}

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice: (opts: {
      acceptAllDevices?: boolean;
      optionalServices?: Array<string | number>;
    }) => Promise<WebBluetoothDevice>;
  };
}

const BluetoothTransfer = registerPlugin<BluetoothTransferPluginNative>('BluetoothTransfer');

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function isWebBluetoothSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return Boolean((navigator as NavigatorWithBluetooth).bluetooth?.requestDevice);
}

export async function getBluetoothEnvironment(): Promise<BluetoothStatus> {
  const native = isNativeAndroid();
  const webBt = isWebBluetoothSupported();

  if (native) {
    try {
      const st = await BluetoothTransfer.checkStatus();
      return {
        isNativeAndroid: true,
        webBluetoothSupported: webBt,
        available: st.available,
        enabled: st.enabled,
        hasPermission: st.hasPermission,
      };
    } catch {
      return {
        isNativeAndroid: true,
        webBluetoothSupported: webBt,
        available: false,
        enabled: false,
        hasPermission: false,
      };
    }
  }

  return {
    isNativeAndroid: false,
    webBluetoothSupported: webBt,
    available: webBt,
    enabled: webBt,
    hasPermission: webBt,
  };
}

export async function requestNativeBtPermissions(): Promise<boolean> {
  if (!isNativeAndroid()) return true;
  const res = await BluetoothTransfer.requestBluetoothPermissions();
  return Boolean(res.granted);
}

export async function shareFilesViaAndroidBluetooth(
  files: File[],
  text?: string
): Promise<{ launched: boolean; directBluetooth: boolean }> {
  const encodedFiles = await Promise.all(
    files.map(async (f) => {
      const buf = await f.arrayBuffer();
      return {
        name: f.name,
        mime: f.type || 'application/octet-stream',
        dataBase64: bytesToBase64(new Uint8Array(buf)),
      };
    })
  );

  return await BluetoothTransfer.shareViaBluetooth({
    text: text?.trim() || undefined,
    files: encodedFiles,
  });
}

export async function scanNearbyBleDevices(): Promise<BleDeviceItem[]> {
  if (isNativeAndroid()) {
    const res = await BluetoothTransfer.scanBleDevices();
    return res.devices || [];
  }
  const nav = navigator as NavigatorWithBluetooth;
  if (!nav.bluetooth?.requestDevice) {
    return [];
  }
  const dev = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['generic_access', '0000ffe0-0000-1000-8000-00805f9b34fb'],
  });
  return [
    {
      id: dev.id,
      name: dev.name || 'Bluetooth Device',
      rssi: -50,
      bonded: true,
    },
  ];
}

export async function sendBleClipboardText(deviceId: string, text: string): Promise<void> {
  if (isNativeAndroid()) {
    await BluetoothTransfer.sendBleText({ deviceId, text });
    return;
  }
  const nav = navigator as NavigatorWithBluetooth;
  if (!nav.bluetooth?.requestDevice) {
    throw new Error('Web Bluetooth is not supported in this browser.');
  }
  const dev = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
  });
  if (!dev.gatt) throw new Error('Selected device has no GATT server.');
  const server = await dev.gatt.connect();
  try {
    const services = await server.getPrimaryServices();
    const bytes = new TextEncoder().encode(text);
    for (const svc of services) {
      const chars = await svc.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) {
          if (ch.writeValueWithResponse) {
            await ch.writeValueWithResponse(bytes);
          } else if (ch.writeValueWithoutResponse) {
            await ch.writeValueWithoutResponse(bytes);
          } else if (ch.writeValue) {
            await ch.writeValue(bytes);
          }
          return;
        }
      }
    }
    throw new Error('No writable GATT characteristic found on selected device.');
  } finally {
    server.disconnect();
  }
}
