import { Capacitor } from '@capacitor/core';
import { dict, locale } from './i18n';
import {
  addStagedFiles,
  clipboardText,
  sharedArrival,
  sharedNotice,
} from '../state/transferState';

interface NativeSharedFile {
  name: string;
  mime: string;
  size: number;
  filePath: string;
}

interface NativeSharePayload {
  text?: string;
  files?: NativeSharedFile[];
}

interface PwaShareManifest {
  text?: string;
  files?: Array<{ key: string; name: string; type: string }>;
}

interface WindowWithShareBridge extends Window {
  PoorDropsShareBridge?: {
    consumePendingShare: () => string;
  };
}

function notifyShareLoaded(fileCount: number, hasText: boolean) {
  sharedNotice.value = dict[locale.value].radar.shareReady;
  sharedArrival.value = { fileCount, hasText };
}

async function consumeNativeAndroidShare() {
  const bridge = (window as WindowWithShareBridge).PoorDropsShareBridge;
  if (!bridge?.consumePendingShare) return;

  try {
    const raw = bridge.consumePendingShare();
    if (!raw) return;
    const payload = JSON.parse(raw) as NativeSharePayload;

    let hasText = false;
    let fileCount = 0;

    if (payload.text && payload.text.trim().length > 0) {
      clipboardText.value = payload.text.trim();
      hasText = true;
    }

    if (Array.isArray(payload.files) && payload.files.length > 0) {
      const converted: File[] = [];
      for (const item of payload.files) {
        if (!item.filePath) continue;
        try {
          const webUrl = Capacitor.convertFileSrc(item.filePath);
          const res = await fetch(webUrl);
          if (!res.ok) continue;
          const blob = await res.blob();
          converted.push(
            new File([blob], item.name || 'shared-parcel', {
              type: item.mime || blob.type || 'application/octet-stream',
            })
          );
        } catch {
          // skip unreadable file
        }
      }
      if (converted.length > 0) {
        addStagedFiles(converted);
        fileCount = converted.length;
      }
    }

    if (hasText || fileCount > 0) {
      notifyShareLoaded(fileCount, hasText);
    }
  } catch {
    // ignore invalid JSON
  }
}

async function consumePwaShareTarget() {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('shared') !== '1') return;

  url.searchParams.delete('shared');
  window.history.replaceState(null, '', url.toString());

  try {
    const cache = await caches.open('poordrops-share-v1');
    const manifestRes = await cache.match('/__shared_manifest');
    if (!manifestRes) return;

    const manifest = (await manifestRes.json()) as PwaShareManifest;
    let hasText = false;
    let fileCount = 0;

    if (manifest.text && manifest.text.trim().length > 0) {
      clipboardText.value = manifest.text.trim();
      hasText = true;
    }

    if (Array.isArray(manifest.files) && manifest.files.length > 0) {
      const loadedFiles: File[] = [];
      for (const entry of manifest.files) {
        const res = await cache.match(entry.key);
        if (!res) continue;
        const blob = await res.blob();
        loadedFiles.push(
          new File([blob], entry.name || 'shared-parcel', {
            type: entry.type || blob.type || 'application/octet-stream',
          })
        );
        await cache.delete(entry.key);
      }
      if (loadedFiles.length > 0) {
        addStagedFiles(loadedFiles);
        fileCount = loadedFiles.length;
      }
    }

    await cache.delete('/__shared_manifest');
    if (hasText || fileCount > 0) {
      notifyShareLoaded(fileCount, hasText);
    }
  } catch {
    // ignore cache errors
  }
}

let shareListenerRegistered = false;

export function initShareTargetListener() {
  if (typeof window === 'undefined' || shareListenerRegistered) return;
  shareListenerRegistered = true;

  window.addEventListener('poordrops:native-share', () => {
    consumeNativeAndroidShare();
  });

  consumeNativeAndroidShare();
  consumePwaShareTarget();
}
