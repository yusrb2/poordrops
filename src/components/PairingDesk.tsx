import { useEffect, useRef, useState } from 'preact/hooks';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  Check,
  Copy,
  Globe,
  History,
  Link2,
  QrCode,
  RefreshCw,
  ScanLine,
  StopCircle,
  Unplug,
  Users,
} from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { TactileButton } from './ui/TactileButton';
import { RubberStamp } from './ui/RubberStamp';
import { PinPad } from './PinPad';
import { useT } from '../lib/i18n';
import { extractPinFromInput, lastRoom } from '../lib/identity';
import { buildShareUrl, createFreshRoom, joinPin, leaveRoom } from '../lib/p2p';
import { playClick, playConnect } from '../lib/sound';
import {
  connectionState,
  currentPin,
  p2pError,
  pinPeerList,
} from '../state/p2pState';

interface BarcodeDetectorInstance {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorInstance;

export function PairingDesk() {
  const t = useT();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'pin' | 'link' | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pin = currentPin.value;
  const state = connectionState.value;
  const peersArr = pinPeerList.value;
  const count = peersArr.length;
  const savedLast = lastRoom.value;

  useEffect(() => {
    if (!/^\d{4}$/.test(pin)) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(buildShareUrl(pin), {
      width: 224,
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

  // Embedded in-app QR camera scanner (BarcodeDetector with jsQR canvas fallback)
  useEffect(() => {
    if (!cameraActive) return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    async function startScanner() {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(t.pairing.qrScannerUnsupported);
        return;
      }

      const DetectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }
      ).BarcodeDetector;
      const detector = DetectorCtor
        ? new DetectorCtor({ formats: ['qr_code'] })
        : null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (stopped) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (stopped) return;
          const v = videoRef.current;
          const c = canvasRef.current;
          if (v && c && v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            let detectedRaw: string | null = null;

            if (detector) {
              try {
                const hits = await detector.detect(v);
                if (hits[0]?.rawValue) {
                  detectedRaw = hits[0].rawValue;
                }
              } catch {
                // fall back to jsQR below
              }
            }

            if (!detectedRaw) {
              c.width = v.videoWidth;
              c.height = v.videoHeight;
              const ctx = c.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(v, 0, 0, c.width, c.height);
                const imgData = ctx.getImageData(0, 0, c.width, c.height);
                const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
                  inversionAttempts: 'dontInvert',
                });
                if (decoded?.data) detectedRaw = decoded.data;
              }
            }

            if (detectedRaw) {
              const extracted = extractPinFromInput(detectedRaw);
              if (extracted) {
                playConnect();
                setCameraActive(false);
                joinPin(extracted);
                return;
              }
            }
          }
          if (!stopped) {
            rafId = requestAnimationFrame(() => {
              tick();
            });
          }
        };

        rafId = requestAnimationFrame(() => {
          tick();
        });
      } catch {
        setCameraError(t.pairing.qrScannerPermission);
      }
    }

    startScanner();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, [cameraActive]);

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

  const showQuickReconnect = savedLast && savedLast.pin !== pin && count === 0;

  return (
    <ReceiptCard airmailTop className="p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-dashed border-[var(--border-dashed)]">
        <div>
          <div className="flex items-center gap-2">
            <Globe size={17} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
            <h2 className="font-display-tsuki text-lg sm:text-xl font-bold text-[var(--ink-primary)]">
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

      {/* Main 2-column QR + PIN/Camera grid */}
      <div className="grid gap-5 md:grid-cols-[1.15fr_1fr] items-start">
        {/* Left: Receipt-framed QR + 4-Digit Waybill */}
        <div className="flex flex-col sm:flex-row items-center gap-4 rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4">
          <div className="shrink-0 rounded-[5px] border-2 border-[#CFC5B4] bg-[#FBF8F3] p-2 shadow-[0_3px_0_#DDD2C0]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code for PIN ${pin}`}
                className="h-40 w-40 sm:h-44 sm:w-44 block"
              />
            ) : (
              <div className="h-40 w-40 sm:h-44 sm:w-44 flex items-center justify-center text-[#6B6257] tabular-mono text-xs">
                ....
              </div>
            )}
          </div>

          <div className="flex-1 text-center sm:text-left space-y-2.5 min-w-0">
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

        {/* Right: Quick 4-Digit PIN Pad + Embedded In-App Camera QR Scanner */}
        <div className="space-y-4">
          <div className="space-y-2">
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
                variant={cameraActive ? 'danger' : 'primary'}
                onClick={() => {
                  playClick();
                  setCameraActive((prev) => !prev);
                }}
                className="h-12 sm:h-14"
              >
                {cameraActive ? (
                  <>
                    <StopCircle size={17} strokeWidth={1.5} />
                    <span>{t.pairing.stopCamera}</span>
                  </>
                ) : (
                  <>
                    <Camera size={17} strokeWidth={1.5} />
                    <span>{t.pairing.openCamera}</span>
                  </>
                )}
              </TactileButton>
            </div>
          </div>

          {/* Embedded in-app QR scanner viewfinder */}
          {cameraActive && (
            <div className="snappy-enter rounded-[6px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-[var(--ink-primary)]">
                  <QrCode size={14} className="text-[var(--accent-airmail)]" />
                  <span>{t.pairing.qrScannerTitle}</span>
                </span>
                <span className="tabular-mono text-[10px] text-[var(--ink-secondary)]">
                  {t.pairing.qrScannerHint}
                </span>
              </div>

              {cameraError ? (
                <div className="rounded-[5px] border border-dashed border-[var(--accent-airmail)] bg-[var(--surface-receipt)] p-4 text-center space-y-1.5">
                  <CameraOff size={22} className="mx-auto text-[var(--accent-airmail)]" />
                  <p className="text-xs text-[var(--ink-primary)]">{cameraError}</p>
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-[6px] border-2 border-[var(--border-dashed)] bg-[#171513] aspect-square max-h-60 mx-auto flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[#FBF8F3]/80 rounded-[6px] flex items-center justify-center">
                    <ScanLine size={26} strokeWidth={1.5} className="text-[var(--accent-airmail)] animate-pulse" />
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}
            </div>
          )}

          {showQuickReconnect && (
            <div>
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-dashed border-[var(--accent-cleared)] bg-[var(--surface-inset)] px-3 py-2">
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
  );
}
