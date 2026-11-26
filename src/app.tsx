import { useEffect, useState } from 'preact/hooks';
import { Header } from './components/Header';
import { DeviceBadge } from './components/DeviceBadge';
import { PairingDesk } from './components/PairingDesk';
import { ClipboardSlip } from './components/ClipboardSlip';
import { CargoDropzone } from './components/CargoDropzone';
import { ParcelManifest } from './components/ParcelManifest';
import {
  OnboardingModal,
  shouldAutoOpenOnboarding,
} from './components/OnboardingModal';
import { useT } from './lib/i18n';
import { broadcastAlias, initPairingFromUrl } from './lib/p2p';
import { initTransferEngine } from './lib/transfer';

export function App() {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(() => shouldAutoOpenOnboarding());

  useEffect(() => {
    initTransferEngine();
    initPairingFromUrl();
  }, []);

  return (
    <div className="relative z-10 min-h-dvh flex flex-col">
      <Header
        onOpenHelp={() => setHelpOpen(true)}
        deviceSlot={<DeviceBadge onRename={(next) => broadcastAlias(next)} />}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 space-y-5">
        <PairingDesk />

        <div className="grid gap-5 lg:grid-cols-2">
          <ClipboardSlip />
          <CargoDropzone />
        </div>

        <ParcelManifest />
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 py-6 text-center text-xs text-[var(--ink-secondary)] tabular-mono">
        <p>{t.footer.license}</p>
      </footer>

      <OnboardingModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
