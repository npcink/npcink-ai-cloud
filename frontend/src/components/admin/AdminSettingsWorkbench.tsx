import type { ReactNode } from 'react';

type AdminSettingsWorkbenchItem = {
  id: string;
  label: string;
  status: string;
  tone?: 'ready' | 'attention' | 'neutral' | 'error';
};

type AdminSettingsWorkbenchProps = {
  ariaLabel: string;
  activeId: string;
  items: AdminSettingsWorkbenchItem[];
  children: ReactNode;
  onSelect: (id: string) => void;
};

const TONE_CLASSES = {
  ready: 'bg-emerald-500',
  attention: 'bg-amber-500',
  neutral: 'bg-slate-400',
  error: 'bg-rose-500',
} as const;

export function AdminSettingsWorkbench({
  ariaLabel,
  activeId,
  items,
  children,
  onSelect,
}: AdminSettingsWorkbenchProps) {
  return (
    <section
      data-ui="admin-settings-workbench"
      data-density="compact"
      className="admin-compact-surface overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="grid min-w-0 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label={ariaLabel}
          aria-orientation="vertical"
          className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 p-1.5 dark:border-slate-800 dark:bg-slate-900/40 sm:grid-cols-3 lg:block lg:border-b-0 lg:border-r"
        >
          {items.map((item) => {
            const active = activeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`service-settings-${item.id}`}
                className={`flex min-h-10 min-w-0 items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm transition lg:w-full lg:gap-3 lg:px-3 ${
                  active
                    ? 'bg-white font-semibold text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-white dark:ring-slate-700'
                    : 'text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white'
                }`}
                onClick={() => onSelect(item.id)}
              >
                <span className="truncate">{item.label}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${TONE_CLASSES[item.tone || 'neutral']}`}
                  />
                  <span className="whitespace-nowrap">{item.status}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div data-ui="admin-settings-active-panel" className="min-w-0 p-4">
          {children}
        </div>
      </div>
    </section>
  );
}
