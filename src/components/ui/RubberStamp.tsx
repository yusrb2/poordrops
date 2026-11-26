import { cn } from '../../lib/cn';

interface RubberStampProps {
  label: string;
  tone?: 'cleared' | 'airmail' | 'amber';
  animate?: boolean;
  className?: string;
}

const toneMap = {
  cleared: 'border-[var(--accent-cleared)] text-[var(--accent-cleared)]',
  airmail: 'border-[var(--accent-airmail)] text-[var(--accent-airmail)]',
  amber: 'border-[var(--accent-amber)] text-[var(--accent-amber)]',
};

export function RubberStamp({
  label,
  tone = 'cleared',
  animate = true,
  className,
}: RubberStampProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 border-2 rounded-[3px] tabular-mono text-[11px] font-bold uppercase tracking-wider select-none',
        toneMap[tone],
        animate && 'stamp-settle',
        className
      )}
    >
      {label}
    </span>
  );
}
