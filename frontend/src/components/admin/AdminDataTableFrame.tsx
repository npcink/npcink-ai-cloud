import type { ReactNode } from 'react';

type AdminDataTableFrameProps = {
  title: string;
  resultLabel: string;
  dataUi: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AdminDataTableFrame({
  title,
  resultLabel,
  dataUi,
  children,
  footer,
}: AdminDataTableFrameProps) {
  return (
    <section
      data-ui={dataUi}
      className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{resultLabel}</p>
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </section>
  );
}
