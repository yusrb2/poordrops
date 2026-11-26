import { HelpCircle, Languages, Moon, PackageCheck, Sun, Volume2, VolumeX } from 'lucide-preact';
import { locale, toggleLocale, useT } from '../lib/i18n';
import { soundEnabled, toggleSound } from '../lib/sound';
import { theme, toggleTheme } from '../lib/theme';
import { TactileButton } from './ui/TactileButton';

interface HeaderProps {
  onOpenHelp?: () => void;
  deviceSlot?: preact.ComponentChildren;
}

export function Header({ onOpenHelp, deviceSlot }: HeaderProps) {
  const t = useT();
  const isDark = theme.value === 'dark';
  const isSound = soundEnabled.value;

  return (
    <header className="relative z-10 border-b-[1.5px] border-dashed border-[var(--border-dashed)] bg-[var(--surface-receipt)]">
      <div className="airmail-stripe" />
      <div className="mx-auto max-w-5xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-[5px] border-2 border-[var(--accent-airmail)] bg-[var(--surface-inset)] text-[var(--accent-airmail)] shadow-[0_2px_0_var(--shadow-card)]"
            aria-hidden="true"
          >
            <PackageCheck size={20} strokeWidth={1.5} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display-tsuki text-xl sm:text-2xl font-bold tracking-tight text-[var(--ink-primary)] leading-none">
                PoorDrops
              </h1>
              <span className="tabular-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-[3px] border border-[var(--border-dashed)] bg-[var(--surface-inset)] text-[var(--ink-secondary)]">
                P2P
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{t.tagline}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {deviceSlot}

          <TactileButton
            size="sm"
            variant="secondary"
            onClick={() => toggleLocale()}
            title="Switch Language (EN / ID)"
            aria-label="Switch Language"
          >
            <Languages size={14} strokeWidth={1.5} />
            <span className="tabular-mono">{locale.value.toUpperCase()}</span>
          </TactileButton>

          <TactileButton
            size="sm"
            variant="secondary"
            silent
            onClick={() => toggleSound()}
            title={isSound ? t.header.soundOn : t.header.soundOff}
            aria-label={isSound ? t.header.soundOn : t.header.soundOff}
          >
            {isSound ? <Volume2 size={14} strokeWidth={1.5} /> : <VolumeX size={14} strokeWidth={1.5} />}
          </TactileButton>

          <TactileButton
            size="sm"
            variant="secondary"
            onClick={() => toggleTheme()}
            title={isDark ? t.header.themeLight : t.header.themeDark}
            aria-label={isDark ? t.header.themeLight : t.header.themeDark}
          >
            {isDark ? <Sun size={14} strokeWidth={1.5} /> : <Moon size={14} strokeWidth={1.5} />}
          </TactileButton>

          <TactileButton
            size="sm"
            variant="secondary"
            onClick={onOpenHelp}
            title={t.header.help}
            aria-label={t.header.help}
          >
            <HelpCircle size={14} strokeWidth={1.5} />
            <span className="hidden sm:inline">?</span>
          </TactileButton>
        </div>
      </div>
    </header>
  );
}
