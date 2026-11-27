import { useRef, useState } from 'preact/hooks';
import {
  Check,
  Compass,
  Mail,
  Package,
  Pencil,
  Send,
  Stamp,
  Truck,
} from 'lucide-preact';
import { Modal } from './ui/Modal';
import { TactileButton } from './ui/TactileButton';
import { cn } from '../lib/cn';
import {
  deviceName,
  deviceStamp,
  updateDeviceName,
  updateDeviceStamp,
  type AvatarStampId,
} from '../lib/identity';
import { useT } from '../lib/i18n';
import { playClick } from '../lib/sound';

export const STAMP_ICONS: Record<AvatarStampId, typeof Package> = {
  package: Package,
  send: Send,
  compass: Compass,
  truck: Truck,
  mail: Mail,
  stamp: Stamp,
};

interface DeviceBadgeProps {
  onRename?: (nextName: string) => void;
}

export function DeviceBadge({ onRename }: DeviceBadgeProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(deviceName.value);
  const [draftStamp, setDraftStamp] = useState<AvatarStampId>(deviceStamp.value);
  const inputRef = useRef<HTMLInputElement>(null);

  const ActiveStampIcon = STAMP_ICONS[deviceStamp.value] ?? Package;

  function openEditor() {
    playClick();
    setDraft(deviceName.value);
    setDraftStamp(deviceStamp.value);
    setOpen(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }

  function saveEditor() {
    const saved = updateDeviceName(draft);
    updateDeviceStamp(draftStamp);
    setOpen(false);
    onRename?.(saved);
  }

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        title={t.header.renameHint}
        className="group inline-flex items-center gap-1.5 tabular-mono text-xs px-2.5 py-1.5 rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-primary)] hover:border-[var(--accent-airmail)] cursor-pointer transition-colors"
      >
        <ActiveStampIcon size={13} strokeWidth={1.6} className="text-[var(--accent-airmail)]" />
        <span className="font-bold max-w-[130px] sm:max-w-[160px] truncate">{deviceName.value}</span>
        <Pencil
          size={11}
          strokeWidth={1.5}
          className="text-[var(--ink-secondary)] opacity-65 group-hover:opacity-100"
        />
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t.header.deviceLabel}
        description={t.header.renameHint}
        maxWidthClass="max-w-sm"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            playClick();
            saveEditor();
          }}
        >
          <div className="space-y-1.5">
            <label className="tabular-mono text-[11px] font-bold uppercase text-[var(--ink-secondary)] block">
              {t.header.deviceLabel}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={32}
              onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
              placeholder="Laptop-Kerja"
              className="w-full tabular-mono text-sm px-3 py-2 rounded-[5px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-primary)] focus:border-[var(--accent-airmail)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <span className="tabular-mono text-[11px] font-bold uppercase text-[var(--ink-secondary)] block">
              {t.header.stampLabel}
            </span>
            <div className="grid grid-cols-6 gap-2">
              {(Object.keys(STAMP_ICONS) as AvatarStampId[]).map((id) => {
                const Icon = STAMP_ICONS[id];
                const selected = draftStamp === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={id}
                    onClick={() => {
                      playClick();
                      setDraftStamp(id);
                    }}
                    className={cn(
                      'h-10 rounded-[5px] border-2 flex items-center justify-center cursor-pointer transition-colors',
                      selected
                        ? 'border-[var(--accent-airmail)] bg-[var(--accent-airmail)]/15 text-[var(--accent-airmail)]'
                        : 'border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                    )}
                  >
                    <Icon size={17} strokeWidth={1.6} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <TactileButton type="submit" size="sm" variant="cleared">
              <Check size={14} />
              <span>{t.header.saveAlias}</span>
            </TactileButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
