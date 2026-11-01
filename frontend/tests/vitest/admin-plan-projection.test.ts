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
