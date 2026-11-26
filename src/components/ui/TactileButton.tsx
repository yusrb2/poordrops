import type { ComponentChildren, ComponentProps } from 'preact';
import { cn } from '../../lib/cn';
import { playClick } from '../../lib/sound';

type Variant = 'primary' | 'secondary' | 'cleared' | 'ghost' | 'danger';

type TactileButtonProps = Omit<ComponentProps<'button'>, 'children' | 'size'> & {
  children: ComponentChildren;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  silent?: boolean;
};

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-airmail)] text-[#FBF8F3] border border-[#9E4221] hover:brightness-105',
  secondary:
    'bg-[var(--surface-receipt)] text-[var(--ink-primary)] border border-[var(--border-dashed)] hover:bg-[var(--surface-inset)]',
  cleared:
    'bg-[var(--accent-cleared)] text-[#FBF8F3] border border-[#2C4F34] hover:brightness-105',
  ghost:
    'bg-transparent text-[var(--ink-secondary)] border border-transparent shadow-none hover:bg-[var(--surface-inset)] hover:text-[var(--ink-primary)]',
  danger:
    'bg-[var(--surface-receipt)] text-[var(--accent-airmail)] border border-[var(--accent-airmail)] hover:bg-[var(--accent-airmail)] hover:text-[#FBF8F3]',
};

const sizeStyles = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2.5',
};

export function TactileButton({
  children,
  variant = 'secondary',
  size = 'md',
  silent = false,
  className,
  onClick,
  type = 'button',
  ...rest
}: TactileButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-[5px] font-bold tracking-tight cursor-pointer select-none disabled:opacity-45 disabled:cursor-not-allowed',
        variant !== 'ghost' && 'tactile-btn',
        variantStyles[variant],
        sizeStyles[size],
        typeof className === 'string' ? className : undefined
      )}
      onClick={(e) => {
        if (!silent) playClick();
        if (typeof onClick === 'function') {
          onClick.call(e.currentTarget, e);
        }
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
