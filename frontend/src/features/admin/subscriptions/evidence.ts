import { z } from 'zod';

// Validate the fields consumed by these two surfaces, without coercing missing
// evidence to zero. Source: commercial _billing_mixin/_audit_mixin serializers.
const id = z.string().min(1).refine(value => value === value.trim());
const number = z.number().finite();
const count = number.int().nonnegative();
const date = z.string().refine(value => Number.isFinite(Date.parse(value))).nullable();
const status = z.enum(['trialing', 'active', 'past_due', 'expired', 'suspended', 'canceled']);
const subscription = z.object({
  subscription_id: id, account_id: z.string(), plan_id: z.string(), plan_version_id: z.string(), status,
  current_period_start_at: date, current_period_end_at: date,
});
const account = z.object({
  account_id: id, name: z.string(), metadata: z.record(z.string(), z.unknown()).optional(),
}).nullable();
const site = z.object({ site_id: id, account_id: z.string(), name: z.string(), status: id,
  ownership_released_at: date });
const snapshots = z.array(z.object({
  snapshot_id: id, subscription_id: z.string(), site_id: id,
  // Meter totals are sparse in the real serializer. An absent cost is unknown,
  // not a reason to manufacture zero or reject an otherwise valid snapshot.
  totals: z.record(z.string(), number),
}));
const billing = z.object({
  status: z.enum(['fresh', 'stale', 'missing']), summary: z.string(), site_count: count,
  fresh_site_count: count, stale_site_count: count, missing_site_count: count,
  next_action: z.object({ action: z.literal('rebuild_current_period_billing_snapshots'), label: z.string(), detail: z.string() }).nullable(),
  items: z.array(z.unknown()),
});
const coverage = z.object({
  covered_by_subscription_id: id, subscription_status: status, plan_id: z.string(),
  plan_version_id: z.string(), site_count: count, package_alias: z.string(),
});
const expiry = z.object({ current_period_end_at: date, days_until_end: number.int().nullable(), is_expired: z.boolean() });
const risk = z.enum(['critical', 'warning', 'monitor', 'stable']);
const queueItem = z.object({
  subscription, account, covered_sites: z.array(site), coverage, expiry,
  latest_billing_snapshots: snapshots, billing_snapshot_status: billing,
  operator_risk: z.object({ level: risk, reason_code: id }),
});
const queue = z.object({
  items: z.array(queueItem), total: count,
  summary: z.object({ critical: count, warning: count, monitor: count, stable: count }),
  pagination: z.object({ offset: count, limit: count.positive(), total: count, has_more: z.boolean() }),
  filters: z.object({
    status: z.string(), status_group: z.string(), account_id: z.string(), customer: z.string(),
    plan_id: z.string(), expires_before: date, risk: z.enum(['needs_action', 'all', ...risk.options]),
    sort: z.enum(['priority', 'expiry', 'customer']), offset: count, limit: count.positive(),
  }),
});
const budget = z.object({ runs: number, tokens: number, cost: number });
const meter = z.object({ current_total: number, limit: number, over_limit: z.boolean() });
const detail = z.object({
  subscription, account,
  plan: z.object({ plan_id: id, name: z.string() }).nullable(),
  plan_version: z.object({ plan_version_id: id, plan_id: id }).nullable(),
  covered_sites: z.unknown(), // Kept separate: a damaged site must not destroy valid detail.
  latest_billing_snapshots: snapshots, billing_snapshot_status: billing, coverage, expiry,
  commercial_policy: z.object({ subscription: z.object({ grace_period_days: count }) }),
  budget_headroom: z.object({ base_budget: budget, current_period_topup_delta: budget, effective_budget: budget }),
  budget_state: z.object({ runs: meter, tokens: meter, cost: meter }),
  subscription_grace: z.object({ subscription_status: status, active: z.boolean(), grace_until_at: z.string() }),
  // runs/tokens_total are sparse meter aggregates. budget_state always includes
  // their current_total, including real zero; legacy usage.tokens is not a source.
  usage_totals: z.object({ runs: number.optional(), tokens_total: number.optional(),
    cost_cny: number, cost_cny_snapshot_missing_count: count }),
  commercial_follow_up: z.object({ lifecycle_posture: z.string(),
    snapshot_reconciliation_summary: z.string(), next_operator_follow_up: z.string() }),
});

export type SubscriptionQueueItem = z.infer<typeof queueItem>;
export type SubscriptionDetail = z.infer<typeof detail>;
export type SiteEvidence = { sites: z.infer<typeof site>[]; issues: Array<{ index: number | null; reason: 'collection' | 'invalid' | 'duplicate' | 'account' }> };
export type SubscriptionEvidence = { detail: SubscriptionDetail; sites: SiteEvidence };
export class SubscriptionEvidenceError extends Error {}

function requireValue<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new SubscriptionEvidenceError('Invalid subscription evidence');
  return result.data;
}
function checkTarget(item: { subscription: z.infer<typeof subscription>; account: z.infer<typeof account>;
  coverage: z.infer<typeof coverage>; latest_billing_snapshots: z.infer<typeof snapshots> }) {
  const sub = item.subscription;
  if ((item.account && item.account.account_id !== sub.account_id)
    || item.coverage.covered_by_subscription_id !== sub.subscription_id
    || item.coverage.plan_id !== sub.plan_id || item.coverage.plan_version_id !== sub.plan_version_id
    || item.coverage.subscription_status !== sub.status) {
    throw new SubscriptionEvidenceError('Mismatched subscription evidence');
  }
}

export function readSiteEvidence(value: unknown, accountId: string): SiteEvidence {
  if (!Array.isArray(value)) return { sites: [], issues: [{ index: null, reason: 'collection' }] };
  const parsed = value.map(item => site.safeParse(item));
  const counts = new Map<string, number>();
  for (const item of parsed) if (item.success) counts.set(item.data.site_id, (counts.get(item.data.site_id) || 0) + 1);
  const evidence: SiteEvidence = { sites: [], issues: [] };
  parsed.forEach((item, index) => {
    const reason = !item.success ? 'invalid' : (counts.get(item.data.site_id) || 0) > 1 ? 'duplicate'
      : !accountId || item.data.account_id !== accountId ? 'account' : null;
    if (reason) evidence.issues.push({ index, reason });
    else if (item.success) evidence.sites.push(item.data);
  });
  return evidence;
}

export function readSubscriptionQueue(value: unknown, requestKey: string) {
  const payload = requireValue(queue, value);
  const requested = new URLSearchParams(requestKey);
  const { filters, pagination } = payload;
  for (const key of ['status', 'status_group', 'account_id', 'customer', 'plan_id', 'risk', 'sort'] as const) {
    if (filters[key] !== (requested.get(key) || '')) throw new SubscriptionEvidenceError('Mismatched subscription scope');
  }
  const expires = requested.get('expires_before');
  if ((expires ? Date.parse(expires) : null) !== (filters.expires_before ? Date.parse(filters.expires_before) : null)
    || filters.offset !== Number(requested.get('offset') || 0) || filters.limit !== Number(requested.get('limit'))
    || pagination.offset !== filters.offset || pagination.limit !== filters.limit || pagination.total !== payload.total
    || payload.items.length > pagination.limit
    || pagination.has_more !== (pagination.offset + payload.items.length < payload.total)) {
    throw new SubscriptionEvidenceError('Mismatched subscription pagination');
  }
  const ids = new Set<string>();
  for (const item of payload.items) {
    checkTarget(item);
    const sub = item.subscription;
    if (ids.has(sub.subscription_id) || readSiteEvidence(item.covered_sites, sub.account_id).issues.length
      || (filters.account_id && sub.account_id !== filters.account_id)
      || (filters.plan_id && sub.plan_id !== filters.plan_id)
      || (filters.status && sub.status !== filters.status)
      || (filters.status_group && !['trialing', 'active', 'past_due', 'suspended'].includes(sub.status))
      || (filters.risk === 'needs_action' ? item.operator_risk.level === 'stable'
        : filters.risk !== 'all' && item.operator_risk.level !== filters.risk)) {
      throw new SubscriptionEvidenceError('Invalid subscription queue target');
    }
    ids.add(sub.subscription_id);
  }
  // Risk summary precedes risk filtering and pagination in the service. Do not
  // equate its sum to total or items.length, including legitimate empty pages.
  return payload;
}

export function readSubscriptionDetail(value: unknown, subscriptionId: string): SubscriptionEvidence {
  const payload = requireValue(detail, value);
  checkTarget(payload);
  const sub = payload.subscription;
  if (sub.subscription_id !== subscriptionId || (payload.plan && payload.plan.plan_id !== sub.plan_id)
    || (payload.plan_version && payload.plan_version.plan_id !== sub.plan_id)
    || payload.subscription_grace.subscription_status !== sub.status) {
    throw new SubscriptionEvidenceError('Mismatched subscription target');
  }
  // Current published plan parameters may differ from the stored version ID.
  // Billing counts exclude archived/released sites: no cross-collection equality.
  return { detail: payload, sites: readSiteEvidence(payload.covered_sites, sub.account_id) };
}

export function subscriptionAuditScope(evidence: SubscriptionEvidence) {
  const accountId = evidence.detail.account?.account_id || '';
  // Subscription audits use the customer's scope, like the route projection.
  // A site is a fallback only when the account association is unavailable.
  if (accountId) return { accountId, siteId: '' };
  const siteId = evidence.sites.sites[0]?.site_id || '';
  return siteId ? { accountId: '', siteId } : null;
}
