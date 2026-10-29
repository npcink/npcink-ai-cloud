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

function asNumber(value: unknown): number {
  return Number(value ?? 0) || 0;
}

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

export function normalizeRuntimeTelemetry(raw: any): RuntimeTelemetrySummary {
  const totals = raw?.totals ?? {};
  const gaps = raw?.governance_gaps ?? {};
  const alertSummary = raw?.alert_summary ?? {};
  const usageStatistics = raw?.usage_statistics ?? {};
  return {
    generatedAt: String(raw?.generated_at ?? ''),
    window: { since: String(raw?.window?.since ?? raw?.filters?.since ?? ''), until: String(raw?.window?.until ?? raw?.generated_at ?? '') },
    evidenceLimits: Object.fromEntries(Object.entries(raw?.evidence_limits ?? {}).map(([key, value]) => [key, value === true])),
    displayLimit: raw?.filters?.limit == null ? null : asNumber(raw.filters.limit),
    sampleLimited: Boolean(raw?.evidence_limits?.runs_truncated || raw?.evidence_limits?.provider_calls_truncated || raw?.evidence_limits?.meter_events_truncated),
    usageTimeline: Array.isArray(usageStatistics?.timeline)
      ? usageStatistics.timeline.map((point: any) => ({
          day: String(point?.day ?? ''),
          runs: asNumber(point?.runs),
          succeeded: asNumber(point?.succeeded),
          failed: asNumber(point?.failed),
          successRate: point?.success_rate == null ? null : asNumber(point?.success_rate),
          avgLatencyMs: point?.avg_latency_ms == null ? null : asNumber(point?.avg_latency_ms),
        }))
      : [],
    providerFailures: Array.isArray(raw?.provider_failures) ? raw.provider_failures.map((item: any) => ({
      runId: String(item.run_id || ''), siteId: String(item.site_id || ''),
      profileId: String(item.profile_id || ''), providerId: String(item.provider_id || ''),
      modelId: String(item.model_id || ''), errorCode: String(item.error_code || ''),
      reason: String(item.reason || 'unknown'), occurredAt: String(item.occurred_at || ''),
    })) : [],
    capabilityGroups: Array.isArray(raw?.capability_groups) ? raw.capability_groups.map((group: any) => ({
      id: String(group.group_id ?? ''),
      runs: asNumber(group.runs_total),
      failed: asNumber(group.failed),
      providerErrors: asNumber(group.provider_errors),
      providerCoverage: asNumber(group.provider_call_run_coverage_rate),
      providerGapRuns: group.provider_call_gap_runs == null ? null : asNumber(group.provider_call_gap_runs),
      meteringCoverage: asNumber(group.metered_run_coverage_rate),
    })) : [],
    totals: {
      runs: asNumber(totals.runs),
      providerCalls: asNumber(totals.provider_calls),
      usageMeterEvents: asNumber(totals.usage_meter_events),
      providerCallRunCoverageRate: asNumber(totals.provider_call_run_coverage_rate),
      providerEvidencePendingRuns: asNumber(totals.provider_evidence_pending_runs),
      providerEvidenceRequiredRuns: totals.provider_evidence_required_runs == null ? null : asNumber(totals.provider_evidence_required_runs),
      aiEvidenceRequiredRuns: totals.ai_evidence_required_runs == null ? null : asNumber(totals.ai_evidence_required_runs),
      meteredRunCoverageRate: asNumber(totals.metered_run_coverage_rate),
    },
    governanceGaps: {
      unmeteredCapabilities: Array.isArray(gaps.unmetered_capabilities) ? gaps.unmetered_capabilities.map(String) : [],
      missingProviderCallCapabilities: Array.isArray(gaps.missing_provider_call_capabilities) ? gaps.missing_provider_call_capabilities.map(String) : [],
      unmeteredRunCount: asNumber(gaps.unmetered_run_count),
      runsWithoutProviderCallCount: asNumber(gaps.runs_without_provider_call_count),
      reviewGuidance: String(gaps.review_guidance ?? ''),
    },
    alertSummary: {
      status: String(alertSummary.status ?? 'inactive'),
      summary: String(alertSummary.summary ?? ''),
      nextAction: String(alertSummary.next_action ?? ''),
      alertCount: asNumber(alertSummary.alert_count),
      alerts: ((Array.isArray(alertSummary.alerts)
        ? alertSummary.alerts.map((item: any) => ({
            code: String(item?.code ?? ''),
            severity: String(item?.severity ?? 'warning'),
            title: String(item?.title ?? ''),
            summary: String(item?.summary ?? ''),
            count: asNumber(item?.count),
            capabilities: Array.isArray(item?.capabilities) ? item.capabilities.map(String) : [],
            suggestedAction: String(item?.suggested_action ?? ''),
            href: String(item?.href ?? ''),
            dailyCounts: (Array.isArray(item?.daily_counts)
              ? item.daily_counts.map((point: any) => ({
                  day: String(point?.day ?? ''),
                  count: Math.max(0, asNumber(point?.count)),
                })).filter((point: { day: string }) => point.day)
              : []) as RuntimeTelemetryAlert['dailyCounts'],
          }))
        : []) as RuntimeTelemetryAlert[]
      ).sort((a, b) => alertSortRank(b.severity) - alertSortRank(a.severity) || b.count - a.count || a.code.localeCompare(b.code)),
    },
  };
}
