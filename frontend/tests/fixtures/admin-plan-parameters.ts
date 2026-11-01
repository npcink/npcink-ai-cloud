import type { PlanDetailPayload, PlanIntent, PlanParameters } from '@/features/admin/plans/plan-projection';
import canonicalTiers from './admin-plan-canonical-tiers.json' with { type: 'json' };
// Generated from CommercialService._list_plan_tier_templates(), without DB or network.
export function canonicalTier(tierId = 'pro') {
  return structuredClone(canonicalTiers.find(tier => tier.tier_id === tierId) || canonicalTiers.find(tier => tier.tier_id === 'pro')!);
}
export const planRevision = (letter = 'a') => `plan-v1:${letter.repeat(64)}`;
export const parameters: PlanParameters = { monthly_included_points: 10000, site_limit: 5, max_vector_documents: 0, max_media_images: 0, max_cost_cny_per_period: 0, sales_price_cny: 99, max_active_runs: 0, max_batch_items: 0, grace_period_days: 0 };
export function planDetail(planId = 'pro', values = parameters, letter = 'a'): PlanDetailPayload {
  const summary = canonicalTier(planId);
  return {
    revision: planRevision(letter), plan: { plan_id: planId, name: planId, status: 'active', description: 'Existing package', metadata: { tier_id: summary.tier_id } },
    latest_version: { plan_id: planId, plan_version_id: `${planId}_v1`, version_label: 'v1', status: 'published', created_at: '2026-11-01T00:00:00Z',
      budgets: { max_ai_credits_per_period: values.monthly_included_points, max_runs_per_period: 0, max_tokens_per_period: 0, max_cost_cny_per_period: values.max_cost_cny_per_period },
      concurrency: { max_active_runs: values.max_active_runs }, policy: { subscription: { grace_period_days: values.grace_period_days } },
      metadata: { site_limit: values.site_limit, max_vector_documents: values.max_vector_documents, max_media_images: values.max_media_images, max_batch_items: values.max_batch_items },
    }, sales_offer: { offer_id: `${summary.tier_id}_monthly_v1`, plan_id: planId, plan_version_id: `${planId}_published_v0`, tier_id: summary.tier_id,
      account_id: '', purchase_mode: 'self_serve', billing_cycle: 'monthly', amount: values.sales_price_cny, currency: 'CNY', status: 'active' },
    tier_summary: { ...summary, package_alias: planId }, package_fit_cues: [],
  };
}
export function planCatalog() {
  const plans = ['pro', 'plus'].map(id => planDetail(id));
  return { tier_templates: plans.map(d => d.tier_summary), items: plans.map(d => ({ plan: d.plan, tier_summary: d.tier_summary, latest_version: d.latest_version, published_version_count: 1, subscription_counts: { total: 2, active: 1 } })) };
}
export function planWrite(intent: PlanIntent) {
  return { ...planDetail(intent.plan_id, intent.values, 'b').latest_version,
    parameter_operation: { action: 'parameters.update', source_revision: intent.revision, parameters: intent.values } };
}
export function planConfirmation(intent: PlanIntent, state = 'confirmed') {
  return { plan_id: intent.plan_id, operation_id: intent.operation_id, action: 'parameters.update', source_revision: intent.revision, state,
    current: state === 'confirmed' ? { revision: planRevision('b'), parameters: intent.values, plan_version_id: `${intent.plan_id}_v1` } : null,
    receipt: state === 'confirmed' ? { audit_event_id: 1, plan_id: intent.plan_id, plan_version_id: intent.plan_version_id, actor_kind: 'platform_admin', actor_ref: 'fixture-admin', method: 'PATCH', path: `/internal/service/admin/plans/${intent.plan_id}`, event_kind: 'plan_version.publish', operation_id: intent.operation_id, action: 'parameters.update', source_revision: intent.revision, parameters: intent.values } : null,
  };
}
