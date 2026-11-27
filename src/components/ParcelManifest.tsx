import { useState } from 'preact/hooks';
import {
  Archive,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Forward,
  Receipt,
  Scissors,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { TactileButton } from './ui/TactileButton';
import { RubberStamp } from './ui/RubberStamp';
import { Modal } from './ui/Modal';
import { formatBytes } from '../lib/crypto';
import { useT } from '../lib/i18n';
import { playClick } from '../lib/sound';
import {
  addStagedFiles,
  manifestItems,
  sharedNotice,
  shredManifest,
  type ManifestItem,
} from '../state/transferState';

export function ParcelManifest() {
  const t = useT();
  const [previewItem, setPreviewItem] = useState<ManifestItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shredNotice, setShredNotice] = useState(false);

  const items = manifestItems.value;

  function triggerDownload(item: ManifestItem) {
    if (!item.objectUrl) return;
    const a = document.createElement('a');
    a.href = item.objectUrl;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openItem(item: ManifestItem) {
    if (!item.objectUrl) return;
    if (item.mime.startsWith('image/')) {
      setPreviewItem(item);
      return;
    }
    window.open(item.objectUrl, '_blank', 'noopener,noreferrer');
  }

  async function copyItemText(item: ManifestItem) {
    let textToCopy = item.textContent;
    if (!textToCopy && item.objectUrl && item.mime.startsWith('text/')) {
      try {
        const res = await fetch(item.objectUrl);
        textToCopy = await res.text();
      } catch {
        textToCopy = undefined;
      }
    }
    const fallback = `${item.name} (${formatBytes(item.size)})${item.sha256 ? ` · sha256:${item.sha256}` : ''}`;
    try {
      await navigator.clipboard.writeText(textToCopy ?? fallback);
      setCopiedId(`txt-${item.id}`);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }

  async function forwardItem(item: ManifestItem) {
    if (!item.objectUrl) return;
    playClick();
    try {
      const res = await fetch(item.objectUrl);
      const blob = await res.blob();
      const file = new File([blob], item.name, {
        type: item.mime || blob.type || 'application/octet-stream',
      });
      addStagedFiles([file]);
      sharedNotice.value = t.manifest.forwardedNotice;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // ignore
    }
  }

  async function copyHash(item: ManifestItem) {
    if (!item.sha256) return;
    try {
      await navigator.clipboard.writeText(item.sha256);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1400);
    } catch {
      // ignore
    }
  }

  function handleShred() {
    shredManifest();
    setShredNotice(true);
    setTimeout(() => setShredNotice(false), 2200);
  }

  return (
    <>
      <ReceiptCard serrated className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-dashed border-[var(--border-dashed)]">
          <div>
            <div className="flex items-center gap-2">
              <Receipt size={16} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
              <h2 className="tabular-mono text-base font-bold tracking-widest text-[var(--ink-primary)]">
                {t.manifest.title}
              </h2>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.manifest.subtitle}</p>
          </div>

          {items.length > 0 && (
            <TactileButton size="sm" variant="danger" onClick={handleShred}>
              <Scissors size={13} strokeWidth={1.5} />
              <span>{t.manifest.shredBtn}</span>
            </TactileButton>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-6 text-center space-y-1">
            <p className="font-display-tsuki text-base font-bold text-[var(--ink-primary)]">
              {shredNotice ? t.manifest.shredded : t.manifest.emptyTitle}
            </p>
            <p className="text-xs text-[var(--ink-secondary)]">{t.manifest.emptyBody}</p>
          </div>
        ) : (
          <div className="divide-y divide-dashed divide-[var(--border-dashed)]">
            {items.map((item) => {
              const isImage = item.mime.startsWith('image/') && Boolean(item.objectUrl);
              const stampLabel =
                item.verification === 'verified'
                  ? t.manifest.verified
                  : item.verification === 'mismatch'
                  ? t.manifest.mismatch
                  : t.manifest.unverified;
              const stampTone =
                item.verification === 'verified'
                  ? 'cleared'
                  : item.verification === 'mismatch'
                  ? 'airmail'
                  : 'amber';

              return (
                <div
                  key={item.id}
                  className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {isImage ? (
                      <button
                        type="button"
                        onClick={() => setPreviewItem(item)}
                        className="shrink-0 h-14 w-14 rounded-[4px] border border-[var(--border-dashed)] overflow-hidden bg-[var(--surface-inset)] cursor-pointer hover:opacity-90"
                        title={t.manifest.preview}
                      >
                        <img
                          src={item.objectUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="shrink-0 h-12 w-12 rounded-[4px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] flex items-center justify-center text-[var(--ink-secondary)]">
                        {item.isZipBundle ? (
                          <Archive size={20} strokeWidth={1.5} />
                        ) : (
                          <FileText size={20} strokeWidth={1.5} />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`tabular-mono text-[10px] font-bold px-1.5 py-0.5 rounded-[3px] border ${
                            item.direction === 'send'
                              ? 'border-[var(--accent-airmail)] text-[var(--accent-airmail)]'
                              : 'border-[var(--accent-cleared)] text-[var(--accent-cleared)]'
                          }`}
                        >
                          {item.direction === 'send' ? t.manifest.sent : t.manifest.recv}
                        </span>
                        <span className="font-bold text-sm text-[var(--ink-primary)] truncate max-w-[230px] sm:max-w-[340px]">
                          {item.name}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-mono text-[var(--ink-secondary)]">
                        <span>{formatBytes(item.size)}</span>
                        <span>·</span>
                        <span>{item.speedMBps.toFixed(2)} MB/s</span>
                        <span>·</span>
                        <span>{item.peerName}</span>
                        {item.sha256 && (
                          <>
                            <span>·</span>
                            <button
                              type="button"
                              onClick={() => copyHash(item)}
                              title={t.manifest.copyHash}
                              className="inline-flex items-center gap-1 hover:text-[var(--ink-primary)] cursor-pointer"
                            >
                              {copiedId === item.id ? (
                                <Check size={11} className="text-[var(--accent-cleared)]" />
                              ) : null}
                              <span>sha256:{item.sha256.slice(0, 10)}…</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <RubberStamp label={stampLabel} tone={stampTone} />

                    {item.objectUrl && (
                      <TactileButton
                        size="sm"
                        variant="secondary"
                        onClick={() => openItem(item)}
                      >
                        <ExternalLink size={13} strokeWidth={1.5} />
                        <span>{t.manifest.openFile}</span>
                      </TactileButton>
                    )}

                    <TactileButton
                      size="sm"
                      variant="secondary"
                      onClick={() => copyItemText(item)}
                    >
                      {copiedId === `txt-${item.id}` ? (
                        <Check size={13} className="text-[var(--accent-cleared)]" />
                      ) : (
                        <Copy size={13} strokeWidth={1.5} />
                      )}
                      <span>{copiedId === `txt-${item.id}` ? t.pairing.copied : t.manifest.copyText}</span>
                    </TactileButton>

                    {item.objectUrl && (
                      <TactileButton
                        size="sm"
                        variant="secondary"
                        onClick={() => forwardItem(item)}
                      >
                        <Forward size={13} strokeWidth={1.5} />
                        <span>{t.manifest.forwardBtn}</span>
                      </TactileButton>
                    )}

                    {item.objectUrl && (
                      <TactileButton
                        size="sm"
                        variant="cleared"
                        onClick={() => triggerDownload(item)}
                      >
                        <Download size={13} strokeWidth={1.5} />
                        <span>{t.manifest.saveFile}</span>
                      </TactileButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ReceiptCard>

      <Modal
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
        title={previewItem?.name || ''}
        description={previewItem ? `${formatBytes(previewItem.size)}` : undefined}
        maxWidthClass="max-w-2xl"
      >
        {previewItem?.objectUrl && (
          <div className="space-y-3">
            <img
              src={previewItem.objectUrl}
              alt={previewItem.name}
              className="max-h-[60dvh] w-full object-contain rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-inset)]"
            />
            <div className="flex justify-end">
              <TactileButton variant="cleared" size="sm" onClick={() => triggerDownload(previewItem)}>
                <Download size={14} />
                <span>{t.manifest.saveFile}</span>
              </TactileButton>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
