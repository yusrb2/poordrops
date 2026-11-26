import { useEffect, useRef, useState } from 'preact/hooks';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  QrCode,
  Radio,
  ShieldCheck,
  Stamp,
} from 'lucide-preact';
import { Modal } from './ui/Modal';
import { TactileButton } from './ui/TactileButton';
import { RubberStamp } from './ui/RubberStamp';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';
import { playClick, playStamp } from '../lib/sound';

const ONBOARDING_KEY = 'poordrops_onboarding_done';

export function shouldAutoOpenOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // ignore
  }
}

interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardingModal({ open, onOpenChange }: OnboardingModalProps) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [sandboxStamped, setSandboxStamped] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const steps = [
    {
      title: t.onboarding.step1Title,
      body: t.onboarding.step1Body,
      icon: Radio,
      visual: (
        <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4 flex items-center justify-center gap-4 tabular-mono text-xs">
          <div className="px-3 py-2 rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)] font-bold">
            Phone-A
          </div>
          <span className="text-[var(--accent-airmail)] font-bold">══ WebRTC ══▶</span>
          <div className="px-3 py-2 rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)] font-bold">
            Laptop-B
          </div>
        </div>
      ),
    },
    {
      title: t.onboarding.step2Title,
      body: t.onboarding.step2Body,
      icon: QrCode,
      visual: (
        <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4 flex items-center justify-center gap-4">
          <div className="flex gap-1.5">
            {['4', '8', '1', '5'].map((d, idx) => (
              <span
                key={idx}
                className="h-9 w-8 rounded-[4px] border border-[var(--ink-primary)] bg-[var(--surface-receipt)] flex items-center justify-center tabular-mono font-bold text-base"
              >
                {d}
              </span>
            ))}
          </div>
          <span className="tabular-mono text-xs text-[var(--ink-secondary)]">OR</span>
          <div className="h-9 px-2.5 rounded-[4px] border border-[var(--accent-airmail)] bg-[var(--accent-airmail)] text-[#FBF8F3] flex items-center gap-1.5 text-xs font-bold">
            <QrCode size={14} />
            <span>?pin=4815</span>
          </div>
        </div>
      ),
    },
    {
      title: t.onboarding.step3Title,
      body: t.onboarding.step3Body,
      icon: Clipboard,
      visual: (
        <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4 flex flex-wrap items-center justify-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] border border-[var(--accent-cleared)] bg-[var(--surface-receipt)] font-bold text-[var(--accent-cleared)]">
            <Clipboard size={13} />
            <span>{t.clipboard.openLink}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] border border-[var(--border-dashed)] bg-[var(--surface-receipt)] font-bold">
            <Archive size={13} />
            <span>{t.cargo.bundleZip}</span>
          </span>
        </div>
      ),
    },
    {
      title: t.onboarding.step4Title,
      body: t.onboarding.step4Body,
      icon: ShieldCheck,
      visual: (
        <div className="rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-[var(--border-dashed)]">
            <span className="tabular-mono text-xs font-bold text-[var(--ink-secondary)]">
              {t.onboarding.sandboxLabel}
            </span>
            {sandboxStamped && (
              <RubberStamp label={t.manifest.verified} tone="cleared" />
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--ink-secondary)]">
              {sandboxStamped ? t.onboarding.sandboxStamped : 'sha256:9f86d08188...'}
            </span>
            <TactileButton
              size="sm"
              variant={sandboxStamped ? 'cleared' : 'primary'}
              onClick={() => {
                playStamp();
                setSandboxStamped(true);
              }}
            >
              <Stamp size={13} strokeWidth={1.5} />
              <span>{t.onboarding.sandboxBtn}</span>
            </TactileButton>
          </div>
        </div>
      ),
    },
  ];

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSandboxStamped(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        playClick();
        setStep((s) => Math.min(steps.length - 1, s + 1));
      } else if (e.key === 'ArrowLeft') {
        playClick();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, steps.length]);

  function finish() {
    markOnboardingDone();
    onOpenChange(false);
  }

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) markOnboardingDone();
        onOpenChange(next);
      }}
      title={t.onboarding.badge}
      description={t.tagline}
      maxWidthClass="max-w-lg"
    >
      <div
        className="space-y-4 select-none"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
          const delta = endX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) >= 45) {
            playClick();
            if (delta < 0) {
              setStep((s) => Math.min(steps.length - 1, s + 1));
            } else {
              setStep((s) => Math.max(0, s - 1));
            }
          }
        }}
      >
        {/* Snappy Animated Step Body */}
        <div key={step} className="snappy-enter space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-[5px] border border-[var(--accent-airmail)] bg-[var(--surface-inset)] text-[var(--accent-airmail)] flex items-center justify-center shrink-0">
              <Icon size={18} strokeWidth={1.5} />
            </div>
            <h3 className="font-display-tsuki text-lg font-bold text-[var(--ink-primary)]">
              {current.title}
            </h3>
          </div>

          <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
            {current.body}
          </p>

          {current.visual}
        </div>

        {/* Step Dots + Swipe Hint */}
        <div className="flex items-center justify-between pt-2 border-t border-dashed border-[var(--border-dashed)]">
          <div className="flex items-center gap-1.5">
            {steps.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Step ${idx + 1}`}
                onClick={() => {
                  playClick();
                  setStep(idx);
                }}
                className={cn(
                  'h-2.5 rounded-full transition-all cursor-pointer',
                  idx === step
                    ? 'w-7 bg-[var(--accent-airmail)]'
                    : 'w-2.5 bg-[var(--border-dashed)] hover:bg-[var(--ink-secondary)]'
                )}
              />
            ))}
          </div>
          <span className="tabular-mono text-[11px] text-[var(--ink-secondary)]">
            {t.onboarding.sandboxHint}
          </span>
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <TactileButton size="sm" variant="ghost" onClick={finish}>
            {t.onboarding.skip}
          </TactileButton>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <TactileButton
                size="sm"
                variant="secondary"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                <ChevronLeft size={14} />
                <span>{t.onboarding.back}</span>
              </TactileButton>
            )}

            {step < steps.length - 1 ? (
              <TactileButton
                size="sm"
                variant="primary"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              >
                <span>{t.onboarding.next}</span>
                <ChevronRight size={14} />
              </TactileButton>
            ) : (
              <TactileButton size="sm" variant="cleared" onClick={finish}>
                <span>{t.onboarding.done}</span>
              </TactileButton>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
