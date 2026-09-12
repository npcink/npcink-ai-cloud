'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackofficeEmptyState,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  EditorAssistQualityPanel,
} from '@/components/admin/EditorAssistQualityPanel';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/utils';

const runtimeTelemetryClient = createApiClient({ idempotencyPrefix: 'runtime_telemetry' });

type RuntimeTelemetryAlert = {
  code: string;
  severity: string;
  title: string;
  summary: string;
  count: number;
  capabilities: string[];
  suggestedAction: string;
  href: string;
};

type ProviderFailure = {
  runId: string; siteId: string; profileId: string; providerId: string;
  modelId: string; errorCode: string; reason: string; occurredAt: string;
};

type RuntimeTelemetrySummary = {
  providerFailures: ProviderFailure[];
  generatedAt: string;
  capabilityGroups: {
    id: string;
    runs: number;
    failed: number;
    providerErrors: number;
    providerCoverage: number;
    meteringCoverage: number;
  }[];
  totals: {
    runs: number;
    providerCalls: number;
    usageMeterEvents: number;
    providerCallRunCoverageRate: number;
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

type RuntimeRunEvidence = {
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
  provider_call_count: number;
  has_meter_event: boolean;
};

type EvidenceLane = {
  id: string;
  href: string;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
};

type TranslationFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

const WINDOW_OPTIONS = [24, 72, 168] as const;

const evidenceLanes: EvidenceLane[] = [
  {
    id: 'audit',
    href: '/admin/audit',
    titleKey: 'admin.audit_workspace.title',
    titleFallback: 'Audit evidence',
    descKey: 'admin.audit_workspace.lane_description',
    descFallback: 'Exact service operation receipts, outcomes, scopes, and bounded request metadata.',
  },
  {
    id: 'plugin',
    href: '/admin/plugin-observability',
    titleKey: 'admin.nav_plugin_observability',
    titleFallback: 'Plugin observability',
    descKey: 'admin.advanced.plugin_observability_desc',
    descFallback: 'Plugin event volume, error pressure, latency, and recent failure evidence.',
  },
  {
    id: 'media',
    href: '/admin/media-observability',
    titleKey: 'admin.nav_media_observability',
    titleFallback: 'Media observability',
    descKey: 'admin.advanced.media_observability_desc',
    descFallback: 'Media processing jobs, failures, processing duration, and compression value.',
  },
  {
    id: 'vector',
    href: '/admin/vector-observability',
    titleKey: 'admin.nav_vector_observability',
    titleFallback: 'Vector observability',
    descKey: 'admin.advanced.vector_observability_desc',
    descFallback: 'Vector and Site Knowledge indexing health for support investigations.',
  },
  {
    id: 'feedback',
    href: '/admin/agent-feedback',
    titleKey: 'admin.nav_agent_feedback',
    titleFallback: 'Agent feedback quality',
    descKey: 'admin.advanced.agent_feedback_desc',
    descFallback: 'Read-only quality signals from local operator feedback across Cloud-backed AI assistance.',
  },
  {
    id: 'advisor',
    href: '/admin/ai-advisor',
    titleKey: 'admin.ai_advisor.title',
    titleFallback: 'Operations Advisor',
    descKey: 'admin.advanced.ai_advisor_desc',
    descFallback: 'AI-assisted diagnosis for selected operational signals.',
  },
];

const runtimeEvidenceItems = [
  {
    titleKey: 'admin.advanced.runtime_resolution_title',
    titleFallback: 'Runtime resolution',
    descKey: 'admin.advanced.runtime_resolution_desc',
    descFallback: 'Capability to profile, supplier, and model selection evidence. Read-only, not a router editor.',
  },
  {
    titleKey: 'admin.advanced.capability_matrix_title',
    titleFallback: 'Capability matrix',
    descKey: 'admin.advanced.capability_matrix_desc',
    descFallback: 'Current Cloud runtime mapping across capabilities, selected providers, and write posture.',
  },
  {
    titleKey: 'admin.advanced.runtime_profiles_title',
    titleFallback: 'Runtime configurations',
    descKey: 'admin.advanced.runtime_profiles_desc',
    descFallback: 'Cloud runtime profile metadata and selected provider/model references.',
  },
  {
    titleKey: 'admin.advanced.recent_runtime_evidence_title',
    titleFallback: 'Recent runtime evidence',
    descKey: 'admin.advanced.recent_runtime_evidence_desc',
    descFallback: 'Recent run metadata used for diagnostics without exposing prompts, results, or provider secrets.',
  },
];

function normalizeWindow(value: string | null): 24 | 72 | 168 {
  const parsed = Number(value);
  return WINDOW_OPTIONS.includes(parsed as 24 | 72 | 168) ? parsed as 24 | 72 | 168 : 24;
}

function asNumber(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function normalizeRuntimeTelemetry(raw: any): RuntimeTelemetrySummary {
  const totals = raw?.totals ?? {};
  const gaps = raw?.governance_gaps ?? {};
  const alertSummary = raw?.alert_summary ?? {};
  return {
    generatedAt: String(raw?.generated_at ?? ''),
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
      meteringCoverage: asNumber(group.metered_run_coverage_rate),
    })) : [],
    totals: {
      runs: asNumber(totals.runs),
      providerCalls: asNumber(totals.provider_calls),
      usageMeterEvents: asNumber(totals.usage_meter_events),
      providerCallRunCoverageRate: asNumber(totals.provider_call_run_coverage_rate),
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
      alerts: Array.isArray(alertSummary.alerts)
        ? alertSummary.alerts.map((item: any) => ({
            code: String(item?.code ?? ''),
            severity: String(item?.severity ?? 'warning'),
            title: String(item?.title ?? ''),
            summary: String(item?.summary ?? ''),
            count: asNumber(item?.count),
            capabilities: Array.isArray(item?.capabilities) ? item.capabilities.map(String) : [],
            suggestedAction: String(item?.suggested_action ?? ''),
            href: String(item?.href ?? ''),
          }))
        : [],
    },
  };
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function statusTone(status: string): 'success' | 'warning' | 'error' | 'pending' {
  const normalized = status.trim().toLowerCase();
  if (['ok', 'healthy', 'success', 'ready'].includes(normalized)) return 'success';
  if (['error', 'critical', 'failed'].includes(normalized)) return 'error';
  if (['warning', 'degraded'].includes(normalized)) return 'warning';
  return 'pending';
}

function scopeLabel(capabilities: string[], t: TranslationFn): string {
  return capabilities.map((capability) => {
    const labels: Record<string, string> = {
      text: 'admin.troubleshooting.scope_text',
      knowledge: 'admin.troubleshooting.scope_knowledge',
      image: 'admin.troubleshooting.scope_image',
      audio: 'admin.troubleshooting.scope_audio',
    };
    return labels[capability] ? t(labels[capability], {}, capability) : capability;
  }).join(', ') || t('admin.troubleshooting.runtime_scope', {}, 'Cloud runtime');
}

function issueTitle(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  const knownTitles: Record<string, [string, string]> = {
    'hosted_model.unmetered_runs': ['admin.troubleshooting.issue_meter_gap', 'Usage records missing'],
    'hosted_model.provider_errors': ['admin.troubleshooting.issue_provider_errors', 'Provider call errors'],
    'hosted_model.failed_runs': ['admin.troubleshooting.issue_runtime_failed', 'Runtime runs failed'],
    'hosted_model.provider_call_gap': ['admin.troubleshooting.issue_provider_gap', 'Provider call coverage gap'],
  };
  const known = knownTitles[issue.code];
  return known ? t(known[0], {}, known[1]) : issue.title || issue.code;
}

function issueSummary(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  const knownSummaries: Record<string, [string, string]> = {
    'hosted_model.unmetered_runs': ['admin.troubleshooting.issue_meter_gap_desc', 'Some requests have no matching usage record. This does not establish whether billing is incorrect.'],
    'hosted_model.provider_errors': ['admin.troubleshooting.issue_provider_errors_desc', 'Provider calls are returning errors in the current telemetry window.'],
    'hosted_model.failed_runs': ['admin.troubleshooting.issue_runtime_failed_desc', 'Runtime runs are failing before or during provider execution.'],
    'hosted_model.provider_call_gap': ['admin.troubleshooting.issue_provider_gap_desc', 'Some runtime runs do not have matching provider-call telemetry.'],
  };
  const known = knownSummaries[issue.code];
  return known ? t(known[0], {}, known[1]) : issue.summary;
}

function issueAction(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  if (issue.code === 'hosted_model.provider_errors') return t('admin.troubleshooting.failures_title');
  const knownActions: Record<string, [string, string]> = {
    inspect_metering_callback_or_usage_event_mapping: ['admin.troubleshooting.action_check_metering', 'Ask technical support to check usage event recording and request association for the affected functions.'],
    inspect_provider_credentials_quota_and_health: ['admin.troubleshooting.action_check_provider_health', 'Check supplier health, credentials, and quota evidence.'],
    inspect_runtime_failure_detail: ['admin.troubleshooting.action_check_runtime_failures', 'Inspect runtime failure codes and provider health evidence.'],
    inspect_runtime_failure_codes_and_provider_health: ['admin.troubleshooting.action_check_runtime_failures', 'Inspect runtime failure codes and provider health evidence.'],
    inspect_provider_call_recording_for_hosted_profiles: ['admin.troubleshooting.action_check_telemetry_gap', 'Inspect provider-call recording coverage for hosted profiles.'],
  };
  const known = knownActions[issue.suggestedAction];
  return known ? t(known[0], {}, known[1]) : t('admin.troubleshooting.action_unknown', {}, 'Ask technical support to investigate this time window and diagnostic code.');
}

function issueOwner(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  const key = issue.code === 'hosted_model.provider_errors' || issue.code === 'hosted_model.failed_runs'
    ? 'admin.troubleshooting.owner_maintenance'
    : issue.code === 'hosted_model.unmetered_runs' || issue.code === 'hosted_model.provider_call_gap'
      ? 'admin.troubleshooting.owner_support'
      : 'admin.troubleshooting.owner_platform';
  return t(key, {}, key === 'admin.troubleshooting.owner_maintenance' ? 'Maintenance engineer' : key === 'admin.troubleshooting.owner_support' ? 'Technical support' : 'Platform administrator');
}

function issueEvidenceGuidance(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  if (issue.code === 'hosted_model.provider_call_gap') {
    return t('admin.troubleshooting.evidence_provider_gap', {}, 'This is a provider-call evidence gap. It does not establish that the run failed.');
  }
  if (issue.code === 'hosted_model.unmetered_runs') {
    return t('admin.troubleshooting.evidence_meter_gap', {}, 'This is a metering evidence gap. It does not establish a billing error or run failure.');
  }
  if (issue.code === 'hosted_model.provider_errors') {
    return t('admin.troubleshooting.evidence_provider_error', {}, 'This represents provider-call errors. Confirm the individual run evidence before declaring recovery.');
  }
  return t('admin.troubleshooting.evidence_runtime_failure', {}, 'This represents runtime failures in the selected telemetry window.');
}

function severityLabel(severity: string, t: TranslationFn): string {
  return statusTone(severity) === 'error'
    ? t('admin.troubleshooting.severity_error', {}, 'Error')
    : statusTone(severity) === 'warning'
      ? t('admin.troubleshooting.severity_warning', {}, 'Warning')
      : t('admin.troubleshooting.severity_notice', {}, 'Notice');
}

export default function AdminTroubleshootingPage() {
  const { t } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const windowHours = normalizeWindow(searchParams.get('window'));
  const focusedIssueCode = searchParams.get('focus') || '';
  const siteFilter = searchParams.get('site') || '';
  const capabilityFilter = searchParams.get('function') || '';
  const usageStatisticsHref = `/admin/usage-statistics?window=${windowHours}&from=troubleshooting${siteFilter ? `&group=sites&site=${encodeURIComponent(siteFilter)}` : capabilityFilter ? `&group=functions&function=${encodeURIComponent(capabilityFilter)}` : ''}`;
  const [moreOpen, setMoreOpen] = useState(false);
  const [data, setData] = useState<RuntimeTelemetrySummary | null>(null);
  const [runEvidence, setRunEvidence] = useState<RuntimeRunEvidence[]>([]);
  const [runEvidenceMeta, setRunEvidenceMeta] = useState({ sampled: false, truncated: false });
  const [runEvidenceLoading, setRunEvidenceLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qualityRefreshSignal, setQualityRefreshSignal] = useState(0);
  const requestSequenceRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);

  const updateUrl = useCallback((updates: { window?: number | null; focus?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value && !(key === 'window' && value === 24)) params.set(key, String(value));
      else params.delete(key);
    });
    const query = params.toString();
    // These parameters only select client-side evidence. Native history keeps
    // useSearchParams in sync without an unnecessary server navigation.
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

  const loadTelemetry = useCallback(async (refresh = false) => {
    requestAbortRef.current?.abort();
    const sequence = ++requestSequenceRef.current;
    const controller = new AbortController();
    requestAbortRef.current = controller;
    if (refresh || hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ recent_minutes: String(windowHours * 60), limit: '25' });
      if (siteFilter) params.set('site_id', siteFilter);
      if (capabilityFilter) params.set('capability', capabilityFilter);
      const response = await runtimeTelemetryClient.request<unknown>(
        `/api/admin/runtime-telemetry?${params.toString()}`,
        { signal: controller.signal }
      );
      if (sequence !== requestSequenceRef.current) return;
      setData(normalizeRuntimeTelemetry(response.data));
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (sequence !== requestSequenceRef.current) return;
      setError(resolveUiErrorMessage(loadError, t('admin.troubleshooting.load_error', {}, 'Failed to load runtime diagnostics.')));
    } finally {
      if (sequence === requestSequenceRef.current) {
        requestAbortRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t, windowHours, siteFilter, capabilityFilter]);

  useEffect(() => {
    void loadTelemetry();
    return () => {
      requestSequenceRef.current += 1;
      requestAbortRef.current?.abort();
    };
  }, [loadTelemetry]);

  const issues = data?.alertSummary.alerts || [];
  const selectedIssue = issues.find((issue) => issue.code === focusedIssueCode) || null;
  const selectedGroups = data?.capabilityGroups.filter((group) => selectedIssue?.capabilities.includes(group.id)) || [];
  useEffect(() => {
    if (!selectedIssue) {
      setRunEvidence([]);
      setRunEvidenceMeta({ sampled: false, truncated: false });
      return;
    }
    const controller = new AbortController();
    setRunEvidenceLoading(true);
    const capability = selectedIssue.capabilities[0] || '';
    const query = new URLSearchParams({
      recent_minutes: String(windowHours * 60),
      issue_code: selectedIssue.code,
      limit: '25',
    });
    if (siteFilter) query.set('site_id', siteFilter);
    if (capabilityFilter || capability) query.set('capability', capabilityFilter || capability);
    void runtimeTelemetryClient.request<{ items?: RuntimeRunEvidence[]; sampled?: boolean; truncated?: boolean }>(
      `/api/admin/runtime-telemetry/runs?${query.toString()}`,
      { signal: controller.signal },
    ).then((response) => {
      if (controller.signal.aborted) return;
      const payload = response.data;
      setRunEvidence(Array.isArray(payload.items) ? payload.items : []);
      setRunEvidenceMeta({ sampled: Boolean(payload.sampled), truncated: Boolean(payload.truncated) });
    }).catch(() => {
      if (!controller.signal.aborted) {
        setRunEvidence([]);
        setRunEvidenceMeta({ sampled: false, truncated: false });
      }
    }).finally(() => {
      if (!controller.signal.aborted) setRunEvidenceLoading(false);
    });
    return () => controller.abort();
  }, [selectedIssue, siteFilter, capabilityFilter, windowHours]);
  const refreshInProgress = loading || refreshing;
  const conclusionStatus = data?.alertSummary.status || (loading ? 'pending' : 'inactive');
  const conclusionLabel = statusTone(conclusionStatus) === 'success'
    ? t('admin.troubleshooting.status_healthy', {}, 'Healthy')
    : statusTone(conclusionStatus) === 'error'
      ? t('admin.troubleshooting.status_critical', {}, 'Critical')
      : statusTone(conclusionStatus) === 'warning'
        ? t('admin.troubleshooting.status_warning', {}, 'Needs attention')
        : t('admin.troubleshooting.status_unknown', {}, 'Awaiting evidence');
  const conclusionSummary = issues.length
    ? t('admin.troubleshooting.conclusion_issues', { count: String(issues.length), issue: issueTitle(issues[0], t) }, '{{count}} problem types found in this period. Check {{issue}} first.')
    : data?.totals.runs === 0
      ? t('admin.troubleshooting.no_requests', {}, 'No requests in this period; runtime health cannot be assessed.')
      : t('admin.troubleshooting.conclusion_healthy', {}, 'No monitored anomalies found in this period.');

  return (
    <BackofficePageStack>
      <BackofficePageHeader
        title={t('admin.troubleshooting.title', {}, 'Runtime diagnostics')}
        secondaryAction={<div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => setMoreOpen(true)}>{t('admin.troubleshooting.more', {}, 'More diagnostics')}</button>
          <button className="btn btn-secondary btn-sm" disabled={refreshInProgress} onClick={() => { setQualityRefreshSignal((current) => current + 1); void loadTelemetry(true); }}>
            {refreshInProgress ? t('admin.troubleshooting.refreshing', {}, 'Refreshing...') : t('admin.troubleshooting.refresh', {}, 'Refresh')}
          </button>
        </div>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label={t('admin.troubleshooting.window_label', {}, 'Diagnostic window')}>
          {WINDOW_OPTIONS.map((hours) => (
            <button
              key={hours}
              type="button"
              aria-pressed={windowHours === hours}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${windowHours === hours ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'}`}
              onClick={() => updateUrl({ window: hours, focus: null })}
            >
              {hours === 24 ? '24h' : hours === 72 ? '72h' : '7d'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400" data-ui="diagnostic-source-freshness">
          {data?.generatedAt ? (
            <span>{t('admin.troubleshooting.runtime_updated_at', { time: formatDate(data.generatedAt) }, 'Runtime updated {{time}}')}</span>
          ) : null}

        </div>
      </div>

      {data ? (
        <div
          data-ui="runtime-diagnostic-conclusion"
          className="flex items-center gap-2 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <BackofficeStatusBadge label={conclusionLabel} status={statusTone(conclusionStatus)} />
            <p className="text-sm text-slate-700 dark:text-slate-200">{conclusionSummary}</p>
          </div>

        </div>
      ) : null}

      {error ? (
        <div
          data-ui="runtime-diagnostic-source-error"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200"
          role="alert"
        >
          <div className="font-semibold">
            {data
              ? t('admin.troubleshooting.refresh_error_summary', {}, 'Runtime telemetry could not refresh. Continue with the retained evidence or retry shortly.')
              : t('admin.troubleshooting.unavailable_error_summary', {}, 'Runtime telemetry is temporarily unavailable. Retry shortly.')}
          </div>
          {data ? <div className="mt-1 text-xs">{t('admin.troubleshooting.stale_notice', {}, 'The last successfully loaded diagnostic snapshot remains visible.')}</div> : null}
          <details className="mt-2 text-xs text-rose-700/85 dark:text-rose-300/85">
            <summary className="cursor-pointer font-medium">
              {t('admin.troubleshooting.technical_error_details', {}, 'Technical error details')}
            </summary>
            <p className="mt-1 break-words font-mono">{error}</p>
          </details>
        </div>
      ) : null}

      {loading && !data ? (
        <BackofficeSectionPanel className="animate-pulse space-y-3" aria-label={t('admin.troubleshooting.loading', {}, 'Loading runtime diagnostics')}>
          <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
        </BackofficeSectionPanel>
      ) : (
        <div className="space-y-4">
          <AdminDataTableFrame
            title={t('admin.troubleshooting.queue_title', {}, 'Problems in this period')}
            resultLabel={t('admin.troubleshooting.issue_count', { count: String(issues.length) }, '{{count}} problem types')}
            headerVisibility="sr-only"
            dataUi="runtime-diagnostic-table-frame"
            density="compact"
            bodyClassName="max-h-[var(--admin-diagnostic-queue-max-height)] overflow-auto"
          >
            {issues.length ? (
              <table
                data-ui="runtime-diagnostic-table"
                className="w-full min-w-[34rem] table-fixed text-left text-sm"
                aria-label={t('admin.troubleshooting.queue_title', {}, 'Runtime anomaly queue')}
              >
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2" scope="col">{t('admin.troubleshooting.column_issue', {}, 'Anomaly')}</th>
                    <th className="w-[10rem] px-3 py-2" scope="col">{t('admin.troubleshooting.column_scope', {}, 'Affected scope')}</th>
                    <th className="w-[5rem] px-3 py-2 text-right" scope="col">{t('admin.troubleshooting.column_occurrences', {}, 'Count')}</th>
                    <th className="w-[4.5rem] px-3 py-2 text-right" scope="col">{t('admin.troubleshooting.column_action', {}, 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {issues.map((issue) => {
                    const selected = selectedIssue?.code === issue.code;
                    return (
                      <tr
                        key={issue.code}
                        data-ui="runtime-diagnostic-issue"
                        aria-selected={selected}
                        className={selected ? 'bg-blue-50/80 dark:bg-blue-950/25' : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/30'}
                      >
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-950 dark:text-white">
                              {issueTitle(issue, t)}
                            </span>
                            <BackofficeStatusBadge label={severityLabel(issue.severity, t)} status={statusTone(issue.severity)} />
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{issueSummary(issue, t)}</p>
                        </td>
                        <td className="px-3 py-2.5 align-top text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {scopeLabel(issue.capabilities, t)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top font-semibold text-slate-700 dark:text-slate-200">
                          {formatNumber(issue.count)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          <button
                            type="button"
                            aria-label={`${t('admin.troubleshooting.inspect', {}, 'Inspect')} ${issueTitle(issue, t)}`}
                            aria-haspopup="dialog"
                            aria-expanded={selected}
                            className="cursor-pointer text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
                            onClick={() => updateUrl({ focus: issue.code })}
                          >
                            {t('admin.troubleshooting.inspect', {}, 'Inspect')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <BackofficeEmptyState
                className="m-5 md:m-6"
                title={error && !data
                  ? t('admin.troubleshooting.queue_unavailable_title', {}, 'Runtime anomaly data unavailable')
                  : data?.totals.runs === 0
                    ? t('admin.troubleshooting.no_requests_title', {}, 'No requests in this period')
                    : t('admin.troubleshooting.no_issue_title', {}, 'No monitored anomalies found')}
                description={error && !data
                  ? t('admin.troubleshooting.queue_unavailable_desc', {}, 'Cloud could not load runtime telemetry, so the current anomaly state cannot be determined. Retry before treating this window as healthy.')
                  : data?.totals.runs === 0
                    ? t('admin.troubleshooting.no_requests', {}, 'No requests in this period; runtime health cannot be assessed.')
                    : t('admin.troubleshooting.no_issue_desc', {}, 'No monitored anomalies found in this period.')}
              />
            )}
          </AdminDataTableFrame>

          {selectedIssue ? <AdminInspectorDrawer
            open={true}
            title={issueTitle(selectedIssue, t)}
            titleId="runtime-diagnostic-inspector-title"
            description={issueSummary(selectedIssue, t)}
            closeLabel={t('common.close', {}, 'Close')}
            onClose={() => updateUrl({ focus: null })}
            headerAccessory={<BackofficeStatusBadge label={severityLabel(selectedIssue.severity, t)} status={statusTone(selectedIssue.severity)} />}
          >
            <div id="runtime-diagnostic-inspector" className="space-y-6">
              {selectedIssue.code === 'hosted_model.provider_errors' ? <section data-ui="provider-failure-details" className="space-y-4">
                <h3 className="font-semibold">{t('admin.troubleshooting.failures_title')}</h3>
                <p className="text-xs text-slate-500">{t('admin.troubleshooting.failures_limit')}</p>
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="font-semibold">{t('admin.troubleshooting.operator_action_title')}</p>
                  <p>{t('admin.troubleshooting.provider_operator_next_step')}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href="/admin/runtime-profiles" className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_runtime_profiles')}</Link>
                    <Link href={`/admin/plugin-observability?window=${windowHours}`} className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_plugin_errors')}</Link>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{t('admin.troubleshooting.provider_operator_verify')}</p>
                </div>
                {data?.providerFailures.length ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  const blob = new Blob([JSON.stringify({ windowHours, generatedAt: data.generatedAt, recovery: 'unverified', failures: data.providerFailures }, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url; link.download = 'runtime-failure-evidence.json'; link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>{t('admin.troubleshooting.failure_export')}</button> : null}
                {data?.providerFailures.length ? (() => {
                  const first = data.providerFailures[0];
                  const reasonKey = ['output_schema_invalid', 'invalid_request', 'timeout'].includes(first.reason) ? first.reason : 'unknown';
                  return <>
                    <article className="space-y-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                      <p className="font-semibold">{t(`admin.troubleshooting.failure_reason_${reasonKey}`)} · {data.providerFailures.length} {t('admin.troubleshooting.failure_count_suffix')}</p>
                      <p className="text-sm">{first.siteId} · {first.providerId} / {first.modelId} · {first.profileId}</p>
                      <p className="text-sm">{t(`admin.troubleshooting.failure_step_${first.reason === 'output_schema_invalid' ? 'schema' : first.reason === 'timeout' ? 'timeout' : 'unknown'}`)}</p>
                      <p className="text-xs text-amber-700">{t('admin.troubleshooting.failure_recovery_unverified')}</p>
                    </article>
                    <details className="border-b border-slate-200 pb-4 dark:border-slate-800"><summary className="cursor-pointer text-sm font-semibold">{t('admin.troubleshooting.failure_records_summary', { count: String(data.providerFailures.length) })}</summary><div className="space-y-3 pt-3">{data.providerFailures.map((failure, index) => <div key={`${failure.runId}-${index}`} className="text-xs"><p>{failure.occurredAt ? formatDate(failure.occurredAt) : '—'} · {failure.profileId}</p><details><summary className="cursor-pointer">{t('admin.troubleshooting.technical_detail_title')}</summary><dl className="space-y-1 break-all py-2"><dt>{t('admin.troubleshooting.failure_run_id')}</dt><dd><code>{failure.runId}</code></dd><dt>{t('admin.troubleshooting.issue_code')}</dt><dd><code>{failure.errorCode}</code></dd></dl></details></div>)}</div></details>
                  </>;
                })() : <p className="text-sm">{t('admin.troubleshooting.failures_unavailable')}</p>}
              </section> : null}

                <section key={selectedIssue.code} data-ui="runtime-issue-evidence">
                  <h3 className="py-2 text-sm font-semibold">{t('admin.troubleshooting.open_evidence', {}, 'View function-level data')}</h3>
                  <div className="space-y-3 py-2">
                    <p className="break-all text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.issue_code', {}, 'Diagnostic code')}: {selectedIssue.code}</p>
                    <p className="text-sm">{t(selectedIssue.code === 'hosted_model.provider_errors' ? 'admin.troubleshooting.provider_error_count' : 'admin.troubleshooting.affected_runs', {}, 'Affected requests')}: {formatNumber(selectedIssue.count)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{issueEvidenceGuidance(selectedIssue, t)}</p>
                    {selectedGroups.length ? <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs" aria-label={t('admin.troubleshooting.open_evidence', {}, 'View function-level data')}>
                        <thead className="border-b border-slate-200 dark:border-slate-800"><tr>
                          <th className="px-3 py-2">{t('admin.troubleshooting.column_scope', {}, 'Affected scope')}</th>
                          <th className="px-3 py-2">{t('admin.troubleshooting.runs', {}, 'Requests')}</th>
                          <th className="px-3 py-2">{t('admin.troubleshooting.failed_requests', {}, 'Failed requests')}</th>
                          <th className="px-3 py-2">{t(selectedIssue.code === 'hosted_model.provider_errors' ? 'admin.troubleshooting.provider_error_count' : selectedIssue.code === 'hosted_model.unmetered_runs' ? 'admin.troubleshooting.metering_coverage' : 'admin.troubleshooting.provider_coverage', {}, 'Call record completeness')}</th>
                        </tr></thead>
                        <tbody>{selectedGroups.map((group) => <tr key={group.id} className="border-b border-slate-100 dark:border-slate-800">
                          <th className="px-3 py-2">{scopeLabel([group.id], t)}</th><td className="px-3 py-2">{formatNumber(group.runs)}</td><td className="px-3 py-2">{formatNumber(group.failed)}</td><td className="px-3 py-2">{selectedIssue.code === 'hosted_model.provider_errors' ? formatNumber(group.providerErrors) : formatRate(selectedIssue.code === 'hosted_model.unmetered_runs' ? group.meteringCoverage : group.providerCoverage)}</td>
                        </tr>)}</tbody>
                      </table>
                    </div> : <p className="text-sm">{t('admin.troubleshooting.groups_unavailable', {}, 'No matching function-level data was returned.')}</p>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.group_scope_note', {}, 'Totals for the returned functions in this period, not individual failure records. Functions may be omitted from the bounded response.')}</p>
                    <section className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800" data-ui="runtime-run-evidence">
                      <h3 className="text-sm font-semibold">{t('admin.troubleshooting.run_evidence_title', {}, 'Affected run evidence')}</h3>
                      {runEvidenceLoading ? <p className="text-xs text-slate-500">{t('admin.troubleshooting.run_evidence_loading', {}, 'Loading bounded run evidence…')}</p> : runEvidence.length ? <div className="space-y-2">{runEvidence.map((run) => <div key={run.run_id} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"><div className="flex flex-wrap items-center gap-2"><BackofficeStatusBadge label={run.status} status={statusTone(run.status)} /><span>{run.site_id}</span><code>{run.run_id}</code></div><p className="mt-1 text-slate-500">{run.ability_name} · {run.ability_family} · {run.profile_id}</p><dl className="mt-2 grid gap-x-4 gap-y-1 text-slate-500 sm:grid-cols-2"><div><dt className="inline font-semibold">{t('admin.troubleshooting.run_error_code', {}, 'Error code')}: </dt><dd className="inline break-all">{run.error_code || t('admin.troubleshooting.no_run_error_code', {}, 'None')}</dd></div><div><dt className="inline font-semibold">{t('admin.troubleshooting.run_duration', {}, 'Duration')}: </dt><dd className="inline">{run.duration_ms == null ? '—' : `${run.duration_ms} ms`}</dd></div><div><dt className="inline font-semibold">{t('admin.troubleshooting.run_provider_calls', {}, 'Provider calls')}: </dt><dd className="inline">{run.provider_call_count}</dd></div><div><dt className="inline font-semibold">{t('admin.troubleshooting.run_metering', {}, 'Metering')}: </dt><dd className="inline">{run.has_meter_event ? t('admin.troubleshooting.metered', {}, 'metered') : t('admin.troubleshooting.unmetered', {}, 'no meter event')}</dd></div></dl></div>)}</div> : <p className="text-xs text-slate-500">{t('admin.troubleshooting.run_evidence_unavailable', {}, 'No individual run evidence is available for this anomaly in the selected window.')}</p>}
                      {runEvidenceMeta.truncated ? <p className="text-xs text-amber-700">{t('admin.troubleshooting.run_evidence_truncated', {}, 'Showing a bounded sample of matching runs.')}</p> : null}
                    </section>
                  </div>
                </section>
                {selectedIssue.code !== 'hosted_model.provider_errors' ? <div className="space-y-2 text-sm">
                  <h3 className="font-semibold">{t('admin.troubleshooting.operator_action_title', {}, '按这个顺序处理')}</h3>
                  <p className="text-xs text-slate-500">{t('admin.troubleshooting.owner_label', {}, 'Recommended owner')}: {issueOwner(selectedIssue, t)}</p>
                  <ol className="list-decimal space-y-3 pl-5">
                    <li>{t('admin.troubleshooting.operator_step_confirm_scope', {}, '先确认影响范围：上面的功能分组和次数，表示需要核对的请求数量。')}</li>
                    <li>{t('admin.troubleshooting.operator_step_check_followup', {}, '查看同时段插件错误以寻找线索；该入口不含完整成功记录，不能据此确认恢复。')}</li>
                    <li>{t('admin.troubleshooting.operator_step_check_config', {}, '如果持续发生，再检查模型供应商连接或运行配置。')}</li>
                  </ol>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/admin/plugin-observability?window=${windowHours}`} className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_plugin_errors', {}, '查看相关运行记录')}</Link>
                    {selectedIssue.code === 'hosted_model.provider_errors' || selectedIssue.code === 'hosted_model.provider_call_gap' ? <Link href="/admin/ai-resources" className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_suppliers', {}, '检查模型供应商')}</Link> : null}
                    {selectedIssue.capabilities.some(scope => scope.toLowerCase().includes('knowledge') || scope.includes('知识')) ? <Link href="/admin/vector-observability" className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_knowledge', {}, '检查站点知识库')}</Link> : null}
                    <Link href="/admin/runtime-profiles" className="btn btn-ghost btn-sm">{t('admin.troubleshooting.view_runtime_profiles', {}, '查看运行配置')}</Link>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.operator_no_mutation_notice', {}, '跳转不会自动修改设置；供应商和运行配置页面包含修改操作，请确认原因后再调整。')}</p>
                  <details className="border-t border-slate-200 pt-3 dark:border-slate-800"><summary className="cursor-pointer text-sm">{t('admin.troubleshooting.technical_detail_title', {}, '技术详情')}</summary><p className="mt-2 break-all text-xs text-slate-500">{t('admin.troubleshooting.issue_code', {}, '诊断代码')}: <code>{selectedIssue.code}</code></p><p className="mt-2 text-xs text-slate-500">{t('admin.troubleshooting.requests_unavailable', {}, '当前只能看到功能分组汇总，尚不能定位具体请求或确认根因。')}</p></details>
                </div> : null}

              </div>
          </AdminInspectorDrawer> : null}
        </div>
      )}

      <Link href={usageStatisticsHref} className="text-sm text-blue-700 underline">{t('admin.nav_usage_statistics')}</Link>
      {siteFilter || capabilityFilter ? <p className="text-sm">{siteFilter ? `${t('admin.troubleshooting.site_filter', {}, 'Site')}: ${siteFilter}` : null}{siteFilter && capabilityFilter ? ' · ' : null}{capabilityFilter ? `${t('admin.troubleshooting.function_filter', {}, 'Function')}: ${capabilityFilter}` : null}</p> : null}
      {data ? <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.runs', {}, 'Runs')}: {formatNumber(data.totals.runs)} · {windowHours}h</p> : null}
      <AdminInspectorDrawer open={moreOpen} title={t('admin.troubleshooting.more', {}, 'More diagnostics')} titleId="runtime-more-title" closeLabel={t('common.close', {}, 'Close')} onClose={() => setMoreOpen(false)}>
      <div className="space-y-5">
      {data ? <details className="border-t border-slate-200 py-3 dark:border-slate-800" data-ui="runtime-data-integrity">
        <summary className="cursor-pointer text-sm font-semibold">{t('admin.troubleshooting.integrity_title', {}, 'Data completeness')}</summary>
        <dl className="mt-3 flex flex-wrap gap-6 text-sm">
          <div><dt>{t('admin.troubleshooting.provider_coverage', {}, 'Call record completeness')}</dt><dd className="font-semibold">{formatRate(data.totals.providerCallRunCoverageRate)}</dd></div>
          <div><dt>{t('admin.troubleshooting.metering_coverage', {}, 'Usage record completeness')}</dt><dd className="font-semibold">{formatRate(data.totals.meteredRunCoverageRate)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.integrity_note', {}, 'These rates measure record completeness for requests requiring AI evidence, not request success or billing accuracy.')}</p>
      <details id="runtime-evidence" className="admin-compact-surface border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer select-none px-3 py-3 text-sm font-semibold text-slate-900 dark:text-white">{t('admin.troubleshooting.runtime_metadata_title', {}, 'Runtime evidence guide')}</summary>
        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] table-fixed text-left text-sm" aria-label={t('admin.troubleshooting.runtime_metadata_title', {}, 'Runtime evidence guide')}>
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-400">
                <tr>
                  <th className="w-[30%] px-5 py-2.5 md:px-6" scope="col">{t('admin.troubleshooting.metadata_column_type', {}, 'Evidence type')}</th>
                  <th className="px-5 py-2.5 md:px-6" scope="col">{t('admin.troubleshooting.metadata_column_purpose', {}, 'Purpose')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {runtimeEvidenceItems.map((item) => (
                  <tr key={item.titleKey}>
                    <th className="px-5 py-3 font-semibold text-slate-950 dark:text-white md:px-6" scope="row">{t(item.titleKey, {}, item.titleFallback)}</th>
                    <td className="px-5 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300 md:px-6">{t(item.descKey, {}, item.descFallback)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 md:px-6"><p className="max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">{t('admin.advanced.runtime_evidence_boundary', {}, 'Evidence source remains Cloud runtime metadata such as run records, provider-call records, usage meter events, runtime profiles, and capability projection rows.')}</p><Link href="/admin/runtime-profiles" className="btn btn-secondary btn-sm">{t('admin.advanced.action_open_runtime_profiles', {}, 'Open runtime profiles')}</Link></div>
        </div>
      </details>
      </details> : null}

      <EditorAssistQualityPanel
        windowHours={windowHours}
        refreshSignal={qualityRefreshSignal}
      />

      <details id="evidence-lanes" className="border-t border-slate-200 dark:border-slate-800">
        <summary className="cursor-pointer py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.troubleshooting.lanes_title', {}, 'Evidence lanes')}</h2>
            </div>
            <BackofficeStatusBadge
              label={t('admin.troubleshooting.lane_count', { count: String(evidenceLanes.length) }, '{{count}} channels')}
              status="read_only"
            />
          </div>
        </summary>
        <div data-ui="runtime-evidence-lane-list" className="divide-y divide-slate-200 dark:divide-slate-800">
          {evidenceLanes.map((lane) => <Link key={lane.id} href={lane.href} className="block py-4 hover:text-blue-700">
            <span className="text-sm font-semibold">{t(lane.titleKey, {}, lane.titleFallback)} →</span>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t(lane.descKey, {}, lane.descFallback)}</p>
          </Link>)}
        </div>
      </details>


      </div>
      </AdminInspectorDrawer>
    </BackofficePageStack>
  );
}
