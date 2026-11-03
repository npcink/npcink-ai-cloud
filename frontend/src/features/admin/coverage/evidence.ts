import { z } from 'zod';

const count = z.number().int().nonnegative();
const timestamp = z.iso.datetime({ offset: true });
const text = z.string();
const severity = z.enum(['error', 'warning', 'ok', 'inactive']);
const item = z.object({
  account: z.object({ account_id: text.trim().min(1), name: text, status: text,
    metadata: z.record(text, z.unknown()).optional() }),
  primary_subscription: z.object({ subscription_id: text.trim().min(1), account_id: text.optional(),
    status: text, current_period_end_at: timestamp.nullable() }).nullable(),
  package: z.object({ display_package_label: text, package_kind: text, coverage_state: text }),
  primary_identity: z.object({ email: text, status: text, principal_id: text.optional() }).nullable().optional(),
  identity_relationship_state: z.enum(['healthy', 'missing', 'conflict', 'access_disabled']).optional(),
  severity, priority: count, reason_code: text.min(1), reason_label: text,
  recommended_action: text.min(1), action_label: text, action_href: text,
  evidence: z.object({ site_count: count, active_site_count: count, active_key_site_count: count,
    missing_key_site_count: count, subscription_status: text,
    current_period_end_at: timestamp.nullable(), days_until_end: z.number().int().nullable(),
    billing_snapshot_status: z.object({ status: text.min(1), summary: text,
      fresh_site_count: count, stale_site_count: count, missing_site_count: count }) }),
});
const queue = z.object({
  generated_at: timestamp,
  filters: z.object({ q: text, status: text, reason: text, sort: text, offset: count, limit: count.positive() }),
  summary: z.object({ total: count, visible: count, needs_action: count, error: count, warning: count,
    ok: count, inactive: count, reason_counts: z.record(text, count) }),
  total: count, hidden_internal_total: count,
  pagination: z.object({ offset: count, limit: count.positive(), total: count, has_more: z.boolean() }),
  items: z.array(z.unknown()),
});
export type CoverageQueueItem = z.infer<typeof item>;
export type CoverageWorkQueue = Omit<z.infer<typeof queue>, 'items'> & { items: CoverageQueueItem[]; issues: string[] };

// Mirrors get_admin_coverage_work_queue's action branches. No arbitrary URL is trusted.
function actionTarget(row: CoverageQueueItem): string | null {
  const account = `/admin/accounts/${encodeURIComponent(row.account.account_id)}`;
  switch (row.recommended_action) {
    case 'repair_customer_access': case 'inspect_customer_access': return `${account}#customer-access`;
    case 'review_customer_status': case 'inspect_when_needed': case 'wait_for_site_onboarding': return account;
    case 'change_customer_package': return `${account}#coverage-actions`;
    case 'inspect_site_footprint': case 'inspect_site_key_coverage': return `${account}#site-footprint`;
    case 'repair_subscription_lifecycle': case 'review_renewal': case 'inspect_billing_snapshot':
      return row.primary_subscription
        ? `/admin/subscriptions/${encodeURIComponent(row.primary_subscription.subscription_id)}`
        : `${account}#coverage-actions`;
    default: return null;
  }
}

export function readCoverageQueue(value: unknown, requestKey: string): CoverageWorkQueue {
  const parsed = queue.parse(value), params = new URLSearchParams(requestKey);
  const { pagination: p, summary: s, filters: f } = parsed;
  const q = (params.get('q') || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  if (f.q !== q || f.status !== (params.get('status') || 'all') || f.reason !== (params.get('reason') || '')
    || f.sort !== (params.get('sort') || 'priority') || f.offset !== Number(params.get('offset') || 0)
    || f.limit !== Number(params.get('limit') || 100) || p.limit !== f.limit || p.offset !== f.offset
    || p.total !== parsed.total || parsed.items.length > p.limit || s.visible !== parsed.items.length
    || (p.offset < p.total && parsed.items.length === 0)
    || p.has_more !== (p.offset + parsed.items.length < p.total)
    || (parsed.items.length > 0 && p.offset + parsed.items.length > p.total)
    || s.total !== s.error + s.warning + s.ok + s.inactive || s.needs_action !== s.error + s.warning
    || parsed.total > s.total) throw new Error('Invalid coverage queue scope or pagination');
  const items: CoverageQueueItem[] = [], issues: string[] = [], seen = new Set<string>();
  if (parsed.items.length !== Math.max(0, Math.min(p.limit, p.total - p.offset))) issues.push('pagination.items');
  for (const [index, raw] of parsed.items.entries()) {
    const result = item.safeParse(raw);
    if (!result.success) { issues.push(`items[${index + 1}]`); continue; }
    const row = result.data, target = actionTarget(row), key = row.account.account_id;
    const searchable = [row.account.account_id, row.account.name, row.account.metadata?.operator_display_name,
      row.primary_identity?.email, row.primary_identity?.principal_id, row.primary_subscription?.subscription_id,
      row.primary_subscription?.status, ...Object.values(row.package), row.reason_code, row.reason_label].join(' ').toLowerCase();
    if (seen.has(key) || !target || row.action_href !== target
      || (row.primary_subscription?.account_id && row.primary_subscription.account_id !== key)
      || (f.status === 'needs_action' ? !['error', 'warning'].includes(row.severity) : f.status !== 'all' && row.severity !== f.status)
      || (f.reason && row.reason_code !== f.reason) || !q.split(' ').every(term => searchable.includes(term))) {
      issues.push(`items[${index + 1}]`); continue;
    }
    seen.add(key); items.push({ ...row, action_href: target });
  }
  return { ...parsed, items, issues };
}
