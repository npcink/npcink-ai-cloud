import type { ReactNode } from 'react';

type AdminSettingsDisclosureProps = {
  title: string;
  description: string;
  statusLabel?: string;
  statusTone?: 'configured' | 'attention' | 'neutral';
  dataUi?: string;
  children: ReactNode;
};

const STATUS_CLASSES = {
  configured: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  attention: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  neutral: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
} as const;

export function AdminSettingsDisclosure({
  title,
  description,
  statusLabel,
  statusTone = 'neutral',
  dataUi,
  children,
}: AdminSettingsDisclosureProps) {
  return (
    <details
      data-ui={dataUi}
      className="group rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            <span className="mr-2 inline-block text-slate-400 transition group-open:rotate-90 dark:text-slate-500">›</span>
            {title}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {statusLabel ? (
          <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_CLASSES[statusTone]}`}>
            {statusLabel}
          </span>
        ) : null}
      </summary>
      <div className="grid gap-3 border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        {children}
      </div>
    </details>
  );
}
