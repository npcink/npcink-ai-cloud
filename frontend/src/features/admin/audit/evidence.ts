import { z } from 'zod';

const count = z.number().int().nonnegative();
const text = z.string();
const timestamp = z.iso.datetime({ offset: true });
// Empty optional identifiers are emitted as strings by the metadata-only serializer.
const event = z.object({
  event_id: count.positive(), account_id: text, site_id: text, key_id: text,
  subscription_id: text, plan_id: text, plan_version_id: text, scope_kind: text, scope_id: text,
  event_kind: text.min(1), outcome: text.min(1), method: text, path: text,
  trace_id: text, idempotency_key: text, actor_kind: text.min(1), actor_ref: text,
  created_at: timestamp,
});
const page = z.object({
  items: z.array(z.unknown()), total: count, generated_at: timestamp,
  filters: z.object({ event_id: count, site_id: text, site_ids: z.array(text), account_id: text,
    event_kind: text, outcome: text, idempotency_key: text, actor_ref: text, scope_kind: text, scope_id: text,
    created_from: timestamp.nullable(), created_to: timestamp.nullable() }),
  sort: z.object({ created_at: z.literal('desc'), event_id: z.literal('desc') }),
  pagination: z.object({ limit: count.positive(), offset: count, total: count, has_more: z.boolean(),
    next_offset: count.nullable(), last_offset: count, is_out_of_range: z.boolean() }),
  diagnostics: z.object({ returned_count: count, query_duration_ms: z.number().nonnegative() }),
});
const exactFields = ['actor_ref', 'scope_kind', 'scope_id',
  'idempotency_key', 'event_kind', 'outcome'] as const;

function auditInstant(value: string): readonly [number, number] {
  const valid = timestamp.parse(value.replace('t', 'T').replace(/z$/, 'Z'));
  const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/;
  const digits = fraction.exec(valid)?.[1] || '';
  // Normalize only whole seconds through Date; compare fractions separately so
  // JS millisecond truncation cannot erase Python datetime's microseconds.
  // fromisoformat truncates any finer precision to six fractional digits.
  return [Date.parse(valid.replace(fraction, '')), Number(digits.padEnd(6, '0').slice(0, 6))];
}
function compareInstants(left: readonly [number, number], right: readonly [number, number]) {
  return left[0] - right[0] || left[1] - right[1];
}

export function readAdminAuditEvidence(value: unknown, requestKey: string) {
  const parsed = page.parse(value), params = new URLSearchParams(requestKey), p = parsed.pagination;
  const from = params.get('created_from'), to = params.get('created_to');
  const lower = from ? auditInstant(from) : null, upper = to ? auditInstant(to) : null;
  const f = parsed.filters;
  // Metadata echoes both supplied parameters even though the row predicate
  // gives site precedence. The admin endpoint never supplies site_ids.
  if (f.event_id !== Number(params.get('event_id') || 0) || f.site_ids.length !== 0
    || (['site_id', 'account_id', ...exactFields] as const).some(key => f[key] !== (params.get(key) || ''))
    || (lower ? f.created_from === null || compareInstants(auditInstant(f.created_from), lower) !== 0 : f.created_from !== null)
    || (upper ? f.created_to === null || compareInstants(auditInstant(f.created_to), upper) !== 0 : f.created_to !== null)) {
    throw new Error('Audit evidence does not match the requested filters');
  }
  const next = p.offset + parsed.items.length, last = p.total > 0 ? Math.floor((p.total - 1) / p.limit) * p.limit : 0;
  if (p.limit !== Number(params.get('limit') || 50) || p.offset !== Number(params.get('offset') || 0)
    || p.total !== parsed.total || parsed.items.length > p.limit || (parsed.items.length > 0 && next > p.total)
    || (p.offset < p.total && parsed.items.length === 0)
    || p.has_more !== (next < p.total) || p.next_offset !== (p.has_more ? next : null)
    || p.last_offset !== last || p.is_out_of_range !== (p.offset > 0 && p.offset >= p.total)
    || parsed.diagnostics.returned_count !== parsed.items.length) throw new Error('Invalid audit evidence pagination');
  const items: z.infer<typeof event>[] = [], issues: string[] = [], seen = new Set<number>();
  if (parsed.items.length !== Math.max(0, Math.min(p.limit, p.total - p.offset))) issues.push('pagination.items');
  for (const [index, raw] of parsed.items.entries()) {
    const result = event.safeParse(raw);
    if (!result.success) { issues.push(`items[${index + 1}]`); continue; }
    const row = result.data, created = auditInstant(row.created_at);
    // The repository uses site_id first, then account_id only without a site.
    const wrongOwner = params.get('site_id') ? row.site_id !== params.get('site_id')
      : params.get('account_id') && row.account_id !== params.get('account_id');
    if (seen.has(row.event_id) || (params.get('event_id') && row.event_id !== Number(params.get('event_id')))
      || wrongOwner
      || exactFields.some(key => params.get(key) && row[key] !== params.get(key))
      || (lower && compareInstants(created, lower) < 0)
      || (upper && compareInstants(created, upper) > 0)) {
      issues.push(`items[${index + 1}]`); continue;
    }
    // Zod strips unknown properties: request/result payloads cannot reach the workspace.
    seen.add(row.event_id); items.push(row);
  }
  return { ...parsed, items, issues };
}
