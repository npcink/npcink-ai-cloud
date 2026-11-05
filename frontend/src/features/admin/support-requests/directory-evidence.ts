import { z } from 'zod';
import { supportPriority, supportStatus } from './detail-evidence';
import type { SupportRequestListPayload } from './types';

const id = z.string().min(1).refine(value => value.trim() === value);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const date = z.string().refine(value => Number.isFinite(Date.parse(value))).nullish().transform(value => value ?? undefined);
const row = z.object({
  request_id: id, account_id: id, account_name: z.string().optional(), site_name: z.string().optional(), site_url: z.string().optional(), email: z.string(),
  site_id: z.string().optional(), principal_id: z.string().optional(),
  topic: z.enum(['general', 'billing', 'payment', 'site', 'usage', 'account']),
  title: z.string(), description: z.string(), status: supportStatus,
  priority: supportPriority,
  admin_note: z.string().optional(),
  waiting_on: z.enum(['operator', 'customer', 'none']).optional(),
  first_operator_response_at: date, last_customer_activity_at: date,
  last_operator_public_activity_at: date, waiting_since: date,
  created_at: date, updated_at: date, resolved_at: date, closed_at: date,
});
const directory = z.object({
  items: z.array(z.unknown()),
  pagination: z.object({ limit: count.min(1).max(200), offset: count, total: count, has_more: z.boolean() }),
  summary: z.object({ open: count, in_progress: count, critical: count, warning: count,
    monitor: count, stable: count, waiting_for_operator: count, waiting_for_customer: count, overdue: count }),
});

const SUPPORT_REQUEST_OVERDUE_HOURS = 48;

/** Mirrors the repository's overdue predicate without reading mutable UI state. */
export function isSupportRequestOverdue(
  request: Pick<SupportRequestListPayload['items'][number], 'waiting_on' | 'waiting_since'>,
  asOf: Date
): boolean {
  if (request.waiting_on !== 'operator' || !request.waiting_since) return false;
  const waitingSince = Date.parse(request.waiting_since);
  return Number.isFinite(waitingSince)
    && waitingSince <= asOf.getTime() - SUPPORT_REQUEST_OVERDUE_HOURS * 60 * 60 * 1000;
}

/** Mirrors list_admin_support_requests' five-field normalized LIKE scope. */
export function matchesSupportRequestQuery(
  request: Pick<SupportRequestListPayload['items'][number], 'request_id' | 'email' | 'title' | 'account_id' | 'site_id'>,
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [request.request_id, request.email, request.title, request.account_id, request.site_id || '']
    .some(value => value.toLowerCase().includes(normalized));
}

// Match list_admin_support_requests, including nullable serializer dates. A bad
// envelope is a failed read; individual rows are isolated with visible evidence.
export function readSupportDirectory(value: unknown, requestKey: string, asOf = new Date()): SupportRequestListPayload {
  const parsed = directory.parse(value), params = new URLSearchParams(requestKey);
  const { limit, offset, total, has_more } = parsed.pagination;
  if (limit !== Number(params.get('limit') || 100) || offset !== Number(params.get('offset') || 0)
    || parsed.items.length > limit || (parsed.items.length > 0 && offset + parsed.items.length > total)
    || has_more !== (offset + parsed.items.length < total)) throw new Error('Invalid support directory pagination');
  const items: SupportRequestListPayload['items'] = [], issues: string[] = [], seen = new Set<string>();
  for (const [index, raw] of parsed.items.entries()) {
    const result = row.safeParse(raw);
    if (!result.success || seen.has(result.data.request_id)
      || (params.get('status') && result.data.status !== params.get('status'))
      || (params.get('topic') && result.data.topic !== params.get('topic'))
      || (params.get('attention') === 'waiting_for_operator' && result.data.waiting_on !== 'operator')
      || (params.get('attention') === 'overdue' && !isSupportRequestOverdue(result.data, asOf))
      || !matchesSupportRequestQuery(result.data, params.get('q') || '')) {
      issues.push(`items[${index + 1}]`); continue;
    }
    seen.add(result.data.request_id); items.push(result.data);
  }
  return { items, pagination: parsed.pagination, summary: parsed.summary, issues };
}
