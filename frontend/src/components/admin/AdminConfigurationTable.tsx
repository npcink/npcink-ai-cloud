import type { ReactNode } from 'react';

type AdminConfigurationTableProps = {
  ariaLabel: string;
  itemHeading: string;
  valueHeading: string;
  detailHeading: string;
  children: ReactNode;
  density?: 'standard' | 'compact';
};

type AdminConfigurationRowProps = {
  rowId: string;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

export function AdminConfigurationTable({
  ariaLabel,
  itemHeading,
  valueHeading,
  detailHeading,
  children,
  density = 'standard',
}: AdminConfigurationTableProps) {
  return (
    <div
      data-ui="admin-configuration-table"
      data-density={density}
      data-boundary="rows"
      className="overflow-hidden"
    >
      <table className="w-full table-fixed text-left text-sm" aria-label={ariaLabel}>
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[48%]" />
          <col className="w-[30%]" />
        </colgroup>
        <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-400">
          <tr>
            <th className={density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5'} scope="col">{itemHeading}</th>
            <th className={density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5'} scope="col">{valueHeading}</th>
            <th className={density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-2.5'} scope="col">{detailHeading}</th>
          </tr>
        </thead>
        <tbody
          data-density={density}
          className={`divide-y ${
            density === 'compact'
              ? 'divide-slate-100 dark:divide-slate-800/70'
              : 'divide-slate-200 dark:divide-slate-800'
          }`}
        >
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function AdminConfigurationRow({
  rowId,
  label,
  value,
  detail,
}: AdminConfigurationRowProps) {
  return (
    <tr data-configuration-row={rowId} className="admin-configuration-row bg-white dark:bg-slate-950">
      <th className="px-4 py-3 align-middle font-medium text-slate-700 dark:text-slate-200" scope="row">
        {label}
      </th>
      <td className="px-4 py-3 align-middle text-slate-900 dark:text-white">
        {value}
      </td>
      <td className="px-4 py-3 align-middle text-xs leading-5 text-slate-500 dark:text-slate-400">
        {detail}
      </td>
    </tr>
  );
}
