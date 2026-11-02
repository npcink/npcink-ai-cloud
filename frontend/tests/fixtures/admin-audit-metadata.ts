import serializers from './admin-diagnostic-serializers.json' with { type: 'json' };

// Explicit normal-scenario parameter echo. Fault injections must bypass this.
export function buildAuditMetadata(params: URLSearchParams) {
  const filters = structuredClone(serializers.audit.filters);
  filters.event_id = Number(params.get('event_id') || 0);
  for (const key of ['site_id', 'account_id', 'event_kind', 'outcome', 'idempotency_key', 'actor_ref', 'scope_kind', 'scope_id'] as const) {
    filters[key] = params.get(key) || '';
  }
  const time = (key: string) => params.get(key)?.replace('t', 'T').replace(/z$/, 'Z') || null;
  return { filters: { ...filters, created_from: time('created_from'), created_to: time('created_to') },
    sort: structuredClone(serializers.audit.sort) };
}
