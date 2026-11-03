import serializers from '../../fixtures/admin-diagnostic-serializers.json' with { type: 'json' };

// Explicit normal-scenario builder only. Fault injection must pass raw data directly.
// Defaults reflect the actual empty RuntimeService serializer, not production fallbacks.
export function buildRuntimeTelemetryFixture(input: Record<string, any>, params: URLSearchParams) {
  const empty = structuredClone(serializers.telemetryEmpty);
  const generated = input.generated_at || empty.generated_at;
  const end = Math.max(Date.parse(generated), params.get('since') ? Date.parse(params.get('since')!) : 0);
  const minutes = Number(params.get('recent_minutes') || 1440);
  const start = Math.min(end, Math.max(end - minutes * 60_000, params.get('since') ? Date.parse(params.get('since')!) : 0));
  const totals = { ...empty.totals, ...input.totals };
  // These historical normal mocks represent AI requests unless specified otherwise.
  totals.ai_evidence_required_runs = input.totals?.ai_evidence_required_runs ?? totals.runs - totals.non_ai_zero_credit_runs;
  totals.provider_evidence_required_runs = input.totals?.provider_evidence_required_runs ?? totals.ai_evidence_required_runs - totals.provider_evidence_pending_runs;
  // Actual serializer emits coverage 1 for a zero denominator and a dense UTC timeline.
  if (!totals.provider_evidence_required_runs) totals.provider_call_run_coverage_rate = 1;
  if (!totals.ai_evidence_required_runs) totals.metered_run_coverage_rate = 1;
  const timeline = [];
  for (let day = new Date(new Date(start).toISOString().slice(0, 10)); day.getTime() <= end; day = new Date(day.getTime() + 86_400_000)) {
    const last = day.toISOString().slice(0, 10) === new Date(end).toISOString().slice(0, 10);
    const runs = last ? totals.runs : 0;
    timeline.push({ day: day.toISOString().slice(0, 10), runs, succeeded: runs, failed: 0,
      success_rate: runs ? 1 : null, avg_latency_ms: null, latency_samples: 0 });
  }
  const alerts = (input.alert_summary?.alerts || []).map((alert: Record<string, unknown>) => ({
    title: '', summary: '', suggested_action: '', href: '/admin/troubleshooting', capabilities: [], daily_counts: [], ...alert,
  }));
  return {
    ...empty, ...input, generated_at: Date.parse(generated) === end ? generated : new Date(end).toISOString(),
    window: { since: new Date(start).toISOString(), until: new Date(end).toISOString() },
    filters: { site_id: params.get('site_id') || '', capability: params.get('capability') || '',
      recent_minutes: minutes, since: new Date(start).toISOString(), limit: Number(params.get('limit') || 25) },
    totals, governance_gaps: { ...empty.governance_gaps, ...input.governance_gaps },
    evidence_limits: { ...empty.evidence_limits, ...input.evidence_limits },
    usage_statistics: { ...empty.usage_statistics, timeline, ...input.usage_statistics },
    capability_groups: (input.capability_groups || []).map((group: Record<string, unknown>) => ({
      failed: 0, provider_errors: 0, provider_call_run_coverage_rate: 1, metered_run_coverage_rate: 1, ...group,
    })),
    alert_summary: { ...empty.alert_summary, ...input.alert_summary, alerts, alert_count: alerts.length },
  };
}

export function buildRuntimeRunsFixture(input: Record<string, any>) {
  return { sampled: false, truncated: false, ...input, items: input.items.map((run: Record<string, any>) => ({
    error_code: null, started_at: null, finished_at: null, duration_ms: null,
    provider_evidence_state: run.provider_call_count ? 'recorded' : 'missing', ...run,
  })) };
}
