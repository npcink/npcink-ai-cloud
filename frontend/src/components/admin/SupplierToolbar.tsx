import type { ConnectionStatusFilter } from '@/components/admin/SupplierConnectionTables';

type SupplierToolbarProps = {
  connectionSearch: string;
  onConnectionSearchChange: (value: string) => void;
  statusFilter: ConnectionStatusFilter;
  onStatusFilterChange: (value: ConnectionStatusFilter) => void;
  hasLatestOperation: boolean;
  onOpenLatestOperation: () => void;
  onAddModelSupplier: () => void;
  translate: (key: string, fallback: string) => string;
};

export function SupplierToolbar({
  connectionSearch,
  onConnectionSearchChange,
  statusFilter,
  onStatusFilterChange,
  hasLatestOperation,
  onOpenLatestOperation,
  onAddModelSupplier,
  translate,
}: SupplierToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="min-w-[18rem] flex-1">
          <span className="sr-only">{translate('field_search_connections', 'Search suppliers')}</span>
          <input
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            value={connectionSearch}
            onChange={(event) => onConnectionSearchChange(event.target.value)}
            placeholder={translate('placeholder_search_connections', 'Name, provider, model, capability')}
          />
        </label>
        <label>
          <span className="sr-only">{translate('status_filter_label', 'Status')}</span>
          <select
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as ConnectionStatusFilter)}
            aria-label={translate('status_filter_label', 'Status')}
          >
            <option value="all">{translate('filter_all_statuses', 'All statuses')}</option>
            <option value="ready">{translate('filter_ready', 'Ready')}</option>
            <option value="missing_secret">{translate('filter_missing_secret', 'Missing secret')}</option>
            <option value="disabled">{translate('filter_disabled', 'Disabled')}</option>
          </select>
        </label>
        {hasLatestOperation ? (
          <button type="button" className="btn btn-secondary justify-center" onClick={onOpenLatestOperation}>
            {translate('action_latest_operation', 'Latest operation')}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary justify-center" onClick={onAddModelSupplier}>
          {translate('action_add_model_supplier', 'Add model supplier')}
        </button>
    </div>
  );
}
