import { useRef, useState } from 'preact/hooks';
import {
  Clipboard,
  Laptop,
  Radio,
  Share2,
  Smartphone,
  Upload,
  Wifi,
  X,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { Switch } from './ui/Switch';
import { TactileButton } from './ui/TactileButton';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';
import {
  deviceName,
  localDeviceKind,
  localOsBadge,
} from '../lib/identity';
import { playClick } from '../lib/sound';
import { pushClipboardToPeer, sendFilesToPeers } from '../lib/transfer';
import {
  nearbyScope,
  nearbyStatus,
  peerList,
  type PeerMeta,
} from '../state/p2pState';
import {
  autoAcceptEnabled,
  clearStagedFiles,
  clipboardText,
  outgoingOfferStatus,
  setAutoAccept,
  sharedNotice,
  stagedFiles,
} from '../state/transferState';

const RADAR_SLOTS = [
  { x: '18%', y: '22%' },
  { x: '82%', y: '22%' },
  { x: '16%', y: '76%' },
  { x: '84%', y: '76%' },
  { x: '50%', y: '12%' },
  { x: '50%', y: '88%' },
];

export function NearbyRadar() {
  const t = useT();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pendingPeerId, setPendingPeerId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const peersArr = peerList.value;
  const staged = stagedFiles.value;
  const clip = clipboardText.value;
  const offerStatus = outgoingOfferStatus.value;
  const shareBanner = sharedNotice.value;

  function handleAvatarTap(peer: PeerMeta) {
    playClick();
    if (staged.length > 0) {
      const batch = [...staged];
      clearStagedFiles();
      sharedNotice.value = null;
      sendFilesToPeers(batch, { targetPeerIds: [peer.id] });
      return;
    }
    setPendingPeerId(peer.id);
    pickerRef.current?.click();
  }

  function handleAvatarDrop(peer: PeerMeta, fileList: FileList | null) {
    setDragTargetId(null);
    if (!fileList || fileList.length === 0) return;
    playClick();
    sendFilesToPeers(Array.from(fileList), { targetPeerIds: [peer.id] });
  }

  const scopeLabel =
    nearbyScope.value === 'wifi' ? t.radar.scopeWifi : t.radar.scopeLobby;

  return (
    <ReceiptCard airmailTop className="p-4 sm:p-5">
      <input
        ref={pickerRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const input = e.target as HTMLInputElement;
          const files = input.files ? Array.from(input.files) : [];
          input.value = '';
          const targetId = pendingPeerId;
          setPendingPeerId(null);
          if (targetId && files.length > 0) {
            sendFilesToPeers(files, { targetPeerIds: [targetId] });
          }
        }}
      />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-dashed border-[var(--border-dashed)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Radio
              size={17}
              strokeWidth={1.5}
              className={
                peersArr.length > 0
                  ? 'text-[var(--accent-cleared)]'
                  : 'text-[var(--accent-airmail)] animate-pulse'
              }
            />
            <h2 className="font-display-tsuki text-lg sm:text-xl font-bold text-[var(--ink-primary)]">
              {t.radar.title}
            </h2>
            <span className="inline-flex items-center gap-1 tabular-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-[3px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
              <Wifi size={11} strokeWidth={1.5} />
              <span>{scopeLabel}</span>
            </span>
          </div>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.radar.subtitle}</p>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-primary)] cursor-pointer select-none">
          <span>{t.radar.autoAccept}</span>
          <Switch
            checked={autoAcceptEnabled.value}
            onCheckedChange={(checked) => setAutoAccept(checked)}
            label={t.radar.autoAccept}
          />
        </label>
      </div>

      {/* Share-sheet loaded banner */}
      {shareBanner && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[5px] border border-dashed border-[var(--accent-cleared)] bg-[var(--accent-cleared)]/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--ink-primary)] font-semibold">
            <Share2 size={14} className="text-[var(--accent-cleared)] shrink-0" />
            <span>{shareBanner}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              sharedNotice.value = null;
            }}
            className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Outgoing AirDrop offer feedback */}
      {offerStatus && (
        <div
          className={cn(
            'mb-3 rounded-[5px] border border-dashed px-3 py-2 tabular-mono text-xs font-bold',
            offerStatus.state === 'waiting'
              ? 'border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 text-[var(--ink-primary)]'
              : 'border-[var(--accent-airmail)] bg-[var(--accent-airmail)]/10 text-[var(--accent-airmail)]'
          )}
        >
          {offerStatus.state === 'waiting'
            ? t.radar.waitingAccept.replace('{name}', offerStatus.peerName)
            : offerStatus.state === 'declined'
            ? t.radar.declinedBy.replace('{name}', offerStatus.peerName)
            : t.radar.timedOut.replace('{name}', offerStatus.peerName)}
        </div>
      )}

      {/* Postal Stamp Circular Radar */}
      <div className="relative mx-auto rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4 sm:p-5 overflow-hidden">
        <div className="relative mx-auto h-64 sm:h-72 max-w-xl flex items-center justify-center">
          {/* Concentric dashed rings */}
          <div className="pointer-events-none absolute h-60 w-60 sm:h-68 sm:w-68 rounded-full border border-dashed border-[var(--border-dashed)]" />
          <div className="pointer-events-none absolute h-40 w-40 sm:h-44 sm:w-44 rounded-full border border-dashed border-[var(--border-dashed)]" />

          {/* Sweeping postal-compass hand */}
          <div
            className="pointer-events-none absolute h-56 w-56 sm:h-64 sm:w-64 rounded-full animate-spin"
            style={{ animationDuration: '9s' }}
          >
            <div
              className="mx-auto h-1/2 w-[2px] origin-bottom opacity-35"
              style={{
                background:
                  'linear-gradient(to top, var(--accent-airmail), transparent)',
              }}
            />
          </div>

          {/* Center self stamp */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full border-2 border-[var(--ink-primary)] bg-[var(--surface-receipt)] shadow-[0_3px_0_var(--shadow-card)] flex items-center justify-center text-[var(--accent-airmail)]">
              {localDeviceKind === 'mobile' ? (
                <Smartphone size={24} strokeWidth={1.5} />
              ) : (
                <Laptop size={24} strokeWidth={1.5} />
              )}
            </div>
            <span className="mt-1.5 tabular-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-[3px] bg-[var(--ink-primary)] text-[var(--surface-receipt)]">
              {t.radar.youLabel} · {localOsBadge}
            </span>
            <span className="text-xs font-bold text-[var(--ink-primary)] mt-0.5 max-w-[140px] truncate">
              {deviceName.value}
            </span>
          </div>

          {/* Orbiting discovered device avatars (first 6) */}
          {peersArr.slice(0, RADAR_SLOTS.length).map((peer, idx) => {
            const pos = RADAR_SLOTS[idx];
            const isDraggingOver = dragTargetId === peer.id;
            const DeviceIcon = peer.kind === 'mobile' ? Smartphone : Laptop;

            return (
              <div
                key={peer.id}
                style={{ left: pos.x, top: pos.y }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragTargetId(peer.id);
                }}
                onDragLeave={() => setDragTargetId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleAvatarDrop(peer, e.dataTransfer?.files ?? null);
                }}
              >
                <button
                  type="button"
                  onClick={() => handleAvatarTap(peer)}
                  className={cn(
                    'tactile-btn group relative flex flex-col items-center rounded-[8px] border-2 px-2.5 py-2 cursor-pointer transition-all',
                    isDraggingOver
                      ? 'border-[var(--accent-airmail)] bg-[var(--accent-airmail)]/15 scale-105'
                      : 'border-[var(--accent-cleared)] bg-[var(--surface-receipt)] hover:border-[var(--accent-airmail)]'
                  )}
                >
                  <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-inset)] text-[var(--ink-primary)] border border-[var(--border-dashed)]">
                    <DeviceIcon size={18} strokeWidth={1.5} />
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent-cleared)] border border-[var(--surface-receipt)]" />
                  </div>
                  <span className="mt-1 text-[11px] font-bold text-[var(--ink-primary)] max-w-[105px] truncate">
                    {peer.name}
                  </span>
                  <span className="tabular-mono text-[9px] uppercase text-[var(--ink-secondary)]">
                    {isDraggingOver
                      ? t.radar.dropToSend
                      : staged.length > 0
                      ? t.radar.sendStaged.replace('{n}', String(staged.length))
                      : `${peer.os} · ${t.radar.tapToSend}`}
                  </span>
                </button>

                {clip.trim().length > 0 && (
                  <TactileButton
                    size="sm"
                    variant="secondary"
                    onClick={() => pushClipboardToPeer(peer.id, clip)}
                    className="mt-1 !px-2 !py-0.5 !text-[10px]"
                  >
                    <Clipboard size={10} />
                    <span>{t.radar.beamClip}</span>
                  </TactileButton>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty state or extra peer overflow strip */}
        {peersArr.length === 0 ? (
          <div className="mt-2 border-t border-dashed border-[var(--border-dashed)] pt-3 text-center space-y-1">
            <p className="text-xs font-bold text-[var(--ink-primary)]">
              {nearbyStatus.value === 'scanning' ? t.radar.scanning : t.radar.emptyTitle}
            </p>
            <p className="text-xs text-[var(--ink-secondary)] max-w-lg mx-auto">
              {t.radar.emptyBody}
            </p>
          </div>
        ) : (
          peersArr.length > RADAR_SLOTS.length && (
            <div className="mt-3 pt-3 border-t border-dashed border-[var(--border-dashed)] flex flex-wrap gap-2 justify-center">
              {peersArr.slice(RADAR_SLOTS.length).map((peer) => (
                <TactileButton
                  key={peer.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAvatarTap(peer)}
                >
                  <Upload size={12} />
                  <span>
                    {peer.name} ({peer.os})
                  </span>
                </TactileButton>
              ))}
            </div>
          )
        )}
      </div>
    </ReceiptCard>
  );
}
