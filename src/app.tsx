import { useEffect, useState } from 'preact/hooks';
import { Bluetooth, Radio, Share2, X } from 'lucide-preact';
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
import { TactileButton } from './components/ui/TactileButton';
import {
  OnboardingModal,
  shouldAutoOpenOnboarding,
} from './components/OnboardingModal';
import { useT } from './lib/i18n';
import { broadcastAlias, initPairingFromUrl } from './lib/p2p';
import { initShareTargetListener } from './lib/shareTarget';
import { initTransferEngine } from './lib/transfer';
import { sharedArrival } from './state/transferState';
import { activeMode, setActiveMode } from './state/uiState';

export function App() {
  const t = useT();
  const [helpOpen, setHelpOpen] = useState(() => shouldAutoOpenOnboarding());

  useEffect(() => {
    initTransferEngine();
    initPairingFromUrl();
    initShareTargetListener();
  }, []);

  const mode = activeMode.value;
  const arrival = sharedArrival.value;

  return (
    <div className="relative z-10 min-h-dvh flex flex-col">
      <Header
        onOpenHelp={() => setHelpOpen(true)}
        deviceSlot={<DeviceBadge onRename={(next) => broadcastAlias(next)} />}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-3.5 sm:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5">
        <ModeSwitcher />

        {/* Share Sheet Quick-Routing Banner */}
        {arrival && (
          <div className="receipt-card snappy-enter p-3.5 sm:p-4 border-[var(--accent-cleared)] bg-[var(--surface-receipt)] space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <Share2 size={16} strokeWidth={1.5} className="text-[var(--accent-cleared)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-display-tsuki text-sm sm:text-base font-bold text-[var(--ink-primary)]">
                    {t.shareRoute.title}
                  </p>
                  <p className="text-xs text-[var(--ink-secondary)]">
                    {t.shareRoute.subtitle.replace('{n}', String(arrival.fileCount))}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label={t.shareRoute.dismiss}
                onClick={() => {
                  sharedArrival.value = null;
                }}
                className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TactileButton
                size="sm"
                variant="primary"
                onClick={() => {
                  setActiveMode('radar');
                  sharedArrival.value = null;
                }}
              >
                <Radio size={13} />
                <span>{t.shareRoute.viaRadar}</span>
              </TactileButton>
              <TactileButton
                size="sm"
                variant="cleared"
                onClick={() => {
                  setActiveMode('bluetooth');
                  sharedArrival.value = null;
                }}
              >
                <Bluetooth size={13} />
                <span>{t.shareRoute.viaBluetooth}</span>
              </TactileButton>
            </div>
          </div>
        )}

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
