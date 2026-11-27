import { Bluetooth, QrCode, Radio } from 'lucide-preact';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';
import { playClick } from '../lib/sound';
import { peerCount, pinPeerList } from '../state/p2pState';
import { activeMode, setActiveMode, type TransferMode } from '../state/uiState';

export function ModeSwitcher() {
  const t = useT();
  const current = activeMode.value;
  const radarPeers = peerCount.value;
  const pinCount = pinPeerList.value.length;

  const tabs: Array<{
    id: TransferMode;
    code: string;
    label: string;
    icon: typeof Radio;
    badge?: number;
  }> = [
    {
      id: 'radar',
      code: '01',
      label: t.modes.radar,
      icon: Radio,
      badge: radarPeers > 0 ? radarPeers : undefined,
    },
    {
      id: 'qr',
      code: '02',
      label: t.modes.qr,
      icon: QrCode,
      badge: pinCount > 0 ? pinCount : undefined,
    },
    {
      id: 'bluetooth',
      code: '03',
      label: t.modes.bluetooth,
      icon: Bluetooth,
    },
  ];

  return (
    <nav
      aria-label={t.modes.ariaLabel}
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = current === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              if (current !== tab.id) {
                playClick();
                setActiveMode(tab.id);
              }
            }}
            className={cn(
              'tactile-btn relative flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-t-[6px] rounded-b-[4px] border-[1.5px] px-2 py-2.5 sm:px-4 sm:py-3 cursor-pointer select-none transition-colors overflow-hidden',
              isActive
                ? 'border-[var(--ink-primary)] bg-[var(--surface-receipt)] text-[var(--ink-primary)]'
                : 'border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-receipt)]/65'
            )}
          >
            {/* Terracotta archival tab stripe when active */}
            {isActive && (
              <span className="absolute top-0 left-0 right-0 h-[4px] bg-[var(--accent-airmail)]" />
            )}

            <div className="flex items-center gap-1.5">
              <Icon
                size={15}
                strokeWidth={1.7}
                className={cn(
                  'shrink-0',
                  isActive ? 'text-[var(--accent-airmail)]' : 'text-[var(--ink-secondary)]'
                )}
              />
              <span className="tabular-mono text-[10px] font-bold opacity-75">
                {tab.code}
              </span>
            </div>

            <span className="tabular-mono text-[10px] sm:text-xs font-bold uppercase tracking-wide truncate max-w-full">
              {tab.label}
            </span>

            {typeof tab.badge === 'number' && (
              <span className="tabular-mono text-[10px] font-bold px-1.5 py-0.2 rounded-[3px] bg-[var(--accent-cleared)] text-[#FBF8F3] leading-tight">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
