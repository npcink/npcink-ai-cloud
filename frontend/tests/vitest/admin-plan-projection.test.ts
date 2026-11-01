import { describe, expect, it } from 'vitest';
import { buildInitialForm, formParameters, readPlanConfirmation, requirePlanCatalog, requirePlanDetail, requirePlanWrite, type PlanIntent } from '@/features/admin/plans/plan-projection';
import { readPlanIntent } from '@/features/admin/plans/use-plan-editor';
import { parameters, planCatalog, planConfirmation, planDetail, planRevision, planWrite } from '../fixtures/admin-plan-parameters';
const intent: PlanIntent = { plan_id: 'pro', plan_version_id: 'pro_v1', operation_id: 'original-key', revision: planRevision(), values: parameters, form: buildInitialForm(planDetail()) };

describe('plan evidence contracts', () => {
  it('accepts actual plan projection and zero limits, preserving nine submitted fields', () => {
    expect(requirePlanDetail(planDetail(), 'pro')).toEqual(planDetail());
    expect(formParameters(buildInitialForm(planDetail()))).toEqual(parameters);
    expect(readPlanIntent(intent, 'pro')).toEqual(intent);
    expect(() => readPlanIntent(intent, 'plus')).toThrow();
    expect(() => readPlanIntent({ ...intent, form: { ...intent.form, site_limit: '6' } }, 'pro')).toThrow();
  });
  it.each([{}, { items: null }, { items: {} }, { items: [] }, { ...planCatalog(), items: [{ ...planCatalog().items[0], subscription_counts: {} }] }, { ...planCatalog(), items: [planCatalog().items[0], planCatalog().items[0]] }])('rejects missing, damaged or duplicated catalog evidence %#', value => {
    expect(() => requirePlanCatalog(value)).toThrow();
  });
  it('keeps legitimate empty catalogs distinct from damage', () => {
    expect(requirePlanCatalog({ items: [], tier_templates: [] })).toEqual({ items: [], tier_templates: [] });
    expect(requirePlanCatalog(planCatalog())).toEqual(planCatalog());
  });
  it.each([{}, { ...planDetail(), plan: { plan_id: 'plus' } }, { ...planDetail(), latest_version: { ...planDetail().latest_version, plan_id: 'plus' } }, { ...planDetail(), sales_offer: { amount: '99', currency: 'CNY', status: 'active' } }])('rejects incomplete/wrong detail %#', value => {
    expect(() => requirePlanDetail(value, 'pro')).toThrow();
  });
  it('requires the write target, operation revision and normalized values', () => {
    expect(() => requirePlanWrite(planWrite(intent), intent)).not.toThrow();
    for (const value of [{}, { ...planWrite(intent), plan_id: 'plus' }, { ...planWrite(intent), budgets: { max_ai_credits_per_period: 1 } }, { ...planWrite(intent), parameter_operation: {} }]) expect(() => requirePlanWrite(value, intent)).toThrow();
  });
  it('releases only exact durable receipt plus current normative values', () => {
    expect(readPlanConfirmation(planConfirmation(intent), intent)?.audit_event_id).toBe(1);
    expect(readPlanConfirmation(planConfirmation(intent, 'unconfirmed'), intent)).toBeNull();
    for (const value of [
      { ...planConfirmation(intent), operation_id: 'other-key' }, { ...planConfirmation(intent), source_revision: planRevision('c') },
      { ...planConfirmation(intent), receipt: null }, { ...planConfirmation(intent), receipt: { ...planConfirmation(intent).receipt, audit_event_id: 0 } },
      { ...planConfirmation(intent), current: { ...planConfirmation(intent).current, parameters: { ...parameters, sales_price_cny: 1 } } },
      { ...planConfirmation(intent), receipt: { ...planConfirmation(intent).receipt, parameters: { ...parameters, site_limit: 6 } } },
    ]) expect(() => readPlanConfirmation(value, intent)).toThrow();
  });
});

// Serializer fixtures retain its token-key redaction in templates; Version
// budgets are normalized numeric maps. These are deliberately malformed clones.
const damagedPaths = [
  'latest_version.budgets', 'latest_version.budgets.max_ai_credits_per_period',
  'latest_version.budgets.max_cost_cny_per_period', 'latest_version.budgets.max_runs_per_period',
  'latest_version.budgets.max_tokens_per_period', 'latest_version.concurrency.max_active_runs',
  'latest_version.policy.subscription.grace_period_days',
  'tier_summary.monthly_included_points', 'tier_summary.site_limit',
  'tier_summary.budgets_template.max_ai_credits_per_period', 'tier_summary.budgets_template.max_cost_cny_per_period',
  'tier_summary.concurrency_template.max_active_runs', 'tier_summary.policy_baseline.grace_period_days',
  'tier_summary.canonical_shell.budgets.max_ai_credits_per_period', 'tier_summary.canonical_shell.budgets.max_cost_cny_per_period',
  'tier_summary.canonical_shell.concurrency.max_active_runs', 'tier_summary.canonical_shell.policy.subscription.grace_period_days',
  'tier_summary.canonical_shell.metadata.site_limit', 'tier_summary.canonical_shell.metadata.max_vector_documents',
  'tier_summary.canonical_shell.metadata.max_media_images', 'tier_summary.canonical_shell.metadata.max_batch_items',
];
function corrupt(path: string, replacement: unknown, remove = false) {
  const value = structuredClone(planDetail()) as unknown as Record<string, unknown>;
  const keys = path.split('.');
  let parent = value;
  for (const key of keys.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  if (remove) delete parent[keys.at(-1)!]; else parent[keys.at(-1)!] = replacement;
  return value;
}
describe('review R2 serializer projections', () => {
  it.each(damagedPaths)('rejects absent required value %s', path => {
    expect(() => requirePlanDetail(corrupt(path, undefined, true), 'pro')).toThrow();
  });
  it.each(damagedPaths.filter(path => path !== 'latest_version.budgets'))('rejects invalid required number %s', path => {
    for (const bad of [null, -1, '0', Infinity, NaN, {}]) expect(() => requirePlanDetail(corrupt(path, bad), 'pro')).toThrow();
  });
  it.each(['plan_id', 'offer_id', 'tier_id', 'account_id', 'purchase_mode', 'plan_version_id', 'billing_cycle'])('rejects damaged nested offer identity %s', key => {
    expect(() => requirePlanDetail(corrupt(`sales_offer.${key}`, '', true), 'pro')).toThrow();
    if (!['plan_version_id', 'billing_cycle'].includes(key)) expect(() => requirePlanDetail(corrupt(`sales_offer.${key}`, 'other'), 'pro')).toThrow();
  });
  it('keeps zero, nullable resources, optional metadata, custom Plan and historical Offer versions', () => {
    const detail = planDetail('custom-plan', Object.fromEntries(Object.keys(parameters).map(key => [key, 0])) as typeof parameters);
    detail.latest_version!.metadata = { site_limit: null };
    expect(() => requirePlanDetail(detail, 'custom-plan')).not.toThrow();
    expect(detail.sales_offer!.plan_version_id).not.toBe(detail.latest_version!.plan_version_id);
    expect(formParameters(buildInitialForm(detail)).monthly_included_points).toBe(0);
    detail.latest_version = null; detail.sales_offer = null;
    expect(() => requirePlanDetail(detail, 'custom-plan')).not.toThrow();
    expect(formParameters(buildInitialForm(detail)).monthly_included_points).toBe(detail.tier_summary.monthly_included_points);
  });
  it.each(['budgets_template', 'concurrency_template', 'policy_baseline', 'canonical_shell'])('rejects damaged catalog template %s rather than treating it as empty', key => {
    const catalog = planCatalog();
    Object.assign(catalog.tier_templates[0], { [key]: {} });
    expect(() => requirePlanCatalog(catalog)).toThrow();
  });
});
