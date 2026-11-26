import { useRef, useState } from 'preact/hooks';
import { cn } from '../lib/cn';
import { playClick } from '../lib/sound';

interface PinPadProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
}

export function PinPad({ onComplete, disabled = false }: PinPadProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  function submitIfComplete(nextDigits: string[]) {
    const joined = nextDigits.join('');
    if (/^\d{4}$/.test(joined)) {
      onComplete(joined);
      setTimeout(() => {
        setDigits(['', '', '', '']);
        refs[0].current?.blur();
      }, 220);
    }
  }

  function handleChange(index: number, raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    playClick();

    if (clean.length >= 4) {
      const slice = clean.slice(0, 4).split('');
      setDigits(slice);
      submitIfComplete(slice);
      return;
    }

    const next = [...digits];
    next[index] = clean[clean.length - 1];
    setDigits(next);

    if (index < 3) {
      refs[index + 1].current?.focus();
    } else {
      submitIfComplete(next);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      } else if (index > 0) {
        refs[index - 1].current?.focus();
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
      }
      playClick();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs[index - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      refs[index + 1].current?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') || '';
    const match = text.match(/\d{4}/);
    if (match) {
      e.preventDefault();
      playClick();
      const split = match[0].split('');
      setDigits(split);
      submitIfComplete(split);
    }
  }

  return (
    <div className="flex items-center gap-2.5" onPaste={handlePaste}>
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={refs[idx]}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          disabled={disabled}
          value={digit}
          aria-label={`PIN digit ${idx + 1}`}
          placeholder="·"
          onInput={(e) => handleChange(idx, (e.target as HTMLInputElement).value)}
          onKeyDown={(e) => handleKeyDown(idx, e as unknown as KeyboardEvent)}
          onFocus={(e) => (e.target as HTMLInputElement).select()}
          className={cn(
            'h-12 w-11 sm:h-14 sm:w-12 rounded-[5px] border-2 border-dashed border-[var(--border-dashed)] bg-[var(--surface-inset)] text-center tabular-mono text-2xl font-bold text-[var(--ink-primary)] placeholder:text-[var(--ink-secondary)]/45 focus:border-solid focus:border-[var(--accent-airmail)] focus:outline-none transition-colors shadow-[inset_0_2px_0_rgba(0,0,0,0.04)]',
            digit && 'border-solid border-[var(--ink-primary)] bg-[var(--surface-receipt)]'
          )}
        />
      ))}
    </div>
  );
}
