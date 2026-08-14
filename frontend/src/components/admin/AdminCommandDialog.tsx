'use client';

import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogKeyboard } from '@/hooks/useDialogKeyboard';

export type AdminCommandDialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function AdminCommandDialog({
  open,
  title,
  onClose,
  children,
}: AdminCommandDialogProps) {
  const dialogRef = useDialogKeyboard<HTMLDivElement>({ open, onClose });

  if (!open) return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-ui="admin-command-dialog"
      className="fixed inset-0 z-[70] bg-slate-950/24 px-3 py-16 backdrop-blur-sm dark:bg-slate-950/55"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="mx-auto flex max-h-[min(32rem,calc(100svh-8rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        {children}
      </div>
    </div>,
    document.body
  );
}
