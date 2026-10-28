'use client';

import { formatUsdAmount } from '@/lib/format-usd';

import Link from 'next/link';
import { modelIdentityKeys, upstreamModelId } from '@/features/admin/ai-resources/model-reference-identity';
import { useFragmentDisclosure } from '@/features/admin/useFragmentDisclosure';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  BackofficeDiagnosticNotice,
  BackofficeDisclosure,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficePrimaryPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminRouteSkeleton } from '@/components/admin/AdminRouteSkeleton';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import {
  AdminConfigurationRow,
  AdminConfigurationTable,
} from '@/components/admin/AdminConfigurationTable';
import { AdminCredentialField } from '@/components/admin/AdminCredentialField';
import { AdminHelpTip } from '@/components/admin/AdminHelpTip';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { ProviderConnectionDialog } from '@/components/admin/ProviderConnectionDialog';
import { ModelTestDialog, type ModelTestTarget } from '@/features/admin/ai-resources/ModelTestDialog';
import { ProviderReferenceLinks } from '@/components/admin/ProviderReferenceLinks';
import {
  ModelSupplierTable,
} from '@/components/admin/SupplierConnectionTables';
import { SupplierToolbar } from '@/components/admin/SupplierToolbar';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { Modal } from '@/components/ui/Modal';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import {
  aiResourcesClient,
  useAiResourcesDirectory,
} from '@/features/admin/ai-resources/directory';
import {
  buildProviderConnectionForm,
  EMPTY_PROVIDER_CONNECTION_FORM,
  hasProviderWorkbenchDraftChanges,
  INITIAL_PROVIDER_WORKBENCH_STATE,
  providerWorkbenchReducer,
  type ModelReferenceFeatureFilter,
  type ModelReferenceVisibilityFilter,
  type ProviderCatalogPreview,
  type ProviderConnectionForm,
} from '@/features/admin/ai-resources/provider-workbench-state';
import {
  asyncOperationRunning,
  failAsyncOperation,
  IDLE_ASYNC_OPERATION,
  startAsyncOperation,
  succeedAsyncOperation,
  type AsyncOperationState,
} from '@/features/admin/ai-resources/async-operation-state';
import {
  PROVIDER_PRESETS,
  canChooseReferenceProvider,
  connectionExternalLinkItems,
  defaultReferenceProviderId,
  externalUrlValue,
  inferProviderPreset,
  inferReferenceProviderFromModelIds,
  providerPresetById,
  providerExternalLinkItems,
  providerReferenceLinksForConnection,
  providerReferenceLinksForForm,
  referenceProviderForConnection,
  referenceProviderLabel,
  type ProviderExternalLinkItem,
} from '@/features/admin/ai-resources/provider-presets';
import {
  isProviderConnectionDeletePreflight,
  type ConnectionStatusFilter,
  type ProviderConnectionDeletePreflight,
  type ProviderConnectionTestResult,
  type ProviderImageDeliveryProbeResult,
  type ProviderModelHealth,
  type SupplierConnection as Connection,
} from '@/features/admin/ai-resources/types';
import {
  MODEL_VISIBILITY_PAGE_SIZE,
  buildModelVisibilityRows,
  catalogPreviewForMetadata,
  catalogPreviewFromConnection,
  formatReferenceContext,
  formatReferenceContextTitle,
  formatReferencePrice,
  hasReferencePrice,
  modelReferenceSourceNeedsSync,
  modelReferenceFreshness,
  modelReferenceCapabilityTags,
  normalizeProviderCatalogPreview,
  type ModelReferenceEntry,
  type ModelReferenceSourceSummary,
} from '@/features/admin/ai-resources/model-reference-model';
import { ModelReferencePanel } from '@/features/admin/ai-resources/ModelReferencePanel';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { useDialogKeyboard } from '@/hooks/useDialogKeyboard';
import { formatDate } from '@/lib/utils';

type SupplierCategory = 'ai' | 'capability';

type ProviderConnectionTestResponse = ProviderConnectionTestResult & {
  receipt?: AdminMutationReceiptPayload | null;
};

function supplierCategory(connection: Connection): SupplierCategory {
  if (
    connection.metadata?.managed_surface === 'site_knowledge_vector_profile' ||
    connection.kind === 'web_search_provider' ||
    connection.kind === 'image_source_provider' ||
    connection.kind === 'embedding_provider' ||
    connection.kind === 'rerank_provider' ||
    connection.kind === 'vector_store_provider' ||
    connection.capability_ids.includes('web_search') ||
    connection.capability_ids.includes('image_source') ||
    connection.capability_ids.includes('site_knowledge_rerank') ||
    connection.capability_ids.includes('vector_store')
  ) {
    return 'capability';
  }
  return 'ai';
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function imageOutputHostsAreExact(hosts: string[]): boolean {
  return hosts.every((host) => (
    !Array.from(host).some((character) => /\s/.test(character))
    && !['://', '/', '*', '@', '?', '#', ':'].some((marker) => host.includes(marker))
  ));
}

function uniqueList(values: string[]): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (item && !normalized.includes(item)) {
      normalized.push(item);
    }
  }
  return normalized;
}

function joinList(values: string[]): string {
  return uniqueList(values).join(', ');
}

function slugifyProviderValue(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'provider';
}

function providerConnectionIdFromName(value: string): string {
  const name = value.trim().toLowerCase();
  const slug = slugifyProviderValue(name);
  if (!/[^\u0000-\u007f]/.test(name)) return slug;
  // Keep Chinese names distinct instead of collapsing every name to "provider".
  let hash = 2166136261;
  for (const character of name) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return `${slug.slice(0, 80)}_${hash.toString(36)}`;
}

function providerConnectionTestResultFromError(error: unknown): ProviderConnectionTestResponse | undefined {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) {
    return undefined;
  }
  const details = error.details as Record<string, unknown>;
  return typeof details.connection_id === 'string'
    ? details as ProviderConnectionTestResponse
    : undefined;
}

type AiResourcesTranslate = (key: string, fallback: string, params?: Record<string, string>) => string;

function providerModelHealthStatusMeta(status: string): { token: string; labelKey: string; fallback: string } {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'healthy') {
    return { token: 'success', labelKey: 'provider_health_status_healthy', fallback: 'Healthy' };
  }
  if (normalized === 'degraded') {
    return { token: 'warning', labelKey: 'provider_health_status_degraded', fallback: 'Degraded' };
  }
  if (normalized === 'error') {
    return { token: 'error', labelKey: 'provider_health_status_error', fallback: 'Error' };
  }
  return { token: 'unknown', labelKey: 'provider_health_status_not_observed', fallback: 'Not observed' };
}

function formatProviderModelLatency(value: number | null): string {
  if (value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}


type ProviderModelHealthPanelProps = {
  health: ProviderModelHealth;
  translate: AiResourcesTranslate;
};

function ProviderModelHealthPanel({ health, translate }: ProviderModelHealthPanelProps) {
  const [windowId, setWindowId] = useState(health.default_window_id);
  const evidenceRef = useFragmentDisclosure('provider-model-health');
  const activeWindow = health.windows.find((entry) => entry.window_id === windowId)
    || health.windows[0];
  const rows = activeWindow ? activeWindow.rows : [];
  const totalCalls = rows.reduce((sum, row) => sum + row.call_count, 0);
  const activeWindowLabel = activeWindow
    ? translate(
      `provider_health_window_${activeWindow.window_id}`,
      activeWindow.label
    )
    : '';

  return (
    <details data-ui="provider-model-health" ref={evidenceRef} className="mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <summary className="flex cursor-pointer select-none flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-slate-950 dark:text-white">
        <span>{translate('health_title', 'Model health')}</span>
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
          {translate('provider_health_summary', '{{calls}} calls · {{window}}', {
            calls: String(totalCalls),
            window: activeWindowLabel,
          })}
        </span>
      </summary>
      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2" id="provider-model-health" data-ui="provider-model-health-window">
          {health.windows.map((entry) => (
            <button
              key={entry.window_id}
              type="button"
              aria-pressed={activeWindow?.window_id === entry.window_id}
              className={`h-8 rounded-md border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                activeWindow?.window_id === entry.window_id
                  ? 'border-slate-200 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
              }`}
              onClick={() => setWindowId(entry.window_id)}
            >
              {translate(`provider_health_window_${entry.window_id}`, entry.label)}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {translate('provider_health_empty', 'No provider call evidence in this window yet.')}
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs font-normal text-slate-500 dark:text-slate-400">
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 font-normal dark:border-slate-800">
                    {translate('provider_health_col_model', 'Model')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 font-normal dark:border-slate-800">
                    {translate('provider_health_col_status', 'Status')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_calls', 'Calls')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_success', 'Success')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_avg_latency', 'Avg latency')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_p95', 'P95')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_cost', 'Cost')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_fallback', 'Fallbacks')}
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-2 py-2 text-right font-normal dark:border-slate-800">
                    {translate('provider_health_col_last_observed', 'Last observed')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const statusMeta = providerModelHealthStatusMeta(row.status);
                  return (
                    <tr key={`${row.provider_id}/${row.model_id}`} className="text-slate-800 dark:text-slate-200">
                      <td className="border-b border-slate-100 px-2 py-2 dark:border-slate-800/60">
                        <span className="font-medium">{row.model_id}</span>
                        <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{row.provider_id}</span>
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 dark:border-slate-800/60">
                        <BackofficeStatusBadge
                          label={translate(statusMeta.labelKey, statusMeta.fallback)}
                          status={statusMeta.token}
                        />
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right dark:border-slate-800/60">{row.call_count}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right dark:border-slate-800/60">
                        {row.call_count > 0 ? `${Math.round(row.success_rate * 100)}%` : '—'}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right dark:border-slate-800/60">
                        {formatProviderModelLatency(row.avg_latency_ms)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right dark:border-slate-800/60">
                        {formatProviderModelLatency(row.p95_latency_ms)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right dark:border-slate-800/60">
                        {formatUsdAmount(row.cost)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right dark:border-slate-800/60">{row.fallback_count}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-right text-xs dark:border-slate-800/60">
                        {row.last_observed_at ? formatDate(row.last_observed_at) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {translate('provider_health_boundary', 'Read-only evidence from provider call records. This panel does not change hosted runtime profiles or candidate chains.')}
        </p>
      </div>
    </details>
  );
}

function AiResourcesContent() {
  const { t } = useLocale();
  const toast = useToast();
  const providerErrorMessage = useCallback(
    (error: unknown, fallback: string) => resolveUiErrorMessage(error, fallback, t),
    [t]
  );
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedConnectionId = searchParams.get('focus') || '';
  const aiText = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => t(`admin.ai_resources.${key}`, params, fallback),
    [t]
  );
  const directoryQuery = useAiResourcesDirectory();
  const data = directoryQuery.data || null;
  const loading = directoryQuery.isPending;
  const refetchResources = directoryQuery.refetch;
  const directoryError = directoryQuery.error
    ? providerErrorMessage(
      directoryQuery.error,
      aiText('error_load', 'Failed to load provider management.')
    )
    : '';
  const [connectionStatusFilter, setConnectionStatusFilter] = useState<ConnectionStatusFilter>('all');
  const [connectionSearch, setConnectionSearch] = useState('');
  const [modelTestTarget, setModelTestTarget] = useState<ModelTestTarget | null>(null);
  const [savingConnection, setSavingConnection] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [testingConnection, setTestingConnection] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [probingImageDelivery, setProbingImageDelivery] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [imageDeliveryProbeResult, setImageDeliveryProbeResult] = useState<ProviderImageDeliveryProbeResult | null>(null);
  const [approvingImageHost, setApprovingImageHost] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [preflightingDelete, setPreflightingDelete] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [deletingConnection, setDeletingConnection] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [confirmingDeleteConnectionId, setConfirmingDeleteConnectionId] = useState('');
  const [deletePreflight, setDeletePreflight] = useState<ProviderConnectionDeletePreflight | null>(null);
  const [fetchingProviderCatalog, setFetchingProviderCatalog] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [loadingModelReferences, setLoadingModelReferences] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [syncingModelReferences, setSyncingModelReferences] = useState<AsyncOperationState>(IDLE_ASYNC_OPERATION);
  const [savedSupplier, setSavedSupplier] = useState<{ connectionId: string; providerId: string; hasModels: boolean; directoryError: string } | null>(null);
  const [modelReferenceError, setModelReferenceError] = useState('');
  const [modelReferences, setModelReferences] = useState<ModelReferenceEntry[]>([]);
  const [modelReferenceTotal, setModelReferenceTotal] = useState(0);
  const [modelReferenceSources, setModelReferenceSources] = useState<ModelReferenceSourceSummary[]>([]);
  const [connectionTestResults, setConnectionTestResults] = useState<Record<string, ProviderConnectionTestResult>>({});
  const [providerWorkbench, dispatchProviderWorkbench] = useReducer(
    providerWorkbenchReducer,
    INITIAL_PROVIDER_WORKBENCH_STATE
  );
  const {
    providerFormOpen,
    providerFormMode,
    credentialEditOpen,
    providerConnectionForm,
    providerCatalogPreview,
    modelReferenceProviderId,
    modelReferenceSearch,
    modelReferenceFeatureFilter,
    modelReferenceVisibilityFilter,
    modelReferenceIntelligenceFilter,
    modelReferenceShowDeprecated,
    modelReferencePage,
    confirmingModelBatch,
  } = providerWorkbench;
  const savedProviderConnection = data?.connections.find((connection) => connection.connection_id === providerConnectionForm.connectionId);
  const catalogCredentialMissing = !providerConnectionForm.credential.trim()
    && !(providerFormMode === 'edit' && (savedProviderConnection?.configured || savedProviderConnection?.config?.secretless));
  const providerDraftDirty = hasProviderWorkbenchDraftChanges(providerWorkbench);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showUnconfirmedModels, setShowUnconfirmedModels] = useState(false);
  useEffect(() => {
    try {
      dispatchProviderWorkbench({ type: 'set_show_deprecated', show: localStorage.getItem('admin.model-list.show-deprecated') === 'true' });
    } catch { /* Browser preferences are optional. */ }
  }, []);

  function changeHistoricalModelVisibility(show: boolean) {
    dispatchProviderWorkbench({ type: 'set_show_deprecated', show });
    try { localStorage.setItem('admin.model-list.show-deprecated', String(show)); } catch { /* Keep the current view usable without storage. */ }
  }
  const [lastReceipt, setLastReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [receiptDetailsOpen, setReceiptDetailsOpen] = useState(false);
  const [providerWorkbenchSection, setProviderWorkbenchSection] = useState<'connection' | 'models' | 'references'>('connection');
  const deletePreflightRequestRevision = useRef(0);
  const updateWorkspaceParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleConnectionSearchChange = useCallback((value: string) => {
    setConnectionSearch(value);
    updateWorkspaceParams({ q: value.trim() || null, focus: null });
  }, [updateWorkspaceParams]);

  const handleConnectionStatusFilterChange = useCallback((value: ConnectionStatusFilter) => {
    setConnectionStatusFilter(value);
    updateWorkspaceParams({ status: value === 'all' ? null : value, focus: null });
  }, [updateWorkspaceParams]);

  const handleClearConnectionFilters = useCallback(() => {
    setConnectionSearch('');
    setConnectionStatusFilter('all');
    updateWorkspaceParams({ q: null, status: null, focus: null });
  }, [updateWorkspaceParams]);

  const handleSelectConnection = useCallback((connectionId: string) => {
    updateWorkspaceParams({ focus: connectionId });
  }, [updateWorkspaceParams]);
  const loadResources = useCallback(async () => {
    setError('');
    const result = await refetchResources();
    if (result.error) {
      setError(providerErrorMessage(
        result.error,
        aiText('error_load', 'Failed to load provider management.')
      ));
    }
  }, [aiText, providerErrorMessage, refetchResources]);

  const [referenceNow, setReferenceNow] = useState(() => Date.now());
  useEffect(() => {
    if (!providerFormOpen) return;
    setReferenceNow(Date.now());
    const timer = window.setInterval(() => setReferenceNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [providerFormOpen]);

  const referenceReadRevision = useRef(0);
  const referenceRefreshInFlight = useRef<Promise<void> | null>(null);
  const referenceView = useRef({ open: providerFormOpen, providerId: modelReferenceProviderId, connectionId: providerConnectionForm.connectionId });
  useEffect(() => {
    referenceView.current = { open: providerFormOpen, providerId: modelReferenceProviderId, connectionId: providerConnectionForm.connectionId };
  }, [providerFormOpen, modelReferenceProviderId, providerConnectionForm.connectionId]);
  const loadModelReferences = useCallback(async (providerId: string) => {
    const revision = ++referenceReadRevision.current;
    const normalizedProviderId = providerId.trim().toLowerCase();
    if (!normalizedProviderId || normalizedProviderId === 'custom') {
      setLoadingModelReferences(IDLE_ASYNC_OPERATION);
      setModelReferences([]);
      setModelReferenceTotal(0);
      setModelReferenceSources([]);
      return;
    }
    setLoadingModelReferences(startAsyncOperation(normalizedProviderId));
    setModelReferenceError('');
    try {
      const pageSize = 500;
      const references: ModelReferenceEntry[] = [];
      let total = 0;
      let offset = 0;
      let sourceSummary: ModelReferenceSourceSummary[] = [];
      const seenReferenceKeys = new Set<string>();

      while (offset === 0 || offset < total) {
        const params = new URLSearchParams({
          provider_id: normalizedProviderId,
          limit: String(pageSize),
          offset: String(offset),
          include_deprecated: 'true',
        });
        const response = await aiResourcesClient.request<{
          items?: ModelReferenceEntry[];
          total?: number;
          source_summary?: ModelReferenceSourceSummary[];
        }>(`/api/admin/model-references?${params.toString()}`);
        const pageItems = Array.isArray(response.data.items) ? response.data.items : [];
        total = Math.max(total, Number(response.data.total ?? 0) || 0);
        if (!sourceSummary.length && Array.isArray(response.data.source_summary)) {
          sourceSummary = response.data.source_summary;
        }
        const referenceCountBeforePage = references.length;
        pageItems.forEach((item) => {
          const key = `${item.provider_id}:${item.model_id}`;
          if (!seenReferenceKeys.has(key)) {
            seenReferenceKeys.add(key);
            references.push(item);
          }
        });
        if (
          !pageItems.length
          || pageItems.length < pageSize
          || references.length === referenceCountBeforePage
          || references.length >= total
        ) break;
        offset += pageItems.length;
      }

      const result = { source: sourceSummary.find(source => source.source_id === 'models.dev') || null };
      if (revision !== referenceReadRevision.current) return result;
      setReferenceNow(Date.now());
      setModelReferences(references);
      setModelReferenceTotal(total || references.length);
      setModelReferenceSources(sourceSummary);
      setLoadingModelReferences(succeedAsyncOperation(normalizedProviderId));
      return result;
    } catch (referenceError) {
      if (revision !== referenceReadRevision.current) return null;
      const referenceMessage = providerErrorMessage(referenceError, aiText('error_load_model_references', 'Failed to load model reference data.'));
      setLoadingModelReferences(failAsyncOperation(referenceMessage, normalizedProviderId));
      setModelReferenceError(referenceMessage);
      return { source: null };
    }
  }, [aiText, providerErrorMessage]);

  useEffect(() => {
    if (!providerFormOpen) return;
    setModelReferences([]);
    setModelReferenceSources([]);
    setSyncingModelReferences(IDLE_ASYNC_OPERATION);
    void loadModelReferences(modelReferenceProviderId);
    return () => { referenceReadRevision.current += 1; };
  }, [loadModelReferences, modelReferenceProviderId, providerFormOpen]);

  useEffect(() => {
    const requestedStatus = searchParams.get('status');
    if (requestedStatus === 'ready' || requestedStatus === 'attention' || requestedStatus === 'missing_secret' || requestedStatus === 'disabled') {
      setConnectionStatusFilter(requestedStatus);
    } else {
      setConnectionStatusFilter('all');
    }
    setConnectionSearch(searchParams.get('q') || '');
  }, [searchParams]);

  async function saveProviderConnection() {
    const normalizedConnectionId = providerConnectionForm.connectionId || slugifyProviderValue(providerConnectionForm.displayName || providerConnectionForm.providerId);
    const normalizedProviderId = providerConnectionForm.providerId || slugifyProviderValue(providerConnectionForm.displayName || providerConnectionForm.connectionId);
    const modelIds = uniqueList(splitList(providerConnectionForm.modelIds));
    const imageOutputHosts = splitList(providerConnectionForm.imageOutputHosts);
    if (!imageOutputHostsAreExact(imageOutputHosts)) {
      setError(aiText(
        'error_image_output_hosts_invalid',
        'Use exact host names only, without schemes, paths, ports, or wildcards.'
      ));
      return;
    }
    const modelConfig = {
      ...data?.connections.find((item) => item.connection_id === providerConnectionForm.connectionId)?.config,
      model_ids: modelIds, model_id: modelIds[0] || '',
      image_response_format: providerConnectionForm.imageResponseFormat,
      image_output_hosts: imageOutputHosts,
    };
    const referenceLinks = providerReferenceLinksForForm(providerConnectionForm);
    const websiteUrl = externalUrlValue(referenceLinks.websiteUrl);
    const statusUrl = externalUrlValue(referenceLinks.statusUrl);
    const docsUrl = externalUrlValue(referenceLinks.docsUrl);
    setSavingConnection(startAsyncOperation(normalizedConnectionId));
    setError('');
    setMessage('');
    try {
      const response = await aiResourcesClient.request<{
        connection_id?: string;
        receipt?: AdminMutationReceiptPayload | null;
      }>(providerFormMode === 'edit' ? `/api/admin/provider-connections/${encodeURIComponent(normalizedConnectionId)}` : '/api/admin/provider-connections', {
        method: providerFormMode === 'edit' ? 'PATCH' : 'POST',
        body: {
          connection_id: normalizedConnectionId,
          provider_id: normalizedProviderId,
          provider_type: providerConnectionForm.kind,
          kind: providerConnectionForm.kind,
          display_name: providerConnectionForm.displayName,
          enabled: providerConnectionForm.enabled,
          base_url: providerConnectionForm.baseUrl,
          source_role: providerConnectionForm.sourceRole,
          capability_ids: splitList(providerConnectionForm.capabilityIds),
          runtime_profile_ids: splitList(providerConnectionForm.runtimeProfileIds),
          config: modelConfig,
          metadata: {
            ui_source: 'ai_resources_channel_form',
            provider_preset: providerConnectionForm.providerPreset,
            website_url: websiteUrl || undefined,
            status_url: statusUrl || undefined,
            docs_url: docsUrl || undefined,
            model_ids: modelIds,
            model_catalog_preview: catalogPreviewForMetadata(providerCatalogPreview),
          },
          credential: providerConnectionForm.credential || undefined,
        },
      });
      const savedConnectionId = String(response.data.connection_id || normalizedConnectionId);
      setLastReceipt(response.data.receipt || null);
      let testFailed = false;
      let testErrorMessage = '';
      setMessage(aiText('message_connection_saved_testing', 'Provider connection saved. Running connection test now.'));
      try {
        await runProviderConnectionTest(savedConnectionId, { announce: false, reload: false, recordResult: false });
      } catch (testError) {
        testFailed = true;
        setMessage('');
        testErrorMessage = aiText(
          'message_connection_saved_test_failed',
          'Provider connection saved, but the connection test failed: {{message}}',
          {
            message: providerErrorMessage(testError, aiText('error_test_connection', 'Provider connection test failed.')),
          }
        );
      }
      await loadResources();
      dispatchProviderWorkbench({ type: 'reset_after_save' });
      setSavedSupplier({ connectionId: savedConnectionId, providerId: normalizedProviderId, hasModels: modelIds.length > 0, directoryError: testFailed ? testErrorMessage : '' });
      setError('');
      setMessage('');
      toast.success(aiText('message_supplier_saved', 'Supplier saved.'), t('common.success'));
      setSavingConnection(succeedAsyncOperation(normalizedConnectionId));
    } catch (saveError) {
      const saveMessage = providerErrorMessage(saveError, aiText('error_save_connection', 'Failed to save provider connection.'));
      setSavingConnection(failAsyncOperation(saveMessage, normalizedConnectionId));
      setError(saveMessage);
    }
  }

  async function requestProviderConnectionDelete(connection: Connection) {
    if (connection.managed_by !== 'cloud_provider_connections') return;
    const requestRevision = deletePreflightRequestRevision.current + 1;
    deletePreflightRequestRevision.current = requestRevision;
    setConfirmingDeleteConnectionId('');
    setDeletePreflight(null);
    if (
      providerConnectionForm.connectionId === connection.connection_id &&
      providerDraftDirty
    ) {
      const draftMessage = aiText(
        'error_delete_connection_unsaved_draft',
        'Save or discard the unsaved provider draft before deleting this connection.'
      );
      setProviderWorkbenchSection('connection');
      dispatchProviderWorkbench({ type: 'reopen_draft' });
      setError(draftMessage);
      return;
    }

    setPreflightingDelete(startAsyncOperation(connection.connection_id));
    setError('');
    try {
      const response = await aiResourcesClient.request<ProviderConnectionDeletePreflight>(
        `/api/admin/provider-connections/${encodeURIComponent(connection.connection_id)}/delete-preflight`
      );
      if (!isProviderConnectionDeletePreflight(response.data)) {
        throw new Error('provider deletion preflight is incomplete');
      }
      if (deletePreflightRequestRevision.current !== requestRevision) return;
      if (response.data.connection.connection_id !== connection.connection_id) {
        throw new Error('provider deletion preflight does not match the requested connection');
      }
      setDeletePreflight(response.data);
      setConfirmingDeleteConnectionId(connection.connection_id);
      setPreflightingDelete(succeedAsyncOperation(connection.connection_id));
    } catch (preflightError) {
      if (deletePreflightRequestRevision.current !== requestRevision) return;
      const preflightMessage = providerErrorMessage(
        preflightError,
        aiText(
          'error_delete_connection_preflight',
          'Could not inspect the current provider deletion impact.'
        )
      );
      setPreflightingDelete(failAsyncOperation(preflightMessage, connection.connection_id));
      setError(preflightMessage);
      toast.error(preflightMessage, t('common.error'));

    }
  }

  async function deleteProviderConnection(connection: Connection) {
    if (connection.managed_by !== 'cloud_provider_connections') return;
    if (
      !deletePreflight ||
      deletePreflight.connection.connection_id !== connection.connection_id
    ) {
      await requestProviderConnectionDelete(connection);
      return;
    }
    if (
      providerConnectionForm.connectionId === connection.connection_id &&
      providerDraftDirty
    ) {
      setConfirmingDeleteConnectionId('');
      setDeletePreflight(null);
      setProviderWorkbenchSection('connection');
      dispatchProviderWorkbench({ type: 'reopen_draft' });
      const draftMessage = aiText(
        'error_delete_connection_unsaved_draft',
        'Save or discard the unsaved provider draft before deleting this connection.'
      );
      setError(draftMessage);
      return;
    }
    setDeletingConnection(startAsyncOperation(connection.connection_id));
    setError('');
    setMessage('');
    try {
      const response = await aiResourcesClient.request<{ receipt?: AdminMutationReceiptPayload | null }>(
        `/api/admin/provider-connections/${encodeURIComponent(connection.connection_id)}`,
        {
          method: 'DELETE',
          body: {
            expected_updated_at: deletePreflight.expected_updated_at,
          },
        }
      );
      setLastReceipt(response.data.receipt || null);
      const successMessage = aiText('message_connection_deleted', 'Provider connection deleted.');
      setMessage('');
      toast.success(successMessage, t('common.success'));
      if (providerConnectionForm.connectionId === connection.connection_id) {
        dispatchProviderWorkbench({ type: 'reset_after_save' });
      }
      setConfirmingDeleteConnectionId('');
      setDeletePreflight(null);
      await loadResources();
      setDeletingConnection(succeedAsyncOperation(connection.connection_id));
    } catch (deleteError) {
      const isConflict = deleteError instanceof ApiError &&
        deleteError.errorCode === 'provider_connection.delete_conflict';
      if (isConflict) {
        setConfirmingDeleteConnectionId('');
        setDeletePreflight(null);
        await loadResources();
      }
      const deleteMessage = isConflict
        ? aiText(
            'error_delete_connection_conflict',
            'This provider connection changed after the deletion check. Review the refreshed row and try again.'
          )
        : providerErrorMessage(
            deleteError,
            aiText('error_delete_connection', 'Failed to delete provider connection.')
          );
      setError(deleteMessage);
      setDeletingConnection(failAsyncOperation(deleteMessage, connection.connection_id));
      toast.error(deleteMessage, t('common.error'));

    }
  }

  async function approveDetectedImageHost(connection: Connection, probeId = '') {
    const evidenceRunId = String(connection.image_delivery_repair?.run_id || '');
    const evidenceProbeId = probeId || String(connection.image_delivery_repair?.probe_id || '');
    if (!evidenceRunId && !evidenceProbeId) return;
    setApprovingImageHost(startAsyncOperation(connection.connection_id));
    setError('');
    setMessage('');
    try {
      const response = await aiResourcesClient.request<{
        approved_image_output_host?: string;
        receipt?: AdminMutationReceiptPayload | null;
      }>(
        `/api/admin/provider-connections/${encodeURIComponent(connection.connection_id)}/approve-image-host`,
        {
          method: 'POST',
          body: evidenceProbeId
            ? { evidence_probe_id: evidenceProbeId }
            : { evidence_run_id: evidenceRunId },
        }
      );
      setLastReceipt(response.data.receipt || null);
      const approvedHost = String(response.data.approved_image_output_host || '');
      if (approvedHost && providerConnectionForm.connectionId === connection.connection_id) {
        dispatchProviderWorkbench({
          type: 'apply_saved_image_delivery',
          connectionId: connection.connection_id,
          imageResponseFormat: 'url',
          imageOutputHosts: uniqueList([
            ...(connection.config?.image_output_hosts || []),
            approvedHost,
          ]).join(', '),
        });
      }
      setImageDeliveryProbeResult((current) => current && current.probe_id === evidenceProbeId
        ? { ...current, status: 'host_approved', host_approved: true }
        : current);
      await loadResources();
      toast.success(
        aiText('image_host_repair_success', 'Exact image host approved. Run the image delivery test again.'),
        t('common.success')
      );
      setApprovingImageHost(succeedAsyncOperation(connection.connection_id));
    } catch (approvalError) {
      const approvalMessage = providerErrorMessage(
        approvalError,
        aiText('image_host_repair_error', 'Failed to approve the detected image host.')
      );
      setError(approvalMessage);
      setApprovingImageHost(failAsyncOperation(approvalMessage, connection.connection_id));
    }
  }

  async function runImageDeliveryProbe(): Promise<void> {
    const connectionId = providerConnectionForm.connectionId;
    if (!canProbeImageDelivery || !connectionId) return;
    setProbingImageDelivery(startAsyncOperation(connectionId));
    setImageDeliveryProbeResult(null);
    setError('');
    try {
      const response = await aiResourcesClient.request<ProviderImageDeliveryProbeResult & {
        receipt?: AdminMutationReceiptPayload | null;
      }>(
        `/api/admin/provider-connections/${encodeURIComponent(connectionId)}/image-delivery-probes`,
        { method: 'POST' }
      );
      setImageDeliveryProbeResult(response.data);
      setLastReceipt(response.data.receipt || null);
      await loadResources();
      toast.success(
        response.data.status === 'approval_required'
          ? aiText('image_delivery_probe_host_detected', 'Image host detected. Approve the exact host to continue.')
          : aiText('image_delivery_probe_passed', 'Image delivery test passed.'),
        t('common.success')
      );
      setProbingImageDelivery(succeedAsyncOperation(connectionId));
    } catch (probeError) {
      const probeErrorCode = probeError instanceof ApiError ? probeError.errorCode : '';
      const probeFallback = probeErrorCode === 'provider_connection.image_probe_model_required'
        ? aiText('image_delivery_probe_model_required', 'Enable and save at least one image-generation model before testing delivery.')
        : probeErrorCode === 'provider_connection.image_generation_not_enabled'
          ? aiText('image_delivery_probe_capability_required', 'Enable image generation for this connection before testing delivery.')
          : aiText('image_delivery_probe_failed', 'Image delivery test failed.');
      const probeMessage = providerErrorMessage(
        probeError,
        probeFallback
      );
      setError(probeMessage);
      setProbingImageDelivery(failAsyncOperation(probeMessage, connectionId));
      await loadResources();

    }
  }

  async function syncModelReferencesForProvider(
    providerId: string,
    options: { announce?: boolean } = {}
  ): Promise<void> {
    const normalizedProviderId = providerId.trim().toLowerCase();
    if (!normalizedProviderId || normalizedProviderId === 'custom') return;
    const connectionId = referenceView.current.connectionId;
    const stillCurrent = () => referenceView.current.open && referenceView.current.providerId === normalizedProviderId
      && referenceView.current.connectionId === connectionId;
    setSyncingModelReferences(startAsyncOperation(normalizedProviderId));
    setModelReferenceError('');
    try {
      await aiResourcesClient.request<unknown>('/api/admin/model-references/sync', {
        method: 'POST',
        body: {},
      });
      if (!stillCurrent()) return;
      const result = await loadModelReferences(normalizedProviderId);
      if (!stillCurrent()) return;
      if (!result?.source || result.source.status !== 'active') {
        throw new Error(result?.source?.last_error_message || aiText('error_load_model_references', 'Failed to load model reference data.'));
      }
      if (options.announce) {
        const successMessage = aiText('message_model_references_synced', 'Model reference data synced. It is reference-only and does not change billing or routing.');
        toast.success(successMessage, t('common.success'));
      }
      setSyncingModelReferences(succeedAsyncOperation(normalizedProviderId));
    } catch (syncError) {
      if (!stillCurrent()) return;
      const message = providerErrorMessage(syncError, aiText('error_sync_model_references', 'Failed to sync model reference data.'));
      setSyncingModelReferences(failAsyncOperation(message, normalizedProviderId));
      setModelReferenceError(message);
    }
  }

  async function fetchProviderCatalogPreview() {
    const normalizedConnectionId = providerConnectionForm.connectionId || slugifyProviderValue(providerConnectionForm.displayName || providerConnectionForm.providerId);
    const normalizedProviderId = providerConnectionForm.providerId || slugifyProviderValue(providerConnectionForm.displayName || providerConnectionForm.connectionId);
    const modelIds = splitList(providerConnectionForm.modelIds);
    const imageOutputHosts = splitList(providerConnectionForm.imageOutputHosts);
    if (!imageOutputHostsAreExact(imageOutputHosts)) {
      setError(aiText(
        'error_image_output_hosts_invalid',
        'Use exact host names only, without schemes, paths, ports, or wildcards.'
      ));
      return;
    }
    const modelConfig = {
      ...data?.connections.find((item) => item.connection_id === providerConnectionForm.connectionId)?.config,
      model_ids: modelIds, model_id: modelIds[0] || '',
      image_response_format: providerConnectionForm.imageResponseFormat,
      image_output_hosts: imageOutputHosts,
    };
    const referenceLinks = providerReferenceLinksForForm(providerConnectionForm);
    const websiteUrl = externalUrlValue(referenceLinks.websiteUrl);
    const statusUrl = externalUrlValue(referenceLinks.statusUrl);
    const docsUrl = externalUrlValue(referenceLinks.docsUrl);
    if (catalogCredentialMissing) {
      setError(aiText('error_fetch_catalog_credential_required', 'Enter an API key before fetching upstream models. Existing saved credentials are not returned to the browser.'));
      return;
    }
    setFetchingProviderCatalog(startAsyncOperation());
    dispatchProviderWorkbench({ type: 'set_catalog_preview', preview: null });
    setError('');
    setMessage('');
    try {
      const response = await aiResourcesClient.request<ProviderCatalogPreview>('/api/admin/provider-connections/preview-catalog', {
        method: 'POST',
        body: {
          connection_id: normalizedConnectionId,
          provider_id: normalizedProviderId,
          provider_type: providerConnectionForm.kind,
          kind: providerConnectionForm.kind,
          display_name: providerConnectionForm.displayName,
          enabled: providerConnectionForm.enabled,
          base_url: providerConnectionForm.baseUrl,
          source_role: providerConnectionForm.sourceRole,
          capability_ids: splitList(providerConnectionForm.capabilityIds),
          runtime_profile_ids: splitList(providerConnectionForm.runtimeProfileIds),
          config: modelConfig,
          metadata: {
            ui_source: 'ai_resources_catalog_preview',
            provider_preset: providerConnectionForm.providerPreset,
            website_url: websiteUrl || undefined,
            status_url: statusUrl || undefined,
            docs_url: docsUrl || undefined,
          },
          credential: providerConnectionForm.credential,
        },
      });
      const preview = response.data;
      dispatchProviderWorkbench({ type: 'set_catalog_preview', preview });
      const verifiedModelIds = (preview.models || [])
        .filter((model) => !model.is_deprecated && (model.verified || model.runtime_supported))
        .map((model) => model.model_id);
      const referenceProviderId = inferReferenceProviderFromModelIds(
        verifiedModelIds.length ? verifiedModelIds : (preview.model_ids || []),
        defaultReferenceProviderId(normalizedProviderId, providerConnectionForm.providerPreset)
      );
      if (referenceProviderId !== modelReferenceProviderId) {
        dispatchProviderWorkbench({
          type: 'set_reference_provider',
          providerId: referenceProviderId,
        });
      }
      const catalogMessage = aiText('message_account_catalog_fetched', 'Fetched {{count}} account models. Existing enabled choices were kept; choose models and save the supplier.', { count: String(preview.model_count || preview.model_ids?.length || 0) });
      setMessage(catalogMessage);
      setShowUnconfirmedModels(false);
      setFetchingProviderCatalog(succeedAsyncOperation());
      void ensureFreshModelReferences(referenceProviderId);
    } catch (catalogError) {
      const catalogMessage = providerErrorMessage(catalogError, aiText('error_fetch_catalog', 'Failed to fetch upstream models.'));
      setFetchingProviderCatalog(failAsyncOperation(catalogMessage));
      setError(catalogMessage);
    }
  }

  async function ensureFreshModelReferences(providerId: string): Promise<void> {
    if (!providerId || providerId === 'custom') return;
    const connectionId = providerConnectionForm.connectionId;
    const stillCurrent = () => referenceView.current.open && referenceView.current.providerId === providerId
      && referenceView.current.connectionId === connectionId;
    // One external source sync at a time; a later supplier checks again after it finishes.
    if (referenceRefreshInFlight.current) {
      await referenceRefreshInFlight.current;
      if (!stillCurrent()) return;
      return ensureFreshModelReferences(providerId);
    }
    const pending = (async () => {
      const result = await loadModelReferences(providerId);
      if (!stillCurrent() || !result || !modelReferenceSourceNeedsSync(result.source)) return;
      await syncModelReferencesForProvider(providerId);
    })();
    referenceRefreshInFlight.current = pending;
    try { await pending; } finally {
      if (referenceRefreshInFlight.current === pending) referenceRefreshInFlight.current = null;
    }
  }

  async function syncModelReferences() {
    if (referenceRefreshInFlight.current) return;
    const pending = syncModelReferencesForProvider(modelReferenceProviderId, { announce: true });
    referenceRefreshInFlight.current = pending;
    try { await pending; } finally {
      if (referenceRefreshInFlight.current === pending) referenceRefreshInFlight.current = null;
    }
  }

  async function runProviderConnectionTest(
    connectionId: string,
    options: { announce?: boolean; reload?: boolean; recordResult?: boolean } = {}
  ) {
    const announce = options.announce !== false;
    const reload = options.reload !== false;
    const recordResult = options.recordResult !== false;
    setConnectionTestResults((current) => {
      const next = { ...current };
      delete next[connectionId];
      return next;
    });
    setTestingConnection(startAsyncOperation(connectionId));
    setError('');
    if (announce) {
      setMessage('');
    }
    try {
      const response = await aiResourcesClient.request<ProviderConnectionTestResponse>(
        `/api/admin/provider-connections/${encodeURIComponent(connectionId)}/test`,
        { method: 'POST' }
      );
      const result = response.data;
      if (recordResult && result?.connection_id) {
        setConnectionTestResults((current) => ({
          ...current,
          [result.connection_id]: result,
        }));
      }
      if (announce) {
        setLastReceipt(result.receipt || null);
        setMessage('');
      }
      if (reload) {
        await loadResources();
      }
      setTestingConnection(succeedAsyncOperation(connectionId));
      return result;
    } catch (testError) {
      const result = providerConnectionTestResultFromError(testError);
      if (recordResult && result?.connection_id) {
        setConnectionTestResults((current) => ({
          ...current,
          [result.connection_id]: result,
        }));
      }
      if (announce) {
        setLastReceipt(result?.receipt || null);
        const testMessage = providerErrorMessage(
          testError,
          aiText('error_test_connection', 'Provider connection test failed.')
        );
        setError(testMessage);

      }
      setTestingConnection(failAsyncOperation(providerErrorMessage(testError, aiText('error_test_connection', 'Provider connection test failed.')), connectionId));
      throw testError;
    }
  }

  async function retrySavedSupplierCatalog() {
    if (!savedSupplier) return;
    const connectionId = savedSupplier.connectionId;
    try {
      await runProviderConnectionTest(connectionId, { announce: false, recordResult: false });
      setSavedSupplier((current) => current?.connectionId === connectionId ? { ...current, directoryError: '' } : current);
    } catch (cause) {
      const directoryError = aiText('message_connection_saved_test_failed', 'Connection saved; catalog sync failed: {{message}}', {
        message: providerErrorMessage(cause, aiText('error_test_connection', 'Catalog sync failed.')),
      });
      setSavedSupplier((current) => current?.connectionId === connectionId ? { ...current, directoryError } : current);
    }
  }

  function openNewProviderConnection() {
    setConfirmingDeleteConnectionId('');
    setImageDeliveryProbeResult(null);
    setProbingImageDelivery(IDLE_ASYNC_OPERATION);
    setProviderWorkbenchSection('connection');
    setShowUnconfirmedModels(false);
    dispatchProviderWorkbench({
      type: 'open_create',
      referenceProviderId: defaultReferenceProviderId(
        EMPTY_PROVIDER_CONNECTION_FORM.providerId,
        EMPTY_PROVIDER_CONNECTION_FORM.providerPreset
      ),
    });
    setError('');
    setMessage('');
  }

  function editProviderConnection(connection: Connection) {
    setConfirmingDeleteConnectionId('');
    setImageDeliveryProbeResult(null);
    setProbingImageDelivery(IDLE_ASYNC_OPERATION);
    setProviderWorkbenchSection('connection');
    setShowUnconfirmedModels(false);
    const storedCatalogPreview = catalogPreviewFromConnection(connection);
    const providerPreset = inferProviderPreset(connection);
    setMessage('');
    setError('');
    dispatchProviderWorkbench({
      type: 'open_edit',
      form: buildProviderConnectionForm(connection, providerPreset),
      catalogPreview: storedCatalogPreview,
      referenceProviderId: referenceProviderForConnection(connection),
    });
  }

  function closeProviderForm() {
    setImageDeliveryProbeResult(null);
    dispatchProviderWorkbench({ type: 'close' });
    setProviderWorkbenchSection('connection');
    setMessage('');
    setError('');
  }

  function updateProviderConnectionForm(patch: Partial<ProviderConnectionForm>) {
    dispatchProviderWorkbench({
      type: 'patch_form',
      patch,
      referenceProviderId: patch.providerId !== undefined
        ? defaultReferenceProviderId(patch.providerId, providerConnectionForm.providerPreset)
        : undefined,
      invalidateCatalog: Boolean(
        patch.kind || patch.baseUrl || patch.credential || patch.providerId
      ),
    });
  }

  function setProviderModelIds(modelIds: string[]) {
    const inferredReferenceProviderId = inferReferenceProviderFromModelIds(modelIds, modelReferenceProviderId);
    dispatchProviderWorkbench({
      type: 'set_model_ids',
      modelIds: joinList(modelIds),
      referenceProviderId: modelIds.length && inferredReferenceProviderId !== modelReferenceProviderId
        ? inferredReferenceProviderId
        : undefined,
    });
  }

  function removeProviderModelId(modelId: string) {
    setProviderModelIds(splitList(providerConnectionForm.modelIds).filter((item) => item !== modelId));
  }

  function applyProviderPreset(presetId: string) {
    const preset = providerPresetById(presetId);
    const displayName =
      providerConnectionForm.displayName && providerConnectionForm.providerPreset === presetId
        ? providerConnectionForm.displayName
        : preset.displayName;
    dispatchProviderWorkbench({
      type: 'apply_preset',
      form: {
        ...providerConnectionForm,
        providerPreset: preset.id,
        providerId: preset.providerId,
        displayName,
        kind: preset.kind,
        baseUrl: preset.baseUrl,
        capabilityIds: preset.capabilityIds,
        runtimeProfileIds: preset.runtimeProfileIds,
        modelIds: '',
        connectionId:
          providerConnectionForm.connectionId ||
          slugifyProviderValue(displayName || preset.providerId),
      },
      referenceProviderId: defaultReferenceProviderId(preset.providerId, preset.id),
    });
  }

  const providerTestStageLabel = useCallback((stage: string): string => {
    const normalizedStage = stage.trim();
    const labels: Record<string, string> = {
      preflight: aiText('test_stage_preflight', 'Preflight'),
      config_preflight: aiText('test_stage_config_preflight', 'Config preflight'),
      adapter_build: aiText('test_stage_adapter_build', 'Adapter build'),
      catalog_fetch: aiText('test_stage_catalog_fetch', 'Catalog fetch'),
      web_search_probe: aiText('test_stage_web_search_probe', 'Search probe'),
      web_search_reader_probe: aiText('test_stage_web_search_reader_probe', 'Reader probe'),
    };
    return labels[normalizedStage] || normalizedStage || '-';
  }, [aiText]);

  const providerTestMessage = useCallback((result: ProviderConnectionTestResult): string => {
    const normalizedMessage = result.message.trim();
    if (result.error_code || !result.ok) {
      return providerErrorMessage(result, aiText('error_test_connection', 'Provider connection test failed.'));
    }
    if (result.stage === 'web_search_probe') {
      return aiText('test_message_web_search_candidates', 'Search provider returned {{count}} source candidates.', {
        count: String(result.probe?.result_count ?? 0),
      });
    }
    if (result.stage === 'web_search_reader_probe') {
      return aiText('test_message_web_search_reader_candidates', 'Reader provider returned {{count}} readable source candidates.', {
        count: String(result.probe?.result_count ?? 0),
      });
    }
    const messages: Record<string, string> = {
      'provider connection is disabled': aiText('test_message_disabled', 'Provider connection is disabled.'),
      'provider credential is missing': aiText('test_message_missing_secret', 'Provider credential is missing.'),
      'provider runtime configuration is present': aiText('test_message_runtime_config_ready', 'Runtime configuration check passed; no model request was sent.'),
      'provider kind is not supported by the runtime adapter registry': aiText(
        'test_message_unsupported_kind',
        'This provider kind is not supported by the runtime adapter registry.'
      ),
      'provider catalog returned no usable models': aiText('test_message_catalog_empty', 'Provider catalog returned no usable models.'),
      'provider connection is ready': aiText('test_message_ready', 'Account catalog fetched; model capability is not verified by this check.'),
      'web search reader returned no readable content': aiText('test_message_web_search_reader_empty', 'Reader provider returned no readable content.'),
      'web search reader base URL is missing': aiText('test_message_web_search_reader_missing_base_url', 'Reader provider base URL is missing.'),
    };
    return messages[normalizedMessage] || aiText('message_connection_tested', 'Provider connection tested.');
  }, [aiText, providerErrorMessage]);

  const providerKindLabel = useCallback((kind: string): string => {
    switch (kind) {
      case 'text_provider':
        return aiText('kind_text_provider', 'Text provider');
      case 'audio_provider':
        return aiText('kind_audio_provider', 'Audio provider');
      case 'web_search_provider':
        return aiText('kind_web_search_provider', 'Web search provider');
      case 'image_source_provider':
        return aiText('kind_image_source_provider', 'Image source provider');
      case 'embedding_provider':
        return aiText('kind_embedding_provider', 'Embedding provider');
      case 'rerank_provider':
        return aiText('kind_rerank_provider', 'Rerank provider');
      case 'vector_store_provider':
        return aiText('kind_vector_store_provider', 'Vector store provider');
      case 'openai_compatible':
        return aiText('kind_openai_compatible', 'OpenAI compatible');
      case 'anthropic':
        return aiText('kind_anthropic', 'Anthropic');
      case 'openrouter':
        return aiText('kind_openrouter', 'OpenRouter');
      case 'siliconflow':
        return aiText('kind_siliconflow', 'SiliconFlow');
      case 'minimax':
      case 'minimax_audio':
        return aiText('kind_minimax', 'MiniMax');
      case 'litellm_gateway':
        return aiText('kind_litellm_gateway', 'LiteLLM gateway');
      case 'vllm':
        return aiText('kind_vllm', 'vLLM');
      case 'tei':
        return aiText('kind_tei', 'TEI');
      default:
        return kind;
    }
  }, [aiText]);

  const providerDialogName = providerConnectionForm.displayName || providerKindLabel(providerConnectionForm.kind);
  const providerDialogTitle = providerFormMode === 'edit'
    ? aiText('channel_form_edit_named_title', 'Edit {{name}}', { name: providerDialogName })
    : aiText('channel_form_title', 'Add provider channel');

  const filteredConnections = useMemo(() => {
    const query = connectionSearch.trim().toLowerCase();
    return (data?.connections || []).filter((connection) => {
      const matchesFilter =
        connectionStatusFilter === 'all'
        || (connectionStatusFilter === 'ready' && connection.status === 'ready' && !connection.attention_required)
        || (connectionStatusFilter === 'attention' && connection.enabled
          && (connection.attention_required ?? connection.status !== 'ready'))
        || (connectionStatusFilter === 'missing_secret' && (connection.status === 'missing_secret' || !connection.configured))
        || (connectionStatusFilter === 'disabled' && (!connection.enabled || connection.status === 'disabled'));
      if (!matchesFilter) return false;
      if (!query) return true;
      return [
        connection.display_name,
        connection.provider_id,
        connection.kind,
        connection.status,
        connection.base_url,
        ...(connection.model_ids || []),
        ...connection.capability_ids,
        ...connection.runtime_profile_ids,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [connectionSearch, connectionStatusFilter, data]);

  const aiSupplierConnections = useMemo(
    () => filteredConnections.filter((connection) => supplierCategory(connection) === 'ai'),
    [filteredConnections]
  );

  const modelFeatureLabel = useCallback((feature: string): string => {
    const normalized = feature.trim();
    if (normalized === 'image_generation' || normalized === 'image_generations' || normalized === 'image') {
      return aiText('model_feature_image_generation', 'Image generation');
    }
    if (normalized === 'text_generation' || normalized === 'text_generations' || normalized === 'text') {
      return aiText('model_feature_text_generation', 'Text generation');
    }
    if (normalized === 'audio_generation' || normalized === 'audio_generations' || normalized === 'audio') {
      return aiText('model_feature_audio_generation', 'Audio');
    }
    if (normalized === 'video_generation' || normalized === 'video_generations' || normalized === 'video') {
      return aiText('model_feature_video_generation', 'Video generation');
    }
    if (normalized === 'vision') return aiText('model_feature_text_vision', 'Text · Image input');
    if (normalized === 'embedding' || normalized === 'embeddings') {
      return aiText('model_feature_embedding', 'Embedding');
    }
    return normalized || aiText('model_feature_unknown', 'Unknown');
  }, [aiText]);

  const modelReferenceCapabilityLabel = useCallback((tag: string): string => {
    const labels: Record<string, string> = {
      reasoning: aiText('model_reference_capability_reasoning', 'Reasoning'),
      tool_call: aiText('model_reference_capability_tool_call', 'Tool calling'),
      structured_output: aiText('model_reference_capability_structured_output', 'Structured output'),
      attachment: aiText('model_reference_capability_attachment', 'Attachment'),
      open_weights: aiText('model_reference_capability_open_weights', 'Open weights'),
    };
    return labels[tag] || tag;
  }, [aiText]);

  const selectedProviderModelIds = useMemo(
    () => splitList(providerConnectionForm.modelIds),
    [providerConnectionForm.modelIds]
  );

  const modelReferenceProviderOptions = useMemo(() => {
    const currentProviderId = defaultReferenceProviderId(
      providerConnectionForm.providerId,
      providerConnectionForm.providerPreset
    );
    return uniqueList([
      currentProviderId,
      ...PROVIDER_PRESETS.map((preset) => preset.providerId).filter((providerId) => providerId !== 'custom'),
      ...modelReferences.map((reference) => reference.provider_id),
    ]);
  }, [modelReferences, providerConnectionForm.providerId, providerConnectionForm.providerPreset]);

  const referenceProviderCanBeChanged = canChooseReferenceProvider(providerConnectionForm.providerPreset);
  const providerUsesCustomRuntimeFields = providerConnectionForm.providerPreset === 'custom';
  const providerUsesImageGeneration = splitList(
    providerConnectionForm.capabilityIds
  ).includes('image_generation');
  const activeProviderConnection = data?.connections.find(
    (connection) => connection.connection_id === providerConnectionForm.connectionId
  );
  const modelNamespacePrefix = providerCatalogPreview?.model_namespace_prefix ?? activeProviderConnection?.model_namespace_prefix ?? (activeProviderConnection?.config && 'model_namespace_prefix' in activeProviderConnection.config
    ? String(activeProviderConnection.config.model_namespace_prefix || '')
    : ['openai', 'openai_compatible', 'openai-compatible'].includes(providerConnectionForm.kind) && providerConnectionForm.providerId !== 'openai'
      ? providerConnectionForm.providerId : '');
  const modelUsages = activeProviderConnection?.model_usage_references || [];
  const usageLabelKeys: Record<string, string> = {
      'wp-ai.short-text': 'profile_short_text', 'wp-ai.editorial': 'profile_editorial',
      'wp-ai.classification': 'profile_classification', 'vision.ai': 'profile_vision_understanding',
      'wp-ai.image-generation': 'profile_image_generation', 'wp-ai.audio-generation': 'profile_audio_generation',
      'text.ai': 'automatic_title',
  };
  const usageName = (profileId: string) => usageLabelKeys[profileId]
    ? t('admin.runtime_profiles.' + usageLabelKeys[profileId]) : aiText('model_internal_route', 'Internal runtime route');
  const disabledModelUsages = modelUsages.filter((usage) => {
    const matches = (id: string) => [...modelIdentityKeys(id, modelNamespacePrefix)].some((key) => modelIdentityKeys(usage.model_id, modelNamespacePrefix).has(key));
    return (activeProviderConnection?.model_ids || []).some(matches) && !selectedProviderModelIds.some(matches);
  });
  const activeImageDeliveryProbe = (imageDeliveryProbeResult?.connection_id === providerConnectionForm.connectionId
    ? imageDeliveryProbeResult : null) || activeProviderConnection?.image_delivery_probe || null;
  const activeImageDeliveryRepair = activeProviderConnection?.image_delivery_repair;
  const isSavingConnection = asyncOperationRunning(savingConnection);
  const isProbingImageDelivery = asyncOperationRunning(probingImageDelivery, providerConnectionForm.connectionId);
  const imageDeliveryFailed = activeImageDeliveryProbe?.status === 'failed'
    || (probingImageDelivery.key === providerConnectionForm.connectionId && probingImageDelivery.status === 'failed');
  const canProbeImageDelivery = providerFormMode === 'edit' && !providerDraftDirty
    && providerConnectionForm.enabled && Boolean(activeProviderConnection?.configured)
    && !isSavingConnection && !isProbingImageDelivery;
  const imageDeliveryStatus = providerDraftDirty ? 'draft' : isProbingImageDelivery ? 'pending'
    : imageDeliveryFailed ? 'failed' : activeImageDeliveryProbe?.status === 'ready' ? 'success'
      : activeImageDeliveryProbe?.status === 'approval_required' ? 'warning' : 'inactive';
  const imageDeliveryStatusLabel = providerDraftDirty
    ? aiText('image_delivery_unsaved', 'Unsaved changes')
    : isProbingImageDelivery ? aiText('image_delivery_probe_testing', 'Testing image delivery...')
      : imageDeliveryFailed ? aiText('image_delivery_failed', 'Failed')
        : activeImageDeliveryProbe?.status === 'ready' ? aiText('image_delivery_verified', 'Verified')
          : activeImageDeliveryProbe?.status === 'approval_required' ? aiText('image_delivery_approval_required', 'Host approval required')
            : aiText('image_delivery_not_verified', 'Not verified');
  const isLoadingModelReferences = asyncOperationRunning(loadingModelReferences);
  const isSyncingModelReferences = asyncOperationRunning(syncingModelReferences);
  const isFetchingProviderCatalog = asyncOperationRunning(fetchingProviderCatalog);
  const providerFormExternalLinkItems = providerExternalLinkItems(
    providerReferenceLinksForForm(providerConnectionForm)
  );

  const modelsDevReferenceSource = useMemo(
    () => modelReferenceSources.find((source) => source.source_id === 'models.dev') || null,
    [modelReferenceSources]
  );

  const modelReferenceCompactStatusText = useMemo(() => {
    if (isSyncingModelReferences) {
      return aiText('model_reference_compact_auto_syncing', 'reference syncing');
    }
    if (isLoadingModelReferences) {
      return aiText('model_reference_compact_loading', 'reference loading');
    }
    if (modelsDevReferenceSource?.status === 'error' || modelReferenceError) {
      return aiText('model_reference_compact_failed', 'reference sync failed');
    }
    if (modelsDevReferenceSource?.last_synced_at || modelReferenceTotal > 0) {
      return aiText('model_reference_compact_synced', 'reference synced');
    }
    return aiText('model_reference_compact_not_synced', 'reference not synced');
  }, [
    aiText,
    isSyncingModelReferences,
    isLoadingModelReferences,
    modelReferenceError,
    modelReferenceTotal,
    modelsDevReferenceSource,
  ]);
  const modelReferenceHasSyncError = Boolean(
    modelReferenceError || modelsDevReferenceSource?.status === 'error'
  );

  const modelVisibilityRows = useMemo(() => buildModelVisibilityRows({
    references: modelReferenceError ? [] : modelReferences.filter(reference => modelReferenceFreshness(reference,
      modelReferenceSources.find(source => source.source_id === reference.source_id) || null, referenceNow) === 'current'),
    catalogPreview: providerCatalogPreview,
    selectedModelIds: selectedProviderModelIds,
    providerId: modelReferenceProviderId,
    search: modelReferenceSearch,
    featureFilter: modelReferenceFeatureFilter,
    visibilityFilter: modelReferenceVisibilityFilter,
    intelligenceFilter: modelReferenceIntelligenceFilter,
    showDeprecated: modelReferenceShowDeprecated,
    upstreamLabel: aiText('model_source_upstream', 'Upstream catalog'),
    manualLabel: aiText('model_source_manual', 'Previously saved'),
    sourceScope: 'account',
    namespacePrefix: modelNamespacePrefix,
    enabledOnlyLabel: aiText('model_source_enabled_only', 'Saved model ID only'),
  }).filter((row) => !showUnconfirmedModels || (row.selected && !row.catalog)), [
    showUnconfirmedModels,
    aiText,
    modelReferenceFeatureFilter,
    modelReferenceIntelligenceFilter,
    modelReferenceProviderId,
    modelReferenceSearch,
    modelReferenceShowDeprecated,
    modelReferenceVisibilityFilter,
    modelNamespacePrefix,
    modelReferences,
    modelReferenceSources,
    modelReferenceError,
    referenceNow,
    providerCatalogPreview,
    selectedProviderModelIds,
  ]);

  const accountModelCount = Number(providerCatalogPreview?.model_count ?? 0);
  const catalogIdentityKeys = new Set((providerCatalogPreview?.models || []).flatMap((model) =>
    Array.from(modelIdentityKeys(model.model_id, modelNamespacePrefix))
  ));
  const unconfirmedSelectedCount = selectedProviderModelIds.filter((modelId) =>
    !Array.from(modelIdentityKeys(modelId, modelNamespacePrefix)).some((key) => catalogIdentityKeys.has(key))
  ).length;
  const modelVisibilityPageCount = Math.max(
    1,
    Math.ceil(modelVisibilityRows.length / MODEL_VISIBILITY_PAGE_SIZE)
  );
  const visibleModelReferencePage = Math.min(
    modelReferencePage,
    modelVisibilityPageCount
  );
  const modelVisibilityPageRows = modelVisibilityRows.slice(
    (visibleModelReferencePage - 1) * MODEL_VISIBILITY_PAGE_SIZE,
    visibleModelReferencePage * MODEL_VISIBILITY_PAGE_SIZE
  );
  const filteredEnableModelIds = modelVisibilityRows
    .filter((row) => !row.selected && !row.deprecated && Boolean(row.catalog))
    .map((row) => row.modelId);
  const filteredDisableModelIds = modelVisibilityRows
    .filter((row) => row.selected)
    .map((row) => row.modelId);
  const confirmingBatchModelIds = confirmingModelBatch === 'enable'
    ? filteredEnableModelIds
    : filteredDisableModelIds;
  const confirmingBatchResultCount = confirmingModelBatch === 'enable'
    ? uniqueList([...selectedProviderModelIds, ...confirmingBatchModelIds]).length
    : selectedProviderModelIds.filter((modelId) => !new Set(confirmingBatchModelIds).has(modelId)).length;

  function applyFilteredModelBatch(): void {
    if (confirmingModelBatch === 'enable') {
      setProviderModelIds([...selectedProviderModelIds, ...filteredEnableModelIds]);
      return;
    }
    if (confirmingModelBatch === 'disable') {
      const disabledIds = new Set(filteredDisableModelIds);
      setProviderModelIds(selectedProviderModelIds.filter((modelId) => !disabledIds.has(modelId)));
    }
  }
  if (loading) {
    return <AdminRouteSkeleton />;
  }

  if (!data) {
    return (
      <BackofficePageStack>
        <BackofficePrimaryPanel
          eyebrow={aiText('eyebrow', 'Runtime plane')}
          title={aiText('title', 'Model suppliers')}
          description={aiText('unavailable_desc', 'Cloud runtime provider resources are unavailable.')}
        >
          <BackofficeDiagnosticNotice
            message={error || directoryError || aiText('unavailable_message', 'Provider management is unavailable.')}
            retryLabel={t('common.retry')}
            onRetry={() => void loadResources()}
          />
        </BackofficePrimaryPanel>
      </BackofficePageStack>
    );
  }

  const readyModelSupplierCount = data.connections.filter(
    (connection) => supplierCategory(connection) === 'ai'
      && connection.status === 'ready'
      && !connection.attention_required
  ).length;
  const modelSupplierCount = data.connections.filter(
    (connection) => supplierCategory(connection) === 'ai'
  ).length;
  const attentionSupplierCount = data.connections.filter(
    (connection) => supplierCategory(connection) === 'ai'
      && connection.enabled
      && (connection.attention_required ?? connection.status !== 'ready')
  ).length;
  return (
    <BackofficePageStack>
      <BackofficePageHeader
        title={aiText('title', 'Model suppliers')}
        description={aiText('description', 'Manage Cloud runtime model-provider connections and model visibility. Search, image, and vector services use their dedicated fixed-configuration pages.')}
        primaryAction={(
          <button type="button" className="btn btn-primary justify-center" onClick={openNewProviderConnection}>
            {aiText('action_add_model_supplier', 'Add model supplier')}
          </button>
        )}
        summaryItems={[
          {
            label: aiText('overview_configured_suppliers', 'Configured'),
            value: readyModelSupplierCount,
          },
          {
            label: aiText('overview_attention_suppliers', 'Needs attention'),
            value: attentionSupplierCount,
            toneClassName: attentionSupplierCount > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: aiText('overview_supplier_total', 'Total suppliers'),
            value: modelSupplierCount,
          },
        ]}
        summaryAside={(
          <Link
            href="/admin/troubleshooting"
            className="shrink-0 font-semibold text-slate-600 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300"
          >
            {aiText('action_view_diagnostics', 'View diagnostics')} →
          </Link>
        )}
      />

      {savedSupplier ? <section data-ui="supplier-next-step" className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="min-w-0 text-sm">{savedSupplier.directoryError ? <p role="alert">{savedSupplier.directoryError}</p> : <p>{savedSupplier.hasModels ? aiText('next_configure_usage', 'Choose where to use the enabled models.') : aiText('next_enable_models', 'Enable an account model before configuring usage.')}</p>}</div>
        <div className="flex shrink-0 gap-2">
          {savedSupplier.directoryError ? <button type="button" className="btn btn-secondary btn-sm" disabled={asyncOperationRunning(testingConnection, savedSupplier.connectionId)} onClick={() => void retrySavedSupplierCatalog()}>{aiText('action_retry_catalog', 'Retry catalog sync')}</button> : null}
          {savedSupplier.hasModels ? <Link className="btn btn-primary btn-sm" href={`/admin/runtime-profiles?provider=${encodeURIComponent(savedSupplier.providerId)}`}>{aiText('action_configure_usage', 'Configure usage')}</Link> : <button type="button" className="btn btn-primary btn-sm" onClick={() => { const connection = data.connections.find((item) => item.connection_id === savedSupplier.connectionId); if (connection) { editProviderConnection(connection); setProviderWorkbenchSection('models'); } }}>{aiText('action_enable_models', 'Enable models first')}</button>}
        </div>
      </section> : null}

        <ProviderConnectionDialog
          open={providerFormOpen && !modelTestTarget}
          title={providerDialogTitle}
          titleId="provider-channel-dialog-title"
          message={message}
          error={error}
          saving={isSavingConnection}
          closeLabel={aiText('action_close_dialog', 'Close')}
          cancelLabel={aiText('action_cancel', 'Cancel')}
          saveLabel={aiText('action_save_supplier', 'Save supplier')}
          savingLabel={aiText('saving', 'Saving...')}
          headerAccessory={<AdminHelpTip label={aiText('save_help', 'About saving')}>{aiText('save_supplier_notice', 'Saves the connection and enabled models, then fetches the account catalog again to update runtime models. Capability verification is separate.')}</AdminHelpTip>}
          footerNotice={providerWorkbenchSection === 'references' ? aiText('reference_panel_note', 'Reference information is read-only; it does not change enabled models or routing.') : aiText('save_supplier_short', 'Save connection and enabled models')}
          footerActions={providerWorkbenchSection === 'references' ? <div key="reference-actions" className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" disabled={isSavingConnection} onClick={closeProviderForm}>{aiText('action_cancel', 'Cancel')}</button>
            <button type="button" className="btn btn-secondary" onClick={(event) => { event.preventDefault(); setProviderWorkbenchSection('models'); }}>{aiText('action_manage_models', 'Manage models')}</button>
          </div> : undefined}
          density="compact"
          contentMode={providerWorkbenchSection === 'models' ? 'contained' : 'scroll'}
          onClose={closeProviderForm}
          onSubmit={() => { if (providerWorkbenchSection !== 'references') void saveProviderConnection(); }}
        >
                {disabledModelUsages.length ? <div role="alert" className="mb-2 text-sm text-amber-800 dark:text-amber-200">{aiText('model_disable_impact', 'Saving will make models unavailable to: {{profiles}}. Update these usages to avoid interruption.', { profiles: [...new Set(disabledModelUsages.map((usage) => usageName(usage.profile_id)))].join(', ') })} <Link className="font-semibold underline" href={`/admin/runtime-profiles?provider=${encodeURIComponent(providerConnectionForm.providerId)}`}>{aiText('action_configure_usage', 'Configure usage')}</Link></div> : null}
                <div
                  role="tablist"
                  aria-label={aiText('provider_workbench_sections', 'Provider workspace sections')}
                  className="flex items-center gap-1 border-b border-slate-200 pb-2 dark:border-slate-800"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={providerWorkbenchSection === 'connection'}
                    className={`h-8 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      providerWorkbenchSection === 'connection'
                        ? 'border-slate-200 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                    }`}
                    onClick={() => setProviderWorkbenchSection('connection')}
                  >
                    {aiText('workbench_connection_tab', 'Connection settings')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={providerWorkbenchSection === 'models'}
                    className={`h-8 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      providerWorkbenchSection === 'models'
                        ? 'border-slate-200 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                    }`}
                    onClick={() => setProviderWorkbenchSection('models')}
                  >
                    {aiText('workbench_models_tab', 'Model management')}
                    <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {selectedProviderModelIds.length}
                    </span>
                  </button>
                  <button type="button" role="tab" aria-selected={providerWorkbenchSection === 'references'}
                    className={`h-8 rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${providerWorkbenchSection === 'references'
                      ? 'border-slate-200 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'}`}
                    onClick={() => setProviderWorkbenchSection('references')}>
                    {aiText('reference_browse_title', 'Reference information')}
                  </button>
                </div>
                <p data-ui="supplier-onboarding-step" className={providerFormMode === 'edit' ? 'sr-only' : 'text-xs text-slate-500 dark:text-slate-400'}>
                  {providerFormMode === 'edit'
                    ? aiText('editing_supplier_hint', 'Connection settings and enabled models are saved together. List filters only change the view.')
                    : providerWorkbenchSection === 'connection'
                    ? aiText('onboarding_connection', '1. Enter the supplier address and API Key, then open model management.')
                    : aiText('onboarding_models', '2. Get account models and enable the ones you need. Save the supplier, then configure usage.')}
                </p>
                {providerWorkbenchSection === 'references' ? (
                  <ModelReferencePanel key={modelReferenceProviderId} references={modelReferences}
                    catalogPreview={providerCatalogPreview} selectedModelIds={selectedProviderModelIds}
                    providerId={modelReferenceProviderId} namespacePrefix={modelNamespacePrefix}
                    source={modelsDevReferenceSource} now={referenceNow} loading={isLoadingModelReferences}
                    refreshing={isSyncingModelReferences} error={modelReferenceError}
                    statusText={modelReferenceHasSyncError ? modelReferenceCompactStatusText : ''}
                    showDeprecated={modelReferenceShowDeprecated} onShowDeprecated={changeHistoricalModelVisibility}
                    onRefresh={() => void syncModelReferences()}
                    providerOptions={referenceProviderCanBeChanged ? modelReferenceProviderOptions : []}
                    onProviderChange={(providerId) => dispatchProviderWorkbench({ type: 'set_reference_provider', providerId })}
                  />
                ) : null}
                {providerWorkbenchSection === 'connection' ? (
                <>
                <AdminConfigurationTable
                  ariaLabel={aiText('provider_configuration_table_label', '{{name}} configuration', { name: providerDialogName })}
                  itemHeading={aiText('configuration_item_heading', 'Setting')}
                  valueHeading={aiText('configuration_value_heading', 'Current setting')}
                  detailHeading={aiText('configuration_detail_heading', 'Action / note')}
                >
                  <AdminConfigurationRow
                    rowId="provider-type"
                    label={aiText('field_provider_type', 'Provider type')}
                    value={providerFormMode === 'edit' ? (
                      <span className="font-medium text-slate-900 dark:text-white">
                        {providerPresetById(providerConnectionForm.providerPreset)?.label || providerKindLabel(providerConnectionForm.kind)}
                      </span>
                    ) : (
                      <select
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        value={providerConnectionForm.providerPreset}
                        onChange={(event) => applyProviderPreset(event.target.value)}
                        aria-label={aiText('field_provider_type', 'Provider type')}
                      >
                        {PROVIDER_PRESETS.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    )}
                    detail={providerFormMode === 'edit'
                      ? aiText('provider_type_locked_hint', 'Provider type is fixed after creation')
                      : providerKindLabel(providerConnectionForm.kind)}
                  />
                  <AdminConfigurationRow
                    rowId="display-name"
                    label={aiText('field_display_name', 'Display name')}
                    value={(
                      <input
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        value={providerConnectionForm.displayName}
                        onChange={(event) => {
                          const displayName = event.target.value;
                          updateProviderConnectionForm({
                            displayName,
                            connectionId: providerFormMode === 'create' ? providerConnectionIdFromName(displayName) : providerConnectionForm.connectionId,
                          });
                        }}
                        placeholder="GPT-5.5 via NewAPI"
                        aria-label={aiText('field_display_name', 'Display name')}
                        required
                      />
                    )}
                    detail={aiText('display_name_note', 'Operator-facing name')}
                  />
                  <AdminConfigurationRow
                    rowId="credential"
                    label={aiText('field_credential', 'API Key')}
                    value={(
                      <AdminCredentialField
                        mode={providerFormMode}
                        revealed={credentialEditOpen}
                        value={providerConnectionForm.credential}
                        label={aiText('field_credential', 'API Key')}
                        unchangedLabel={aiText('credential_unchanged', 'Keep current credential')}
                        replaceLabel={aiText('action_replace_credential', 'Replace credential')}
                        cancelReplacementLabel={aiText('action_cancel_credential_replacement', 'Cancel replacement')}
                        keepCurrentPlaceholder={aiText('placeholder_keep_current_credential', 'Leave blank to keep current')}
                        onChange={(credential) => updateProviderConnectionForm({ credential })}
                        onReveal={() => dispatchProviderWorkbench({
                          type: 'set_credential_edit_open',
                          open: true,
                        })}
                        onCancelReplacement={() => dispatchProviderWorkbench({
                          type: 'cancel_credential_edit',
                        })}
                        density="compact"
                        hideLabel
                      />
                    )}
                    detail={providerFormMode === 'edit'
                      ? aiText('credential_keep_hint', 'Credential stays unchanged unless you replace it')
                      : aiText('credential_create_hint', 'Stored securely after save')}
                  />
                  <AdminConfigurationRow
                    rowId="base-url"
                    label={aiText('field_base_url', 'Base URL')}
                    value={(
                      <input
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        value={providerConnectionForm.baseUrl}
                        onChange={(event) => updateProviderConnectionForm({ baseUrl: event.target.value })}
                        placeholder="https://api.example.com/v1"
                        aria-label={aiText('field_base_url', 'Base URL')}
                      />
                    )}
                    detail={providerFormExternalLinkItems.length ? (
                      <ProviderReferenceLinks
                        items={providerFormExternalLinkItems}
                        label={aiText('provider_links_title', 'Reference links')}
                        translate={aiText}
                        variant="inline"
                      />
                    ) : aiText('provider_links_none', 'No reference links')}
                  />
                  <AdminConfigurationRow
                    rowId="runtime-enabled"
                    label={aiText('runtime_use_label', 'Runtime use')}
                    value={providerConnectionForm.enabled
                      ? aiText('field_enabled', 'Enabled')
                      : aiText('status_disabled_label', 'Disabled')}
                    detail={(
                      <label className="inline-flex min-h-9 items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={providerConnectionForm.enabled}
                          onChange={(event) => updateProviderConnectionForm({ enabled: event.target.checked })}
                        />
                        {aiText('field_enabled_runtime', 'Enabled for runtime use')}
                      </label>
                    )}
                  />
                  <AdminConfigurationRow
                    rowId="model-management-entry"
                    label={aiText('model_visibility_title', 'Model visibility')}
                    value={aiText('model_catalog_enabled_count_short', '{{count}} models', {
                      count: String(selectedProviderModelIds.length),
                    })}
                    detail={(
                      <button
                        type="button"
                        className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                        onClick={() => setProviderWorkbenchSection('models')}
                      >
                        {providerFormMode === 'create' ? aiText('action_next_models', 'Next: get and enable models') : aiText('action_manage_models', 'Manage models')}
                      </button>
                    )}
                  />
                {providerUsesImageGeneration ? (
                  <AdminConfigurationRow
                    rowId="image-delivery"
                    label={aiText('image_delivery_row_label', 'Image delivery')}
                    value={(
                      <span className="grid gap-1" role="status">
                        <span><BackofficeStatusBadge label={imageDeliveryStatusLabel} status={imageDeliveryStatus} /></span>
                        {!providerDraftDirty && activeImageDeliveryProbe?.status === 'ready' ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {aiText('image_delivery_verified_model', 'Tested model: {{model}}', {
                              model: String(activeImageDeliveryProbe.model_id || '—'),
                            })}
                          </span>
                        ) : null}
                      </span>
                    )}
                    detail={(
                      <span className="grid gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!canProbeImageDelivery}
                            onClick={() => void runImageDeliveryProbe()}
                          >
                            {isProbingImageDelivery
                              ? aiText('image_delivery_probe_testing', 'Testing image delivery...')
                              : aiText('image_delivery_probe_action', 'Generate test image')}
                          </button>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {aiText('image_delivery_probe_cost_notice', 'Generates one test image and may incur a small provider charge.')}
                          </span>
                        </span>
                        {providerFormMode !== 'edit' || providerDraftDirty ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            {aiText('image_delivery_probe_save_changes', 'Save your changes before generating a test image.')}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {aiText('image_delivery_test_not_proof_compact', 'Fetching the model catalog does not verify image generation.')}
                          </span>
                        )}
                        {!providerDraftDirty && activeImageDeliveryProbe?.status === 'host_approved' ? (
                          <span className="text-xs text-blue-700 dark:text-blue-300">
                            {aiText('image_delivery_probe_host_approved', 'Exact host approved. Run the test again to validate the download.')}
                          </span>
                        ) : null}
                        {!providerDraftDirty && activeImageDeliveryProbe?.status === 'approval_required' ? (
                          <span role="alert" className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                            <span>{aiText('image_delivery_probe_approval_required', 'Detected exact host: {{host}}', {
                              host: String(activeImageDeliveryProbe.detected_host || ''),
                            })}</span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={isProbingImageDelivery || asyncOperationRunning(approvingImageHost, providerConnectionForm.connectionId)}
                              onClick={() => activeProviderConnection && void approveDetectedImageHost(
                                activeProviderConnection,
                                String(activeImageDeliveryProbe.probe_id || activeImageDeliveryRepair?.probe_id || '')
                              )}
                            >
                              {asyncOperationRunning(approvingImageHost, providerConnectionForm.connectionId)
                                ? aiText('image_host_repair_approving', 'Approving...')
                                : aiText('image_host_repair_action', 'Approve this exact host')}
                            </button>
                          </span>
                        ) : null}
                      </span>
                    )}
                  />
                ) : null}
                </AdminConfigurationTable>
                {providerUsesImageGeneration ? (
                  <BackofficeDisclosure summary={aiText('image_advanced_settings', 'Image delivery · Advanced settings')}>
                    <AdminConfigurationTable ariaLabel={aiText('image_advanced_settings', 'Image delivery · Advanced settings')} itemHeading={aiText('configuration_item_heading', 'Setting')} valueHeading={aiText('configuration_value_heading', 'Current value')} detailHeading={aiText('configuration_detail_heading', 'Action / note')} density="compact">
                      <AdminConfigurationRow
                        rowId="image-response-format"
                        label={aiText('field_image_response_format', 'Provider image response')}
                        value={(
                          <select
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            value={providerConnectionForm.imageResponseFormat}
                            onChange={(event) => updateProviderConnectionForm({ imageResponseFormat: event.target.value })}
                            aria-label={aiText('field_image_response_format', 'Provider image response')}
                          >
                            <option value="">{aiText('image_response_provider_default', 'Provider / model default')}</option>
                            <option value="url">{aiText('image_response_url', 'Image URL')}</option>
                            <option value="b64_json">{aiText('image_response_base64', 'Base64 image')}</option>
                          </select>
                        )}
                        detail={aiText('image_response_override_note', 'Usually keep the default. Override only when required by the provider; model-specific settings take precedence.')}
                      />
                      {providerConnectionForm.imageResponseFormat === 'url' ? (
                        <AdminConfigurationRow
                          rowId="image-output-hosts"
                          label={aiText('field_image_output_hosts_advanced', 'Manual exact hosts (advanced)')}
                          value={(
                            <input
                              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              value={providerConnectionForm.imageOutputHosts}
                              onChange={(event) => updateProviderConnectionForm({ imageOutputHosts: event.target.value })}
                              placeholder="images.provider.example, assets.provider.example"
                              aria-label={aiText('field_image_output_hosts', 'Exact image download hosts')}
                            />
                          )}
                          detail={aiText(
                            'image_delivery_manual_host_note',
                            'Normally use the image delivery test. Manual entry accepts exact hosts only; no scheme, path, port, or wildcard.'
                          )}
                        />
                      ) : null}
                    </AdminConfigurationTable>
                  </BackofficeDisclosure>
                ) : null}
                </>
                ) : null}

                {providerWorkbenchSection === 'models' ? (
                <section className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="flex shrink-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{aiText('workbench_models_tab', 'Model management')}</h3>
                        <span>{aiText('account_model_counts', 'Enabled {{enabled}} · Account catalog {{account}}', { enabled: String(selectedProviderModelIds.length), account: String(accountModelCount) })}</span>
                        {unconfirmedSelectedCount ? <button type="button" data-ui="model-unconfirmed-filter" aria-pressed={showUnconfirmedModels}
                          className="font-semibold text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                          onClick={() => setShowUnconfirmedModels(!showUnconfirmedModels)}>
                          {aiText('unconfirmed_model_count', 'Catalog unconfirmed {{count}}', { count: String(unconfirmedSelectedCount) })}
                        </button> : null}
                      </div>
                        <button
                          type="button"
                          data-ui="model-sync-primary"
                          className="btn btn-secondary h-10 shrink-0 px-3"
                          disabled={isFetchingProviderCatalog || isSavingConnection}
                          onClick={() => {
                            if (catalogCredentialMissing) {
                              if (providerFormMode === 'edit') dispatchProviderWorkbench({ type: 'set_credential_edit_open', open: true });
                              setProviderWorkbenchSection('connection');
                            } else void fetchProviderCatalogPreview();
                          }}
                        >
                          {isFetchingProviderCatalog
                            ? aiText('action_fetching_upstream_models', 'Syncing...')
                            : catalogCredentialMissing
                              ? aiText('action_enter_key_first', 'Enter API Key first')
                              : aiText('action_fetch_upstream_models', 'Get account models')}
                        </button>
                    </div>
                    {isSyncingModelReferences || modelReferenceError ? (
                      <p data-ui="account-reference-status" className="shrink-0 text-xs text-slate-500 dark:text-slate-400" role={modelReferenceError ? 'alert' : 'status'}>
                        {modelReferenceError ? aiText('reference_refresh_failed_note', 'Account models are available. Reference information could not be updated; existing configuration is unaffected.') : aiText('reference_refreshing_note', 'Account models fetched. Updating reference information…')}
                        {modelReferenceError ? <button type="button" className="ml-2 font-semibold underline" onClick={() => setProviderWorkbenchSection('references')}>{aiText('reference_browse_title', 'Reference information')}</button> : null}
                      </p>
                    ) : null}
                    <div data-ui="model-visibility-toolbar" className="flex shrink-0 flex-wrap items-start gap-2">
                      <label className="w-full sm:w-[22rem] lg:w-[24rem]">
                        <span className="sr-only">{aiText('field_search_models', 'Search models')}</span>
                        <input
                          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={modelReferenceSearch}
                          onChange={(event) => dispatchProviderWorkbench({
                            type: 'set_reference_search',
                            search: event.target.value,
                          })}
                          placeholder={aiText('placeholder_search_models', 'model, family, provider')}
                        />
                      </label>
                      <details data-ui="model-filters" className="text-xs text-slate-600 dark:text-slate-300">
                        <summary className="cursor-pointer rounded-md border border-slate-200 px-3 py-3 font-semibold dark:border-slate-700">
                          {aiText('model_filters', 'Filters')}{modelReferenceVisibilityFilter !== 'all' || modelReferenceFeatureFilter !== 'all' ? ' •' : ''}
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">

                      <select
                        className="h-10 min-w-28 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        value={modelReferenceVisibilityFilter}
                        onChange={(event) => dispatchProviderWorkbench({
                          type: 'set_reference_visibility_filter',
                          filter: event.target.value as ModelReferenceVisibilityFilter,
                        })}
                        aria-label={aiText('field_visibility_filter', 'Visibility')}
                      >
                        <option value="all">{aiText('filter_all_visibility', 'All visibility')}</option>
                        <option value="enabled">{aiText('filter_enabled_models', 'Enabled')}</option>
                        <option value="disabled">{aiText('filter_disabled_models', 'Disabled')}</option>
                      </select>
                      <select
                        className="h-10 min-w-32 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                        value={modelReferenceFeatureFilter}
                        onChange={(event) => dispatchProviderWorkbench({
                          type: 'set_reference_feature_filter',
                          filter: event.target.value as ModelReferenceFeatureFilter,
                        })}
                        aria-label={aiText('field_feature_filter', 'Feature')}
                      >
                        <option value="all">{aiText('filter_all_features', 'All capabilities')}</option>
                        <option value="text">{aiText('model_feature_text_generation', 'Text generation')}</option>
                        <option value="image">{aiText('model_feature_image_generation', 'Image generation')}</option>
                        <option value="audio">{aiText('model_feature_audio_generation', 'Audio')}</option>
                        <option value="video">{aiText('model_feature_video_generation', 'Video generation')}</option>
                        <option value="embedding">{aiText('model_feature_embedding', 'Embedding')}</option>
                      </select>
                        </div>
                      </details>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 text-xs">
                      {accountModelCount > MODEL_VISIBILITY_PAGE_SIZE ? (
                      <details data-ui="model-maintenance-table">
                        <summary className="w-fit cursor-pointer font-semibold text-slate-600 dark:text-slate-300">{aiText('model_more_operations', 'More operations')}</summary>
                        <div className="mt-2 grid gap-3 border-l border-slate-200 pl-3 dark:border-slate-800">
                          <div className="flex flex-wrap items-center gap-3">{confirmingModelBatch ? (
                            <span className="grid gap-2">
                              <span className="text-amber-700 dark:text-amber-300">
                                {aiText(
                                  'filtered_models_batch_confirmation',
                                  '{{action}} {{count}} matching models? The enabled total will become {{result}}. Changes remain a draft until you save.',
                                  {
                                    action: confirmingModelBatch === 'enable'
                                      ? aiText('action_enable', 'Enable')
                                      : aiText('action_disable', 'Disable'),
                                    count: String(confirmingBatchModelIds.length),
                                    result: String(confirmingBatchResultCount),
                                  }
                                )}
                              </span>
                              <span className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  data-ui="model-filtered-batch-confirm"
                                  className="font-semibold text-blue-700 hover:underline dark:text-blue-300"
                                  onClick={applyFilteredModelBatch}
                                >
                                  {aiText('action_confirm_apply', 'Confirm apply')}
                                </button>
                                <button
                                  type="button"
                                  className="font-semibold text-slate-600 hover:underline dark:text-slate-300"
                                  onClick={() => dispatchProviderWorkbench({ type: 'set_confirming_model_batch', batch: '' })}
                                >
                                  {aiText('action_cancel', 'Cancel')}
                                </button>
                              </span>
                            </span>
                          ) : (
                            <span className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                data-ui="model-filtered-enable-request"
                                className="font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-300"
                                disabled={!filteredEnableModelIds.length || isSavingConnection}
                                onClick={() => dispatchProviderWorkbench({ type: 'set_confirming_model_batch', batch: 'enable' })}
                              >
                                {aiText('action_enable_filtered_models', 'Enable matching')}
                              </button>
                              <button
                                type="button"
                                data-ui="model-filtered-disable-request"
                                className="font-semibold text-slate-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300"
                                disabled={!filteredDisableModelIds.length || isSavingConnection}
                                onClick={() => dispatchProviderWorkbench({ type: 'set_confirming_model_batch', batch: 'disable' })}
                              >
                                {aiText('action_disable_filtered_models', 'Disable matching')}
                              </button>
                            </span>
                          )}</div>
                        </div>
                      </details>
                      ) : null}
                    </div>

                    {modelVisibilityRows.length ? (
                        <div data-ui="model-visibility-directory" className="flex min-h-0 flex-1 flex-col border-t border-slate-200 dark:border-slate-800">
                          <div data-ui="model-visibility-scroll" className="relative min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]">
                            <table className="w-full min-w-[44rem] table-fixed text-left text-xs">
                            <colgroup>
                              <col className="w-[12%]" />
                              <col className="w-[38%]" />
                              <col className="w-[22%]" />
                              <col className="w-[28%]" />
                            </colgroup>
                            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-[0_1px_0_rgba(148,163,184,0.25)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_rgba(30,41,59,0.9)]">
                              <tr>
                                <th className="px-3 py-2 font-semibold">{aiText('column_model_visibility', 'Visibility')}</th>
                                <th className="px-3 py-2 font-semibold">{aiText('catalog_model_header_model', 'Model')}</th>
                                <th className="px-3 py-2 font-semibold">{aiText('catalog_model_header_feature', 'Feature')}</th>
                                <th className="px-3 py-2 font-semibold">{aiText('model_details', 'Details')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {modelVisibilityPageRows.map((row) => {
                                const displayModelId = row.catalog?.upstream_model_id || upstreamModelId(row.modelId, row.sourceKind === 'reference' && !row.selected ? row.reference?.provider_id || '' : modelNamespacePrefix);
                                const rowUsages = modelUsages.filter((usage) => [...modelIdentityKeys(usage.model_id, modelNamespacePrefix)].some((key) => modelIdentityKeys(row.modelId, modelNamespacePrefix).has(key)));
                                const visibleUsageNames = [...new Set(rowUsages.filter((usage) => usageLabelKeys[usage.profile_id]).map((usage) => usageName(usage.profile_id)))];
                                const tags = row.reference ? modelReferenceCapabilityTags(row.reference) : [];
                                const tagLabels = tags.map(modelReferenceCapabilityLabel);
                                const canRemoveManualModel = row.sourceKind === 'manual' && row.selected;
                                const enableBlocked = !row.selected && (row.deprecated || !row.catalog);
                                const referenceContext = row.reference
                                  ? formatReferenceContext(row.reference, aiText('model_reference_missing_context', 'No context data'))
                                  : '';
                                const referencePrice = row.reference
                                  ? formatReferencePrice(
                                    row.reference,
                                    aiText('price_cache_label', 'Cache'),
                                    aiText('model_reference_missing_price', 'No reference price')
                                  )
                                  : '';
                                return (
                                  <tr key={row.modelId} className="group">
                                    <td className="px-3 py-2">
                                      <div className="flex flex-col gap-1">
                                        {row.sourceKind === 'reference' && !row.selected ? <span className="text-xs text-slate-500 dark:text-slate-400">{aiText('model_reference_readonly', 'Read only')}</span> : <button
                                          type="button"
                                          role="switch"
                                          aria-label={aiText('toggle_model_named', 'Enable model {{name}}', { name: displayModelId })}
                                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                                          row.selected
                                            ? 'bg-blue-600'
                                            : 'bg-slate-300 dark:bg-slate-700'
                                        } hover:ring-2 hover:ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:ring-slate-700`}
                                          aria-checked={row.selected}
                                          disabled={enableBlocked}
                                          title={
                                            enableBlocked
                                              ? aiText('model_account_selection_required', 'Only current account models can be newly enabled')
                                              : row.selected
                                                ? aiText('action_disable_catalog_model', 'Disable')
                                                : aiText('action_enable_catalog_model', 'Enable')
                                          }
                                          onClick={() => {
                                            if (row.selected) {
                                              removeProviderModelId(row.modelId);
                                            } else if (!enableBlocked) {
                                              setProviderModelIds([...selectedProviderModelIds, row.modelId]);
                                            }
                                          }}
                                        >
                                          <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${row.selected ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                                          <span className="sr-only">{row.selected ? aiText('status_model_enabled', 'Enabled') : aiText('status_model_disabled', 'Not enabled')}</span>
                                        </button>}
                                        {row.deprecated ? (
                                          <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                            {aiText('catalog_model_deprecated', 'deprecated')}
                                          </span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-semibold text-slate-900 dark:text-white">{displayModelId}</div>
                                      <div className={row.selected && !row.catalog && providerCatalogPreview ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}>
                                        {row.selected && !row.catalog && providerCatalogPreview ? aiText('model_saved_not_returned', 'Saved; not returned in current catalog') : row.sourceKind === 'catalog' ? aiText('model_source_account', 'Account returned') : row.selected ? aiText('model_source_enabled_only', 'Saved model ID only') : aiText('model_source_reference', 'Reference only')}
                                        {row.reference?.override_present ? ` · ${aiText('model_reference_override', 'manual override')}` : ''}
                                      </div>
                                      {visibleUsageNames.length ? <Link className="block text-xs text-blue-700 underline dark:text-blue-300" href={`/admin/runtime-profiles?provider=${encodeURIComponent(providerConnectionForm.providerId)}`}>{aiText('model_used_by', 'Candidate for {{profiles}}', { profiles: visibleUsageNames.join(', ') })}</Link> : null}
                                      {row.deprecated && row.selected ? (
                                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                          {aiText('deprecated_selected_model_hint', 'Deprecated model is kept only because it is already saved. Remove it before saving new model visibility choices.')}
                                        </div>
                                      ) : null}
                                      {canRemoveManualModel ? (
                                        <button
                                          type="button"
                                          className="mt-1 text-xs font-semibold text-slate-500 opacity-0 underline-offset-2 transition hover:text-rose-700 hover:underline focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-slate-400 dark:hover:text-rose-300"
                                          aria-label={aiText('action_remove_model_named', 'Remove {{name}}', { name: displayModelId })}
                                          onClick={() => removeProviderModelId(row.modelId)}
                                        >
                                          {aiText('action_remove_manual_model_short', 'Remove')}
                                        </button>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                      {row.feature ? modelFeatureLabel(row.feature) : (
                                        <span className="text-slate-400" title={aiText('model_feature_unknown', 'Unknown')}>—</span>
                                      )}

                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                      {activeProviderConnection?.enabled && activeProviderConnection.configured && row.selected && row.catalog && ['text', 'vision'].includes(row.feature || '') && (activeProviderConnection.model_ids || []).some(id => [...modelIdentityKeys(id, modelNamespacePrefix)].some(key => modelIdentityKeys(row.modelId, modelNamespacePrefix).has(key))) ? <button
                                        type="button" className="mb-2 block text-xs font-semibold text-blue-700 underline dark:text-blue-300"
                                        aria-label={t('admin.model_test.named', { name: displayModelId })}
                                        onClick={() => setModelTestTarget({ connectionId: activeProviderConnection.connection_id, supplierName: activeProviderConnection.display_name, modelId: row.catalog!.model_id, displayModelId, namespacePrefix: modelNamespacePrefix, capability: row.feature === 'vision' || row.catalog?.capability_tags?.includes('vision') ? 'vision' : 'text' })}
                                      >{t('admin.model_test.title')}</button> : null}
                                      <details data-ui="model-reference-details">
                                          <summary className="cursor-pointer font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white">
                                            {aiText('model_details', 'Details')}
                                          </summary>
                                          <div className="mt-2 grid gap-1 border-l border-slate-200 pl-3 text-[11px] leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                            {row.reference ? <p>{row.reference.source_label} · {aiText('reference_updated', 'Updated')}: {formatDate(row.reference.synced_at)}</p> : null}
                                            {!row.reference ? <p>{aiText('reference_missing_note', 'Reference data is unavailable; enabling and calling this model is unaffected.')}</p> : null}
                                            <div className="break-all">{aiText('model_internal_id', 'Internal ID')}: {row.catalog?.model_id || row.modelId}</div>
                                            {rowUsages.length ? <div className="break-all">{rowUsages.map((usage) => usage.profile_id).join(', ')}</div> : null}
                                            {row.catalog ? <div>{aiText('model_catalog_declaration', 'Capabilities declared by the account catalog; verification is separate.')}</div> : null}
                                            <button type="button" className="w-fit font-semibold underline" onClick={() => { void navigator.clipboard.writeText(displayModelId).then(() => toast.success(t('common.copied'))).catch(() => toast.error(t('admin.troubleshooting.copy_failed'))); }}>{aiText('copy_request_model_id', 'Copy request model ID')}</button>
                                            {tagLabels.length ? <div>{tagLabels.join(' · ')}</div> : null}
                                            <div>
                                              <span className="font-semibold">{aiText('column_context_output', 'Context / output')}：</span>
                                              <span title={row.reference ? formatReferenceContextTitle(row.reference) : undefined}>{referenceContext || aiText('reference_exact_model_missing', 'No reference data for this exact model ID')}</span>
                                            </div>
                                            <div>
                                              <span className="font-semibold">{aiText('column_reference_price', 'Reference price')}：</span>
                                              <span>{referencePrice || aiText('model_reference_missing_price', 'No reference price')}{row.reference && hasReferencePrice(row.reference) ? ` · ${aiText('reference_price_unit', 'USD / 1M tokens (input / output)')}` : ''}</span>
                                            </div>
                                          </div>
                                        </details>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            </table>
                          </div>
                          {modelVisibilityPageCount > 1 ? (
                          <div
                            data-ui="model-visibility-pagination"
                            className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                          >
                            <span>{aiText('model_page_count', '{{shown}} / {{total}} models', { shown: String(modelVisibilityPageRows.length), total: String(modelVisibilityRows.length) })}</span>
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                className="btn btn-secondary h-8 px-3"
                                disabled={visibleModelReferencePage <= 1}
                                onClick={() => dispatchProviderWorkbench({
                                  type: 'set_reference_page',
                                  page: visibleModelReferencePage - 1,
                                })}
                              >
                                {aiText('action_previous_page', 'Previous')}
                              </button>
                              <span className="min-w-16 text-center font-medium text-slate-700 dark:text-slate-200">
                                {aiText('pagination_page', '{{current}} / {{total}}', {
                                  current: String(visibleModelReferencePage),
                                  total: String(modelVisibilityPageCount),
                                })}
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary h-8 px-3"
                                disabled={visibleModelReferencePage >= modelVisibilityPageCount}
                                onClick={() => dispatchProviderWorkbench({
                                  type: 'set_reference_page',
                                  page: visibleModelReferencePage + 1,
                                })}
                              >
                                {aiText('action_next_page', 'Next')}
                              </button>
                            </span>
                          </div>
                          ) : null}
                        </div>
                      ) : (
                        <AdminEmptyState>
                          {true
                            ? aiText('account_scope_empty', 'No account or selected models match. Fetch account models or clear the filters.')
                            : aiText('model_visibility_empty', 'No reference models match the current filters.')}
                        </AdminEmptyState>
                    )}
                  </div>
                </section>
                ) : null}

                {providerWorkbenchSection === 'connection' && providerUsesCustomRuntimeFields ? (
                  <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">
                      {aiText('advanced_settings_title', 'Advanced runtime settings')}
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {aiText('advanced_settings_desc', 'These values are kept for runtime metadata and diagnostics. They do not edit prompts, router rules, abilities, or WordPress writes.')}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {aiText('field_connection_id', 'Connection ID')}
                        <input
                          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={providerConnectionForm.connectionId}
                          onChange={(event) => updateProviderConnectionForm({ connectionId: event.target.value })}
                          placeholder="openai_primary"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {aiText('field_provider_id', 'Provider ID')}
                        <input
                          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={providerConnectionForm.providerId}
                          onChange={(event) => updateProviderConnectionForm({ providerId: event.target.value })}
                          placeholder="openai"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {aiText('field_kind', 'Kind')}
                        <select
                          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={providerConnectionForm.kind}
                          onChange={(event) => updateProviderConnectionForm({ kind: event.target.value })}
                        >
                          <option value="openai_compatible">openai_compatible</option>
                          <option value="anthropic">anthropic</option>
                          <option value="litellm_gateway">litellm_gateway</option>
                          <option value="vllm">vllm</option>
                          <option value="tei">tei</option>
                          <option value="openrouter">openrouter</option>
                          <option value="siliconflow">siliconflow</option>
                          <option value="minimax">minimax</option>
                          <option value="audio_provider">audio_provider</option>
                          <option value="web_search_provider">web_search_provider</option>
                          <option value="image_source_provider">image_source_provider</option>
                          <option value="embedding_provider">embedding_provider</option>
                          <option value="rerank_provider">rerank_provider</option>
                          <option value="vector_store_provider">vector_store_provider</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {aiText('field_source_role', 'Source role')}
                        <select
                          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={providerConnectionForm.sourceRole}
                          onChange={(event) => updateProviderConnectionForm({ sourceRole: event.target.value })}
                        >
                          <option value="execution_source">execution_source</option>
                          <option value="runtime_metadata">runtime_metadata</option>
                          <option value="diagnostic_source">diagnostic_source</option>
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {aiText('field_capabilities', 'Capabilities')}
                        <input
                          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={providerConnectionForm.capabilityIds}
                          onChange={(event) => updateProviderConnectionForm({ capabilityIds: event.target.value })}
                          placeholder="text_generation, image_generation"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                        {aiText('field_profiles', 'Runtime configurations')}
                        <input
                          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          value={providerConnectionForm.runtimeProfileIds}
                          onChange={(event) => updateProviderConnectionForm({ runtimeProfileIds: event.target.value })}
                          placeholder="text.ai"
                        />
                      </label>
                    </div>
                  </details>
                ) : null}
        </ProviderConnectionDialog>
        <ModelSupplierTable
          connections={aiSupplierConnections}
          toolbar={(
            <SupplierToolbar
              connectionSearch={connectionSearch}
              onConnectionSearchChange={handleConnectionSearchChange}
              statusFilter={connectionStatusFilter}
              onStatusFilterChange={handleConnectionStatusFilterChange}
              hasLatestOperation={Boolean(lastReceipt)}
              onOpenLatestOperation={() => setReceiptDetailsOpen(true)}
              translate={aiText}
            />
          )}
          selectedConnectionId={selectedConnectionId}
          onSelectConnection={handleSelectConnection}
          hasActiveFilters={Boolean(connectionSearch.trim() || connectionStatusFilter !== 'all')}
          onClearFilters={handleClearConnectionFilters}
          testResults={connectionTestResults}
          testingConnection={testingConnection}
          approvingImageHost={approvingImageHost}
          deletingConnection={deletingConnection}
          preflightingDelete={preflightingDelete}
          confirmingDeleteConnectionId={confirmingDeleteConnectionId}
          deletePreflight={deletePreflight}
          providerKindLabel={providerKindLabel}
          providerTestStageLabel={providerTestStageLabel}
          providerTestMessage={providerTestMessage}
          referenceLinksForConnection={connectionExternalLinkItems}
          onConfigure={editProviderConnection}
          onTest={(connectionId) => void runProviderConnectionTest(connectionId).catch(() => undefined)}
          onApproveImageHost={(connection) => void approveDetectedImageHost(connection)}
          onDelete={(connection) => void deleteProviderConnection(connection)}
          onRequestDelete={(connection) => void requestProviderConnectionDelete(connection)}
          onCancelDelete={() => {
            setConfirmingDeleteConnectionId('');
            setDeletePreflight(null);
          }}
          translate={aiText}
        />

        {data.providerModelHealth ? (
          <ProviderModelHealthPanel
            health={data.providerModelHealth}
            translate={aiText}
          />
        ) : null}

      <Modal
        isOpen={receiptDetailsOpen && Boolean(lastReceipt)}
        onClose={() => setReceiptDetailsOpen(false)}
        title={aiText('latest_operation_title', 'Latest operation')}
        description={aiText('latest_operation_desc', 'Audit evidence from the most recent supplier change in this session.')}
        size="lg"
      >
        <AdminMutationReceipt receipt={lastReceipt} title={aiText('latest_operation_receipt', 'Operation receipt')} />
      </Modal>

      {modelTestTarget ? <ModelTestDialog target={modelTestTarget} onClose={() => setModelTestTarget(null)} /> : null}

      </BackofficePageStack>
  );
}

export default function AiResourcesPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AiResourcesContent />
    </Suspense>
  );
}
