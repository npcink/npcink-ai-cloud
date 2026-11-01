import { describe, expect, it } from 'vitest';
import { readSubscriptionDetail, readSubscriptionQueue, readSiteEvidence, subscriptionAuditScope } from '@/features/admin/subscriptions/evidence';
import { subscriptionFixture, subscriptionQueueFixture } from '../fixtures/admin-subscriptions';

const key = 'risk=all&sort=priority&limit=10';
const queue = () => subscriptionQueueFixture({ items: [subscriptionFixture()], total: 1 }, new URLSearchParams(key));
function corrupt(value: unknown, path: string, replacement?: unknown) {
  const clone = structuredClone(value) as Record<string, unknown>;
  const keys = path.split('.');
  let record = clone;
  for (const part of keys.slice(0, -1)) record = record[part] as Record<string, unknown>;
  if (replacement === undefined) delete record[keys.at(-1)!];
  else record[keys.at(-1)!] = replacement;
  return clone;
}

describe('subscription queue service evidence', () => {
  it('preserves complete normal, zero and empty pages without equating pre-risk summary to total', () => {
    expect(readSubscriptionQueue(queue(), key).items).toHaveLength(1);
    const value = subscriptionQueueFixture({ items: [], total: 0, summary: { critical: 0, warning: 0, monitor: 0, stable: 8 } }, new URLSearchParams(key));
    expect(readSubscriptionQueue(value, key).summary.stable).toBe(8);
    const outOfRange = subscriptionQueueFixture({ items: [], total: 2 }, new URLSearchParams(`${key}&offset=20`));
    expect(readSubscriptionQueue(outOfRange, `${key}&offset=20`).pagination.offset).toBe(20);
  });
  it.each(['items', 'total', 'summary', 'summary.stable', 'pagination', 'pagination.has_more', 'filters',
    'items.0.subscription', 'items.0.operator_risk.level', 'items.0.coverage.site_count', 'items.0.billing_snapshot_status.fresh_site_count',
    'items.0.latest_billing_snapshots', 'items.0.covered_sites'])('rejects missing %s', path => {
    expect(() => readSubscriptionQueue(corrupt(queue(), path), key)).toThrow();
  });
  it.each([null, {}, 1, 'empty'])('rejects invalid required collection %j', items => {
    expect(() => readSubscriptionQueue({ ...queue(), items }, key)).toThrow();
  });
  it.each(['critical', 'warning', 'monitor', 'stable'])('rejects missing %s summary count', field => {
    expect(() => readSubscriptionQueue(corrupt(queue(), `summary.${field}`), key)).toThrow();
  });
  it('rejects wrong filters, pagination, duplicate targets and invalid risk rather than displaying them', () => {
    for (const [path, value] of [['filters.customer', 'other'], ['filters.offset', 10], ['filters.limit', 99],
      ['pagination.total', 8], ['pagination.has_more', true], ['items.0.operator_risk.level', 'unclassified'],
      ['items.0.account.account_id', 'other'], ['items.0.coverage.covered_by_subscription_id', 'other']]) {
      expect(() => readSubscriptionQueue(corrupt(queue(), path as string, value), key)).toThrow();
    }
    expect(() => readSubscriptionQueue({ ...queue(), items: [queue().items[0], queue().items[0]] }, key)).toThrow();
  });
});

describe('subscription detail evidence', () => {
  it('retains live parameters from a different version of the same plan, null associations and sparse usage', () => {
    const value = subscriptionFixture();
    const parsed = readSubscriptionDetail(value, 'sub_mvp');
    expect(subscriptionAuditScope(parsed)).toEqual({ accountId: value.account!.account_id, siteId: '' });
    expect(parsed.detail.plan_version!.plan_version_id).not.toBe(value.subscription.plan_version_id);
    const nullable = { ...value, account: null, plan: null, plan_version: null, covered_sites: [], usage_totals: { cost_cny: 0, cost_cny_snapshot_missing_count: 0 } };
    expect(readSubscriptionDetail(nullable, 'sub_mvp').detail.plan).toBeNull();
    expect(subscriptionAuditScope(readSubscriptionDetail(nullable, 'sub_mvp'))).toBeNull();
  });
  it('preserves 0 and negative unlimited limits and authoritative token totals', () => {
    const value = subscriptionFixture({ usage_totals: { tokens_total: 731 } });
    value.budget_state.runs.limit = 0; value.budget_state.tokens.limit = -1;
    const parsed = readSubscriptionDetail(value, 'sub_mvp').detail;
    expect(parsed.budget_state.runs.limit).toBe(0);
    expect(parsed.budget_state.tokens.limit).toBe(-1);
    expect(parsed.budget_state.tokens.current_total).toBe(731);
  });
  it.each(['subscription', 'account', 'plan', 'plan_version', 'coverage', 'expiry', 'latest_billing_snapshots',
    'commercial_policy.subscription.grace_period_days', 'budget_headroom.base_budget.tokens', 'budget_headroom.effective_budget.cost',
    'budget_state.runs.current_total', 'budget_state.tokens.limit', 'budget_state.cost.over_limit', 'subscription_grace.active',
    'usage_totals.cost_cny_snapshot_missing_count', 'billing_snapshot_status.next_action', 'billing_snapshot_status.site_count',
    'commercial_follow_up'])('rejects missing %s without manufacturing stable/zero', path => {
    expect(() => readSubscriptionDetail(corrupt(subscriptionFixture(), path), 'sub_mvp')).toThrow();
  });
  it.each(['subscription.subscription_id', 'account.account_id', 'plan.plan_id', 'plan_version.plan_id',
    'coverage.covered_by_subscription_id'])('rejects wrong target %s', path => {
    expect(() => readSubscriptionDetail(corrupt(subscriptionFixture(), path, 'other'), 'sub_mvp')).toThrow();
  });
  it('rejects an unsupported maintenance action instead of enabling a different operation', () => {
    const value = subscriptionFixture({ billing_snapshot_status: { status: 'stale', stale_site_count: 1 } });
    expect(() => readSubscriptionDetail(corrupt(value, 'billing_snapshot_status.next_action.action', 'other_action'), 'sub_mvp')).toThrow();
  });
  it('does not equate billing counts to covered sites, or reject a previous-subscription snapshot as a current one', () => {
    const value = subscriptionFixture({ covered_sites: [{ site_id: 'archived', status: 'archived' }],
      billing_snapshot_status: { fresh_site_count: 0, site_count: 0 }, latest_billing_snapshots: [{ snapshot_id: 'old', totals: {} }] });
    value.latest_billing_snapshots[0].subscription_id = 'previous_subscription';
    expect(readSubscriptionDetail(value, 'sub_mvp').sites.sites).toHaveLength(1);
  });
  it.each([null, {}, 'broken', undefined])('isolates broken site collection %j', covered_sites => {
    const result = readSubscriptionDetail({ ...subscriptionFixture(), covered_sites }, 'sub_mvp');
    expect(result.sites.issues).toEqual([{ index: null, reason: 'collection' }]);
    expect(result.detail.budget_state.tokens.current_total).toBe(32000);
  });
  it('keeps valid sites and exposes every bad/ambiguous target without unsafe links', () => {
    const valid = subscriptionFixture().covered_sites[0];
    const result = readSiteEvidence([valid, null, 'bad', {}, { ...valid, site_id: '' },
      { ...valid, site_id: 'duplicate' }, { ...valid, site_id: 'duplicate' }, { ...valid, site_id: 'other-account', account_id: 'other' }], valid.account_id);
    expect(result.sites).toEqual([valid]);
    expect(result.issues.map(issue => issue.reason)).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'duplicate', 'duplicate', 'account']);
    const evidence = readSubscriptionDetail({ ...subscriptionFixture(), account: null, covered_sites: [null] }, 'sub_mvp');
    expect(subscriptionAuditScope(evidence)).toBeNull();
  });
});
