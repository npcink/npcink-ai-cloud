import { Fragment, type ReactNode } from 'react';
import { AdminHelpTip } from '@/components/admin/AdminHelpTip';
import { AdminActionMenu, type AdminActionMenuItem } from '@/components/admin/AdminActionMenu';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import type {
  ProviderConnectionDeletePreflight,
  ProviderConnectionTestResult,
  ResourceStatus,
  SupplierConnection,
} from '@/features/admin/ai-resources/types';
import { asyncOperationRunning, type AsyncOperationState } from '@/features/admin/ai-resources/async-operation-state';
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
  const attentionLabels: Record<string, string> = {
    last_test_failed: translate('provider_issue_last_test_failed', 'Last verification failed'),
    verification_not_observed: translate('provider_issue_verification_not_observed', 'Connection has not been verified'),
    image_delivery_unconfirmed: translate('provider_issue_image_delivery_unconfirmed', 'Image delivery mode is not confirmed'),
    image_output_hosts_missing: translate('provider_issue_image_output_hosts_missing', 'Image download hosts are missing'),
  };
  const attentionMessages = (connection.attention_reasons || [])
    .map((reason) => attentionLabels[reason])
    .filter(Boolean);
  if (!connection.enabled || (connection.configured && !attentionMessages.length)) return null;
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
      {attentionMessages.length ? (
        <span className="block text-amber-700 dark:text-amber-300">
          {attentionMessages.join(' · ')}
        </span>
      ) : null}
    </div>
  );
}

type SharedTableProps = {
  selectedConnectionId: string;
  onSelectConnection: (connectionId: string) => void;
  testResults: Record<string, ProviderConnectionTestResult>;
  testingConnection: AsyncOperationState;
  approvingImageHost: AsyncOperationState;
  deletingConnection: AsyncOperationState;
  preflightingDelete: AsyncOperationState;
  confirmingDeleteConnectionId: string;
  deletePreflight: ProviderConnectionDeletePreflight | null;
  onDelete: (connection: SupplierConnection) => void;
  onRequestDelete: (connection: SupplierConnection) => void;
  onCancelDelete: () => void;
  providerTestStageLabel: (stage: string) => string;
  providerTestMessage: (result: ProviderConnectionTestResult) => string;
  onTest: (connectionId: string) => void;
  onApproveImageHost: (connection: SupplierConnection) => void;
  translate: Translate;
};

type ModelSupplierTableProps = SharedTableProps & {
  connections: SupplierConnection[];
  providerKindLabel: (kind: string) => string;
  referenceLinksForConnection: (connection: SupplierConnection) => ReferenceLinkItem[];
  onConfigure: (connection: SupplierConnection) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  toolbar?: ReactNode;
};

type SupplierMoreActionsProps = {
  connection: SupplierConnection;
  providerLinks: ReferenceLinkItem[];
  isDeleting: boolean;
  isTesting: boolean;
  onTest: (connectionId: string) => void;
  onSelectConnection: () => void;
  onRequestDelete: (connection: SupplierConnection) => void;
  translate: Translate;
};

function SupplierMoreActions({
  connection,
  providerLinks,
  isDeleting,
  isTesting,
  onTest,
  onSelectConnection,
  onRequestDelete,
  translate,
}: SupplierMoreActionsProps) {
  const items: AdminActionMenuItem[] = providerLinks.map((item) => ({
    key: item.key,
    label: translate(item.labelKey, item.fallback),
    href: item.href,
    external: true,
  }));
  if (connection.managed_by === 'cloud_provider_connections') {
    items.unshift({
      key: 'test-connection',
      label: isTesting ? translate('testing', 'Testing...') : translate('action_test', 'Test'),
      disabled: isTesting || isDeleting,
      onSelect: () => { onSelectConnection(); onTest(connection.connection_id); },
    });
    items.push({
      key: 'delete-connection',
      label: translate('action_delete_connection', 'Delete connection'),
      tone: 'danger',
      disabled: isDeleting,
      onSelect: () => {
        onSelectConnection();
        onRequestDelete(connection);
      },
    });
  }

  return (
    <AdminActionMenu
      dataUi="supplier-more-actions"
      triggerLabel={translate('model_visibility_more_operations', 'More actions')}
      triggerClassName={`${TABLE_ACTION_BUTTON_CLASS} h-9 w-9 px-0 text-base leading-none`}
      disabled={isDeleting}
      items={items}
    />
  );
}

export function ModelSupplierTable({
  connections,
  selectedConnectionId,
  onSelectConnection,
  testResults,
  testingConnection,
  approvingImageHost,
  deletingConnection,
  preflightingDelete,
  confirmingDeleteConnectionId,
  deletePreflight,
  providerKindLabel,
  providerTestStageLabel,
  providerTestMessage,
  referenceLinksForConnection,
  onConfigure,
  hasActiveFilters,
  onClearFilters,
  onTest,
  onApproveImageHost,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  translate,
  toolbar,
}: ModelSupplierTableProps) {
  return (
    <AdminDataTableFrame
      dataUi="model-supplier-directory"
      title={translate('model_directory_title', 'Supplier directory')}
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
        <table data-ui="model-supplier-table" className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-slate-200 bg-white text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <tr>
              <th className="w-[30%] px-4 py-2.5">{translate('column_provider', 'Supplier')}</th>
              <th className="w-[22%] px-3 py-2.5">{translate('column_configuration_status', 'Configuration')}</th>
              <th className="w-[16%] px-3 py-2.5">{translate('column_enabled_models', 'Enabled models')}</th>
              <th className="w-[32%] px-4 py-2.5 text-right">{translate('column_actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {connections.map((connection) => {
              const testResult = testResults[connection.connection_id];
              const modelCount = connection.model_ids?.length || 0;
              const isSelected = connection.connection_id === selectedConnectionId;
              const isTesting = asyncOperationRunning(testingConnection, connection.connection_id);
              const isApprovingImageHost = asyncOperationRunning(approvingImageHost, connection.connection_id);
              const isDeleting = asyncOperationRunning(deletingConnection, connection.connection_id);
              const isPreflightingDelete = asyncOperationRunning(preflightingDelete, connection.connection_id);
              const isConfirmingDelete = confirmingDeleteConnectionId === connection.connection_id;
              const matchingDeletePreflight = deletePreflight?.connection.connection_id === connection.connection_id
                ? deletePreflight
                : null;
              const providerLinks = referenceLinksForConnection(connection);
              const imageDeliveryRepair = connection.image_delivery_repair;
              const hasPendingImageHostRepair = imageDeliveryRepair?.status === 'pending'
                && imageDeliveryRepair.reason_code === 'host_not_allowlisted'
                && Boolean(
                  imageDeliveryRepair.detected_host
                  && (imageDeliveryRepair.run_id || imageDeliveryRepair.probe_id)
                );
              const hasFeedback = Boolean(
                testResult || isTesting ||
                connection.last_error_code ||
                isPreflightingDelete ||
                isConfirmingDelete ||
                hasPendingImageHostRepair
              );
              const selectConnection = () => onSelectConnection(connection.connection_id);
              return (
                <Fragment key={connection.connection_id}>
                  <tr
                    data-connection-id={connection.connection_id}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={isSelected ? 'bg-blue-50/60 dark:bg-blue-950/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/30'}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-1">
                        <span data-ui="supplier-name" className="block max-w-full truncate font-semibold text-slate-950 dark:text-white">{connection.display_name}</span>
                        <AdminHelpTip label={translate('connection_details_named', '{{name}} connection details', { name: connection.display_name })}>
                          <span className="block break-all">{connection.provider_id} · {providerKindLabel(connection.kind)}</span>
                          <span className="block break-all">{connection.base_url || '—'}</span>
                          <span className="block break-words">{connection.runtime_profile_ids.join(', ')}</span>
                          <span className="block">{translate('last_test', 'Last test')}: {connection.last_tested_at ? formatDate(connection.last_tested_at) : translate('status_not_observed', 'Not observed')}</span>
                        </AdminHelpTip>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <BackofficeStatusBadge
                        label={connection.status === 'ready' ? connection.verification_status === 'passed' ? translate('status_catalog_fetched', 'Catalog fetched') : translate('connection_saved', 'Connection saved') : resourceStatusLabel(connection.status, translate)}
                        status={statusTone(connection.status)}
                        className={connection.status === 'ready' ? QUIET_STATUS_BADGE_CLASS : undefined}
                      />
                      <ConnectionIssue connection={connection} translate={translate} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {translate('model_catalog_enabled_count_short', '{{count}} models', { count: String(modelCount) })}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap items-start justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap"
                          disabled={isDeleting || isPreflightingDelete}
                          onClick={() => {
                            selectConnection();
                            onConfigure(connection);
                          }}
                        >
                          {translate('action_configure', 'Configure')}
                        </button>
                        {connection.managed_by === 'cloud_provider_connections' && Boolean(connection.last_error_code || connection.verification_status === 'failed' || testResult?.ok === false) ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap"
                            disabled={isTesting || isDeleting || isPreflightingDelete}
                            onClick={() => {
                              selectConnection();
                              onTest(connection.connection_id);
                            }}
                          >
                            {isTesting ? translate('testing', 'Testing...') : translate('action_retry_test', 'Retry test')}
                          </button>
                        ) : null}
                        <SupplierMoreActions
                          connection={connection}
                          providerLinks={providerLinks}
                          isDeleting={isDeleting || isPreflightingDelete}
                          isTesting={isTesting}
                          onTest={onTest}
                          onSelectConnection={selectConnection}
                          onRequestDelete={onRequestDelete}
                          translate={translate}
                        />
                      </div>
                    </td>
                  </tr>
                  {hasFeedback ? (
                    <tr data-feedback-for={connection.connection_id}>
                      <td colSpan={4} className="bg-slate-50/70 px-4 py-3 dark:bg-slate-900/35">
                        {isTesting ? <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{translate('testing', 'Testing...')}</p> : null}
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
                        {hasPendingImageHostRepair ? (
                          <div role="alert" data-ui="provider-image-host-repair" className="flex flex-wrap items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
                            <span>
                              {translate('image_host_repair_detected', 'Image delivery was blocked because {{host}} is not approved.', {
                                host: String(imageDeliveryRepair?.detected_host || ''),
                              })}
                            </span>
                            <button
                              type="button"
                              className={TABLE_ACTION_BUTTON_CLASS}
                              disabled={isApprovingImageHost || isDeleting}
                              onClick={() => onApproveImageHost(connection)}
                            >
                              {isApprovingImageHost
                                ? translate('image_host_repair_approving', 'Approving...')
                                : translate('image_host_repair_action', 'Approve this exact host')}
                            </button>
                          </div>
                        ) : null}
                        {isPreflightingDelete ? (
                          <p role="status" data-ui="provider-delete-preflight-loading" className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                            {translate('delete_preflight_loading', 'Checking the current deletion impact...')}
                          </p>
                        ) : null}
                        {isConfirmingDelete ? (
                          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
                            <span className="max-w-3xl leading-5">
                              {matchingDeletePreflight ? (
                                <>
                                  {translate(
                                    'delete_preflight_impact',
                                    'Deleting {{name}} affects {{models}} models and {{profiles}} runtime profiles.',
                                    {
                                      name: connection.display_name,
                                      models: String(matchingDeletePreflight.impact.model_count),
                                      profiles: String(matchingDeletePreflight.impact.runtime_profile_ids.length),
                                    }
                                  )}
                                  {' '}
                                  {matchingDeletePreflight.impact.uncovered_runtime_profile_ids.length
                                    ? translate(
                                        'delete_preflight_uncovered_profiles',
                                        'No ready alternative covers: {{profiles}}.',
                                        { profiles: matchingDeletePreflight.impact.uncovered_runtime_profile_ids.join(', ') }
                                      )
                                    : translate(
                                        'delete_preflight_profiles_covered',
                                        'Ready alternatives cover all affected runtime profiles.'
                                      )}
                                </>
                              ) : translate(
                                'delete_confirmation_notice',
                                'Deleting {{name}} removes this runtime connection. Existing model bindings may stop resolving.',
                                { name: connection.display_name }
                              )}
                            </span>
                            <span className="flex gap-2">
                              <button type="button" className={TABLE_CONFIRM_DELETE_BUTTON_CLASS} disabled={isDeleting || !matchingDeletePreflight} onClick={() => onDelete(connection)}>
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
                <td colSpan={4} className="px-4 py-6">
                  <AdminEmptyState className="flex items-center justify-between gap-3 text-left">
                    <span>{translate('ai_suppliers_empty', 'No model suppliers match the current filters.')}</span>
                    {hasActiveFilters ? (
                      <button type="button" className="font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={onClearFilters}>
                        {translate('action_clear_filters', 'Clear filters')}
                      </button>
                    ) : null}
                  </AdminEmptyState>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
    </AdminDataTableFrame>
  );
}
