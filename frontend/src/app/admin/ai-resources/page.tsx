'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  BackofficeDiagnosticNotice,
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
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { ProviderConnectionDialog } from '@/components/admin/ProviderConnectionDialog';
import { ProviderReferenceLinks } from '@/components/admin/ProviderReferenceLinks';
import {
  ModelSupplierTable,
} from '@/components/admin/SupplierConnectionTables';
import { SupplierToolbar } from '@/components/admin/SupplierToolbar';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import {
  aiResourcesClient,
  useAiResourcesDirectory,
} from '@/features/admin/ai-resources/directory';
import {
  buildProviderConnectionForm,
  EMPTY_PROVIDER_CONNECTION_FORM,
  INITIAL_PROVIDER_WORKBENCH_STATE,
  providerWorkbenchReducer,
  type ModelReferenceFeatureFilter,
  type ModelReferenceVisibilityFilter,
  type ProviderCatalogPreview,
  type ProviderCatalogPreviewModel,
  type ProviderConnectionForm,
} from '@/features/admin/ai-resources/provider-workbench-state';
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
import type {
  ConnectionStatusFilter,
  ProviderConnectionTestResult,
  SupplierConnection as Connection,
} from '@/features/admin/ai-resources/types';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { useDialogKeyboard } from '@/hooks/useDialogKeyboard';
import { formatDate } from '@/lib/utils';

type SupplierCategory = 'ai' | 'capability';

type ModelReferenceEntry = {
  source_id: string;
  source_label: string;
  provider_id: string;
  provider_label: string;
  model_id: string;
  display_name: string;
  family: string;
  feature: string;
  status: string;
  modalities: {
    input?: string[];
    output?: string[];
  };
  capability_flags: {
    reasoning?: boolean;
    tool_call?: boolean;
    structured_output?: boolean;
    attachment?: boolean;
    open_weights?: boolean;
  };
  context_window?: number | null;
  output_limit?: number | null;
  price: {
    input?: number | null;
    output?: number | null;
    cache_read?: number | null;
    cache_write?: number | null;
    unit: string;
    billing_truth: boolean;
  };
  source_updated_at: string;
  synced_at: string;
  is_deprecated: boolean;
  override_present: boolean;
};

type ModelReferenceSourceSummary = {
  source_id: string;
  display_name: string;
  source_url: string;
  status: string;
  last_synced_at: string;
  last_error_code: string;
  last_error_message: string;
};

function modelReferenceSourceNeedsSync(source: ModelReferenceSourceSummary | null, total: number): boolean {
  if (total > 0) return false;
  if (!source) return true;
  if (source.last_synced_at) return false;
  return source.status !== 'active';
}

type ModelVisibilityRow = {
  modelId: string;
  family: string;
  feature: string;
  sourceLabel: string;
  sourceKind: 'reference' | 'catalog' | 'manual';
  selected: boolean;
  verified: boolean;
  deprecated: boolean;
  reference?: ModelReferenceEntry;
  catalog?: ProviderCatalogPreviewModel;
};

const MODEL_VISIBILITY_PAGE_SIZE = 25;

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

function providerConnectionTestResultFromError(error: unknown): ProviderConnectionTestResponse | undefined {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object' || Array.isArray(error.details)) {
    return undefined;
  }
  const details = error.details as Record<string, unknown>;
  return typeof details.connection_id === 'string'
    ? details as ProviderConnectionTestResponse
    : undefined;
}

function formatCompactTokenCount(value: number | null): string {
  if (typeof value !== 'number') return '-';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRawTokenCount(value: number | null): string {
  if (typeof value !== 'number') return '-';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatReferenceContext(reference: ModelReferenceEntry, missingLabel: string): string {
  const contextWindow = typeof reference.context_window === 'number' ? reference.context_window : null;
  const outputLimit = typeof reference.output_limit === 'number' ? reference.output_limit : null;
  if (contextWindow === null && outputLimit === null) {
    return missingLabel;
  }
  return `${formatCompactTokenCount(contextWindow)} / ${formatCompactTokenCount(outputLimit)}`;
}

function formatReferenceContextTitle(reference: ModelReferenceEntry): string {
  const contextWindow = typeof reference.context_window === 'number' ? reference.context_window : null;
  const outputLimit = typeof reference.output_limit === 'number' ? reference.output_limit : null;
  return `${formatRawTokenCount(contextWindow)} / ${formatRawTokenCount(outputLimit)} tokens`;
}

function hasReferencePrice(reference: ModelReferenceEntry): boolean {
  return typeof reference.price.input === 'number'
    || typeof reference.price.output === 'number'
    || typeof reference.price.cache_read === 'number'
    || typeof reference.price.cache_write === 'number';
}

function formatReferencePrice(reference: ModelReferenceEntry, cacheLabel: string, missingLabel: string): string {
  if (!hasReferencePrice(reference)) {
    return missingLabel;
  }
  const input = typeof reference.price.input === 'number' ? `$${reference.price.input}` : '-';
  const output = typeof reference.price.output === 'number' ? `$${reference.price.output}` : '-';
  const cacheRead = typeof reference.price.cache_read === 'number' ? `$${reference.price.cache_read}` : '';
  const cacheWrite = typeof reference.price.cache_write === 'number' ? `$${reference.price.cache_write}` : '';
  const cache = cacheRead || cacheWrite ? ` · ${cacheLabel} ${cacheRead || '-'} / ${cacheWrite || '-'}` : '';
  return `${input} / ${output}${cache}`;
}

function modelReferenceCapabilityTags(reference: ModelReferenceEntry): string[] {
  return [
    reference.capability_flags.reasoning ? 'reasoning' : '',
    reference.capability_flags.tool_call ? 'tool_call' : '',
    reference.capability_flags.structured_output ? 'structured_output' : '',
    reference.capability_flags.attachment ? 'attachment' : '',
    reference.capability_flags.open_weights ? 'open_weights' : '',
  ].filter(Boolean);
}

function modelReferenceSearchText(row: ModelVisibilityRow): string {
  return [
    row.modelId,
    row.family,
    row.feature,
    row.sourceLabel,
    row.reference?.display_name,
    row.reference?.provider_label,
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizeModelReferenceFeature(feature: string): ModelReferenceFeatureFilter {
  const normalized = feature.trim().toLowerCase();
  if (normalized.includes('image')) return 'image';
  if (normalized.includes('audio')) return 'audio';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('embedding') || normalized.includes('vector')) return 'embedding';
  if (normalized.includes('text')) return 'text';
  return 'all';
}

function catalogDisplayFeature(modelId: string, catalogFeature: string): string {
  const normalized = modelId.trim().toLowerCase();
  if (/(^|[\/_-])(cosyvoice|sensevoice|funasr|whisper|tts|speech|audio)([\/_:.-]|$)/.test(normalized)) {
    return 'audio';
  }
  if (/(^|[\/_-])(video|wan2\.[0-9]|sora)([\/_:.-]|$)/.test(normalized)) {
    return 'video';
  }
  return catalogFeature;
}

function normalizeModelLookupValue(value: string): string {
  return value.trim().toLowerCase();
}

function modelLookupKeys(modelId: string, providerId: string): string[] {
  const normalizedModelId = normalizeModelLookupValue(modelId);
  const normalizedProviderId = normalizeModelLookupValue(providerId);
  const keys = new Set<string>();
  if (normalizedModelId) {
    keys.add(normalizedModelId);
    const slashIndex = normalizedModelId.indexOf('/');
    if (slashIndex > 0 && slashIndex < normalizedModelId.length - 1) {
      keys.add(normalizedModelId.slice(slashIndex + 1));
    }
    if (normalizedProviderId && normalizedModelId.startsWith(`${normalizedProviderId}/`)) {
      keys.add(normalizedModelId.slice(normalizedProviderId.length + 1));
    }
    if (normalizedProviderId && !normalizedModelId.includes('/')) {
      keys.add(`${normalizedProviderId}/${normalizedModelId}`);
    }
  }
  return Array.from(keys);
}

function modelLookupKeySet(modelId: string, providerId: string): Set<string> {
  return new Set(modelLookupKeys(modelId, providerId));
}

function selectedModelIdFor(
  modelId: string,
  providerId: string,
  selectedModelIds: string[],
  selectedLookup: Map<string, string>
): string {
  for (const key of modelLookupKeys(modelId, providerId)) {
    const selectedModelId = selectedLookup.get(key);
    if (selectedModelId) return selectedModelId;
  }
  return selectedModelIds.includes(modelId) ? modelId : '';
}

function hasModelMetadataFor(
  modelId: string,
  providerId: string,
  references: ModelReferenceEntry[]
): boolean {
  const keys = modelLookupKeySet(modelId, providerId);
  return references.some((reference) => modelLookupKeys(reference.model_id, reference.provider_id || providerId).some((key) => keys.has(key)));
}

function normalizeProviderCatalogPreview(value: any): ProviderCatalogPreview | null {
  if (!value || typeof value !== 'object') return null;
  const models: ProviderCatalogPreviewModel[] = Array.isArray(value.models)
    ? value.models
      .map((model: any): ProviderCatalogPreviewModel => ({
        model_id: String(model?.model_id ?? ''),
        family: String(model?.family ?? ''),
        feature: String(model?.feature ?? ''),
        status: String(model?.status ?? ''),
        is_deprecated: Boolean(model?.is_deprecated),
        runtime_supported: Boolean(model?.runtime_supported),
        verified: Boolean(model?.verified),
        capability_tags: Array.isArray(model?.capability_tags) ? model.capability_tags.map(String) : [],
      }))
      .filter((model: ProviderCatalogPreviewModel) => model.model_id)
    : [];
  const modelIds = Array.isArray(value.model_ids)
    ? value.model_ids.map(String).filter(Boolean)
    : models.map((model) => model.model_id);
  if (!modelIds.length && !models.length) return null;
  return {
    provider_id: String(value.provider_id ?? ''),
    display_name: String(value.display_name ?? ''),
    adapter_type: String(value.adapter_type ?? ''),
    model_count: Number(value.model_count ?? modelIds.length) || modelIds.length,
    model_ids: modelIds,
    models,
    truncated: Boolean(value.truncated),
  };
}

function catalogPreviewForMetadata(preview: ProviderCatalogPreview | null): ProviderCatalogPreview | undefined {
  if (!preview) return undefined;
  return {
    provider_id: preview.provider_id,
    display_name: preview.display_name,
    adapter_type: preview.adapter_type,
    model_count: preview.model_count,
    model_ids: preview.model_ids,
    models: (preview.models || []).map((model) => ({
      model_id: model.model_id,
      family: model.family,
      feature: model.feature,
      status: model.status,
      is_deprecated: model.is_deprecated,
      runtime_supported: model.runtime_supported,
      verified: model.verified,
      capability_tags: model.capability_tags,
    })),
    truncated: preview.truncated,
  };
}

function catalogPreviewFromConnection(connection: Connection): ProviderCatalogPreview | null {
  return normalizeProviderCatalogPreview(
    connection.metadata?.model_catalog_preview || connection.metadata?.model_catalog
  );
}

function AiResourcesContent() {
  const { t } = useLocale();
  const toast = useToast();
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
    ? resolveUiErrorMessage(
      directoryQuery.error,
      aiText('error_load', 'Failed to load provider management.')
    )
    : '';
  const [connectionStatusFilter, setConnectionStatusFilter] = useState<ConnectionStatusFilter>('all');
  const [connectionSearch, setConnectionSearch] = useState('');
  const [savingConnection, setSavingConnection] = useState(false);
  const [testingConnectionId, setTestingConnectionId] = useState('');
  const [approvingImageHostConnectionId, setApprovingImageHostConnectionId] = useState('');
  const [deletingConnectionId, setDeletingConnectionId] = useState('');
  const [confirmingDeleteConnectionId, setConfirmingDeleteConnectionId] = useState('');
  const [fetchingProviderCatalog, setFetchingProviderCatalog] = useState(false);
  const [loadingModelReferences, setLoadingModelReferences] = useState(false);
  const [syncingModelReferences, setSyncingModelReferences] = useState(false);
  const [autoSyncingModelReferences, setAutoSyncingModelReferences] = useState(false);
  const [modelReferenceAutoSyncError, setModelReferenceAutoSyncError] = useState('');
  const [modelReferences, setModelReferences] = useState<ModelReferenceEntry[]>([]);
  const [modelReferenceTotal, setModelReferenceTotal] = useState(0);
  const [modelReferenceSources, setModelReferenceSources] = useState<ModelReferenceSourceSummary[]>([]);
  const [loadedModelReferenceProviderId, setLoadedModelReferenceProviderId] = useState('');
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
    confirmingClearModels,
    confirmingModelBatch,
    customModelInput,
  } = providerWorkbench;
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastReceipt, setLastReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [receiptDetailsOpen, setReceiptDetailsOpen] = useState(false);
  const [providerWorkbenchSection, setProviderWorkbenchSection] = useState<'connection' | 'models'>('connection');
  const autoSyncedReferenceProviders = useRef<Set<string>>(new Set());
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
      setError(resolveUiErrorMessage(
        result.error,
        aiText('error_load', 'Failed to load provider management.')
      ));
    }
  }, [aiText, refetchResources]);

  const loadModelReferences = useCallback(async (providerId: string) => {
    const normalizedProviderId = providerId.trim().toLowerCase();
    if (!normalizedProviderId || normalizedProviderId === 'custom') {
      setModelReferences([]);
      setModelReferenceTotal(0);
      setModelReferenceSources([]);
      setLoadedModelReferenceProviderId(normalizedProviderId);
      return;
    }
    setLoadingModelReferences(true);
    setLoadedModelReferenceProviderId('');
    try {
      const params = new URLSearchParams({
        provider_id: normalizedProviderId,
        limit: '500',
        include_deprecated: 'true',
      });
      const response = await aiResourcesClient.request<{
        items?: ModelReferenceEntry[];
        total?: number;
        source_summary?: ModelReferenceSourceSummary[];
      }>(`/api/admin/model-references?${params.toString()}`);
      setModelReferences(Array.isArray(response.data.items) ? response.data.items : []);
      setModelReferenceTotal(Number(response.data.total ?? 0) || 0);
      setModelReferenceSources(Array.isArray(response.data.source_summary) ? response.data.source_summary : []);
      setLoadedModelReferenceProviderId(normalizedProviderId);
    } catch (referenceError) {
      setModelReferences([]);
      setModelReferenceTotal(0);
      setModelReferenceSources([]);
      setLoadedModelReferenceProviderId('');
      setError(resolveUiErrorMessage(referenceError, aiText('error_load_model_references', 'Failed to load model reference data.')));
    } finally {
      setLoadingModelReferences(false);
    }
  }, [aiText]);

  useEffect(() => {
    if (!providerFormOpen) return;
    void loadModelReferences(modelReferenceProviderId);
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
    const modelIds = splitList(providerConnectionForm.modelIds);
    const imageOutputHosts = splitList(providerConnectionForm.imageOutputHosts);
    if (providerConnectionForm.imageResponseFormat === 'url' && !imageOutputHosts.length) {
      setError(aiText(
        'error_image_output_hosts_required',
        'Enter the exact image download host when the provider returns image URLs.'
      ));
      return;
    }
    if (!imageOutputHostsAreExact(imageOutputHosts)) {
      setError(aiText(
        'error_image_output_hosts_invalid',
        'Use exact host names only, without schemes, paths, ports, or wildcards.'
      ));
      return;
    }
    const modelConfig = {
      ...(modelIds.length ? { model_ids: modelIds, model_id: modelIds[0] } : {}),
      ...(providerConnectionForm.imageResponseFormat
        ? { image_response_format: providerConnectionForm.imageResponseFormat }
        : {}),
      ...(imageOutputHosts.length ? { image_output_hosts: imageOutputHosts } : {}),
    };
    const referenceLinks = providerReferenceLinksForForm(providerConnectionForm);
    const websiteUrl = externalUrlValue(referenceLinks.websiteUrl);
    const statusUrl = externalUrlValue(referenceLinks.statusUrl);
    const docsUrl = externalUrlValue(referenceLinks.docsUrl);
    setSavingConnection(true);
    setError('');
    setMessage('');
    try {
      const response = await aiResourcesClient.request<{
        connection_id?: string;
        receipt?: AdminMutationReceiptPayload | null;
      }>('/api/admin/provider-connections', {
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
      let successMessage = '';
      setMessage(aiText('message_connection_saved_testing', 'Provider connection saved. Running connection test now.'));
      try {
        await runProviderConnectionTest(savedConnectionId, { announce: false, reload: false });
        successMessage = aiText('message_connection_saved_and_tested', 'Provider connection saved and tested. Credential status is masked in this page.');
        setMessage(successMessage);
      } catch (testError) {
        testFailed = true;
        setError(
          aiText('message_connection_saved_test_failed', 'Provider connection saved, but the connection test failed: {{message}}', {
            message: resolveUiErrorMessage(testError, aiText('error_test_connection', 'Provider connection test failed.')),
          })
        );
      }
      await loadResources();
      if (!testFailed) {
        dispatchProviderWorkbench({ type: 'reset_after_save' });
        setMessage('');
        toast.success(successMessage, t('common.success'));
      }
    } catch (saveError) {
      setError(resolveUiErrorMessage(saveError, aiText('error_save_connection', 'Failed to save provider connection.')));
    } finally {
      setSavingConnection(false);
    }
  }

  async function deleteProviderConnection(connection: Connection) {
    if (connection.managed_by !== 'cloud_provider_connections') return;
    setDeletingConnectionId(connection.connection_id);
    setError('');
    setMessage('');
    try {
      const response = await aiResourcesClient.request<{ receipt?: AdminMutationReceiptPayload | null }>(
        `/api/admin/provider-connections/${encodeURIComponent(connection.connection_id)}`,
        {
          method: 'DELETE',
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
      await loadResources();
    } catch (deleteError) {
      const deleteMessage = resolveUiErrorMessage(deleteError, aiText('error_delete_connection', 'Failed to delete provider connection.'));
      setError(deleteMessage);
      toast.error(deleteMessage, t('common.error'));
    } finally {
      setDeletingConnectionId('');
    }
  }

  async function approveDetectedImageHost(connection: Connection) {
    const evidenceRunId = String(connection.image_delivery_repair?.run_id || '');
    if (!evidenceRunId) return;
    setApprovingImageHostConnectionId(connection.connection_id);
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
          body: { evidence_run_id: evidenceRunId },
        }
      );
      setLastReceipt(response.data.receipt || null);
      await loadResources();
      toast.success(
        aiText('image_host_repair_success', 'Exact image host approved. Retry the image generation request.'),
        t('common.success')
      );
    } catch (approvalError) {
      const approvalMessage = resolveUiErrorMessage(
        approvalError,
        aiText('image_host_repair_error', 'Failed to approve the detected image host.')
      );
      setError(approvalMessage);
      toast.error(approvalMessage, t('common.error'));
    } finally {
      setApprovingImageHostConnectionId('');
    }
  }

  async function syncModelReferencesForProvider(
    providerId: string,
    options: { announce?: boolean } = {}
  ): Promise<void> {
    const normalizedProviderId = providerId.trim().toLowerCase();
    if (!normalizedProviderId || normalizedProviderId === 'custom') return;
    setSyncingModelReferences(true);
    setModelReferenceAutoSyncError('');
    try {
      await aiResourcesClient.request<unknown>('/api/admin/model-references/sync', {
        method: 'POST',
        body: {},
      });
      await loadModelReferences(normalizedProviderId);
      if (options.announce) {
        const successMessage = aiText('message_model_references_synced', 'Model reference data synced. It is reference-only and does not change billing or routing.');
        setMessage('');
        toast.success(successMessage, t('common.success'));
      }
    } finally {
      setSyncingModelReferences(false);
    }
  }

  async function fetchProviderCatalogPreview() {
    const normalizedConnectionId = providerConnectionForm.connectionId || slugifyProviderValue(providerConnectionForm.displayName || providerConnectionForm.providerId);
    const normalizedProviderId = providerConnectionForm.providerId || slugifyProviderValue(providerConnectionForm.displayName || providerConnectionForm.connectionId);
    const modelIds = splitList(providerConnectionForm.modelIds);
    const imageOutputHosts = splitList(providerConnectionForm.imageOutputHosts);
    if (providerConnectionForm.imageResponseFormat === 'url' && !imageOutputHosts.length) {
      setError(aiText(
        'error_image_output_hosts_required',
        'Enter the exact image download host when the provider returns image URLs.'
      ));
      return;
    }
    if (!imageOutputHostsAreExact(imageOutputHosts)) {
      setError(aiText(
        'error_image_output_hosts_invalid',
        'Use exact host names only, without schemes, paths, ports, or wildcards.'
      ));
      return;
    }
    const modelConfig = {
      ...(modelIds.length ? { model_ids: modelIds, model_id: modelIds[0] } : {}),
      ...(providerConnectionForm.imageResponseFormat
        ? { image_response_format: providerConnectionForm.imageResponseFormat }
        : {}),
      ...(imageOutputHosts.length ? { image_output_hosts: imageOutputHosts } : {}),
    };
    const referenceLinks = providerReferenceLinksForForm(providerConnectionForm);
    const websiteUrl = externalUrlValue(referenceLinks.websiteUrl);
    const statusUrl = externalUrlValue(referenceLinks.statusUrl);
    const docsUrl = externalUrlValue(referenceLinks.docsUrl);
    if (!providerConnectionForm.credential.trim() && providerFormMode === 'create') {
      setError(aiText('error_fetch_catalog_credential_required', 'Enter an API key before fetching upstream models. Existing saved credentials are not returned to the browser.'));
      return;
    }
    setFetchingProviderCatalog(true);
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
      if (!splitList(providerConnectionForm.modelIds).length && verifiedModelIds.length) {
        setProviderModelIds(verifiedModelIds);
      }
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
      let referenceSyncFailed = '';
      try {
        await syncModelReferencesForProvider(referenceProviderId);
      } catch (syncError) {
        referenceSyncFailed = resolveUiErrorMessage(
          syncError,
          aiText('error_sync_model_references', 'Failed to sync model reference data.')
        );
        setModelReferenceAutoSyncError(referenceSyncFailed);
        await loadModelReferences(referenceProviderId);
      }
      const catalogMessage = aiText(
        referenceSyncFailed ? 'message_catalog_fetched_reference_failed' : 'message_catalog_and_references_synced',
        referenceSyncFailed
          ? 'Fetched {{count}} upstream models. Reference intelligence refresh failed; saved models and runtime calls are not affected.'
          : 'Fetched {{count}} upstream models and refreshed reference intelligence.',
        {
          count: String(preview.model_count || preview.model_ids?.length || 0),
        }
      );
      setMessage('');
      if (referenceSyncFailed) {
        toast.error(catalogMessage, t('common.error'));
      } else {
        toast.success(catalogMessage, t('common.success'));
      }
    } catch (catalogError) {
      setError(resolveUiErrorMessage(catalogError, aiText('error_fetch_catalog', 'Failed to fetch upstream models.')));
    } finally {
      setFetchingProviderCatalog(false);
    }
  }

  async function syncModelReferences() {
    setError('');
    setMessage('');
    try {
      const effectiveReferenceProviderId = inferReferenceProviderFromModelIds(
        splitList(providerConnectionForm.modelIds),
        modelReferenceProviderId
      );
      if (effectiveReferenceProviderId !== modelReferenceProviderId) {
        dispatchProviderWorkbench({
          type: 'set_reference_provider',
          providerId: effectiveReferenceProviderId,
        });
      }
      await syncModelReferencesForProvider(effectiveReferenceProviderId, {
        announce: true,
      });
    } catch (syncError) {
      const effectiveReferenceProviderId = inferReferenceProviderFromModelIds(
        splitList(providerConnectionForm.modelIds),
        modelReferenceProviderId
      );
      await loadModelReferences(effectiveReferenceProviderId);
      const syncMessage = resolveUiErrorMessage(syncError, aiText('error_sync_model_references', 'Failed to sync model reference data.'));
      setModelReferenceAutoSyncError(syncMessage);
      toast.error(syncMessage, t('common.error'));
    }
  }

  const autoSyncModelReferences = useCallback(async (providerId: string) => {
    setAutoSyncingModelReferences(true);
    setModelReferenceAutoSyncError('');
    try {
      await aiResourcesClient.request<unknown>('/api/admin/model-references/sync', {
        method: 'POST',
        body: {},
      });
      await loadModelReferences(providerId);
    } catch (syncError) {
      await loadModelReferences(providerId);
      setModelReferenceAutoSyncError(
        resolveUiErrorMessage(
          syncError,
          aiText('model_reference_status_auto_sync_failed', 'Reference intelligence auto sync failed. Saved models and runtime calls are not affected.')
        )
      );
    } finally {
      setAutoSyncingModelReferences(false);
    }
  }, [aiText, loadModelReferences]);

  async function runProviderConnectionTest(
    connectionId: string,
    options: { announce?: boolean; reload?: boolean } = {}
  ) {
    const announce = options.announce !== false;
    const reload = options.reload !== false;
    setTestingConnectionId(connectionId);
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
      if (result?.connection_id) {
        setConnectionTestResults((current) => ({
          ...current,
          [result.connection_id]: result,
        }));
      }
      if (announce) {
        setLastReceipt(result.receipt || null);
        const successMessage = result ? providerTestMessage(result) : aiText('message_connection_tested', 'Provider connection tested.');
        setMessage('');
        toast.success(successMessage, t('common.success'));
      }
      if (reload) {
        await loadResources();
      }
      return result;
    } catch (testError) {
      const result = providerConnectionTestResultFromError(testError);
      if (result?.connection_id) {
        setConnectionTestResults((current) => ({
          ...current,
          [result.connection_id]: result,
        }));
      }
      if (announce) {
        setLastReceipt(result?.receipt || null);
        const testMessage = resolveUiErrorMessage(
          testError,
          result?.message || aiText('error_test_connection', 'Provider connection test failed.')
        );
        setError(testMessage);
        toast.error(testMessage, t('common.error'));
      }
      throw testError;
    } finally {
      setTestingConnectionId('');
    }
  }

  function openNewProviderConnection() {
    setConfirmingDeleteConnectionId('');
    setProviderWorkbenchSection('connection');
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
    setProviderWorkbenchSection('connection');
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

  function addProviderModelIds(modelIds: string[]) {
    setProviderModelIds([...splitList(providerConnectionForm.modelIds), ...modelIds]);
  }

  function removeProviderModelId(modelId: string) {
    setProviderModelIds(splitList(providerConnectionForm.modelIds).filter((item) => item !== modelId));
  }

  function addCustomProviderModels() {
    const modelIds = splitList(customModelInput);
    if (!modelIds.length) return;
    addProviderModelIds(modelIds);
    dispatchProviderWorkbench({ type: 'set_custom_model_input', value: '' });
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
        modelIds: preset.modelIds,
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
      'provider runtime configuration is present': aiText('test_message_runtime_config_ready', 'Provider runtime configuration is ready.'),
      'provider kind is not supported by the runtime adapter registry': aiText(
        'test_message_unsupported_kind',
        'This provider kind is not supported by the runtime adapter registry.'
      ),
      'provider catalog returned no usable models': aiText('test_message_catalog_empty', 'Provider catalog returned no usable models.'),
      'provider connection is ready': aiText('test_message_ready', 'Provider connection is ready.'),
      'web search reader returned no readable content': aiText('test_message_web_search_reader_empty', 'Reader provider returned no readable content.'),
      'web search reader base URL is missing': aiText('test_message_web_search_reader_missing_base_url', 'Reader provider base URL is missing.'),
    };
    return messages[normalizedMessage] || normalizedMessage || aiText('message_connection_tested', 'Provider connection tested.');
  }, [aiText]);

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
        || (connectionStatusFilter === 'attention' && (connection.attention_required ?? connection.status !== 'ready'))
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
  const providerFormExternalLinkItems = providerExternalLinkItems(
    providerReferenceLinksForForm(providerConnectionForm)
  );

  const selectedModelLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const modelId of selectedProviderModelIds) {
      for (const key of modelLookupKeys(modelId, modelReferenceProviderId)) {
        if (!lookup.has(key)) {
          lookup.set(key, modelId);
        }
      }
    }
    return lookup;
  }, [modelReferenceProviderId, selectedProviderModelIds]);

  const selectedModelMetadataGapCount = useMemo(
    () => selectedProviderModelIds.filter((modelId) => !hasModelMetadataFor(
      modelId,
      modelReferenceProviderId,
      modelReferences
    )).length,
    [modelReferenceProviderId, modelReferences, selectedProviderModelIds]
  );
  const modelsDevReferenceSource = useMemo(
    () => modelReferenceSources.find((source) => source.source_id === 'models.dev') || null,
    [modelReferenceSources]
  );

  useEffect(() => {
    const normalizedProviderId = modelReferenceProviderId.trim().toLowerCase();
    if (!providerFormOpen) return;
    if (!normalizedProviderId || normalizedProviderId === 'custom') return;
    if (loadedModelReferenceProviderId !== normalizedProviderId) return;
    if (loadingModelReferences || syncingModelReferences || autoSyncingModelReferences) return;
    if (!modelReferenceSourceNeedsSync(modelsDevReferenceSource, modelReferenceTotal)) return;
    if (autoSyncedReferenceProviders.current.has(normalizedProviderId)) return;
    autoSyncedReferenceProviders.current.add(normalizedProviderId);
    void autoSyncModelReferences(normalizedProviderId);
  }, [
    autoSyncModelReferences,
    autoSyncingModelReferences,
    loadedModelReferenceProviderId,
    loadingModelReferences,
    modelReferenceProviderId,
    modelReferenceTotal,
    modelsDevReferenceSource,
    providerFormOpen,
    syncingModelReferences,
  ]);

  const modelReferenceCompactStatusText = useMemo(() => {
    if (autoSyncingModelReferences) {
      return aiText('model_reference_compact_auto_syncing', 'reference syncing');
    }
    if (loadingModelReferences) {
      return aiText('model_reference_compact_loading', 'reference loading');
    }
    if (modelsDevReferenceSource?.status === 'error' || modelReferenceAutoSyncError) {
      return aiText('model_reference_compact_failed', 'reference sync failed');
    }
    if (modelsDevReferenceSource?.last_synced_at || modelReferenceTotal > 0) {
      return aiText('model_reference_compact_synced', 'reference synced');
    }
    return aiText('model_reference_compact_not_synced', 'reference not synced');
  }, [
    aiText,
    autoSyncingModelReferences,
    loadingModelReferences,
    modelReferenceAutoSyncError,
    modelReferenceTotal,
    modelsDevReferenceSource,
  ]);
  const modelReferenceHasSyncError = Boolean(
    modelReferenceAutoSyncError || modelsDevReferenceSource?.status === 'error'
  );

  const modelVisibilityRows = useMemo<ModelVisibilityRow[]>(() => {
    const rows = new Map<string, ModelVisibilityRow>();

    for (const reference of modelReferences) {
      const selectedModelId = selectedModelIdFor(
        reference.model_id,
        reference.provider_id || modelReferenceProviderId,
        selectedProviderModelIds,
        selectedModelLookup
      );
      const rowModelId = selectedModelId || reference.model_id;
      rows.set(rowModelId, {
        modelId: rowModelId,
        family: reference.family || reference.source_label,
        feature: reference.feature,
        sourceLabel: reference.source_label,
        sourceKind: 'reference',
        selected: Boolean(selectedModelId),
        verified: false,
        deprecated: reference.is_deprecated,
        reference,
      });
    }

    for (const model of providerCatalogPreview?.models || []) {
      const selectedModelId = selectedModelIdFor(
        model.model_id,
        modelReferenceProviderId,
        selectedProviderModelIds,
        selectedModelLookup
      );
      const rowModelId = selectedModelId || model.model_id;
      const existing = rows.get(rowModelId);
      rows.set(rowModelId, {
        modelId: rowModelId,
        family: existing?.family || model.family,
        feature: existing?.feature || catalogDisplayFeature(model.model_id, model.feature),
        sourceLabel: existing?.sourceLabel || aiText('model_source_upstream', 'Upstream catalog'),
        sourceKind: existing?.sourceKind || 'catalog',
        selected: Boolean(selectedModelId),
        verified: model.verified || existing?.verified || false,
        deprecated: model.is_deprecated || existing?.deprecated || false,
        reference: existing?.reference,
        catalog: model,
      });
    }

    for (const modelId of selectedProviderModelIds) {
      if (!rows.has(modelId)) {
        rows.set(modelId, {
          modelId,
          family: aiText('model_source_manual', 'Manually added'),
          feature: '',
          sourceLabel: aiText('model_source_enabled_only', 'Saved model ID only'),
          sourceKind: 'manual',
          selected: true,
          verified: false,
          deprecated: false,
        });
      }
    }

    const normalizedSearch = modelReferenceSearch.trim().toLowerCase();
    return Array.from(rows.values())
      .filter((row) => {
        if (!modelReferenceShowDeprecated && row.deprecated && !row.selected) return false;
        if (modelReferenceVisibilityFilter === 'enabled' && !row.selected) return false;
        if (modelReferenceVisibilityFilter === 'disabled' && row.selected) return false;
        if (modelReferenceIntelligenceFilter === 'missing' && row.reference) return false;
        if (modelReferenceFeatureFilter !== 'all' && normalizeModelReferenceFeature(row.feature) !== modelReferenceFeatureFilter) {
          return false;
        }
        if (normalizedSearch && !modelReferenceSearchText(row).includes(normalizedSearch)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        if (left.selected !== right.selected) return left.selected ? -1 : 1;
        if (left.deprecated !== right.deprecated) return left.deprecated ? 1 : -1;
        return left.modelId.localeCompare(right.modelId);
      });
  }, [
    aiText,
    modelReferenceFeatureFilter,
    modelReferenceIntelligenceFilter,
    modelReferenceSearch,
    modelReferenceShowDeprecated,
    modelReferenceVisibilityFilter,
    modelReferenceProviderId,
    modelReferences,
    providerCatalogPreview,
    selectedModelLookup,
    selectedProviderModelIds,
  ]);

  const availableModelCount = Math.max(
    modelReferenceTotal,
    Number(providerCatalogPreview?.model_count ?? 0) || 0,
    modelVisibilityRows.length,
    selectedProviderModelIds.length
  );
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
    .filter((row) => !row.selected && !row.deprecated)
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
      && (connection.attention_required ?? connection.status !== 'ready')
  ).length;
  const latestModelSupplierTestAt = data.connections
    .filter(
      (connection) =>
        supplierCategory(connection) === 'ai' &&
        connection.last_tested_at &&
        !Number.isNaN(Date.parse(connection.last_tested_at))
    )
    .sort(
      (left, right) =>
        Date.parse(String(right.last_tested_at)) - Date.parse(String(left.last_tested_at))
    )[0]?.last_tested_at;
  return (
    <BackofficePageStack>
      <BackofficePageHeader
        eyebrow={aiText('eyebrow', 'Runtime plane')}
        title={aiText('title', 'Model suppliers')}
        description={aiText('description', 'Manage Cloud runtime model-provider connections and model visibility. Search, image, and vector services use their dedicated fixed-configuration pages.')}
        secondaryAction={(
          <Link href="/admin/runtime-profiles" className="btn btn-secondary justify-center">
            {aiText('action_open_runtime_profiles', 'Open runtime profiles')}
          </Link>
        )}
        primaryAction={(
          <button type="button" className="btn btn-primary justify-center" onClick={openNewProviderConnection}>
            {aiText('action_add_model_supplier', 'Add model supplier')}
          </button>
        )}
        summaryItems={[
          {
            label: aiText('overview_model_suppliers', 'Model suppliers'),
            value: `${readyModelSupplierCount}/${modelSupplierCount}`,
          },
          {
            label: aiText('overview_attention_suppliers', 'Needs attention'),
            value: attentionSupplierCount,
            toneClassName: attentionSupplierCount > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: aiText('last_test', 'Last test'),
            value: latestModelSupplierTestAt ? formatDate(latestModelSupplierTestAt) : '—',
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

        <ProviderConnectionDialog
          open={providerFormOpen}
          title={providerDialogTitle}
          titleId="provider-channel-dialog-title"
          message={message}
          error={error}
          saving={savingConnection}
          closeLabel={aiText('action_close_dialog', 'Close')}
          cancelLabel={aiText('action_cancel', 'Cancel')}
          saveLabel={aiText('action_save_and_test_connection', 'Save and test')}
          savingLabel={aiText('saving', 'Saving...')}
          footerNotice={aiText('save_test_notice', 'Saving will immediately run a masked provider test. Secrets are never returned to the browser.')}
          density="compact"
          contentMode={providerWorkbenchSection === 'models' ? 'contained' : 'scroll'}
          onClose={closeProviderForm}
          onSubmit={() => void saveProviderConnection()}
        >
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
                </div>
                {providerWorkbenchSection === 'connection' ? (
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
                            connectionId: providerConnectionForm.connectionId ? providerConnectionForm.connectionId : slugifyProviderValue(displayName),
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
                        {aiText('action_manage_models', 'Manage models')}
                      </button>
                    )}
                  />
                  {providerUsesImageGeneration ? (
                    <>
                      <AdminConfigurationRow
                        rowId="image-response-format"
                        label={aiText('image_delivery_row_label', 'Image delivery')}
                        value={(
                          <select
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            value={providerConnectionForm.imageResponseFormat}
                            onChange={(event) => updateProviderConnectionForm({ imageResponseFormat: event.target.value })}
                            aria-label={aiText('field_image_response_format', 'Provider image response')}
                          >
                            <option value="">{aiText('image_response_provider_default', 'Provider default')}</option>
                            <option value="url">{aiText('image_response_url', 'Image URL')}</option>
                            <option value="b64_json">{aiText('image_response_base64', 'Base64 image')}</option>
                          </select>
                        )}
                        detail={(
                          <span className="grid gap-0.5">
                            {!providerConnectionForm.imageResponseFormat && !splitList(providerConnectionForm.imageOutputHosts).length ? (
                              <span className="font-medium text-amber-700 dark:text-amber-300">
                                {aiText('image_delivery_unconfirmed_compact', 'Delivery format not confirmed')}
                              </span>
                            ) : (
                              <span>{aiText('status_configured', 'Configured')}</span>
                            )}
                            <span>{aiText('image_delivery_test_not_proof_compact', 'Connection testing does not prove image delivery.')}</span>
                          </span>
                        )}
                      />
                      {providerConnectionForm.imageResponseFormat === 'url' ? (
                        <AdminConfigurationRow
                          rowId="image-output-hosts"
                          label={aiText('field_image_output_hosts', 'Image download hosts')}
                          value={(
                            <input
                              className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              value={providerConnectionForm.imageOutputHosts}
                              onChange={(event) => updateProviderConnectionForm({ imageOutputHosts: event.target.value })}
                              placeholder="images.provider.example, assets.provider.example"
                              aria-label={aiText('field_image_output_hosts', 'Exact image download hosts')}
                              required
                            />
                          )}
                          detail={aiText(
                            'image_delivery_security_note_compact',
                            'URL mode accepts exact hosts only; no scheme, path, port, or wildcard.'
                          )}
                        />
                      ) : null}
                    </>
                  ) : null}
                </AdminConfigurationTable>
                ) : null}

                {providerWorkbenchSection === 'models' ? (
                <section className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{aiText('model_visibility_title', 'Model visibility')}</h3>
                        <p className="sr-only">
                          {aiText('model_visibility_allowlist_desc', 'Only enabled models in this list can enter hosted runtime profile candidate chains or be used by Cloud runtime.')}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                          <span>{aiText('model_visibility_enabled_available', 'Enabled {{enabled}} / available {{available}}', {
                            enabled: String(selectedProviderModelIds.length),
                            available: String(availableModelCount),
                          })}</span>
                          {selectedModelMetadataGapCount ? (
                            <button
                              type="button"
                              data-ui="model-metadata-gap-filter"
                              aria-pressed={modelReferenceIntelligenceFilter === 'missing'}
                              className={`rounded-full px-2 py-1 font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                                modelReferenceIntelligenceFilter === 'missing'
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                                  : 'text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/60'
                              }`}
                              onClick={() => dispatchProviderWorkbench({
                                type: 'set_reference_intelligence_filter',
                                filter: modelReferenceIntelligenceFilter === 'missing' ? 'all' : 'missing',
                              })}
                            >
                              {modelReferenceIntelligenceFilter === 'missing'
                                ? aiText('action_show_all_models', 'Show all models')
                                : aiText('model_metadata_gap_action', '{{count}} need intelligence →', {
                                  count: String(selectedModelMetadataGapCount),
                                })}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                          <div data-ui="model-visibility-status">
                            {aiText('model_reference_last_synced', 'Last synced {{time}}', {
                              time: modelsDevReferenceSource?.last_synced_at
                                ? formatDate(modelsDevReferenceSource.last_synced_at)
                                : aiText('status_not_synced', 'Not synced'),
                            })}
                          </div>
                          {loadingModelReferences || autoSyncingModelReferences || modelReferenceHasSyncError ? (
                            <div className={`mt-0.5 ${modelReferenceHasSyncError ? 'text-amber-700 dark:text-amber-300' : ''}`}>
                              {modelReferenceCompactStatusText}
                            </div>
                          ) : null}
                          {modelReferenceHasSyncError ? (
                            <button
                              type="button"
                              data-ui="model-reference-retry"
                              className="mt-0.5 font-semibold text-amber-700 hover:underline disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-300"
                              disabled={syncingModelReferences || autoSyncingModelReferences || loadingModelReferences || savingConnection}
                              onClick={() => void syncModelReferences()}
                            >
                              {syncingModelReferences || autoSyncingModelReferences
                                ? aiText('action_syncing_model_references', 'Syncing...')
                                : aiText('action_sync_model_references', 'Retry intelligence only')}
                            </button>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          data-ui="model-sync-primary"
                          className="btn btn-secondary h-10 shrink-0 px-3"
                          disabled={fetchingProviderCatalog || syncingModelReferences || autoSyncingModelReferences || savingConnection}
                          onClick={() => void fetchProviderCatalogPreview()}
                        >
                          {fetchingProviderCatalog || syncingModelReferences
                            ? aiText('action_fetching_upstream_models', 'Syncing...')
                            : aiText('action_fetch_upstream_models', 'Sync models and intelligence')}
                        </button>
                      </div>
                    </div>

                    <div data-ui="model-visibility-toolbar" className="flex flex-wrap items-center gap-2">
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

                    <details data-ui="model-maintenance-table" className="border-t border-slate-200 pt-2 dark:border-slate-800">
                      <summary className="cursor-pointer py-1 text-sm font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white">
                        {aiText('model_maintenance_disclosure', 'Manual and batch operations')}
                      </summary>
                      <div className="mt-2">
                        <AdminConfigurationTable
                        ariaLabel={aiText('model_maintenance_table_label', 'Model maintenance')}
                        itemHeading={aiText('configuration_item_heading', 'Setting')}
                        valueHeading={aiText('configuration_value_heading', 'Current setting')}
                        detailHeading={aiText('configuration_detail_heading', 'Action / note')}
                      >
                        {referenceProviderCanBeChanged ? (
                          <AdminConfigurationRow
                            rowId="model-reference-provider"
                            label={aiText('field_reference_provider', 'Reference source')}
                            value={(
                              <select
                                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                value={modelReferenceProviderId}
                                onChange={(event) => dispatchProviderWorkbench({
                                  type: 'set_reference_provider',
                                  providerId: event.target.value,
                                })}
                                aria-label={aiText('field_reference_provider', 'Reference source')}
                              >
                                {modelReferenceProviderOptions.map((providerId) => (
                                  <option key={providerId} value={providerId}>
                                    {referenceProviderLabel(providerId)}
                                  </option>
                                ))}
                              </select>
                            )}
                            detail={aiText('reference_provider_desc', 'Only compatible or custom channels need this. Clear provider types automatically use their own reference intelligence.')}
                          />
                        ) : null}
                        <AdminConfigurationRow
                          rowId="historical-model-visibility"
                          label={aiText('historical_models_label', 'Historical models')}
                          value={modelReferenceShowDeprecated
                            ? aiText('status_included', 'Included')
                            : aiText('status_hidden', 'Hidden')}
                          detail={(
                            <label className="inline-flex min-h-8 items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={modelReferenceShowDeprecated}
                                onChange={(event) => dispatchProviderWorkbench({
                                  type: 'set_show_deprecated',
                                  show: event.target.checked,
                                })}
                              />
                              {aiText('field_show_deprecated_models_compact', 'Include historical/deprecated')}
                            </label>
                          )}
                        />
                        <AdminConfigurationRow
                          rowId="manual-model-add"
                          label={aiText('manual_model_add_title', 'Add model ID manually')}
                          value={(
                            <div className="flex items-center gap-2">
                              <input
                                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                value={customModelInput}
                                onChange={(event) => dispatchProviderWorkbench({
                                  type: 'set_custom_model_input',
                                  value: event.target.value,
                                })}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addCustomProviderModels();
                                  }
                                }}
                                placeholder={aiText('placeholder_add_custom_models', 'Add specified models, separated by commas')}
                                aria-label={aiText('manual_model_add_title', 'Add model ID manually')}
                              />
                              <button
                                type="button"
                                className="btn btn-secondary h-9 shrink-0 px-3"
                                disabled={!customModelInput.trim()}
                                onClick={addCustomProviderModels}
                              >
                                {aiText('action_add_model', 'Add')}
                              </button>
                            </div>
                          )}
                          detail={aiText('manual_model_add_desc', 'Use this only for models missing from the upstream catalog. Manual-only rows can be removed from the list.')}
                        />
                        <AdminConfigurationRow
                          rowId="filtered-model-batch"
                          label={aiText('filtered_models_batch_label', 'Filtered results')}
                          value={aiText('filtered_models_batch_count', '{{count}} matching models', {
                            count: String(modelVisibilityRows.length),
                          })}
                          detail={confirmingModelBatch ? (
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
                                disabled={!filteredEnableModelIds.length || savingConnection}
                                onClick={() => dispatchProviderWorkbench({ type: 'set_confirming_model_batch', batch: 'enable' })}
                              >
                                {aiText('action_enable_filtered_models', 'Enable matching')}
                              </button>
                              <button
                                type="button"
                                data-ui="model-filtered-disable-request"
                                className="font-semibold text-slate-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300"
                                disabled={!filteredDisableModelIds.length || savingConnection}
                                onClick={() => dispatchProviderWorkbench({ type: 'set_confirming_model_batch', batch: 'disable' })}
                              >
                                {aiText('action_disable_filtered_models', 'Disable matching')}
                              </button>
                            </span>
                          )}
                        />
                        <AdminConfigurationRow
                          rowId="enabled-model-bulk-maintenance"
                          label={aiText('enabled_models_maintenance_label', 'Enabled models')}
                          value={aiText('model_catalog_enabled_count_short', '{{count}} models', {
                            count: String(selectedProviderModelIds.length),
                          })}
                          detail={confirmingClearModels ? (
                            <span className="grid gap-2">
                              <span className="text-rose-700 dark:text-rose-300">
                                {aiText('clear_all_models_confirmation', 'Disable all {{count}} currently enabled models?', {
                                  count: String(selectedProviderModelIds.length),
                                })}
                              </span>
                              <span className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  data-ui="model-clear-all-confirm"
                                  className="font-semibold text-rose-700 hover:underline dark:text-rose-300"
                                  onClick={() => setProviderModelIds([])}
                                >
                                  {aiText('action_confirm_clear_all_models', 'Confirm clear')}
                                </button>
                                <button
                                  type="button"
                                  className="font-semibold text-slate-600 hover:underline dark:text-slate-300"
                                  onClick={() => dispatchProviderWorkbench({
                                    type: 'set_confirming_clear_models',
                                    confirming: false,
                                  })}
                                >
                                  {aiText('action_cancel', 'Cancel')}
                                </button>
                              </span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              data-ui="model-clear-all-request"
                              className="font-semibold text-rose-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
                              disabled={!selectedProviderModelIds.length || savingConnection}
                              onClick={() => dispatchProviderWorkbench({
                                type: 'set_confirming_clear_models',
                                confirming: true,
                              })}
                            >
                              {aiText('action_clear_all_models', 'Clear all')}
                            </button>
                          )}
                        />
                        </AdminConfigurationTable>
                      </div>
                    </details>

                    {loadingModelReferences ? (
                        <div
                          data-surface-state="loading"
                          className="border-y border-slate-200 bg-slate-50/60 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400"
                        >
                          {aiText('loading_model_references', 'Loading model reference data...')}
                        </div>
                      ) : modelVisibilityRows.length ? (
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
                                <th className="px-3 py-2 font-semibold">{aiText('column_model_intelligence', 'Intelligence')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {modelVisibilityPageRows.map((row) => {
                                const tags = row.reference ? modelReferenceCapabilityTags(row.reference) : [];
                                const tagLabels = tags.map(modelReferenceCapabilityLabel);
                                const visibleTagLabels = tagLabels.slice(0, 3);
                                const canRemoveManualModel = row.sourceKind === 'manual' && row.selected;
                                const deprecatedEnableBlocked = row.deprecated && !row.selected;
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
                                const referenceHasContext = Boolean(
                                  row.reference
                                  && (typeof row.reference.context_window === 'number' || typeof row.reference.output_limit === 'number')
                                );
                                const referenceHasPriceValue = Boolean(row.reference && hasReferencePrice(row.reference));
                                return (
                                  <tr key={row.modelId} className="group">
                                    <td className="px-3 py-2">
                                      <div className="flex flex-col gap-1">
                                        <button
                                          type="button"
                                          className={`inline-flex w-fit rounded-full px-2 py-1 text-[11px] font-semibold transition ${
                                          row.selected
                                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'
                                        } hover:ring-2 hover:ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:ring-slate-700`}
                                          aria-pressed={row.selected}
                                          disabled={deprecatedEnableBlocked}
                                          title={
                                            deprecatedEnableBlocked
                                              ? aiText('action_enable_deprecated_model_blocked', 'Deprecated models cannot be newly enabled')
                                              : row.selected
                                                ? aiText('action_disable_catalog_model', 'Disable')
                                                : aiText('action_enable_catalog_model', 'Enable')
                                          }
                                          onClick={() => {
                                            if (row.selected) {
                                              removeProviderModelId(row.modelId);
                                            } else if (!row.deprecated) {
                                              setProviderModelIds([...selectedProviderModelIds, row.modelId]);
                                            }
                                          }}
                                        >
                                          {row.selected
                                            ? aiText('status_model_enabled', 'Enabled')
                                            : deprecatedEnableBlocked
                                              ? aiText('status_model_deprecated_disabled', 'Deprecated')
                                              : aiText('status_model_disabled', 'Not enabled')}
                                        </button>
                                        {row.deprecated ? (
                                          <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                            {aiText('catalog_model_deprecated', 'deprecated')}
                                          </span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-semibold text-slate-900 dark:text-white">{row.modelId}</div>
                                      <div className="text-slate-500 dark:text-slate-400">
                                        {row.family}
                                        {row.sourceKind === 'manual' ? ` · ${row.sourceLabel}` : ''}
                                        {row.verified ? ` · ${aiText('catalog_model_status_upstream_available', 'Upstream available')}` : ''}
                                        {row.reference?.override_present ? ` · ${aiText('model_reference_override', 'manual override')}` : ''}
                                      </div>
                                      {row.deprecated && row.selected ? (
                                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                          {aiText('deprecated_selected_model_hint', 'Deprecated model is kept only because it is already saved. Remove it before saving new model visibility choices.')}
                                        </div>
                                      ) : null}
                                      {canRemoveManualModel ? (
                                        <button
                                          type="button"
                                          className="mt-1 text-xs font-semibold text-slate-500 opacity-0 underline-offset-2 transition hover:text-rose-700 hover:underline focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-slate-400 dark:hover:text-rose-300"
                                          aria-label={aiText('action_remove_model_named', 'Remove {{name}}', { name: row.modelId })}
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
                                      {tagLabels.length ? (
                                        <div
                                          className="mt-1 max-w-[16rem] truncate text-slate-500 dark:text-slate-400"
                                          title={tagLabels.join(' · ')}
                                        >
                                          {visibleTagLabels.join(' · ')}
                                          {tagLabels.length > visibleTagLabels.length ? ` · +${tagLabels.length - visibleTagLabels.length}` : ''}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                      {row.reference ? (
                                        <details data-ui="model-reference-details">
                                          <summary className="cursor-pointer font-semibold text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white">
                                            {referenceHasContext
                                              ? referenceContext
                                              : aiText('model_reference_recorded', 'Reference available')}
                                            <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">
                                              · {referenceHasPriceValue
                                                ? aiText('model_reference_price_available', 'priced')
                                                : aiText('model_reference_price_missing_compact', 'no price')}
                                            </span>
                                          </summary>
                                          <div className="mt-2 grid gap-1 border-l border-slate-200 pl-3 text-[11px] leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                            <div>
                                              <span className="font-semibold">{aiText('column_context_output', 'Context / output')}：</span>
                                              <span title={row.reference ? formatReferenceContextTitle(row.reference) : undefined}>{referenceContext}</span>
                                            </div>
                                            <div>
                                              <span className="font-semibold">{aiText('column_reference_price', 'Reference price')}：</span>
                                              <span>{referencePrice}</span>
                                            </div>
                                          </div>
                                        </details>
                                      ) : (
                                        <span className="font-medium text-amber-700 dark:text-amber-300">
                                          {aiText('model_reference_needs_intelligence', 'Needs intelligence')}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            </table>
                          </div>
                          <div
                            data-ui="model-visibility-pagination"
                            className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                          >
                            <span>
                              {aiText(
                                'model_visibility_page_summary',
                                'Showing {{shown}} of {{total}} matching models · {{enabled}} enabled',
                                {
                                  shown: String(modelVisibilityPageRows.length),
                                  total: String(modelVisibilityRows.length),
                                  enabled: String(selectedProviderModelIds.length),
                                }
                              )}
                            </span>
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
                        </div>
                      ) : (
                        <AdminEmptyState>
                          {aiText('model_visibility_empty', 'No models match the current filters. Sync a catalog, sync reference intelligence, or add a model manually.')}
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
          testingConnectionId={testingConnectionId}
          approvingImageHostConnectionId={approvingImageHostConnectionId}
          deletingConnectionId={deletingConnectionId}
          confirmingDeleteConnectionId={confirmingDeleteConnectionId}
          providerKindLabel={providerKindLabel}
          providerTestStageLabel={providerTestStageLabel}
          providerTestMessage={providerTestMessage}
          referenceLinksForConnection={connectionExternalLinkItems}
          onConfigure={editProviderConnection}
          onTest={(connectionId) => void runProviderConnectionTest(connectionId)}
          onApproveImageHost={(connection) => void approveDetectedImageHost(connection)}
          onDelete={(connection) => void deleteProviderConnection(connection)}
          onRequestDelete={setConfirmingDeleteConnectionId}
          onCancelDelete={() => setConfirmingDeleteConnectionId('')}
          translate={aiText}
        />

      <Modal
        isOpen={receiptDetailsOpen && Boolean(lastReceipt)}
        onClose={() => setReceiptDetailsOpen(false)}
        title={aiText('latest_operation_title', 'Latest operation')}
        description={aiText('latest_operation_desc', 'Audit evidence from the most recent supplier change in this session.')}
        size="lg"
      >
        <AdminMutationReceipt receipt={lastReceipt} title={aiText('latest_operation_receipt', 'Operation receipt')} />
      </Modal>

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
