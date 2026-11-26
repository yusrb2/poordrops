import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';
import { cn } from '../../lib/cn';
import { playClick } from '../../lib/sound';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ComponentChildren;
  maxWidthClass?: string;
}

const Root = DialogPrimitive.Root as unknown as (props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ComponentChildren;
}) => preact.JSX.Element;

const Portal = DialogPrimitive.Portal as unknown as (props: {
  children?: ComponentChildren;
}) => preact.JSX.Element;

const Overlay = DialogPrimitive.Overlay as unknown as (props: {
  className?: string;
}) => preact.JSX.Element;

const Content = DialogPrimitive.Content as unknown as (props: {
  className?: string;
  children?: ComponentChildren;
}) => preact.JSX.Element;

const Title = DialogPrimitive.Title as unknown as (props: {
  className?: string;
  children?: ComponentChildren;
}) => preact.JSX.Element;

const Description = DialogPrimitive.Description as unknown as (props: {
  className?: string;
  children?: ComponentChildren;
}) => preact.JSX.Element;

const Close = DialogPrimitive.Close as unknown as (props: {
  asChild?: boolean;
  className?: string;
  children?: ComponentChildren;
  onClick?: () => void;
  'aria-label'?: string;
}) => preact.JSX.Element;

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidthClass = 'max-w-lg',
}: ModalProps) {
  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="fixed inset-0 z-40 bg-[#171513]/65" />
        <Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 receipt-card p-0 overflow-hidden snappy-enter focus:outline-none',
            maxWidthClass
          )}
        >
          <div className="airmail-stripe" />
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-dashed border-[var(--border-dashed)]">
            <div>
              <Title className="font-display-tsuki text-lg font-bold text-[var(--ink-primary)] leading-tight">
                {title}
              </Title>
              {description && (
                <Description className="mt-1 text-xs text-[var(--ink-secondary)]">
                  {description}
                </Description>
              )}
            </div>
            <Close
              aria-label="Close"
              onClick={() => playClick()}
              className="p-1.5 rounded-[4px] border border-[var(--border-dashed)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-inset)] cursor-pointer"
            >
              <X size={16} strokeWidth={1.5} />
            </Close>
          </div>
          <div className="p-5 max-h-[80dvh] overflow-y-auto">{children}</div>
        </Content>
      </Portal>
    </Root>
  );
}
