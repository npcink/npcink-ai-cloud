import { readRuntimeTelemetry } from './telemetry-evidence';

export type RuntimeTelemetryAlert = {
  code: string;
  severity: string;
  title: string;
  summary: string;
  count: number;
  capabilities: string[];
  suggestedAction: string;
  href: string;
  dailyCounts: Array<{ day: string; count: number }>;
};

export type ProviderFailure = {
  runId: string; siteId: string; profileId: string; providerId: string;
  modelId: string; errorCode: string; reason: string; occurredAt: string;
};

export type UsageTimelinePoint = {
  day: string;
  runs: number;
  succeeded: number;
  failed: number;
  successRate: number | null;
  avgLatencyMs: number | null;
};

export type RuntimeTelemetrySummary = {
  issues: string[];
  sampleLimited: boolean;
  providerFailures: ProviderFailure[];
  generatedAt: string;
  window: { since: string; until: string };
  evidenceLimits: Record<string, boolean>;
  displayLimit: number | null;
  usageTimeline: UsageTimelinePoint[];
  capabilityGroups: {
    id: string;
    runs: number;
    failed: number;
    providerErrors: number;
    providerCoverage: number;
    providerGapRuns: number | null;
    meteringCoverage: number;
  }[];
  totals: {
    runs: number;
    providerCalls: number;
    usageMeterEvents: number;
    providerCallRunCoverageRate: number;
    providerEvidencePendingRuns: number;
    providerEvidenceRequiredRuns: number | null;
    aiEvidenceRequiredRuns: number | null;
    meteredRunCoverageRate: number;
  };
  governanceGaps: {
    unmeteredCapabilities: string[];
    missingProviderCallCapabilities: string[];
    unmeteredRunCount: number;
    runsWithoutProviderCallCount: number;
    reviewGuidance: string;
  };
  alertSummary: {
    status: string;
    summary: string;
    nextAction: string;
    alertCount: number;
    alerts: RuntimeTelemetryAlert[];
  };
};

export type RuntimeRunEvidence = {
  run_id: string;
  site_id: string;
  ability_name: string;
  ability_family: string;
  profile_id: string;
  status: string;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  selected_provider_id?: string | null;
  selected_model_id?: string | null;
  provider_call_count: number;
  provider_evidence_state?: string;
  has_meter_event: boolean;
};

export function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function statusTone(status: string): 'success' | 'warning' | 'error' | 'pending' {
  const normalized = status.trim().toLowerCase();
  if (['ok', 'healthy', 'success', 'succeeded', 'ready'].includes(normalized)) return 'success';
  if (['error', 'critical', 'failed'].includes(normalized)) return 'error';
  if (['warning', 'degraded'].includes(normalized)) return 'warning';
  return 'pending';
}

function alertSortRank(severity: string): number {
  const tone = statusTone(severity);
  if (tone === 'error') return 3;
  if (tone === 'warning') return 2;
  if (tone === 'success') return 1;
  return 0;
}

export function normalizeRuntimeTelemetry(value: unknown, requestKey?: string): RuntimeTelemetrySummary {
  const raw = readRuntimeTelemetry(value, requestKey), totals = raw.totals, gaps = raw.governance_gaps;
  return {
    issues: raw.issues,
    generatedAt: raw.generated_at,
    window: raw.window,
    evidenceLimits: raw.evidence_limits,
    displayLimit: raw.filters.limit,
    sampleLimited: raw.evidence_limits.runs_truncated || raw.evidence_limits.provider_calls_truncated || raw.evidence_limits.meter_events_truncated,
    usageTimeline: raw.usage_statistics.timeline.map(point => ({ day: point.day, runs: point.runs,
      succeeded: point.succeeded, failed: point.failed, successRate: point.success_rate, avgLatencyMs: point.avg_latency_ms })),
    providerFailures: raw.provider_failures.map(item => ({ runId: item.run_id, siteId: item.site_id,
      profileId: item.profile_id, providerId: item.provider_id, modelId: item.model_id,
      errorCode: item.error_code, reason: item.reason, occurredAt: item.occurred_at })),
    capabilityGroups: raw.capability_groups.map(group => ({ id: group.group_id, runs: group.runs_total,
      failed: group.failed, providerErrors: group.provider_errors, providerCoverage: group.provider_call_run_coverage_rate,
      providerGapRuns: group.provider_call_gap_runs ?? null, meteringCoverage: group.metered_run_coverage_rate })),
    totals: {
      runs: totals.runs, providerCalls: totals.provider_calls, usageMeterEvents: totals.usage_meter_events,
      providerCallRunCoverageRate: totals.provider_call_run_coverage_rate,
      providerEvidencePendingRuns: totals.provider_evidence_pending_runs,
      providerEvidenceRequiredRuns: totals.provider_evidence_required_runs,
      aiEvidenceRequiredRuns: totals.ai_evidence_required_runs, meteredRunCoverageRate: totals.metered_run_coverage_rate,
    },
    governanceGaps: { unmeteredCapabilities: gaps.unmetered_capabilities,
      missingProviderCallCapabilities: gaps.missing_provider_call_capabilities,
      unmeteredRunCount: gaps.unmetered_run_count, runsWithoutProviderCallCount: gaps.runs_without_provider_call_count,
      reviewGuidance: gaps.review_guidance },
    alertSummary: { status: raw.alert_summary.status, summary: raw.alert_summary.summary,
      nextAction: raw.alert_summary.next_action, alertCount: raw.alert_summary.alert_count,
      alerts: raw.alert_summary.alerts.map(item => ({ code: item.code, severity: item.severity, title: item.title,
        summary: item.summary, count: item.count, capabilities: item.capabilities, suggestedAction: item.suggested_action,
        href: item.href, dailyCounts: item.daily_counts })).sort((a, b) =>
        alertSortRank(b.severity) - alertSortRank(a.severity) || b.count - a.count || a.code.localeCompare(b.code)),
    },
  };
}
