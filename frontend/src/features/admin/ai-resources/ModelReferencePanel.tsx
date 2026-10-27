'use client';

import { useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { formatDate } from '@/lib/utils';
import { modelIdentityKeys, upstreamModelId } from './model-reference-identity';
import {
  MODEL_VISIBILITY_PAGE_SIZE,
  formatReferenceContext,
  formatReferencePrice,
  hasReferencePrice,
  modelReferenceSourceNeedsSync,
  modelReferenceFreshness,
  type ModelReferenceFreshness,
  type ModelReferenceEntry,
  type ModelReferenceSourceSummary,
} from './model-reference-model';
import type { ProviderCatalogPreview } from './provider-workbench-state';
import { referenceProviderLabel } from './provider-presets';

function ReferenceList({ references, freshness }: { references: ModelReferenceEntry[]; freshness: (reference: ModelReferenceEntry) => ModelReferenceFreshness }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(references.length / MODEL_VISIBILITY_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const rows = references.slice((current - 1) * MODEL_VISIBILITY_PAGE_SIZE, current * MODEL_VISIBILITY_PAGE_SIZE);
  return (
    <div className="grid gap-2" data-ui="reference-records">
      {rows.map((reference) => (
        <div data-ui="reference-record" key={`${reference.provider_id}:${reference.model_id}`} className="grid gap-1 border-b border-slate-200 py-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <span className="break-all font-semibold text-slate-950 dark:text-white">{upstreamModelId(reference.model_id, reference.provider_id)}</span>
          {freshness(reference) !== 'current' ? <span className="text-amber-800 dark:text-amber-200">{t(`admin.ai_resources.reference_record_${freshness(reference)}`)}</span> : null}
          <span>{t('admin.ai_resources.column_context_output')}: {formatReferenceContext(reference, t('admin.ai_resources.model_reference_missing_context'))}</span>
          <span>{t('admin.ai_resources.column_reference_price')}: {formatReferencePrice(reference, t('admin.ai_resources.price_cache_label'), t('admin.ai_resources.model_reference_missing_price'))}{hasReferencePrice(reference) ? ` · ${t('admin.ai_resources.reference_price_unit')}` : ''}</span>
          <span>{reference.source_label} · {t('admin.ai_resources.reference_updated')}: {formatDate(reference.synced_at)}</span>
        </div>
      ))}
      {pageCount > 1 ? <div className="flex items-center gap-3 text-xs" data-ui="reference-pagination">
        <button type="button" className="btn btn-secondary h-8 px-3" disabled={current === 1} onClick={() => setPage(current - 1)}>{t('admin.ai_resources.action_previous_page')}</button>
        <span>{current} / {pageCount}</span>
        <button type="button" className="btn btn-secondary h-8 px-3" disabled={current === pageCount} onClick={() => setPage(current + 1)}>{t('admin.ai_resources.action_next_page')}</button>
      </div> : null}
    </div>
  );
}

export function ModelReferencePanel({
  references, catalogPreview, selectedModelIds, providerId, namespacePrefix,
  source, now, loading, refreshing, error, statusText, showDeprecated, onShowDeprecated,
  onRefresh, providerOptions, onProviderChange,
}: {
  references: ModelReferenceEntry[];
  catalogPreview: ProviderCatalogPreview | null;
  selectedModelIds: string[];
  providerId: string;
  namespacePrefix: string;
  source: ModelReferenceSourceSummary | null;
  now: number;
  loading: boolean;
  refreshing: boolean;
  error: string;
  statusText: string;
  showDeprecated: boolean;
  onShowDeprecated: (show: boolean) => void;
  onRefresh: () => void;
  providerOptions: string[];
  onProviderChange: (providerId: string) => void;
}) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const accountKeys = new Set([
    ...selectedModelIds,
    ...(catalogPreview?.models || []).map(model => model.model_id),
  ].flatMap(id => [...modelIdentityKeys(id, namespacePrefix)]));
  const matchesAccount = (reference: ModelReferenceEntry) => [...modelIdentityKeys(
    upstreamModelId(reference.model_id, reference.provider_id), namespacePrefix,
  )].some(key => accountKeys.has(key));
  const freshness = (reference: ModelReferenceEntry): ModelReferenceFreshness => error ? 'unconfirmed' : modelReferenceFreshness(reference, source, now);
  const matched = references.filter(reference => matchesAccount(reference) && freshness(reference) === 'current');
  const historicalCount = references.filter(reference => freshness(reference) !== 'current' || reference.is_deprecated).length;
  const others = references.filter(reference => !(matchesAccount(reference) && freshness(reference) === 'current')
    && (showDeprecated || (!reference.is_deprecated && freshness(reference) === 'current'))
    && `${reference.model_id} ${reference.display_name}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <section className="grid gap-4 text-sm" data-ui="model-reference-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span>{t(modelReferenceSourceNeedsSync(source, now) ? 'admin.ai_resources.reference_stale' : 'admin.ai_resources.reference_fresh')}</span>
          <span data-ui="model-visibility-status">{t('admin.ai_resources.model_reference_last_synced', { time: source?.last_synced_at ? formatDate(source.last_synced_at) : t('admin.ai_resources.status_not_synced') })}</span>
        </div>
        <button type="button" data-ui="model-reference-retry" className="btn btn-secondary h-9 px-3" disabled={loading || refreshing} onClick={onRefresh}>
          {t(refreshing ? 'admin.ai_resources.action_syncing_model_references' : 'admin.ai_resources.action_sync_model_references')}
        </button>
      </div>
      {error || statusText ? <p role="alert" className="text-xs text-amber-800 dark:text-amber-200">{t('admin.ai_resources.reference_refresh_failed_note')} {error || statusText}</p> : null}
      {providerOptions.length ? <label className="flex items-center gap-2 text-xs">
        {t('admin.ai_resources.reference_source_view_label')}
        <select className="h-9 rounded-md border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950" value={providerId} onChange={event => onProviderChange(event.target.value)}>
          {providerOptions.map(id => <option key={id} value={id}>{referenceProviderLabel(id)}</option>)}
        </select>
      </label> : null}
      <div data-ui="account-model-references">
        <h3 className="font-semibold">{t('admin.ai_resources.reference_current_models')} · {matched.length}</h3>
        {loading ? <p role="status" className="py-3 text-xs">{t('admin.ai_resources.loading_model_references')}</p>
          : matched.length ? <ReferenceList references={matched} freshness={freshness} />
            : <p className="py-3 text-xs text-slate-500 dark:text-slate-400">{t('admin.ai_resources.reference_exact_model_missing')}</p>}
      </div>
      <details data-ui="model-reference-browse">
        <summary className="w-fit cursor-pointer text-xs font-semibold">{t('admin.ai_resources.reference_other_models')}</summary>
        <div className="mt-3 grid gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <input aria-label={t('admin.ai_resources.field_search_models')} placeholder={t('admin.ai_resources.placeholder_search_models')}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={search} onChange={event => setSearch(event.target.value)} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={showDeprecated} onChange={event => onShowDeprecated(event.target.checked)} />{t('admin.ai_resources.history_view_preference')}</label>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.ai_resources.reference_other_note')}{historicalCount ? ` ${t('admin.ai_resources.reference_historical_count', { count: String(historicalCount) })}` : ''}</p>
          {others.length ? <ReferenceList key={`${search}:${showDeprecated}`} references={others} freshness={freshness} /> : <p className="text-xs">{t('admin.ai_resources.model_visibility_empty')}</p>}
        </div>
      </details>
    </section>
  );
}
