import { useRef, useState } from 'preact/hooks';
import { Check, Pencil, Tag } from 'lucide-preact';
import { deviceName, updateDeviceName } from '../lib/identity';
import { useT } from '../lib/i18n';
import { playClick } from '../lib/sound';

interface DeviceBadgeProps {
  onRename?: (nextName: string) => void;
}

export function DeviceBadge({ onRename }: DeviceBadgeProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deviceName.value);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    playClick();
    setDraft(deviceName.value);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 20);
  }

  function commitEdit() {
    const saved = updateDeviceName(draft);
    setEditing(false);
    onRename?.(saved);
  }

  if (editing) {
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          playClick();
          commitEdit();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={32}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => commitEdit()}
          aria-label={t.header.deviceLabel}
          className="tabular-mono text-xs px-2 py-1 w-40 rounded-[4px] border border-[var(--accent-airmail)] bg-[var(--surface-inset)] text-[var(--ink-primary)] focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Save name"
          className="p-1.5 rounded-[4px] bg-[var(--accent-cleared)] text-[#FBF8F3] cursor-pointer"
        >
          <Check size={12} strokeWidth={2} />
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      title={t.header.renameHint}
      className="group inline-flex items-center gap-1.5 tabular-mono text-xs px-2.5 py-1.5 rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-primary)] hover:border-[var(--accent-airmail)] cursor-pointer transition-colors"
    >
      <Tag size={12} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
      <span className="font-bold max-w-[140px] truncate">{deviceName.value}</span>
      <Pencil size={11} strokeWidth={1.5} className="text-[var(--ink-secondary)] opacity-65 group-hover:opacity-100" />
    </button>
  );
}
