import type {
  ModelReferenceFeatureFilter,
  ModelReferenceIntelligenceFilter,
  ModelReferenceVisibilityFilter,
  ProviderCatalogPreview,
  ProviderCatalogPreviewModel,
} from './provider-workbench-state';
import type { SupplierConnection } from './types';
import { modelIdentityKeys } from './model-reference-identity';

export type ModelReferenceEntry = {
  source_id: string;
  source_label: string;
  provider_id: string;
  provider_label: string;
  model_id: string;
  display_name: string;
  family: string;
  feature: string;
  status: string;
  modalities: { input?: string[]; output?: string[] };
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

export type ModelReferenceSourceSummary = {
  source_id: string;
  display_name: string;
  source_url: string;
  status: string;
  last_synced_at: string;
  last_error_code: string;
  last_error_message: string;
};

export type ModelVisibilityRow = {
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

export const MODEL_VISIBILITY_PAGE_SIZE = 25;

export function modelReferenceSourceNeedsSync(
  source: ModelReferenceSourceSummary | null,
  total: number
): boolean {
  if (total > 0) return false;
  if (!source) return true;
  if (source.last_synced_at) return false;
  return source.status !== 'active';
}

export function formatReferenceContext(
  reference: ModelReferenceEntry,
  missingLabel: string
): string {
  const contextWindow = typeof reference.context_window === 'number' ? reference.context_window : null;
  const outputLimit = typeof reference.output_limit === 'number' ? reference.output_limit : null;
  if (contextWindow === null && outputLimit === null) return missingLabel;
  return `${formatCompactTokenCount(contextWindow)} / ${formatCompactTokenCount(outputLimit)}`;
}

export function formatReferenceContextTitle(reference: ModelReferenceEntry): string {
  const contextWindow = typeof reference.context_window === 'number' ? reference.context_window : null;
  const outputLimit = typeof reference.output_limit === 'number' ? reference.output_limit : null;
  return `${formatRawTokenCount(contextWindow)} / ${formatRawTokenCount(outputLimit)} tokens`;
}

export function formatReferencePrice(
  reference: ModelReferenceEntry,
  cacheLabel: string,
  missingLabel: string
): string {
  if (!hasReferencePrice(reference)) return missingLabel;
  const input = typeof reference.price.input === 'number' ? `$${reference.price.input}` : '-';
  const output = typeof reference.price.output === 'number' ? `$${reference.price.output}` : '-';
  const cacheRead = typeof reference.price.cache_read === 'number' ? `$${reference.price.cache_read}` : '';
  const cacheWrite = typeof reference.price.cache_write === 'number' ? `$${reference.price.cache_write}` : '';
  const cache = cacheRead || cacheWrite
    ? ` · ${cacheLabel} ${cacheRead || '-'} / ${cacheWrite || '-'}`
    : '';
  return `${input} / ${output}${cache}`;
}

export function modelReferenceCapabilityTags(reference: ModelReferenceEntry): string[] {
  return [
    reference.capability_flags.reasoning ? 'reasoning' : '',
    reference.capability_flags.tool_call ? 'tool_call' : '',
    reference.capability_flags.structured_output ? 'structured_output' : '',
    reference.capability_flags.attachment ? 'attachment' : '',
    reference.capability_flags.open_weights ? 'open_weights' : '',
  ].filter(Boolean);
}

export function normalizeModelReferenceFeature(feature: string): ModelReferenceFeatureFilter {
  const normalized = feature.trim().toLowerCase();
  if (normalized.includes('image')) return 'image';
  if (normalized.includes('audio')) return 'audio';
  if (normalized.includes('video')) return 'video';
  if (normalized.includes('embedding') || normalized.includes('vector')) return 'embedding';
  if (normalized.includes('text')) return 'text';
  return 'all';
}

export function hasModelMetadataFor(
  modelId: string,
  providerId: string,
  references: ModelReferenceEntry[]
): boolean {
  const keys = modelIdentityKeys(modelId, providerId);
  return references.some((reference) => Array.from(
    modelIdentityKeys(reference.model_id, reference.provider_id || providerId)
  ).some((key) => keys.has(key)));
}

export function normalizeProviderCatalogPreview(value: unknown): ProviderCatalogPreview | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const models: ProviderCatalogPreviewModel[] = Array.isArray(record.models)
    ? record.models
      .map((model): ProviderCatalogPreviewModel => {
        const item = model && typeof model === 'object' ? model as Record<string, unknown> : {};
        return {
          model_id: String(item.model_id ?? ''),
          family: String(item.family ?? ''),
          feature: String(item.feature ?? ''),
          status: String(item.status ?? ''),
          is_deprecated: Boolean(item.is_deprecated),
          runtime_supported: Boolean(item.runtime_supported),
          verified: Boolean(item.verified),
          capability_tags: Array.isArray(item.capability_tags) ? item.capability_tags.map(String) : [],
        };
      })
      .filter((model) => model.model_id)
    : [];
  const modelIds = Array.isArray(record.model_ids)
    ? record.model_ids.map(String).filter(Boolean)
    : models.map((model) => model.model_id);
  if (!modelIds.length && !models.length) return null;
  return {
    provider_id: String(record.provider_id ?? ''),
    display_name: String(record.display_name ?? ''),
    adapter_type: String(record.adapter_type ?? ''),
    model_count: Number(record.model_count ?? modelIds.length) || modelIds.length,
    model_ids: modelIds,
    models,
    truncated: Boolean(record.truncated),
  };
}

export function catalogPreviewForMetadata(
  preview: ProviderCatalogPreview | null
): ProviderCatalogPreview | undefined {
  if (!preview) return undefined;
  return {
    ...preview,
    model_ids: [...preview.model_ids],
    models: (preview.models || []).map((model) => ({
      ...model,
      capability_tags: [...model.capability_tags],
    })),
  };
}

export function catalogPreviewFromConnection(
  connection: SupplierConnection
): ProviderCatalogPreview | null {
  return normalizeProviderCatalogPreview(
    connection.metadata?.model_catalog_preview || connection.metadata?.model_catalog
  );
}

export function buildModelVisibilityRows({
  references,
  catalogPreview,
  selectedModelIds,
  providerId,
  search,
  featureFilter,
  visibilityFilter,
  intelligenceFilter,
  showDeprecated,
  upstreamLabel,
  manualLabel,
  enabledOnlyLabel,
}: {
  references: ModelReferenceEntry[];
  catalogPreview: ProviderCatalogPreview | null;
  selectedModelIds: string[];
  providerId: string;
  search: string;
  featureFilter: ModelReferenceFeatureFilter;
  visibilityFilter: ModelReferenceVisibilityFilter;
  intelligenceFilter: ModelReferenceIntelligenceFilter;
  showDeprecated: boolean;
  upstreamLabel: string;
  manualLabel: string;
  enabledOnlyLabel: string;
}): ModelVisibilityRow[] {
  const selectedLookup = new Map<string, string>();
  for (const modelId of selectedModelIds) {
    for (const key of modelIdentityKeys(modelId, providerId)) {
      if (!selectedLookup.has(key)) selectedLookup.set(key, modelId);
    }
  }
  const selectedModelIdFor = (modelId: string, identityProviderId: string): string => {
    for (const key of modelIdentityKeys(modelId, identityProviderId)) {
      const selectedModelId = selectedLookup.get(key);
      if (selectedModelId) return selectedModelId;
    }
    return selectedModelIds.includes(modelId) ? modelId : '';
  };
  const rows = new Map<string, ModelVisibilityRow>();
  for (const reference of references) {
    const selectedModelId = selectedModelIdFor(
      reference.model_id,
      reference.provider_id || providerId
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
  for (const model of catalogPreview?.models || []) {
    const selectedModelId = selectedModelIdFor(model.model_id, providerId);
    const rowModelId = selectedModelId || model.model_id;
    const existing = rows.get(rowModelId);
    rows.set(rowModelId, {
      modelId: rowModelId,
      family: existing?.family || model.family,
      feature: existing?.feature || catalogDisplayFeature(model.model_id, model.feature),
      sourceLabel: existing?.sourceLabel || upstreamLabel,
      sourceKind: existing?.sourceKind || 'catalog',
      selected: Boolean(selectedModelId),
      verified: model.verified || existing?.verified || false,
      deprecated: model.is_deprecated || existing?.deprecated || false,
      reference: existing?.reference,
      catalog: model,
    });
  }
  for (const modelId of selectedModelIds) {
    if (!rows.has(modelId)) {
      rows.set(modelId, {
        modelId,
        family: manualLabel,
        feature: '',
        sourceLabel: enabledOnlyLabel,
        sourceKind: 'manual',
        selected: true,
        verified: false,
        deprecated: false,
      });
    }
  }
  const normalizedSearch = search.trim().toLowerCase();
  return Array.from(rows.values())
    .filter((row) => {
      if (!showDeprecated && row.deprecated && !row.selected) return false;
      if (visibilityFilter === 'enabled' && !row.selected) return false;
      if (visibilityFilter === 'disabled' && row.selected) return false;
      if (intelligenceFilter === 'missing' && row.reference) return false;
      if (featureFilter !== 'all' && normalizeModelReferenceFeature(row.feature) !== featureFilter) return false;
      if (normalizedSearch && !modelReferenceSearchText(row).includes(normalizedSearch)) return false;
      return true;
    })
    .sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      if (left.deprecated !== right.deprecated) return left.deprecated ? 1 : -1;
      return left.modelId.localeCompare(right.modelId);
    });
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

export function hasReferencePrice(reference: ModelReferenceEntry): boolean {
  return typeof reference.price.input === 'number'
    || typeof reference.price.output === 'number'
    || typeof reference.price.cache_read === 'number'
    || typeof reference.price.cache_write === 'number';
}

function catalogDisplayFeature(modelId: string, catalogFeature: string): string {
  const normalized = modelId.trim().toLowerCase();
  if (/(^|[\/_-])(cosyvoice|sensevoice|funasr|whisper|tts|speech|audio)([\/_:.-]|$)/.test(normalized)) return 'audio';
  if (/(^|[\/_-])(video|wan2\.[0-9]|sora)([\/_:.-]|$)/.test(normalized)) return 'video';
  return catalogFeature;
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
