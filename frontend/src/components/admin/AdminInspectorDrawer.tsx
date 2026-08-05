'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type AdminInspectorDrawerProps = {
  open: boolean;
  title: string;
  titleId: string;
  eyebrow?: string;
  description?: string;
  closeLabel: string;
  headerAccessory?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

export function AdminInspectorDrawer({
  open,
  title,
  titleId,
  eyebrow,
  description,
  closeLabel,
  headerAccessory,
  footer,
  onClose,
  children,
}: AdminInspectorDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, a[href]'
        )
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      data-ui="admin-inspector-drawer"
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? `${titleId}-description` : undefined}
    >
      <div
        ref={drawerRef}
        className="flex h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:max-w-[32rem]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {eyebrow}
              </p>
            ) : null}
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-lg font-semibold text-slate-950 dark:text-white">
                {title}
              </h2>
              {headerAccessory}
            </div>
            {description ? (
              <p id={`${titleId}-description`} className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            data-ui="admin-inspector-drawer-close"
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
