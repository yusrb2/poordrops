import { useEffect, useState } from 'preact/hooks';
import { Header } from './components/Header';
import { DeviceBadge } from './components/DeviceBadge';
import { ModeSwitcher } from './components/ModeSwitcher';
import { NearbyRadar } from './components/NearbyRadar';
import { PairingDesk } from './components/PairingDesk';
import { BluetoothDesk } from './components/BluetoothDesk';
import { ClipboardSlip } from './components/ClipboardSlip';
import { CargoDropzone } from './components/CargoDropzone';
import { ParcelManifest } from './components/ParcelManifest';
import { IncomingParcelModal } from './components/IncomingParcelModal';
import {
  OnboardingModal,
  shouldAutoOpenOnboarding,
} from './components/OnboardingModal';
import { useT } from './lib/i18n';
import { broadcastAlias, initPairingFromUrl } from './lib/p2p';
import { initShareTargetListener } from './lib/shareTarget';
import { initTransferEngine } from './lib/transfer';
import { activeMode } from './state/uiState';

export function App() {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(() => shouldAutoOpenOnboarding());

  useEffect(() => {
    initTransferEngine();
    initPairingFromUrl();
    initShareTargetListener();
  }, []);

  const mode = activeMode.value;

  return (
    <div className="relative z-10 min-h-dvh flex flex-col">
      <Header
        onOpenHelp={() => setHelpOpen(true)}
        deviceSlot={<DeviceBadge onRename={(next) => broadcastAlias(next)} />}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-3.5 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">
        <ModeSwitcher />

        {mode === 'radar' && (
          <div key="mode-radar" className="space-y-4 sm:space-y-5 snappy-enter">
            <NearbyRadar />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <CargoDropzone />
              <ClipboardSlip />
            </div>
          </div>
        )}

        {mode === 'qr' && (
          <div key="mode-qr" className="space-y-4 sm:space-y-5 snappy-enter">
            <PairingDesk />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              <CargoDropzone />
              <ClipboardSlip />
            </div>
          </div>
        )}

        {mode === 'bluetooth' && (
          <div key="mode-bt" className="space-y-4 sm:space-y-5 snappy-enter">
            <BluetoothDesk />
          </div>
        )}

        <ParcelManifest />
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 py-6 text-center text-xs text-[var(--ink-secondary)] tabular-mono">
        <p>{t.footer.license}</p>
      </footer>

      <IncomingParcelModal />
      <OnboardingModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
