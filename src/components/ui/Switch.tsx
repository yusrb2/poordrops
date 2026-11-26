import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../lib/cn';
import { playClick } from '../../lib/sound';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  label?: string;
}

const RadixSwitchRoot = SwitchPrimitive.Root as unknown as (props: {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  'aria-label'?: string;
  children?: preact.ComponentChildren;
}) => preact.JSX.Element;

const RadixSwitchThumb = SwitchPrimitive.Thumb as unknown as (props: {
  className?: string;
}) => preact.JSX.Element;

export function Switch({ checked, onCheckedChange, id, label }: SwitchProps) {
  return (
    <RadixSwitchRoot
      id={id}
      checked={checked}
      aria-label={label}
      onCheckedChange={(val) => {
        playClick();
        onCheckedChange(val);
      }}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-[var(--border-dashed)] transition-colors',
        checked ? 'bg-[var(--accent-cleared)] border-[var(--accent-cleared)]' : 'bg-[var(--surface-inset)]'
      )}
    >
      <RadixSwitchThumb
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-[var(--surface-receipt)] shadow-sm transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )}
      />
    </RadixSwitchRoot>
  );
}
