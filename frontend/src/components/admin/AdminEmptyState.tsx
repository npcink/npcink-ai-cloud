import type { ReactNode } from 'react';

type AdminEmptyStateProps = {
  children: ReactNode;
  className?: string;
};

export function AdminEmptyState({
  children,
  className = '',
}: AdminEmptyStateProps) {
  return (
    <div
      data-ui="admin-empty-state"
      data-surface-state="empty"
      className={`rounded-lg border border-dashed border-slate-300 px-3 py-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400 ${className}`}
    >
      {children}
    </div>
  );
}
