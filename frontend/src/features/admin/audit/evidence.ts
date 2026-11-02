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
  pagination: z.object({ limit: count.positive(), offset: count, total: count, has_more: z.boolean(),
    next_offset: count.nullable(), last_offset: count, is_out_of_range: z.boolean() }),
  diagnostics: z.object({ returned_count: count, query_duration_ms: z.number().nonnegative() }),
});
const exactFields = ['site_id', 'account_id', 'actor_ref', 'scope_kind', 'scope_id',
  'idempotency_key', 'event_kind', 'outcome'] as const;

export function readAdminAuditEvidence(value: unknown, requestKey: string) {
  const parsed = page.parse(value), params = new URLSearchParams(requestKey), p = parsed.pagination;
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
    const row = result.data, created = Date.parse(row.created_at);
    if (seen.has(row.event_id) || (params.get('event_id') && row.event_id !== Number(params.get('event_id')))
      || exactFields.some(key => params.get(key) && row[key] !== params.get(key))
      || (params.get('created_from') && created < Date.parse(params.get('created_from')!))
      || (params.get('created_to') && created > Date.parse(params.get('created_to')!))) {
      issues.push(`items[${index + 1}]`); continue;
    }
    // Zod strips unknown properties: request/result payloads cannot reach the workspace.
    seen.add(row.event_id); items.push(row);
  }
  return { ...parsed, items, issues };
}
