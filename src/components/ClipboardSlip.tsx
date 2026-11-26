import { useRef, useState } from 'preact/hooks';
import {
  Check,
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  Send,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { TactileButton } from './ui/TactileButton';
import { Switch } from './ui/Switch';
import { useT } from '../lib/i18n';
import { pushClipboardText } from '../lib/transfer';
import { isConnected } from '../state/p2pState';
import {
  autoCopyEnabled,
  autoCopyWarning,
  clipboardMeta,
  clipboardText,
  setAutoCopy,
} from '../state/transferState';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX) || [];
  return Array.from(new Set(matches)).slice(0, 4);
}

export function ClipboardSlip() {
  const t = useT();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const text = clipboardText.value;
  const meta = clipboardMeta.value;
  const connected = isConnected.value;
  const urls = extractUrls(text);

  function handleInput(val: string) {
    clipboardText.value = val;
    if (!connected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushClipboardText(val);
    }, 180);
  }

  async function handlePasteClick() {
    try {
      const pasted = await navigator.clipboard.readText();
      clipboardText.value = pasted;
      if (connected) {
        await pushClipboardText(pasted);
      }
    } catch {
      // Fallback: focus textarea so user can Ctrl+V manually
    }
  }

  async function copyString(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <ReceiptCard className="p-4 sm:p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-3 border-b border-dashed border-[var(--border-dashed)]">
          <div>
            <div className="flex items-center gap-2">
              <Clipboard size={16} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
              <h2 className="font-display-tsuki text-lg font-bold text-[var(--ink-primary)]">
                {t.clipboard.title}
              </h2>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.clipboard.subtitle}</p>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--ink-secondary)] cursor-pointer select-none">
            <span>{t.clipboard.autoCopy}</span>
            <Switch
              checked={autoCopyEnabled.value}
              onCheckedChange={(checked) => setAutoCopy(checked)}
              label={t.clipboard.autoCopy}
            />
          </label>
        </div>

        <textarea
          value={text}
          onInput={(e) => handleInput((e.target as HTMLTextAreaElement).value)}
          onPaste={() => {
            setTimeout(() => {
              if (connected) pushClipboardText(clipboardText.value);
            }, 20);
          }}
          rows={4}
          placeholder={t.clipboard.placeholder}
          className="w-full rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3 text-sm text-[var(--ink-primary)] placeholder:text-[var(--ink-secondary)]/60 focus:border-solid focus:border-[var(--accent-airmail)] focus:outline-none resize-y tabular-mono"
        />

        {autoCopyWarning.value === 'blocked' && (
          <p className="mt-1.5 text-[11px] text-[var(--accent-amber)] tabular-mono">
            {t.clipboard.autoCopyBlocked}
          </p>
        )}

        {meta && (
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-[var(--ink-secondary)] tabular-mono">
            <span>
              {t.clipboard.fromPeer.replace('{name}', meta.senderName)}
            </span>
            <span>
              {new Date(meta.receivedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
        )}
      </div>

      {/* Detected URLs + Quick Actions */}
      <div className="space-y-2.5">
        {urls.length > 0 ? (
          <div className="space-y-1.5">
            {urls.map((url) => (
              <div
                key={url}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-dashed border-[var(--accent-cleared)] bg-[var(--surface-inset)] px-2.5 py-2"
              >
                <span className="tabular-mono text-xs text-[var(--ink-primary)] truncate max-w-[230px] sm:max-w-[260px]">
                  {url}
                </span>
                <div className="flex items-center gap-1.5">
                  <TactileButton
                    size="sm"
                    variant="secondary"
                    onClick={() => copyString(url, url)}
                  >
                    {copiedId === url ? <Check size={12} /> : <Clipboard size={12} />}
                    <span>{copiedId === url ? t.clipboard.copied : t.clipboard.copyBtn}</span>
                  </TactileButton>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-[5px] bg-[var(--accent-cleared)] text-[#FBF8F3] border border-[#2C4F34] px-2.5 py-1.5 text-xs font-bold hover:brightness-105"
                  >
                    <ExternalLink size={12} strokeWidth={1.5} />
                    <span>{t.clipboard.openLink}</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--ink-secondary)]">
            {connected ? t.clipboard.noLinks : t.clipboard.waitingPeer}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <TactileButton size="sm" variant="secondary" onClick={handlePasteClick}>
            <ClipboardPaste size={14} strokeWidth={1.5} />
            <span>{t.clipboard.pasteBtn}</span>
          </TactileButton>

          <TactileButton
            size="sm"
            variant="secondary"
            disabled={!text}
            onClick={() => copyString('all', text)}
          >
            {copiedId === 'all' ? <Check size={14} /> : <Clipboard size={14} strokeWidth={1.5} />}
            <span>{copiedId === 'all' ? t.clipboard.copied : t.clipboard.copyBtn}</span>
          </TactileButton>

          <TactileButton
            size="sm"
            variant="primary"
            disabled={!connected || !text}
            onClick={() => pushClipboardText(text)}
            className="ml-auto"
          >
            <Send size={13} strokeWidth={1.5} />
            <span>{t.clipboard.sendBtn}</span>
          </TactileButton>
        </div>
      </div>
    </ReceiptCard>
  );
}
