// Normal-route fixtures follow the service serializers. Fault tests corrupt the
// completed fixture explicitly; this builder is never used to repair API data.
const period = { current_period_start_at: '2026-11-01T00:00:00Z', current_period_end_at: '2026-12-01T00:00:00Z' };
type Seed = {
  [key: string]: unknown;
  subscription?: { subscription_id?: string; account_id?: string; plan_id?: string; plan_version_id?: string; status?: string;
    current_period_start_at?: string | null; current_period_end_at?: string | null };
  account?: { account_id?: string; name?: string; status?: string; metadata?: Record<string, unknown> } | null;
  covered_sites?: Array<{ site_id: string; name?: string; status?: string; account_id?: string; ownership_released_at?: string | null }>;
  coverage?: { site_count?: number; package_alias?: string };
  billing_snapshot_status?: { status?: string; summary?: string; site_count?: number; fresh_site_count?: number;
    stale_site_count?: number; missing_site_count?: number; next_action?: { action: string; label?: string; detail?: string } | null };
  latest_billing_snapshots?: Array<{ snapshot_id: string; totals: Record<string, number>; site_id?: string; account_id?: string; plan_version_id?: string; subscription_id?: string }>;
  usage_totals?: { runs?: number; tokens_total?: number; cost_cny?: number; cost_cny_snapshot_missing_count?: number };
  operator_risk?: { level: string; reason_code: string };
};

export function subscriptionFixture(seed: Seed = {}) {
  const subscription = { subscription_id: 'sub_mvp', account_id: 'acct_subscription', plan_id: 'pro', plan_version_id: 'pro_v1',
    status: 'active', ...period, ...seed.subscription };
  const account = seed.account === null ? null : { account_id: subscription.account_id, name: 'Subscription customer', status: 'active', metadata: {}, ...seed.account };
  if (account) subscription.account_id = account.account_id;
  const covered_sites = (seed.covered_sites ?? [{ site_id: 'site_mvp', name: 'Subscription site' }]).map(item => ({
    account_id: subscription.account_id, name: '', status: 'active', ownership_released_at: null, ...item,
  }));
  const rawBilling = seed.billing_snapshot_status;
  const stale = rawBilling?.stale_site_count ?? 0, missing = rawBilling?.missing_site_count ?? 0;
  const billingSites = covered_sites.filter(site => site.status !== 'archived' && !site.ownership_released_at);
  const fresh = rawBilling?.fresh_site_count ?? Math.max(0, billingSites.length - stale - missing);
  const billingStatus = rawBilling?.status ?? (stale ? 'stale' : missing ? 'missing' : 'fresh');
  const latest_billing_snapshots = (seed.latest_billing_snapshots ?? billingSites.slice(0, fresh + stale).map(site => ({ snapshot_id: `snapshot_${site.site_id}`, totals: {} }))).map((snapshot, index) => ({
    account_id: subscription.account_id, subscription_id: subscription.subscription_id, site_id: billingSites[index]?.site_id || 'site_mvp',
    plan_version_id: subscription.plan_version_id, currency: 'CNY', period_start_at: subscription.current_period_start_at,
    period_end_at: subscription.current_period_end_at, generated_at: '2026-11-01T00:00:00Z', ...snapshot,
  }));
  const summary = billingStatus === 'stale' ? 'Current-period billing snapshots need rebuild to match the latest subscription posture.'
    : billingStatus === 'missing' ? 'Current-period billing snapshots are still missing for at least one covered site.'
      : 'Current-period billing snapshots are fresh for every covered site.';
  const billing_snapshot_status = { status: billingStatus, summary: rawBilling?.summary ?? summary,
    site_count: fresh + stale + missing, fresh_site_count: fresh, stale_site_count: stale, missing_site_count: missing,
    next_action: billingStatus === 'fresh' ? null : { action: 'rebuild_current_period_billing_snapshots',
      label: 'Rebuild current-period billing snapshots', detail: 'Refresh current-period billing snapshots for every covered site before treating billing posture as reconciled.' },
    items: billingSites.map((site, index) => ({ site_id: site.site_id, status: index < fresh ? 'fresh' : index < fresh + stale ? 'stale' : 'missing', snapshot: latest_billing_snapshots[index] ?? null })),
  };
  const usage = { runs: 21, tokens_total: 32000, cost_cny: 18.42, cost_cny_snapshot_missing_count: 2, ...seed.usage_totals };
  const coverage = { covered_by_subscription_id: subscription.subscription_id, subscription_status: subscription.status,
    plan_id: subscription.plan_id, plan_version_id: subscription.plan_version_id, current_period_end_at: subscription.current_period_end_at,
    site_count: covered_sites.length, package_alias: subscription.plan_id, ...seed.coverage };
  const operator_risk = seed.operator_risk ?? (['past_due', 'expired', 'suspended'].includes(subscription.status)
    ? { level: 'critical', reason_code: subscription.status } : billingStatus !== 'fresh'
      ? { level: 'warning', reason_code: `snapshot_${billingStatus}` } : { level: 'stable', reason_code: 'stable' });
  return { subscription, account, covered_sites, coverage, operator_risk, latest_billing_snapshots,
    expiry: { current_period_end_at: subscription.current_period_end_at, days_until_end: 29, is_expired: false },
    plan: { plan_id: subscription.plan_id, name: subscription.plan_id },
    plan_version: { plan_id: subscription.plan_id, plan_version_id: `${subscription.plan_id}_live` },
    commercial_policy: { subscription: { grace_period_days: 3 } },
    budget_headroom: { base_budget: { runs: 1000, tokens: 500000, cost: 250 },
      current_period_topup_delta: { runs: 35000, tokens: 7000000, cost: 349 }, effective_budget: { runs: 36000, tokens: 7500000, cost: 599 } },
    budget_state: { runs: { current_total: usage.runs, limit: 36000, over_limit: false },
      tokens: { current_total: usage.tokens_total, limit: 7500000, over_limit: false }, cost: { current_total: usage.cost_cny, limit: 599, over_limit: false } },
    billing_snapshot_status,
    subscription_grace: { subscription_status: subscription.status, active: subscription.status === 'past_due', grace_until_at: '' },
    usage_totals: usage,
    commercial_follow_up: { lifecycle_posture: 'Read current status and grace posture first.',
      snapshot_reconciliation_summary: 'Use site detail and filtered audit evidence to confirm whether snapshot posture and impact are aligned.',
      next_operator_follow_up: 'Open site detail for runtime and entitlement impact.' },
  };
}

export function subscriptionQueueFixture(input: { items: Seed[]; total: number; summary?: Record<string, number> }, params: URLSearchParams) {
  const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 10);
  const items = input.items.map(item => subscriptionFixture(item));
  const summary = input.summary ?? items.reduce<Record<string, number>>((result, item) => {
    result[item.operator_risk.level] += 1; return result;
  }, { critical: 0, warning: 0, monitor: 0, stable: 0 });
  return { ...input, items, summary,
    filters: { status: params.get('status') || '', status_group: params.get('status_group') || '', account_id: params.get('account_id') || '',
      customer: params.get('customer') || '', plan_id: params.get('plan_id') || '', expires_before: params.get('expires_before') ? new Date(params.get('expires_before')!).toISOString() : null,
      risk: params.get('risk') || 'all', sort: params.get('sort') || 'priority', offset, limit },
    pagination: { offset, limit, total: input.total, has_more: offset + input.items.length < input.total },
  };
}
