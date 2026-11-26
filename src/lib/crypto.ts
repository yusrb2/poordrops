export async function computeSha256Hex(input: Blob | ArrayBuffer): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle?.digest) {
    return null;
  }
  try {
    const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const rounded = Math.ceil(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
