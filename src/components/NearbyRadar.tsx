import { useRef, useState } from 'preact/hooks';
import {
  Clipboard,
  Laptop,
  Radio,
  RefreshCw,
  Share2,
  Smartphone,
  Wifi,
  WifiOff,
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
import { rescanNearbyDiscovery } from '../lib/p2p';
import { playClick } from '../lib/sound';
import { pushClipboardToPeer, sendFilesToPeers } from '../lib/transfer';
import {
  isRescanning,
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
  const status = nearbyStatus.value;
  const rescanning = isRescanning.value;

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

  const signalLabel =
    status === 'offline'
      ? t.radar.statusOffline
      : peersArr.length === 1
      ? t.radar.statusOneNearby
      : peersArr.length > 1
      ? t.radar.statusManyNearby.replace('{n}', String(peersArr.length))
      : t.radar.statusScanning;

  const signalDotClass =
    status === 'offline'
      ? 'bg-[var(--accent-airmail)]'
      : peersArr.length > 0
      ? 'bg-[var(--accent-cleared)]'
      : 'bg-[var(--accent-amber)] animate-pulse';

  function renderPeerCard(peer: PeerMeta, compactMobile = false) {
    const isDraggingOver = dragTargetId === peer.id;
    const DeviceIcon = peer.kind === 'mobile' ? Smartphone : Laptop;

    return (
      <div
        key={peer.id}
        className={cn(
          'avatar-pop-in flex flex-col items-center',
          compactMobile && 'min-w-0 w-full'
        )}
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
            compactMobile ? 'w-full min-w-0' : 'min-w-[112px] max-w-[144px]',
            isDraggingOver
              ? 'border-[var(--accent-airmail)] bg-[var(--accent-airmail)]/15 scale-105'
              : 'border-[var(--accent-cleared)] bg-[var(--surface-receipt)] hover:border-[var(--accent-airmail)]'
          )}
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-inset)] text-[var(--ink-primary)] border border-[var(--border-dashed)] shrink-0">
            <DeviceIcon size={18} strokeWidth={1.5} />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent-cleared)] border border-[var(--surface-receipt)]" />
          </div>

          <span className="mt-1 inline-flex items-center px-1.5 py-0.2 rounded-[3px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] tabular-mono text-[9px] font-bold uppercase text-[var(--ink-secondary)]">
            {peer.os}
          </span>

          <span className="mt-0.5 text-[11px] font-bold text-[var(--ink-primary)] w-full text-center truncate">
            {peer.name}
          </span>

          <span className="tabular-mono text-[9px] uppercase text-[var(--ink-secondary)] truncate max-w-full">
            {isDraggingOver
              ? t.radar.dropToSend
              : staged.length > 0
              ? t.radar.sendStaged.replace('{n}', String(staged.length))
              : t.radar.tapToSend}
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
  }

  return (
    <ReceiptCard airmailTop className="p-3.5 sm:p-5">
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
      <div className="flex flex-col gap-3 pb-3 mb-4 border-b border-dashed border-[var(--border-dashed)]">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Radio
                size={17}
                strokeWidth={1.5}
                className={
                  status === 'offline'
                    ? 'text-[var(--accent-airmail)]'
                    : peersArr.length > 0
                    ? 'text-[var(--accent-cleared)]'
                    : 'text-[var(--accent-amber)] animate-pulse'
                }
              />
              <h2 className="font-display-tsuki text-lg sm:text-xl font-bold text-[var(--ink-primary)]">
                {t.radar.title}
              </h2>
              <span className="inline-flex items-center gap-1 tabular-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-[3px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
                {status === 'offline' ? (
                  <WifiOff size={11} strokeWidth={1.5} />
                ) : (
                  <Wifi size={11} strokeWidth={1.5} />
                )}
                <span>{scopeLabel}</span>
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.radar.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 tabular-mono text-[11px] font-bold px-2.5 py-1 rounded-[4px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-primary)]">
              <span className={cn('h-2 w-2 rounded-full shrink-0', signalDotClass)} />
              <span>{signalLabel}</span>
            </span>

            <TactileButton
              size="sm"
              variant="secondary"
              disabled={rescanning}
              onClick={() => rescanNearbyDiscovery({ forceReconnect: true })}
              title={t.radar.rescanBtn}
            >
              <RefreshCw
                size={13}
                strokeWidth={1.5}
                className={cn(rescanning && 'animate-spin')}
              />
              <span>{rescanning ? t.radar.rescanning : t.radar.rescanBtn}</span>
            </TactileButton>
          </div>
        </div>

        <label className="flex items-center justify-between sm:justify-end gap-2 text-xs font-semibold text-[var(--ink-primary)] cursor-pointer select-none">
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
          <div className="flex items-center gap-2 text-[var(--ink-primary)] font-semibold min-w-0">
            <Share2 size={14} className="text-[var(--accent-cleared)] shrink-0" />
            <span className="break-words">{shareBanner}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              sharedNotice.value = null;
            }}
            className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer shrink-0"
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

      {/* Postal Stamp Radar Surface */}
      <div className="relative mx-auto rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3.5 sm:p-5 overflow-hidden">
        {/* Mobile compact radar dial (< 640px) */}
        <div className="sm:hidden flex flex-col items-center gap-3">
          <div className="relative h-36 w-full flex items-center justify-center">
            <div className="pointer-events-none absolute h-32 w-32 rounded-full border border-dashed border-[var(--border-dashed)]" />
            <div className="pointer-events-none absolute h-22 w-22 rounded-full border border-dashed border-[var(--border-dashed)]" />
            <div
              className="pointer-events-none absolute h-32 w-32 rounded-full animate-spin"
              style={{ animationDuration: rescanning ? '1.6s' : '7s' }}
            >
              <div
                className="mx-auto h-1/2 w-[2px] origin-bottom opacity-40"
                style={{
                  background:
                    'linear-gradient(to top, var(--accent-airmail), transparent)',
                }}
              />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center max-w-[180px]">
              <div className="h-11 w-11 rounded-full border-2 border-[var(--ink-primary)] bg-[var(--surface-receipt)] shadow-[0_2px_0_var(--shadow-card)] flex items-center justify-center text-[var(--accent-airmail)]">
                {localDeviceKind === 'mobile' ? (
                  <Smartphone size={20} strokeWidth={1.5} />
                ) : (
                  <Laptop size={20} strokeWidth={1.5} />
                )}
              </div>
              <span className="mt-1 tabular-mono text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-[3px] bg-[var(--ink-primary)] text-[var(--surface-receipt)]">
                {t.radar.youLabel} · {localOsBadge}
              </span>
              <span className="text-[11px] font-bold text-[var(--ink-primary)] mt-0.5 max-w-full truncate">
                {deviceName.value}
              </span>
            </div>
          </div>

          {peersArr.length > 0 && (
            <div className="w-full grid grid-cols-2 gap-2.5">
              {peersArr.map((peer) => renderPeerCard(peer, true))}
            </div>
          )}
        </div>

        {/* Desktop circular radar (>= 640px) */}
        <div className="hidden sm:flex relative mx-auto h-76 max-w-xl items-center justify-center">
          <div className="pointer-events-none absolute h-70 w-70 rounded-full border border-dashed border-[var(--border-dashed)]" />
          <div className="pointer-events-none absolute h-46 w-46 rounded-full border border-dashed border-[var(--border-dashed)]" />

          <div
            className="pointer-events-none absolute h-68 w-68 rounded-full animate-spin"
            style={{ animationDuration: rescanning ? '1.6s' : '7s' }}
          >
            <div
              className="mx-auto h-1/2 w-[2px] origin-bottom opacity-40"
              style={{
                background:
                  'linear-gradient(to top, var(--accent-airmail), transparent)',
              }}
            />
          </div>

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
            <span className="text-xs font-bold text-[var(--ink-primary)] mt-0.5 max-w-[160px] truncate">
              {deviceName.value}
            </span>
          </div>

          {peersArr.slice(0, RADAR_SLOTS.length).map((peer, idx) => {
            const pos = RADAR_SLOTS[idx];
            return (
              <div
                key={peer.id}
                style={{ left: pos.x, top: pos.y }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20"
              >
                {renderPeerCard(peer, false)}
              </div>
            );
          })}
        </div>

        {/* Empty state or desktop overflow */}
        {peersArr.length === 0 ? (
          <div className="mt-3 border-t border-dashed border-[var(--border-dashed)] pt-3 text-center space-y-1">
            <p className="text-xs font-bold text-[var(--ink-primary)]">
              {status === 'offline'
                ? t.radar.statusOffline
                : status === 'scanning'
                ? t.radar.scanning
                : t.radar.emptyTitle}
            </p>
            <p className="text-xs text-[var(--ink-secondary)] max-w-lg mx-auto">
              {t.radar.emptyBody}
            </p>
          </div>
        ) : (
          peersArr.length > RADAR_SLOTS.length && (
            <div className="hidden sm:flex mt-3 pt-3 border-t border-dashed border-[var(--border-dashed)] flex-wrap gap-2 justify-center">
              {peersArr.slice(RADAR_SLOTS.length).map((peer) => renderPeerCard(peer, false))}
            </div>
          )
        )}
      </div>
    </ReceiptCard>
  );
}
