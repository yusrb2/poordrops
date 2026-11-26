import { useRef, useState } from 'preact/hooks';
import {
  Archive,
  FileUp,
  PackagePlus,
  Send,
  Trash2,
  X,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { TactileButton } from './ui/TactileButton';
import { cn } from '../lib/cn';
import { formatBytes, formatEta } from '../lib/crypto';
import { useT } from '../lib/i18n';
import { playClick } from '../lib/sound';
import { cancelTransfer, sendFilesToPeers } from '../lib/transfer';
import { createZipBundle } from '../lib/zipBundle';
import { isConnected } from '../state/p2pState';
import {
  activeTransfers,
  addStagedFiles,
  clearStagedFiles,
  removeStagedFile,
  sharedNotice,
  stagedFiles,
} from '../state/transferState';

export function CargoDropzone() {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bundling, setBundling] = useState(false);

  const connected = isConnected.value;
  const active = activeTransfers.value;
  const staged = stagedFiles.value;

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    playClick();
    addStagedFiles(Array.from(fileList));
  }

  async function handleSendRaw() {
    if (!connected || staged.length === 0) return;
    const batch = [...staged];
    clearStagedFiles();
    sharedNotice.value = null;
    await sendFilesToPeers(batch);
  }

  async function handleBundleZip() {
    if (!connected || staged.length === 0 || bundling) return;
    setBundling(true);
    try {
      const batch = [...staged];
      const zipFile = await createZipBundle(batch);
      clearStagedFiles();
      sharedNotice.value = null;
      await sendFilesToPeers([zipFile], { isZipBundle: true });
    } finally {
      setBundling(false);
    }
  }

  return (
    <ReceiptCard className="p-4 sm:p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="pb-2.5 mb-3 border-b border-dashed border-[var(--border-dashed)]">
          <div className="flex items-center gap-2">
            <PackagePlus size={16} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
            <h2 className="font-display-tsuki text-lg font-bold text-[var(--ink-primary)]">
              {t.cargo.title}
            </h2>
          </div>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.cargo.subtitle}</p>
        </div>

        {/* Scale Dropzone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer?.files ?? null);
          }}
          className={cn(
            'rounded-[6px] border-2 border-dashed p-5 text-center cursor-pointer transition-colors select-none',
            dragging
              ? 'border-[var(--accent-airmail)] bg-[var(--accent-airmail)]/10'
              : 'border-[var(--border-dashed)] bg-[var(--surface-inset)] hover:border-[var(--accent-airmail)]'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const target = e.target as HTMLInputElement;
              addFiles(target.files);
              target.value = '';
            }}
          />
          <FileUp
            size={26}
            strokeWidth={1.5}
            className={cn(
              'mx-auto mb-2',
              dragging ? 'text-[var(--accent-airmail)] scale-110 transition-transform' : 'text-[var(--ink-secondary)]'
            )}
          />
          <p className="text-sm font-bold text-[var(--ink-primary)]">
            {dragging ? t.cargo.dropActive : t.cargo.dropHere}
          </p>
          <p className="text-xs text-[var(--ink-secondary)] mt-1">{t.cargo.dropSub}</p>
        </div>

        {/* Staged Queue */}
        {staged.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs tabular-mono text-[var(--ink-secondary)]">
              <span>{t.cargo.stagedCount.replace('{n}', String(staged.length))}</span>
              <button
                type="button"
                onClick={() => {
                  playClick();
                  clearStagedFiles();
                  sharedNotice.value = null;
                }}
                className="inline-flex items-center gap-1 hover:text-[var(--accent-airmail)] cursor-pointer"
              >
                <Trash2 size={12} />
                <span>{t.cargo.clearStaged}</span>
              </button>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {staged.map((f, idx) => (
                <div
                  key={`${f.name}-${f.size}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-[4px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate font-semibold text-[var(--ink-primary)]">{f.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-mono text-[var(--ink-secondary)]">
                      {formatBytes(f.size)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => {
                        playClick();
                        removeStagedFile(idx);
                      }}
                      className="text-[var(--ink-secondary)] hover:text-[var(--accent-airmail)] cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons + Active Streams */}
      <div className="space-y-3">
        {!connected && staged.length > 0 && (
          <p className="text-xs text-[var(--accent-amber)] tabular-mono">{t.cargo.needPeer}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <TactileButton
            size="md"
            variant="primary"
            disabled={!connected || staged.length === 0 || bundling}
            onClick={handleSendRaw}
            className="flex-1"
          >
            <Send size={14} strokeWidth={1.5} />
            <span>{t.cargo.sendUncompressed}</span>
          </TactileButton>

          <TactileButton
            size="md"
            variant={staged.length > 1 ? 'cleared' : 'secondary'}
            disabled={!connected || staged.length === 0 || bundling}
            onClick={handleBundleZip}
          >
            <Archive size={14} strokeWidth={1.5} />
            <span>{bundling ? t.cargo.bundlingZip : t.cargo.bundleZip}</span>
          </TactileButton>
        </div>

        {/* Live Transfers */}
        {active.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-dashed border-[var(--border-dashed)]">
            {active.map((tr) => {
              const pct =
                tr.size > 0
                  ? Math.min(100, Math.round((tr.transferredBytes / tr.size) * 100))
                  : 100;
              return (
                <div
                  key={tr.id}
                  className="rounded-[5px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[var(--ink-primary)] truncate">
                      {tr.direction === 'send' ? t.cargo.sending : t.cargo.receiving}: {tr.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => cancelTransfer(tr.id)}
                      className="tabular-mono text-[11px] text-[var(--accent-airmail)] hover:underline cursor-pointer shrink-0"
                    >
                      {t.cargo.cancel}
                    </button>
                  </div>

                  {/* Parcel Tape Progress Bar */}
                  <div className="h-2.5 w-full overflow-hidden rounded-[3px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)]">
                    <div
                      className="h-full bg-[var(--accent-amber)] transition-all duration-150"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] tabular-mono text-[var(--ink-secondary)]">
                    <span>
                      {pct}% · {formatBytes(tr.transferredBytes)} / {formatBytes(tr.size)}
                    </span>
                    <span>
                      {tr.speedMBps.toFixed(2)} MB/s · {t.cargo.eta} {formatEta(tr.etaSeconds)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ReceiptCard>
  );
}
