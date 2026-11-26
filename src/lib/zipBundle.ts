import { zip } from 'fflate';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildBundleName(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  return `poordrops-bundle-${stamp}.zip`;
}

function uniqueEntryName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let idx = 2;
  while (used.has(`${base} (${idx})${ext}`)) {
    idx += 1;
  }
  const candidate = `${base} (${idx})${ext}`;
  used.add(candidate);
  return candidate;
}

export async function createZipBundle(files: File[]): Promise<File> {
  const entries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();

  for (const file of files) {
    const rawPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const baseName = rawPath && rawPath.trim().length > 0 ? rawPath : file.name;
    const entryName = uniqueEntryName(baseName, usedNames);
    const buf = await file.arrayBuffer();
    entries[entryName] = new Uint8Array(buf);
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 1 }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const copied = new Uint8Array(zipped.byteLength);
  copied.set(zipped);

  return new File([copied], buildBundleName(), {
    type: 'application/zip',
    lastModified: Date.now(),
  });
}
