import { z } from 'zod';
import { readSiteDisplay } from '@/lib/identity-display';

const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);
const text = z.string();
const timestamp = z.iso.datetime({ offset: true });
const point = z.object({ day: z.iso.date(), runs: count, succeeded: count, failed: count,
  success_rate: rate.nullable(), avg_latency_ms: z.number().nonnegative().nullable() });
const group = z.object({ group_id: text.min(1), runs_total: count, failed: count, provider_errors: count,
  provider_call_run_coverage_rate: rate, provider_call_gap_runs: count.nullish(), metered_run_coverage_rate: rate });
const failure = z.object({ run_id: text.min(1), site_id: text.min(1), profile_id: text,
  provider_id: text, model_id: text, error_code: text.min(1), reason: text.min(1), occurred_at: timestamp });
const alert = z.object({ code: text.min(1), severity: text.min(1), title: text, summary: text,
  count, capabilities: z.array(text), suggested_action: text, href: text,
  daily_counts: z.array(z.object({ day: z.iso.date(), count })) });
const telemetry = z.object({
  site_display: z.unknown().optional().transform(readSiteDisplay),
  generated_at: timestamp,
  window: z.object({ since: timestamp, until: timestamp }),
  filters: z.object({ site_id: text, capability: text, recent_minutes: count.positive(), since: timestamp, limit: count.positive() }),
  evidence_limits: z.object({ runs_truncated: z.boolean(), provider_calls_truncated: z.boolean(),
    meter_events_truncated: z.boolean(), capability_groups_truncated: z.boolean() }),
  totals: z.object({ runs: count, provider_calls: count, usage_meter_events: count,
    ai_evidence_required_runs: count, provider_evidence_required_runs: count,
    provider_evidence_pending_runs: count, non_ai_zero_credit_runs: count,
    provider_call_run_coverage_rate: rate, metered_run_coverage_rate: rate }),
  governance_gaps: z.object({ unmetered_capabilities: z.array(text), missing_provider_call_capabilities: z.array(text),
    unmetered_run_count: count, runs_without_provider_call_count: count, review_guidance: text }),
  alert_summary: z.object({ status: z.enum(['inactive', 'ok', 'warning', 'error']), summary: text, next_action: text,
    alert_count: count, alerts: z.array(alert) }),
  usage_statistics: z.object({ timeline: z.array(point) }),
  capability_groups: z.array(z.unknown()), provider_failures: z.array(z.unknown()),
});

// Compare timestamps at millisecond precision; the server may emit microseconds.
export function readRuntimeTelemetry(value: unknown, requestKey?: string) {
  const raw = telemetry.parse(value), t = raw.totals, g = raw.governance_gaps, a = raw.alert_summary;
  const start = Date.parse(raw.window.since), end = Date.parse(raw.window.until);
  const expectedSince = (params: URLSearchParams) => Math.min(end, Math.max(
    end - raw.filters.recent_minutes * 60_000, params.get('since') ? Date.parse(params.get('since')!) : 0));
  if (end !== Date.parse(raw.generated_at) || start > end || start !== Date.parse(raw.filters.since)
    || t.ai_evidence_required_runs + t.non_ai_zero_credit_runs !== t.runs
    || t.provider_evidence_required_runs + t.provider_evidence_pending_runs !== t.ai_evidence_required_runs
    || g.unmetered_run_count > t.ai_evidence_required_runs
    || g.runs_without_provider_call_count > t.provider_evidence_required_runs
    || (t.provider_evidence_required_runs === 0 && t.provider_call_run_coverage_rate !== 1)
    || (t.ai_evidence_required_runs === 0 && t.metered_run_coverage_rate !== 1)
    || a.alert_count !== a.alerts.length || (a.status === 'ok' && a.alerts.length > 0)
    || (a.status === 'inactive' && t.runs !== 0)) throw new Error('Invalid runtime diagnostic metrics or window');
  if (requestKey !== undefined) {
    const params = new URLSearchParams(requestKey);
    if (raw.filters.site_id !== (params.get('site_id') || '') || raw.filters.capability !== (params.get('capability') || '')
      || raw.filters.limit !== Number(params.get('limit') || 20)
      || raw.filters.recent_minutes !== Number(params.get('recent_minutes') || 60)
      || Math.abs(start - expectedSince(params)) > 1) throw new Error('Runtime diagnostics do not match the requested scope');
  }
  const issues: string[] = [];
  const capability_groups: z.infer<typeof group>[] = [];
  const provider_failures: z.infer<typeof failure>[] = [];
  for (const [i, value] of raw.capability_groups.entries()) {
    const parsed = group.safeParse(value);
    if (!parsed.success || parsed.data.failed > parsed.data.runs_total) issues.push(`capability_groups[${i + 1}]`);
    else capability_groups.push(parsed.data);
  }
  for (const [i, value] of raw.provider_failures.entries()) {
    const parsed = failure.safeParse(value);
    if (!parsed.success || (raw.filters.site_id && parsed.data.site_id !== raw.filters.site_id)
      || Date.parse(parsed.data.occurred_at) < start || Date.parse(parsed.data.occurred_at) > end) issues.push(`provider_failures[${i + 1}]`);
    else provider_failures.push(parsed.data);
  }
  for (const p of raw.usage_statistics.timeline) {
    if (p.succeeded + p.failed > p.runs || (p.runs === 0 ? p.success_rate !== null
      : p.success_rate === null || Math.abs(p.success_rate - p.succeeded / p.runs) > 0.0001)
      || p.day < raw.window.since.slice(0, 10) || p.day > raw.window.until.slice(0, 10)) throw new Error('Invalid runtime usage timeline');
  }
  return { ...raw, capability_groups, provider_failures, issues };
}
