import { useState } from 'preact/hooks';
import { Package, Stamp } from 'lucide-preact';
import { Header } from './components/Header';
import { ReceiptCard } from './components/ui/ReceiptCard';
import { RubberStamp } from './components/ui/RubberStamp';
import { TactileButton } from './components/ui/TactileButton';
import { Modal } from './components/ui/Modal';
import { useT } from './lib/i18n';
import { playStamp } from './lib/sound';

export function App() {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(false);
  const [stamped, setStamped] = useState(false);

  return (
    <div className="relative z-10 min-h-dvh flex flex-col">
      <Header
        onOpenHelp={() => setHelpOpen(true)}
        deviceSlot={
          <span className="tabular-mono text-xs px-2.5 py-1.5 rounded-[5px] border border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
            Cardboard-Cat-42
          </span>
        }
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 space-y-5">
        <ReceiptCard airmailTop serrated className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-[var(--accent-airmail)]">
                <Package size={18} strokeWidth={1.5} />
                <span className="tabular-mono text-xs font-bold uppercase tracking-wider">
                  {t.pairing.title}
                </span>
              </div>
              <h2 className="font-display-tsuki text-2xl font-bold text-[var(--ink-primary)]">
                {t.tagline}
              </h2>
              <p className="text-sm text-[var(--ink-secondary)] max-w-xl">
                {t.pairing.subtitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {stamped && <RubberStamp label={t.manifest.verified} tone="cleared" />}
              <TactileButton
                variant="primary"
                size="sm"
                onClick={() => {
                  playStamp();
                  setStamped(true);
                }}
              >
                <Stamp size={14} strokeWidth={1.5} />
                <span>{t.onboarding.sandboxBtn}</span>
              </TactileButton>
            </div>
          </div>
        </ReceiptCard>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 py-5 text-center text-xs text-[var(--ink-secondary)] tabular-mono">
        <p>{t.footer.license}</p>
      </footer>

      <Modal
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title={t.onboarding.badge}
        description={t.tagline}
      >
        <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
          {t.onboarding.step1Body}
        </p>
      </Modal>
    </div>
  );
}
