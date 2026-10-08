import type { SummaryBranch } from './advisor-model';

export const advisorScopes = ['operations', 'runtime', 'commercial', 'routing'] as const;
export type AdvisorScope = typeof advisorScopes[number];
export function advisorScope(value: string | null | undefined): AdvisorScope {
  if (value === 'operations_analysis') return 'operations';
  const canonical = value?.replace(/_operations$/, '');
  return advisorScopes.includes(canonical as AdvisorScope) ? canonical as AdvisorScope : 'operations';
}

/** Missing/redacted fields are unknown. A returned numeric zero remains zero. */
export function advisorNumeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
type AdvisorMetric = { key: string; value: number | null; tone: 'neutral' | 'warning' };
export function advisorMetrics(branch: SummaryBranch): AdvisorMetric[] {
  const signals = branch.source_context.advisor.signals as Record<string, unknown>[];
  const field = (code: string, key: string) => signals.find(s => s.code === code)?.[key];
  const count = (code: string, key: string) => advisorNumeric(field(code, key));
  const list = (code: string, key: string) => {
    const value = field(code, key);
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value.length : null;
  };
  const scope = advisorScope(branch.source_context.advisor.scope || branch.scope);
  if (scope === 'runtime') return [
    { key: 'callback_failed', value: count('runtime.callback_pressure', 'failed'), tone: 'warning' },
    { key: 'queued_runs', value: count('runtime.queue_pressure', 'queued_runs'), tone: 'warning' },
    { key: 'guard_events', value: count('runtime.guard_events', 'recent_events'), tone: 'warning' },
  ];
  if (scope === 'commercial') return [
    { key: 'attention_subscriptions', value: count('commercial.subscription_attention', 'count'), tone: 'warning' },
    { key: 'expiring_7d', value: count('commercial.subscription_expiring_soon', 'within_7_days'), tone: 'warning' },
    { key: 'recent_decisions', value: count('commercial.recent_decisions', 'count'), tone: 'neutral' },
  ];
  if (scope === 'routing') return [
    { key: 'profile_candidates', value: list('routing.profile_candidates', 'recommended_profile_ids'), tone: 'neutral' },
    { key: 'degraded_providers', value: list('routing.provider_degradation', 'avoid_provider_ids'), tone: 'warning' },
    { key: 'avoided_profiles', value: list('routing.provider_degradation', 'avoid_profile_ids'), tone: 'warning' },
  ];
  return [
    { key: 'failed_runs', value: count('ops.runtime_quality', 'failed_runs'), tone: 'warning' },
    { key: 'provider_errors', value: count('ops.provider_quality', 'provider_errors'), tone: 'warning' },
    { key: 'knowledge_no_hits', value: count('ops.knowledge_quality', 'knowledge_no_hits'), tone: 'warning' },
    { key: 'usage_cost', value: count('ops.usage_cost', 'provider_cost'), tone: 'neutral' },
  ];
}

// Static backend action codes, including healthy-state actions without a destination.
export const advisorActionCatalog: Record<string, { copy: string; href?: string; site?: boolean; windowChanged?: boolean }> = {
  inspect_failed_runs_by_site_and_ability: { copy: 'inspect_failed_runs', href: '/admin/troubleshooting?focus=hosted_model.failed_runs&window=336', site: true, windowChanged: true },
  inspect_provider_errors_latency_and_fallbacks: { copy: 'inspect_provider_errors', href: '/admin/troubleshooting?focus=hosted_model.provider_errors&window=336', site: true, windowChanged: true },
  review_site_knowledge_no_hit_queries_and_index_coverage: { copy: 'review_knowledge_no_hits', href: '/admin/vector-observability?window=336', site: true, windowChanged: true },
  review_subscription_attention_and_expiry_coverage: { copy: 'review_subscription_risk', href: '/admin/coverage' },
  inspect_queue_worker_and_callback_delivery: { copy: 'inspect_queue_callbacks', href: '/admin#runtime-attention' },
  inspect_commercial_entitlement_and_runtime_guard: { copy: 'inspect_entitlement_guard', href: '/admin/coverage' },
  inspect_callback_delivery_and_site_runtime: { copy: 'inspect_queue_callbacks', href: '/admin#runtime-attention' },
  inspect_runtime_queue_and_worker: { copy: 'inspect_queue_callbacks', href: '/admin#runtime-attention' },
  inspect_attention_subscriptions: { copy: 'review_subscription_risk', href: '/admin/subscriptions' },
  review_expiring_subscription_coverage: { copy: 'review_subscription_risk', href: '/admin/coverage' },
  review_hosted_routing_profile_candidates: { copy: 'routing_candidates', href: '/admin/runtime-profiles' },
  inspect_provider_degradation_before_profile_adoption: { copy: 'inspect_provider_errors', href: '/admin/ai-resources#provider-model-health' },
  continue_operations_monitoring: { copy: 'continue_monitoring' },
  continue_runtime_monitoring: { copy: 'continue_monitoring' },
  continue_commercial_monitoring: { copy: 'continue_monitoring' },
  continue_routing_monitoring: { copy: 'continue_monitoring' },
  continue_site_monitoring: { copy: 'continue_monitoring' },
};
export function advisorActionHref(action: string, site: string): string | undefined {
  const entry = advisorActionCatalog[action];
  if (!entry?.href) return undefined;
  if (!entry.site || !site) return entry.href;
  const [path, query] = entry.href.split('?');
  const params = new URLSearchParams(query);
  params.set('site', site);
  return `${path}?${params}`;
}
