import { z } from 'zod';

const text = z.string();
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const run = z.object({
  run_id: text.trim().min(1), site_id: text.trim().min(1), ability_name: text.min(1), ability_family: text,
  profile_id: text, status: text.trim().min(1), error_code: text.nullable(),
  started_at: timestamp.nullable(), finished_at: timestamp.nullable(), duration_ms: count.nullable(),
  provider_call_count: count, has_meter_event: z.boolean(),
  provider_evidence_state: z.enum(['not_required', 'recorded', 'pending', 'failed_without_call', 'canceled_without_call', 'missing']),
  selected_provider_id: text.nullish(), selected_model_id: text.nullish(),
});
const list = z.object({ items: z.array(z.unknown()), sampled: z.boolean(), truncated: z.boolean() });

export function readRuntimeRuns(value: unknown, scope: { site: string; capability: string; runId: string }) {
  const parsed = list.parse(value), issues: string[] = [], items: z.infer<typeof run>[] = [], seen = new Set<string>();
  for (const [index, value] of parsed.items.entries()) {
    const result = run.safeParse(value);
    if (!result.success) { issues.push(`items[${index + 1}]`); continue; }
    const row = result.data;
    // RuntimeService matches capability as exact family OR ability name OR profile id.
    if (seen.has(row.run_id) || (scope.runId && row.run_id !== scope.runId)
      || (scope.site && row.site_id !== scope.site)
      || (scope.capability && ![row.ability_family, row.ability_name, row.profile_id].includes(scope.capability))
      || (row.started_at && row.finished_at && Date.parse(row.finished_at) < Date.parse(row.started_at))) {
      issues.push(`items[${index + 1}]`); continue;
    }
    seen.add(row.run_id); items.push(row);
  }
  return { ...parsed, items, issues };
}
