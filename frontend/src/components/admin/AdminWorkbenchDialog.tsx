'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type AdminWorkbenchDialogProps = {
  open: boolean;
  title: string;
  titleId: string;
  headerAccessory?: ReactNode;
  message?: string;
  error?: string;
  saving: boolean;
  closeLabel: string;
  cancelLabel: string;
  saveLabel: string;
  savingLabel: string;
  footerNotice: string;
  footerActions?: ReactNode;
  hideFooterActions?: boolean;
  width?: 'wide' | 'compact';
  density?: 'standard' | 'compact';
  presentation?: 'dialog' | 'drawer';
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  children: ReactNode;
};

export function AdminWorkbenchDialog({
  open,
  title,
  titleId,
  headerAccessory,
  message,
  error,
  saving,
  closeLabel,
  cancelLabel,
  saveLabel,
  savingLabel,
  footerNotice,
  footerActions,
  hideFooterActions = false,
  width = 'wide',
  density = 'standard',
  presentation = 'dialog',
  onClose,
  onSubmit,
  children,
}: AdminWorkbenchDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }

  return createPortal(
    <div
      data-ui="admin-workbench-dialog"
      data-density={density}
      data-presentation={presentation}
      className={`fixed inset-0 z-50 flex overflow-y-auto bg-slate-950/45 ${
        presentation === 'drawer'
          ? 'items-stretch justify-end p-0'
          : `items-start justify-center ${
            density === 'compact' ? 'px-2 py-2 sm:px-4 sm:py-4' : 'px-4 py-6 backdrop-blur-sm sm:py-10'
          }`
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-workflow-notice`}
    >
      <div
        ref={dialogRef}
        data-width={width}
        className={`${
          presentation === 'drawer'
            ? 'admin-workbench-drawer h-dvh max-h-dvh animate-slide-in-right rounded-none border-y-0 border-r-0 shadow-2xl motion-reduce:animate-none'
            : `${width === 'compact' ? 'admin-workbench-dialog-compact' : 'admin-workbench-dialog'} ${
              density === 'compact'
                ? 'admin-compact-surface max-h-[calc(100vh-2rem)] shadow-lg'
                : `max-h-[calc(100vh-3rem)] ${width === 'compact' ? 'rounded-xl' : 'rounded-2xl'} shadow-2xl`
            }`
        } flex w-full flex-col overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950`}
      >
        <div className={`flex items-center justify-between border-b border-slate-200 dark:border-slate-800 ${
          density === 'compact' ? 'min-h-11 gap-2 px-4 py-2' : 'gap-3 px-5 py-3'
        }`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 id={titleId} className="text-base font-semibold text-slate-950 dark:text-white">
              {title}
            </h3>
            {headerAccessory}
          </div>
          <button
            ref={closeButtonRef}
            data-ui="admin-workbench-close"
            type="button"
            className={`inline-flex shrink-0 items-center justify-center text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white ${
              density === 'compact'
                ? 'h-8 w-8 rounded'
                : 'h-9 w-9 rounded-lg'
            }`}
            disabled={saving}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <span aria-hidden="true">X</span>
          </button>
        </div>

        {message || error ? (
          <div className={`grid gap-2 border-b border-slate-200 dark:border-slate-800 ${
            density === 'compact' ? 'px-4 py-2' : 'px-5 py-3'
          }`}>
            {message ? (
              <div
                role="status"
                aria-live="polite"
                className={`${density === 'compact' ? 'border-l-2 px-2 py-1.5' : 'rounded-lg border px-3 py-2'} border-emerald-200 bg-emerald-50 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-200`}
              >
                {message}
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                className={`${density === 'compact' ? 'border-l-2 px-2 py-1.5' : 'rounded-lg border px-3 py-2'} border-rose-200 bg-rose-50 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200`}
              >
                {error}
              </div>
            ) : null}
          </div>
        ) : null}

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className={`grid min-h-0 flex-1 auto-rows-max content-start gap-3 overflow-y-auto ${
            density === 'compact' ? '!gap-2 px-4 py-3' : 'px-5 py-4'
          }`}>
            {children}
          </div>
          <div className={`flex flex-col border-t border-slate-200 bg-white text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between ${
            density === 'compact' ? 'gap-2 px-4 py-2' : 'gap-3 px-5 py-3'
          }`}>
            <span id={`${titleId}-workflow-notice`}>{footerNotice}</span>
            {footerActions ?? (hideFooterActions ? null : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>
                  {cancelLabel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary justify-center disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? savingLabel : saveLabel}
                </button>
              </div>
            ))}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
