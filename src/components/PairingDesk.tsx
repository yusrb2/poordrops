import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  History,
  Link2,
  QrCode,
  Radio,
  RefreshCw,
  Unplug,
  Users,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { TactileButton } from './ui/TactileButton';
import { RubberStamp } from './ui/RubberStamp';
import { PinPad } from './PinPad';
import { QrScannerModal } from './QrScannerModal';
import { useT } from '../lib/i18n';
import { lastRoom } from '../lib/identity';
import { buildShareUrl, createFreshRoom, joinPin, leaveRoom } from '../lib/p2p';
import {
  connectionState,
  currentPin,
  p2pError,
  peerCount,
  peerList,
} from '../state/p2pState';

export function PairingDesk() {
  const t = useT();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'pin' | 'link' | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const pin = currentPin.value;
  const state = connectionState.value;
  const peersArr = peerList.value;
  const count = peerCount.value;
  const savedLast = lastRoom.value;

  useEffect(() => {
    if (!/^\d{4}$/.test(pin)) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(buildShareUrl(pin), {
      width: 192,
      margin: 1,
      color: {
        dark: '#24201C',
        light: '#FBF8F3',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [pin]);

  async function copyText(type: 'pin' | 'link', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1600);
    } catch {
      // ignore if clipboard blocked
    }
  }

  const statusText =
    state === 'connected'
      ? t.pairing.statusConnected
      : state === 'connecting'
      ? t.pairing.statusConnecting
      : state === 'waiting'
      ? t.pairing.statusWaiting
      : state === 'error'
      ? t.pairing.statusError
      : t.pairing.statusIdle;

  const showQuickReconnect =
    savedLast &&
    savedLast.pin !== pin &&
    count === 0;

  return (
    <>
      <ReceiptCard airmailTop className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-dashed border-[var(--border-dashed)]">
          <div>
            <div className="flex items-center gap-2">
              <Radio
                size={16}
                strokeWidth={1.5}
                className={
                  count > 0
                    ? 'text-[var(--accent-cleared)]'
                    : 'text-[var(--accent-airmail)] animate-pulse'
                }
              />
              <h2 className="font-display-tsuki text-lg font-bold text-[var(--ink-primary)]">
                {t.pairing.title}
              </h2>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.pairing.subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            {count > 0 ? (
              <RubberStamp
                label={
                  count === 1
                    ? t.pairing.peerConnectedOne
                    : t.pairing.peerConnectedMany.replace('{n}', String(count))
                }
                tone="cleared"
              />
            ) : (
              <span className="tabular-mono text-xs px-2.5 py-1 rounded-[4px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
                {statusText}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-[1.2fr_1fr] items-center">
          {/* Left: 4-Digit Waybill + Auto-QR */}
          <div className="flex flex-col sm:flex-row items-center gap-4 rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3.5">
            <div className="shrink-0 rounded-[5px] border-2 border-[#CFC5B4] bg-[#FBF8F3] p-1.5 shadow-[0_2px_0_#DDD2C0]">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code for PIN ${pin}`}
                  className="h-32 w-32 sm:h-36 sm:w-36 block"
                />
              ) : (
                <div className="h-32 w-32 sm:h-36 sm:w-36 flex items-center justify-center text-[#6B6257] tabular-mono text-xs">
                  ....
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2.5">
              <div>
                <span className="tabular-mono text-[11px] uppercase tracking-wider text-[var(--ink-secondary)] block">
                  {t.pairing.yourCode}
                </span>
                <div className="tabular-mono text-4xl sm:text-5xl font-bold tracking-[0.16em] text-[var(--ink-primary)] mt-0.5 select-all">
                  {pin || '----'}
                </div>
              </div>

              <p className="text-xs text-[var(--ink-secondary)] leading-snug">
                {t.pairing.scanNote}
              </p>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                <TactileButton
                  size="sm"
                  variant="secondary"
                  disabled={!pin}
                  onClick={() => copyText('pin', pin)}
                >
                  {copiedType === 'pin' ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedType === 'pin' ? t.pairing.copied : t.pairing.copyPin}</span>
                </TactileButton>

                <TactileButton
                  size="sm"
                  variant="secondary"
                  disabled={!pin}
                  onClick={() => copyText('link', buildShareUrl(pin))}
                >
                  {copiedType === 'link' ? <Check size={13} /> : <Link2 size={13} />}
                  <span>{copiedType === 'link' ? t.pairing.copied : t.pairing.copyLink}</span>
                </TactileButton>

                <TactileButton
                  size="sm"
                  variant="ghost"
                  onClick={() => createFreshRoom()}
                  title={t.pairing.newCode}
                >
                  <RefreshCw size={13} />
                  <span>{t.pairing.newCode}</span>
                </TactileButton>
              </div>
            </div>
          </div>

          {/* Right: 4-Box Auto-Submit PIN Pad + Camera Scan + Quick Reconnect */}
          <div className="space-y-3.5">
            <div>
              <h3 className="text-sm font-bold text-[var(--ink-primary)]">
                {t.pairing.enterCodeTitle}
              </h3>
              <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                {t.pairing.enterCodeHint}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <PinPad onComplete={(entered) => joinPin(entered)} />
              <TactileButton
                size="md"
                variant="primary"
                onClick={() => setScannerOpen(true)}
                className="h-12 sm:h-14"
              >
                <QrCode size={17} strokeWidth={1.5} />
                <span>{t.pairing.scanQrBtn}</span>
              </TactileButton>
            </div>

            {showQuickReconnect && (
              <div className="pt-1">
                <TactileButton
                  size="sm"
                  variant="secondary"
                  onClick={() => joinPin(savedLast.pin)}
                >
                  <History size={13} strokeWidth={1.5} className="text-[var(--accent-amber)]" />
                  <span>
                    {t.pairing.quickReconnect} #{savedLast.pin}
                    {savedLast.peerName ? ` (${savedLast.peerName})` : ''}
                  </span>
                </TactileButton>
              </div>
            )}

            {peersArr.length > 0 && (
              <div className="pt-1 flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-dashed border-[var(--accent-cleared)] bg-[var(--surface-inset)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Users size={14} strokeWidth={1.5} className="text-[var(--accent-cleared)]" />
                  {peersArr.map((p) => (
                    <span
                      key={p.id}
                      className="tabular-mono font-bold text-[var(--ink-primary)] bg-[var(--surface-receipt)] px-2 py-0.5 rounded-[3px] border border-[var(--border-dashed)]"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
                <TactileButton
                  size="sm"
                  variant="ghost"
                  onClick={() => leaveRoom()}
                  className="text-xs text-[var(--accent-airmail)]"
                >
                  <Unplug size={13} />
                  <span>{t.pairing.leaveRoom}</span>
                </TactileButton>
              </div>
            )}

            {p2pError.value && (
              <p className="tabular-mono text-xs text-[var(--accent-airmail)]">
                {p2pError.value}
              </p>
            )}
          </div>
        </div>
      </ReceiptCard>

      <QrScannerModal
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetectedPin={(detected) => joinPin(detected)}
      />
    </>
  );
}
