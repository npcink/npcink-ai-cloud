import type { SiteRuntimeData } from './account-site-runtime';
import type {
  AccountCreditBreakdownItem,
  AccountQuotaMetric,
} from './account-credit-evidence';
import { formatNumber as formatInteger } from '@/lib/utils';

type TranslationFunction = (
  key: string,
  vars?: Record<string, string>,
  fallback?: string
) => string;

export type AccountBudgetSummary = {
  used: number;
  limit: number;
  remaining: number;
  usageRatio: number;
  overLimit: boolean;
  unlimited: boolean;
};

export function emptyBudgetSummary(): AccountBudgetSummary {
  return {
    used: 0,
    limit: 0,
    remaining: 0,
    usageRatio: 0,
    overLimit: false,
    unlimited: true,
  };
}

export function summarizeBudget(
  siteRuntimeData: Record<string, SiteRuntimeData>,
  metric: 'runs' | 'tokens' | 'cost'
): AccountBudgetSummary {
  const entries = Object.values(siteRuntimeData);
  if (entries.length === 0) {
    return emptyBudgetSummary();
  }
  const used = entries.reduce(
    (sum, item) => sum + Number(item.budgetState?.[metric]?.current_total ?? 0),
    0
  );
  const positiveLimits = entries
    .map((item) => Number(item.budgetState?.[metric]?.limit ?? 0))
    .filter((value) => value > 0);
  const limit = positiveLimits.reduce((sum, value) => sum + value, 0);
  const unlimited = positiveLimits.length === 0;
  return {
    used,
    limit,
    remaining: unlimited ? 0 : Math.max(0, limit - used),
    usageRatio: unlimited || limit <= 0 ? 0 : used / limit,
    overLimit: entries.some((item) => Boolean(item.budgetState?.[metric]?.over_limit)),
    unlimited,
  };
}

export function formatUsageRatio(
  summary: AccountBudgetSummary,
  unlimitedLabel = 'Unlimited'
): string {
  if (summary.unlimited) {
    return unlimitedLabel;
  }
  return `${Math.round(Math.min(999, Math.max(0, summary.usageRatio * 100)))}%`;
}

export function quotaToneClass(
  summary: AccountBudgetSummary
): string | undefined {
  if (summary.overLimit || summary.usageRatio >= 1) {
    return 'text-red-600 dark:text-red-400';
  }
  if (summary.usageRatio >= 0.8) {
    return 'text-amber-700 dark:text-amber-300';
  }
  return undefined;
}

export function quotaMetricToneClass(
  metric?: AccountQuotaMetric | null
): string | undefined {
  if (!metric) {
    return undefined;
  }
  if (metric.status === 'limited' || (!metric.unlimited && metric.usage_ratio >= 1)) {
    return 'text-red-600 dark:text-red-400';
  }
  if (metric.status === 'near_limit' || (!metric.unlimited && metric.usage_ratio >= 0.8)) {
    return 'text-amber-700 dark:text-amber-300';
  }
  return undefined;
}

export function metricToBudgetSummary(
  metric?: AccountQuotaMetric | null
): AccountBudgetSummary {
  if (!metric) {
    return emptyBudgetSummary();
  }
  return {
    used: Number(metric.used || 0),
    limit: Number(metric.limit || 0),
    remaining: Number(metric.remaining || 0),
    usageRatio: Number(metric.usage_ratio || 0),
    overLimit:
      metric.status === 'limited' ||
      (!metric.unlimited && Number(metric.used || 0) >= Number(metric.limit || 0)),
    unlimited: Boolean(metric.unlimited),
  };
}

export function quotaMetricLabel(
  metric: AccountQuotaMetric,
  t: TranslationFunction
): string {
  const labels: Record<string, string> = {
    ai_credits: t('admin.account_detail.ai_credits_label', undefined, 'AI credits'),
    bound_sites: t('admin.account_detail.bound_sites_label', undefined, 'Bound sites'),
    active_api_key_sites: t('admin.account_detail.active_api_keys_label', undefined, 'Active API keys'),
    concurrent_runs: t('admin.account_detail.concurrent_runs_label', undefined, 'Concurrent runs'),
    batch_items: t('admin.account_detail.batch_items_label', undefined, 'Batch items'),
    vector_documents: t('admin.account_detail.vector_documents_label', undefined, 'Vector articles'),
    vector_chunks: t('admin.account_detail.vector_chunks_label', undefined, 'Vector chunks'),
    vector_sync_documents_per_run: t('admin.account_detail.vector_sync_documents_label', undefined, 'Sync articles/run'),
    vector_sync_chunks_per_run: t('admin.account_detail.vector_sync_chunks_label', undefined, 'Sync chunks/run'),
    tokens: t('admin.tokens_used', undefined, 'Tokens used'),
    cost: t('admin.cost_estimate', undefined, 'Cost estimate'),
    provider_calls: t('admin.account_detail.provider_calls_label', undefined, 'Provider calls'),
  };
  return labels[metric.key] || metric.label || metric.key;
}

export function creditBreakdownLabel(
  item: AccountCreditBreakdownItem,
  t: TranslationFunction
): string {
  const labels: Record<string, string> = {
    runs: t('admin.account_detail.breakdown_runs_label', undefined, 'Hosted runs'),
    tokens_total: t('admin.account_detail.breakdown_tokens_label', undefined, 'Model tokens'),
    web_search: t('admin.account_detail.breakdown_search_label', undefined, 'Search'),
    image_recommendation: t('admin.account_detail.breakdown_image_label', undefined, 'Image recommendation'),
    provider_calls_other: t('admin.account_detail.breakdown_provider_other_label', undefined, 'Other provider calls'),
    vector_documents: t('admin.account_detail.breakdown_vector_documents_label', undefined, 'Vector articles'),
    vector_chunks: t('admin.account_detail.breakdown_vector_chunks_label', undefined, 'Vector chunks'),
  };
  return labels[item.key] || item.label || item.key;
}

export function formatSignedCreditDelta(value: number): string {
  const rounded = Math.round(Number(value || 0));
  const formatted = formatInteger(Math.abs(rounded));
  if (rounded > 0) {
    return `+${formatted}`;
  }
  if (rounded < 0) {
    return `-${formatted}`;
  }
  return formatted;
}
