import { useEffect, useRef, useState } from 'preact/hooks';
import jsQR from 'jsqr';
import { CameraOff, ScanLine } from 'lucide-preact';
import { Modal } from './ui/Modal';
import { TactileButton } from './ui/TactileButton';
import { extractPinFromInput } from '../lib/identity';
import { useT } from '../lib/i18n';
import { playConnect } from '../lib/sound';

interface QrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetectedPin: (pin: string) => void;
}

export function QrScannerModal({
  open,
  onOpenChange,
  onDetectedPin,
}: QrScannerModalProps) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let stopped = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    async function startCamera() {
      setErrorMsg(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg(t.pairing.qrScannerUnsupported);
        return;
      }

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

        const tick = () => {
          if (stopped) return;
          const v = videoRef.current;
          const c = canvasRef.current;
          if (v && c && v.readyState >= v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const imgData = ctx.getImageData(0, 0, c.width, c.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (decoded?.data) {
                const pin = extractPinFromInput(decoded.data);
                if (pin) {
                  playConnect();
                  onDetectedPin(pin);
                  onOpenChange(false);
                  return;
                }
              }
            }
          }
          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch {
        setErrorMsg(t.pairing.qrScannerPermission);
      }
    }

    startCamera();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
      }
    };
  }, [open]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t.pairing.qrScannerTitle}
      description={t.pairing.qrScannerHint}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        {errorMsg ? (
          <div className="rounded-[5px] border border-dashed border-[var(--accent-airmail)] bg-[var(--surface-inset)] p-6 text-center space-y-2">
            <CameraOff size={28} strokeWidth={1.5} className="mx-auto text-[var(--accent-airmail)]" />
            <p className="text-sm text-[var(--ink-primary)]">{errorMsg}</p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[6px] border-2 border-[var(--border-dashed)] bg-[#171513] aspect-square max-h-72 mx-auto flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-6 border-2 border-dashed border-[#FBF8F3]/80 rounded-[6px] flex items-center justify-center">
              <ScanLine size={28} strokeWidth={1.5} className="text-[var(--accent-airmail)] animate-pulse" />
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        )}

        <div className="flex justify-end">
          <TactileButton variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {t.pairing.close}
          </TactileButton>
        </div>
      </div>
    </Modal>
  );
}
