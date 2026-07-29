import { Fragment, type ReactNode } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { ProviderReferenceLinks } from '@/components/admin/ProviderReferenceLinks';
import type {
  ProviderConnectionTestResult,
  ResourceStatus,
  SupplierConnection,
} from '@/features/admin/ai-resources/types';
import { formatDate } from '@/lib/utils';

type Translate = (
  key: string,
  fallback: string,
  variables?: Record<string, string>
) => string;

type ReferenceLinkItem = {
  key: string;
  labelKey: string;
  fallback: string;
  href: string;
};

const QUIET_STATUS_BADGE_CLASS =
  'bg-slate-50 px-2 py-0.5 text-xs normal-case tracking-normal text-slate-600 dark:bg-slate-900 dark:text-slate-300';

const TABLE_ACTION_BUTTON_CLASS =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-700';

const TABLE_DELETE_BUTTON_CLASS =
  'rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900 dark:bg-slate-950 dark:text-rose-300 dark:hover:border-rose-800 dark:hover:bg-rose-950/20';

const TABLE_CONFIRM_DELETE_BUTTON_CLASS =
  'rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:border-rose-700 dark:hover:bg-rose-950/50';

function statusTone(status: ResourceStatus): 'success' | 'warning' | 'disabled' | 'info' {
  if (status === 'ready' || status === 'healthy') return 'success';
  if (status === 'missing_secret' || status === 'missing_provider' || status === 'saved_credential_unreadable' || status === 'degraded') return 'warning';
  if (status === 'disabled') return 'disabled';
  return 'info';
}

function resourceStatusLabel(status: ResourceStatus, translate: Translate): string {
  const labels: Record<string, string> = {
    ready: translate('status_ready_label', 'Ready'),
    missing_secret: translate('status_missing_secret_label', 'Missing secret'),
    missing_provider: translate('status_missing_provider_label', 'Missing provider'),
    saved_credential_unreadable: translate('status_saved_credential_unreadable_label', 'Credential must be saved again'),
    disabled: translate('status_disabled_label', 'Disabled'),
    healthy: translate('status_healthy_label', 'Healthy'),
    degraded: translate('status_degraded_label', 'Degraded'),
    error: translate('status_error_label', 'Error'),
    warning: translate('status_warning_label', 'Warning'),
    info: translate('status_info_label', 'Info'),
    not_observed: translate('status_not_observed', 'Not observed'),
  };
  return labels[status] || status;
}

function connectionErrorLabel(errorCode: string, translate: Translate): string {
  const labels: Record<string, string> = {
    'provider_connection.unsupported_provider_kind': translate(
      'provider_error_unsupported_kind',
      'This connection type cannot be tested automatically.'
    ),
  };
  return labels[errorCode] || translate(
    'provider_last_test_failed',
    'The last test failed. Open configuration, verify the credential, and retry.'
  );
}

function ConnectionIssue({ connection, translate }: { connection: SupplierConnection; translate: Translate }) {
  if (connection.enabled && connection.configured) return null;
  if (connection.status === 'saved_credential_unreadable') {
    return (
      <div className="mt-2 text-xs font-medium leading-5 text-amber-700 dark:text-amber-300">
        {translate('provider_issue_credential_unreadable', 'The saved credential cannot be read. Enter and save it again.')}
      </div>
    );
  }
  return (
    <div className="mt-2 text-xs font-medium leading-5">
      {!connection.enabled ? (
        <span className="text-slate-500 dark:text-slate-400">
          {translate('provider_issue_runtime_disabled', 'Runtime calls are disabled')}
        </span>
      ) : null}
      {!connection.enabled && !connection.configured ? (
        <span className="mx-1 text-slate-300 dark:text-slate-700">·</span>
      ) : null}
      {!connection.configured ? (
        <span className="text-amber-700 dark:text-amber-300">
          {translate('provider_issue_missing_credential', 'Provider credential is not configured')}
        </span>
      ) : null}
    </div>
  );
}

type SharedTableProps = {
  selectedConnectionId: string;
  onSelectConnection: (connectionId: string) => void;
  testResults: Record<string, ProviderConnectionTestResult>;
  testingConnectionId: string;
  deletingConnectionId: string;
  confirmingDeleteConnectionId: string;
  onDelete: (connection: SupplierConnection) => void;
  onRequestDelete: (connectionId: string) => void;
  onCancelDelete: () => void;
  providerTestStageLabel: (stage: string) => string;
  providerTestMessage: (result: ProviderConnectionTestResult) => string;
  onTest: (connectionId: string) => void;
  translate: Translate;
};

type ModelSupplierTableProps = SharedTableProps & {
  connections: SupplierConnection[];
  providerKindLabel: (kind: string) => string;
  referenceLinksForConnection: (connection: SupplierConnection) => ReferenceLinkItem[];
  onConfigure: (connection: SupplierConnection) => void;
  toolbar?: ReactNode;
};

export function ModelSupplierTable({
  connections,
  selectedConnectionId,
  onSelectConnection,
  testResults,
  testingConnectionId,
  deletingConnectionId,
  confirmingDeleteConnectionId,
  providerKindLabel,
  providerTestStageLabel,
  providerTestMessage,
  referenceLinksForConnection,
  onConfigure,
  onTest,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  translate,
  toolbar,
}: ModelSupplierTableProps) {
  return (
    <AdminDataTableFrame
      dataUi="model-supplier-directory"
      title={translate('overview_model_suppliers', 'Model suppliers')}
      resultLabel={translate('directory_result_count', '{{count}} suppliers', { count: String(connections.length) })}
      headerActions={toolbar}
      footer={(
        <details data-ui="supplier-boundary" className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
            {translate('technical_details', 'Technical details')}
          </summary>
          <p className="mt-2 max-w-3xl leading-5">
            {translate('inspector_boundary', 'This table reads Cloud runtime provider detail. Hosted runtime profiles own candidate-chain configuration; local WordPress control remains local.')}
          </p>
        </details>
      )}
    >
        <table data-ui="model-supplier-table" className="w-full min-w-[64rem] table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="w-[21%] px-4 py-2.5">{translate('column_provider', 'Supplier')}</th>
              <th className="w-[13%] px-3 py-2.5">{translate('column_status', 'Status')}</th>
              <th className="w-[16%] px-3 py-2.5">{translate('column_connection', 'Connection')}</th>
              <th className="w-[12%] px-3 py-2.5">{translate('column_enabled_models', 'Runtime allowlist')}</th>
              <th className="w-[16%] px-3 py-2.5">{translate('last_test', 'Last test')}</th>
              <th className="w-[22%] px-4 py-2.5 text-right">{translate('column_actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {connections.map((connection) => {
              const testResult = testResults[connection.connection_id];
              const modelCount = connection.model_ids?.length || 0;
              const isSelected = connection.connection_id === selectedConnectionId;
              const isTesting = testingConnectionId === connection.connection_id;
              const isDeleting = deletingConnectionId === connection.connection_id;
              const isConfirmingDelete = confirmingDeleteConnectionId === connection.connection_id;
              const providerLinks = referenceLinksForConnection(connection);
              const hasFeedback = Boolean(testResult || connection.last_error_code || isConfirmingDelete);
              const selectConnection = () => onSelectConnection(connection.connection_id);
              return (
                <Fragment key={connection.connection_id}>
                  <tr
                    data-connection-id={connection.connection_id}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={isSelected ? 'bg-blue-50/60 dark:bg-blue-950/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/30'}
                  >
                    <td className="px-4 py-3 align-top">
                      <button
                        type="button"
                        className="max-w-full truncate text-left font-semibold text-slate-950 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                        onClick={selectConnection}
                      >
                        {connection.display_name}
                      </button>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{connection.provider_id}</p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <BackofficeStatusBadge
                        label={resourceStatusLabel(connection.status, translate)}
                        status={statusTone(connection.status)}
                        className={connection.status === 'ready' ? QUIET_STATUS_BADGE_CLASS : undefined}
                      />
                      <ConnectionIssue connection={connection} translate={translate} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{providerKindLabel(connection.kind)}</span>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400" title={connection.base_url}>
                        {connection.base_url || '-'}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {translate('model_catalog_enabled_count_short', '{{count}} models', { count: String(modelCount) })}
                      </span>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {connection.runtime_profile_ids.join(', ') || '-'}
                      </p>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {testResult
                          ? (testResult.ok ? translate('test_passed', 'Passed') : resourceStatusLabel(testResult.status, translate))
                          : connection.last_tested_at
                            ? formatDate(connection.last_tested_at)
                            : '-'}
                      </span>
                      {testResult ? <p className="mt-1">{providerTestStageLabel(testResult.stage)}</p> : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-start justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap"
                          disabled={isDeleting}
                          onClick={() => {
                            selectConnection();
                            onConfigure(connection);
                          }}
                        >
                          {translate('action_configure', 'Configure')}
                        </button>
                        {connection.managed_by === 'cloud_provider_connections' ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap"
                            disabled={isTesting || isDeleting}
                            onClick={() => {
                              selectConnection();
                              onTest(connection.connection_id);
                            }}
                          >
                            {isTesting ? translate('testing', 'Testing...') : translate('action_test', 'Test')}
                          </button>
                        ) : null}
                        <details data-ui="supplier-more-actions" className="group shrink-0 text-left">
                          <summary
                            className={`${TABLE_ACTION_BUTTON_CLASS} cursor-pointer list-none whitespace-nowrap`}
                            aria-label={translate('model_visibility_more_operations', 'More actions')}
                          >
                            ···
                          </summary>
                          <div className="mt-2 w-48 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-950">
                            <ProviderReferenceLinks
                              items={providerLinks}
                              label={translate('provider_links_title', 'Reference links')}
                              translate={translate}
                              variant="inline"
                            />
                            {connection.managed_by === 'cloud_provider_connections' ? (
                              <button
                                type="button"
                                className={`${TABLE_DELETE_BUTTON_CLASS} mt-3 w-full`}
                                disabled={isDeleting}
                                onClick={() => {
                                  selectConnection();
                                  onRequestDelete(connection.connection_id);
                                }}
                              >
                                {translate('action_delete', 'Delete')}
                              </button>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                  {hasFeedback ? (
                    <tr data-feedback-for={connection.connection_id}>
                      <td colSpan={6} className="bg-slate-50/70 px-4 py-3 dark:bg-slate-900/35">
                        {testResult && !testResult.ok ? (
                          <p role="alert" className="text-xs leading-5 text-amber-800 dark:text-amber-200">
                            {providerTestStageLabel(testResult.stage)} · {providerTestMessage(testResult)}
                          </p>
                        ) : testResult?.ok ? (
                          <p role="status" className="text-xs leading-5 text-emerald-800 dark:text-emerald-200">
                            {translate('test_result_passed_inline', 'Test passed')} · {providerTestMessage(testResult)}
                          </p>
                        ) : connection.last_error_code ? (
                          <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
                            {connectionErrorLabel(connection.last_error_code, translate)}
                          </p>
                        ) : null}
                        {isConfirmingDelete ? (
                          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
                            <span>
                              {translate('delete_confirmation_notice', 'Deleting {{name}} removes this runtime connection. Existing model bindings may stop resolving.', { name: connection.display_name })}
                            </span>
                            <span className="flex gap-2">
                              <button type="button" className={TABLE_CONFIRM_DELETE_BUTTON_CLASS} disabled={isDeleting} onClick={() => onDelete(connection)}>
                                {isDeleting ? translate('deleting', 'Deleting...') : translate('action_confirm_delete', 'Confirm delete')}
                              </button>
                              <button type="button" className={TABLE_ACTION_BUTTON_CLASS} disabled={isDeleting} onClick={onCancelDelete}>
                                {translate('action_cancel', 'Cancel')}
                              </button>
                            </span>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {connections.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {translate('ai_suppliers_empty', 'No model suppliers match the current filters.')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
    </AdminDataTableFrame>
  );
}
