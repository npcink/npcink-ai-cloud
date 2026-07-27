import type { ReactNode } from 'react';

type AdminDataTableFrameProps = {
  title: string;
  resultLabel: string;
  dataUi: string;
  children: ReactNode;
  footer?: ReactNode;
  density?: 'standard' | 'compact';
};

export function AdminDataTableFrame({
  title,
  resultLabel,
  dataUi,
  children,
  footer,
  density = 'standard',
}: AdminDataTableFrameProps) {
  return (
    <section
      data-ui={dataUi}
      data-density={density}
      className={`overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${
        density === 'compact' ? 'admin-compact-surface mt-2' : 'mt-4 rounded-xl'
      }`}
    >
      <div className={`flex items-center justify-between border-b border-slate-200 dark:border-slate-800 ${
        density === 'compact' ? 'min-h-9 gap-2 bg-white px-3 py-1.5 dark:bg-slate-950' : 'gap-3 bg-slate-50/80 px-4 py-3 dark:bg-slate-900/40'
      }`}>
        <div className={density === 'compact' ? 'flex min-w-0 items-baseline gap-3' : undefined}>
          <h2 className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
          <p className={`${density === 'compact' ? 'truncate' : 'mt-0.5'} text-xs text-slate-500 dark:text-slate-400`}>{resultLabel}</p>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </section>
  );
}
