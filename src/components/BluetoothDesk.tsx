import { Bluetooth } from 'lucide-preact';
import { ReceiptCard } from './ui/ReceiptCard';
import { useT } from '../lib/i18n';

export function BluetoothDesk() {
  const t = useT();

  return (
    <ReceiptCard airmailTop className="p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 pb-3 border-b border-dashed border-[var(--border-dashed)]">
        <Bluetooth size={18} strokeWidth={1.5} className="text-[var(--accent-airmail)]" />
        <div>
          <h2 className="font-display-tsuki text-lg sm:text-xl font-bold text-[var(--ink-primary)]">
            {t.bluetooth.title}
          </h2>
          <p className="text-xs text-[var(--ink-secondary)]">{t.bluetooth.subtitle}</p>
        </div>
      </div>
      <p className="text-xs text-[var(--ink-secondary)]">{t.bluetooth.loadingShell}</p>
    </ReceiptCard>
  );
}
