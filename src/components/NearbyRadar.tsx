import { useRef, useState } from 'preact/hooks';
import {
  Activity,
  Clipboard,
  Info,
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
import { pingPeer, rescanNearbyDiscovery } from '../lib/p2p';
import { playClick } from '../lib/sound';
import { pushClipboardToPeer, sendFilesToPeers } from '../lib/transfer';
import {
  iceState,
  isRescanning,
  lobbyId,
  nearbyScope,
  nearbyStatus,
  peerList,
  signalingState,
  type PeerMeta,
} from '../state/p2pState';
import {
  autoAcceptEnabled,
  clearStagedFiles,
  clipboardText,
  outgoingOfferStatus,
  relaySizeNotice,
  setAutoAccept,
  sharedNotice,
  stagedFiles,
} from '../state/transferState';

type PingResult = 'pending' | number | 'fail';

export function NearbyRadar() {
  const t = useT();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pendingPeerId, setPendingPeerId] = useState<string | null>(null);
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, PingResult>>({});

  const peersArr = peerList.value;
  const staged = stagedFiles.value;
  const clip = clipboardText.value;
  const offerStatus = outgoingOfferStatus.value;
  const shareBanner = sharedNotice.value;
  const largeRelayBanner = relaySizeNotice.value;
  const status = nearbyStatus.value;
  const rescanning = isRescanning.value;
  const currentLobby = lobbyId.value;
  const currentSig = signalingState.value;
  const currentIce = iceState.value;

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

  async function handlePing(peerId: string, e: MouseEvent) {
    e.stopPropagation();
    playClick();
    setPingResults((prev) => ({ ...prev, [peerId]: 'pending' }));
    const ms = await pingPeer(peerId);
    setPingResults((prev) => ({ ...prev, [peerId]: ms === null ? 'fail' : ms }));
  }

  const scopeLabel =
    nearbyScope.value === 'wifi' ? t.radar.scopeWifi : t.radar.scopeLobby;

  const signalLabel =
    status === 'offline' && peersArr.length === 0
      ? t.radar.statusOffline
      : peersArr.length === 1
      ? t.radar.statusOneNearby
      : peersArr.length > 1
      ? t.radar.statusManyNearby.replace('{n}', String(peersArr.length))
      : t.radar.statusScanning;

  const signalDotClass =
    status === 'offline' && peersArr.length === 0
      ? 'bg-[var(--accent-airmail)]'
      : peersArr.length > 0
      ? 'bg-[var(--accent-cleared)]'
      : 'bg-[var(--accent-amber)] animate-pulse';

  function renderPeerCard(peer: PeerMeta, layout: 'orbit' | 'strip') {
    const isDraggingOver = dragTargetId === peer.id;
    const DeviceIcon = peer.kind === 'mobile' ? Smartphone : Laptop;
    const ping = pingResults[peer.id];
    const isDirect = peer.transportMode === 'direct';

    return (
      <div
        key={`${layout}-${peer.id}`}
        className={cn(
          'avatar-pop-in flex flex-col items-center',
          layout === 'strip' ? 'shrink-0 snap-start w-[132px]' : 'max-w-[132px]'
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
            'tactile-btn group relative flex flex-col items-center w-full max-w-[132px] rounded-[8px] border-2 px-2 py-2 cursor-pointer transition-all',
            isDraggingOver
              ? 'border-[var(--accent-airmail)] bg-[var(--accent-airmail)]/15 scale-105'
              : isDirect
              ? 'border-[var(--accent-cleared)] bg-[var(--surface-receipt)] hover:border-[var(--accent-airmail)]'
              : 'border-[var(--accent-amber)] bg-[var(--surface-receipt)] hover:border-[var(--accent-airmail)]'
          )}
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-inset)] text-[var(--ink-primary)] border border-[var(--border-dashed)] shrink-0">
            <DeviceIcon size={16} strokeWidth={1.5} />
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[var(--surface-receipt)]',
                isDirect ? 'bg-[var(--accent-cleared)]' : 'bg-[var(--accent-amber)]'
              )}
            />
          </div>

          <span className="mt-1 inline-flex items-center px-1.5 py-0.2 rounded-[3px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] tabular-mono text-[9px] font-bold uppercase text-[var(--ink-secondary)]">
            {peer.os}
          </span>

          <span className="mt-0.5 text-[11px] font-bold text-[var(--ink-primary)] w-full text-center truncate">
            {peer.name}
          </span>

          {/* Smooth connection mode badge (Direct LAN / Relay Active) */}
          <span
            className={cn(
              'mt-0.5 inline-flex items-center px-1.5 py-0.2 rounded-[3px] border tabular-mono text-[8px] font-bold uppercase',
              isDirect
                ? 'border-[var(--accent-cleared)] text-[var(--accent-cleared)] bg-[var(--accent-cleared)]/10'
                : 'border-[var(--accent-amber)] text-[var(--accent-amber)] bg-[var(--accent-amber)]/10'
            )}
          >
            {isDirect ? t.radar.badgeDirect : t.radar.badgeRelay}
          </span>

          <span className="mt-0.5 tabular-mono text-[9px] uppercase text-[var(--ink-secondary)] truncate max-w-full">
            {isDraggingOver
              ? t.radar.dropToSend
              : staged.length > 0
              ? t.radar.sendStaged.replace('{n}', String(staged.length))
              : t.radar.tapToSend}
          </span>
        </button>

        <div className="mt-1 flex items-center justify-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={(e) => handlePing(peer.id, e as unknown as MouseEvent)}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)] tabular-mono text-[10px] font-bold cursor-pointer hover:border-[var(--accent-airmail)]',
              ping === 'fail'
                ? 'text-[var(--accent-airmail)]'
                : typeof ping === 'number'
                ? 'text-[var(--accent-cleared)]'
                : 'text-[var(--ink-secondary)]'
            )}
          >
            <Activity size={10} strokeWidth={1.5} />
            <span>
              {ping === 'pending'
                ? '...'
                : ping === 'fail'
                ? t.radar.pingFail
                : typeof ping === 'number'
                ? `${ping}ms`
                : t.radar.pingBtn}
            </span>
          </button>

          {clip.trim().length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                playClick();
                pushClipboardToPeer(peer.id, clip);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)] tabular-mono text-[10px] font-bold text-[var(--ink-primary)] cursor-pointer hover:border-[var(--accent-airmail)]"
            >
              <Clipboard size={10} strokeWidth={1.5} />
              <span>{t.radar.beamClip}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const cornerPositions = ['top-1 left-1', 'bottom-1 right-1'];

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

      {/* Responsive stacked header on mobile, horizontal on >= sm */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pb-3 mb-4 border-b border-dashed border-[var(--border-dashed)]">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Radio
              size={17}
              strokeWidth={1.5}
              className={
                peersArr.length > 0
                  ? 'text-[var(--accent-cleared)] shrink-0'
                  : status === 'offline'
                  ? 'text-[var(--accent-airmail)] shrink-0'
                  : 'text-[var(--accent-amber)] animate-pulse shrink-0'
              }
            />
            <h2 className="font-display-tsuki text-lg sm:text-xl font-bold text-[var(--ink-primary)] leading-tight">
              {t.radar.title}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 tabular-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded-[3px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
              {status === 'offline' && peersArr.length === 0 ? (
                <WifiOff size={11} strokeWidth={1.5} />
              ) : (
                <Wifi size={11} strokeWidth={1.5} />
              )}
              <span>{scopeLabel}</span>
            </span>

            <span className="inline-flex items-center gap-1.5 tabular-mono text-[10px] font-bold px-2 py-0.5 rounded-[3px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-primary)]">
              <span className={cn('h-2 w-2 rounded-full shrink-0', signalDotClass)} />
              <span>{signalLabel}</span>
            </span>
          </div>

          <p className="text-xs text-[var(--ink-secondary)]">{t.radar.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 shrink-0">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-primary)] cursor-pointer select-none">
            <span>{t.radar.autoAccept}</span>
            <Switch
              checked={autoAcceptEnabled.value}
              onCheckedChange={(checked) => setAutoAccept(checked)}
              label={t.radar.autoAccept}
            />
          </label>

          <TactileButton
            size="sm"
            variant="secondary"
            disabled={rescanning}
            onClick={() => rescanNearbyDiscovery({ forceReconnect: true })}
            title={t.radar.rescanBtn}
            className="min-h-[40px] px-3"
          >
            <RefreshCw
              size={14}
              strokeWidth={1.5}
              className={cn(rescanning && 'animate-spin')}
            />
            <span>{rescanning ? t.radar.rescanning : t.radar.rescanBtn}</span>
          </TactileButton>
        </div>
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

      {/* Non-blocking advisory when sending > 25MB over Relay Active */}
      {largeRelayBanner && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[5px] border border-dashed border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 px-3 py-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--ink-primary)] min-w-0">
            <Info size={14} className="text-[var(--accent-amber)] shrink-0" />
            <span className="break-words">{largeRelayBanner}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              relaySizeNotice.value = null;
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

      {/* Postal Stamp Square Radar Surface */}
      <div className="rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3 sm:p-5 space-y-3">
        <div className="relative mx-auto w-full max-w-[280px] sm:max-w-[340px] aspect-square flex items-center justify-center">
          {/* Concentric dashed circular rings */}
          <div className="pointer-events-none absolute inset-2 rounded-full border border-dashed border-[var(--border-dashed)]" />
          <div className="pointer-events-none absolute inset-[22%] rounded-full border border-dashed border-[var(--border-dashed)]" />

          {/* Sweeping postal-compass hand */}
          <div
            className="pointer-events-none absolute inset-3 rounded-full animate-spin"
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

          {/* Center self stamp */}
          <div className="relative z-10 flex flex-col items-center text-center max-w-[130px] px-1">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border-2 border-[var(--ink-primary)] bg-[var(--surface-receipt)] shadow-[0_3px_0_var(--shadow-card)] flex items-center justify-center text-[var(--accent-airmail)]">
              {localDeviceKind === 'mobile' ? (
                <Smartphone size={22} strokeWidth={1.5} />
              ) : (
                <Laptop size={22} strokeWidth={1.5} />
              )}
            </div>
            <span className="mt-1.5 tabular-mono text-[9px] sm:text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-[3px] bg-[var(--ink-primary)] text-[var(--surface-receipt)]">
              {t.radar.youLabel} · {localOsBadge}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-[var(--ink-primary)] mt-0.5 w-full truncate">
              {deviceName.value}
            </span>
          </div>

          {/* Up to 2 balanced peer cards on radar corners to prevent overlap */}
          {peersArr.slice(0, 2).map((peer, idx) => (
            <div
              key={peer.id}
              className={cn('absolute z-20', cornerPositions[idx])}
            >
              {renderPeerCard(peer, 'orbit')}
            </div>
          ))}
        </div>

        {/* Scrollable peer strip when > 2 devices are spotted */}
        {peersArr.length > 2 && (
          <div className="pt-2 border-t border-dashed border-[var(--border-dashed)]">
            <div className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x">
              {peersArr.map((peer) => renderPeerCard(peer, 'strip'))}
            </div>
          </div>
        )}

        {/* Empty state copy */}
        {peersArr.length === 0 && (
          <div className="border-t border-dashed border-[var(--border-dashed)] pt-2.5 text-center space-y-1">
            <p className="text-xs font-bold text-[var(--ink-primary)]">
              {status === 'offline'
                ? t.radar.statusOffline
                : status === 'scanning'
                ? t.radar.scanning
                : t.radar.emptyTitle}
            </p>
            <p className="text-xs text-[var(--ink-secondary)] max-w-md mx-auto">
              {t.radar.emptyBody}
            </p>
          </div>
        )}

        {/* Compact live technical diagnostics row */}
        <div className="pt-1 border-t border-dashed border-[var(--border-dashed)] text-[11px] tabular-mono break-all text-center text-[var(--ink-secondary)]">
          {t.radar.diagRoom}: {currentLobby} · {t.radar.diagSignal}: {currentSig} · {t.radar.diagIce}: {currentIce}
        </div>
      </div>
    </ReceiptCard>
  );
}
