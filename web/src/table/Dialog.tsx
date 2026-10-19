import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  compact = false,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  compact?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissibleRef=useRef(dismissible);
  dismissibleRef.current=dismissible;
  useEffect(() => {
    const element = ref.current;
    // Keep the external trigger when Strict Mode replays the focus effect.
    if (document.activeElement instanceof HTMLElement && !element?.contains(document.activeElement))
      returnFocusRef.current = document.activeElement;
    const before = returnFocusRef.current;
    element?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if(dismissibleRef.current)closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const focusables = [
        ...element!.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]',
        ),
      ].filter((control) => control.getClientRects().length > 0);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      // The table removes its inert attribute in the parent's effect on close.
      queueMicrotask(() => {
        if (!ref.current?.isConnected && before?.isConnected) before.focus();
      });
    };
  }, []);
  return (
    <div
      className="modal-shade"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`dialog ${wide ? 'dialog-wide' : ''} ${compact ? 'dialog-compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header className="dialog-header">
          <h2>{title}</h2>
          {dismissible && <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>}
        </header>
        {children}
      </div>
    </div>
  );
}
