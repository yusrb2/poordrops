import type { ComponentChildren, ComponentProps } from 'preact';
import { cn } from '../../lib/cn';

type ReceiptCardProps = Omit<ComponentProps<'section'>, 'children'> & {
  children: ComponentChildren;
  serrated?: boolean;
  airmailTop?: boolean;
};

export function ReceiptCard({
  children,
  className,
  serrated = false,
  airmailTop = false,
  ...rest
}: ReceiptCardProps) {
  return (
    <section
      className={cn(
        'receipt-card relative overflow-visible',
        serrated && 'receipt-serrated pb-5',
        typeof className === 'string' ? className : undefined
      )}
      {...rest}
    >
      {airmailTop && <div className="airmail-stripe rounded-t-[4px]" />}
      {children}
    </section>
  );
}
