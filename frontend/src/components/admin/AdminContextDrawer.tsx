'use client';

import { createPortal } from 'react-dom';
import { useCallback, type ReactNode, type RefObject } from 'react';
import { useDialogFocusManagement } from '@/hooks/useDialogFocusManagement';

type AdminContextDrawerProps = {
  open: boolean;
  title: string;
  titleId: string;
  eyebrow?: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function AdminContextDrawer({
  open,
  title,
  titleId,
  eyebrow,
  closeLabel,
  onClose,
  children,
  footer,
  returnFocusRef,
}: AdminContextDrawerProps) {
  const closeWithFocusReturn = useCallback(() => {
    const returnFocusTarget = returnFocusRef?.current;
    onClose();
    window.requestAnimationFrame(() => returnFocusTarget?.focus());
  }, [onClose, returnFocusRef]);
  const drawerRef = useDialogFocusManagement<HTMLElement>(open, closeWithFocusReturn, returnFocusRef);

  if (!open) return null;

  return createPortal(
    <div data-ui="admin-context-drawer" className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/45"
        tabIndex={-1}
        aria-hidden="true"
        onClick={closeWithFocusReturn}
      />
      <aside
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {eyebrow}
              </p>
            ) : null}
            <h2 id={titleId} className={`${eyebrow ? 'mt-2' : ''} truncate text-xl font-semibold text-slate-950 dark:text-white`}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            data-ui="admin-context-drawer-close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
            aria-label={closeLabel}
            onClick={closeWithFocusReturn}
          >
            <span aria-hidden="true">X</span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}
