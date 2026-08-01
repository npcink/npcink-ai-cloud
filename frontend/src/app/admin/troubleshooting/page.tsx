'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackofficeEmptyState,
  BackofficeLayer,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeSummaryStrip,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  EditorAssistQualityPanel,
  type EditorAssistQualityRequestState,
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

type RuntimeTelemetrySummary = {
  generatedAt: string;
  totals: {
    runs: number;
    aiEvidenceRequiredRuns: number;
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
    totals: {
      runs: asNumber(totals.runs),
      aiEvidenceRequiredRuns: asNumber(totals.ai_evidence_required_runs),
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

function issueDestination(issue: RuntimeTelemetryAlert): string {
  if (issue.href && issue.href !== '/admin/troubleshooting') return issue.href;
  if (issue.code === 'hosted_model.failed_runs') return '/admin/plugin-observability';
  return '#runtime-evidence';
}

function issueTitle(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  const knownTitles: Record<string, [string, string]> = {
    'hosted_model.provider_errors': ['admin.troubleshooting.issue_provider_errors', 'Provider call errors'],
    'hosted_model.failed_runs': ['admin.troubleshooting.issue_runtime_failed', 'Runtime runs failed'],
    'hosted_model.provider_call_gap': ['admin.troubleshooting.issue_provider_gap', 'Provider call coverage gap'],
  };
  const known = knownTitles[issue.code];
  return known ? t(known[0], {}, known[1]) : issue.title || issue.code;
}

function issueSummary(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  const knownSummaries: Record<string, [string, string]> = {
    'hosted_model.provider_errors': ['admin.troubleshooting.issue_provider_errors_desc', 'Provider calls are returning errors in the current telemetry window.'],
    'hosted_model.failed_runs': ['admin.troubleshooting.issue_runtime_failed_desc', 'Runtime runs are failing before or during provider execution.'],
    'hosted_model.provider_call_gap': ['admin.troubleshooting.issue_provider_gap_desc', 'Some runtime runs do not have matching provider-call telemetry.'],
  };
  const known = knownSummaries[issue.code];
  return known ? t(known[0], {}, known[1]) : issue.summary;
}

function issueAction(issue: RuntimeTelemetryAlert, t: TranslationFn): string {
  const knownActions: Record<string, [string, string]> = {
    inspect_provider_credentials_quota_and_health: ['admin.troubleshooting.action_check_provider_health', 'Check supplier health, credentials, and quota evidence.'],
    inspect_runtime_failure_detail: ['admin.troubleshooting.action_check_runtime_failures', 'Inspect runtime failure codes and provider health evidence.'],
    inspect_runtime_failure_codes_and_provider_health: ['admin.troubleshooting.action_check_runtime_failures', 'Inspect runtime failure codes and provider health evidence.'],
    inspect_provider_call_recording_for_hosted_profiles: ['admin.troubleshooting.action_check_telemetry_gap', 'Inspect provider-call recording coverage for hosted profiles.'],
  };
  const known = knownActions[issue.suggestedAction];
  return known ? t(known[0], {}, known[1]) : issue.suggestedAction;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const windowHours = normalizeWindow(searchParams.get('window'));
  const focusedIssueCode = searchParams.get('focus') || '';
  const [data, setData] = useState<RuntimeTelemetrySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qualityRefreshSignal, setQualityRefreshSignal] = useState(0);
  const [qualityRequestState, setQualityRequestState] = useState<EditorAssistQualityRequestState>({
    loading: true,
    error: '',
    generatedAt: '',
  });
  const requestActiveRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const updateUrl = useCallback((updates: { window?: number | null; focus?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value && !(key === 'window' && value === 24)) params.set(key, String(value));
      else params.delete(key);
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadTelemetry = useCallback(async (refresh = false) => {
    if (requestActiveRef.current) return;
    requestActiveRef.current = true;
    const sequence = ++requestSequenceRef.current;
    if (refresh || hasLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ recent_minutes: String(windowHours * 60), limit: '25' });
      const response = await runtimeTelemetryClient.request<unknown>(
        `/api/admin/runtime-telemetry?${params.toString()}`
      );
      if (sequence !== requestSequenceRef.current) return;
      setData(normalizeRuntimeTelemetry(response.data));
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (sequence !== requestSequenceRef.current) return;
      setError(resolveUiErrorMessage(loadError, t('admin.troubleshooting.load_error', {}, 'Failed to load runtime diagnostics.')));
    } finally {
      if (sequence === requestSequenceRef.current) {
        requestActiveRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t, windowHours]);

  useEffect(() => {
    void loadTelemetry();
  }, [loadTelemetry]);

  const issues = data?.alertSummary.alerts || [];
  const selectedIssue = issues.find((issue) => issue.code === focusedIssueCode) || null;
  const hasCoverageSample = Boolean(data && data.totals.aiEvidenceRequiredRuns > 0);
  const selectedWindowLabel = windowHours === 168 ? '7d' : `${windowHours}h`;
  const refreshInProgress = loading || refreshing || qualityRequestState.loading;
  const sourceErrorCount = Number(Boolean(error)) + Number(Boolean(qualityRequestState.error));
  let refreshStateLabel = '';
  let refreshStateTone: 'pending' | 'warning' | 'error' = 'pending';
  if (refreshInProgress) {
    refreshStateLabel = t('admin.troubleshooting.refresh_state_loading', {}, 'Refreshing both sources');
  } else if (sourceErrorCount === 2) {
    refreshStateLabel = t('admin.troubleshooting.refresh_state_failed', {}, 'Both sources failed');
    refreshStateTone = 'error';
  } else if (sourceErrorCount === 1) {
    refreshStateLabel = t('admin.troubleshooting.refresh_state_partial', {}, 'Partial data');
    refreshStateTone = 'warning';
  }
  const conclusionStatus = data?.alertSummary.status || (loading ? 'pending' : 'inactive');
  const conclusionLabel = statusTone(conclusionStatus) === 'success'
    ? t('admin.troubleshooting.status_healthy', {}, 'Healthy')
    : statusTone(conclusionStatus) === 'error'
      ? t('admin.troubleshooting.status_critical', {}, 'Critical')
      : statusTone(conclusionStatus) === 'warning'
        ? t('admin.troubleshooting.status_warning', {}, 'Needs attention')
        : t('admin.troubleshooting.status_unknown', {}, 'Awaiting evidence');
  const conclusionSummary = loading && !data
    ? t('admin.troubleshooting.loading', {}, 'Loading runtime diagnostics')
    : conclusionStatus === 'inactive'
      ? t('admin.troubleshooting.conclusion_inactive', { window: selectedWindowLabel }, 'No runtime runs were observed in the selected {{window}} window.')
      : statusTone(conclusionStatus) === 'error'
        ? t('admin.troubleshooting.conclusion_error', {}, 'Runtime telemetry has errors or coverage gaps that require operator review.')
        : statusTone(conclusionStatus) === 'warning'
          ? t('admin.troubleshooting.conclusion_warning', {}, 'Runtime telemetry has coverage gaps that should be reviewed.')
          : statusTone(conclusionStatus) === 'success'
            ? t('admin.troubleshooting.conclusion_healthy', {}, 'Runtime telemetry is healthy in the selected window.')
            : t('admin.troubleshooting.queue_desc', {}, 'Select an anomaly to inspect its evidence scope and next diagnostic step.');

  return (
    <BackofficePageStack
      data-page-model="diagnostic"
      className="mx-auto max-w-screen-2xl space-y-4"
    >
      <BackofficeLayer
        eyebrow={t('admin.operator_surface', {}, 'Operator surface')}
        title={t('admin.troubleshooting.title', {}, 'Runtime diagnostics')}
        description={t('admin.troubleshooting.description', {}, 'Review the current runtime conclusion, open active anomalies, and continue into the narrowest evidence view.')}
        aside={(
          <div
            data-ui="runtime-diagnostic-header-conclusion"
            className="min-w-0 max-w-xl border-l-2 border-slate-200 pl-3 dark:border-slate-800 lg:min-w-[22rem]"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {t('admin.troubleshooting.health_conclusion', {}, 'Health conclusion')}
              </span>
              <BackofficeStatusBadge label={conclusionLabel} status={statusTone(conclusionStatus)} />
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-700 dark:text-slate-200">{conclusionSummary}</p>
          </div>
        )}
      />

      <div
        data-ui="runtime-diagnostic-toolbar"
        className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-2 dark:border-slate-800"
      >
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
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400" data-ui="diagnostic-source-freshness">
            {data?.generatedAt ? (
              <span>{t('admin.troubleshooting.runtime_updated_at', { time: formatDate(data.generatedAt) }, 'Runtime updated {{time}}')}</span>
            ) : null}
            {qualityRequestState.generatedAt ? (
              <span>{t('admin.troubleshooting.quality_updated_at', { time: formatDate(qualityRequestState.generatedAt) }, 'Quality updated {{time}}')}</span>
            ) : null}
            {refreshStateLabel ? (
              <BackofficeStatusBadge
                label={refreshStateLabel}
                status={refreshStateTone}
              />
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={refreshInProgress}
            onClick={() => {
              setQualityRefreshSignal((current) => current + 1);
              void loadTelemetry(true);
            }}
          >
            {refreshInProgress ? t('admin.troubleshooting.refreshing', {}, 'Refreshing...') : t('admin.troubleshooting.refresh', {}, 'Refresh')}
          </button>
        </div>
      </div>

      {data ? <BackofficeSummaryStrip items={[
        { label: t('admin.troubleshooting.runs', {}, 'Runs'), value: formatNumber(data.totals.runs) },
        { label: t('admin.troubleshooting.provider_coverage', {}, 'Provider-call coverage'), value: hasCoverageSample ? formatRate(data.totals.providerCallRunCoverageRate) : t('admin.troubleshooting.not_measured', {}, 'Not measured'), toneClassName: hasCoverageSample && data.totals.providerCallRunCoverageRate < 1 ? 'text-amber-700 dark:text-amber-300' : !hasCoverageSample ? 'text-slate-400 dark:text-slate-500' : undefined },
        { label: t('admin.troubleshooting.metering_coverage', {}, 'Metering coverage'), value: hasCoverageSample ? formatRate(data.totals.meteredRunCoverageRate) : t('admin.troubleshooting.not_measured', {}, 'Not measured'), toneClassName: hasCoverageSample && data.totals.meteredRunCoverageRate < 1 ? 'text-amber-700 dark:text-amber-300' : !hasCoverageSample ? 'text-slate-400 dark:text-slate-500' : undefined },
        { label: t('admin.troubleshooting.open_issues', {}, 'Open anomalies'), value: data.alertSummary.alertCount, toneClassName: data.alertSummary.alertCount > 0 ? 'text-amber-700 dark:text-amber-300' : undefined },
      ]} density="compact" /> : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200" role="alert">
          <div className="font-semibold">{error}</div>
          {data ? <div className="mt-1 text-xs">{t('admin.troubleshooting.stale_notice', {}, 'The last successfully loaded diagnostic snapshot remains visible.')}</div> : null}
        </div>
      ) : null}

      <div
        data-ui="runtime-diagnostic-workspace"
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-3"
      >
        <div className="min-w-0">
          {loading && !data ? (
            <BackofficeSectionPanel className="animate-pulse space-y-3" aria-label={t('admin.troubleshooting.loading', {}, 'Loading runtime diagnostics')}>
              <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
              <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
            </BackofficeSectionPanel>
          ) : issues.length ? (
            <AdminDataTableFrame
              dataUi="runtime-diagnostic-table-frame"
              density="compact"
              title={t('admin.troubleshooting.queue_title', {}, 'Runtime anomaly queue')}
              resultLabel={t('admin.troubleshooting.issue_count', { count: String(issues.length) }, '{{count}} active anomalies')}
              bodyClassName="max-h-[var(--admin-diagnostic-queue-max-height)] overflow-auto"
            >
              <table
                data-ui="runtime-diagnostic-table"
                className="w-full min-w-[34rem] table-fixed text-left text-sm"
                aria-label={t('admin.troubleshooting.queue_title', {}, 'Runtime anomaly queue')}
              >
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="w-[7rem] px-3 py-2" scope="col">{t('admin.troubleshooting.column_severity', {}, 'Severity')}</th>
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
                          <BackofficeStatusBadge label={severityLabel(issue.severity, t)} status={statusTone(issue.severity)} />
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <span className="font-semibold text-slate-950 dark:text-white">
                            {issueTitle(issue, t)}
                          </span>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{issueSummary(issue, t)}</p>
                        </td>
                        <td className="px-3 py-2.5 align-top text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {issue.capabilities.join(', ') || t('admin.troubleshooting.runtime_scope', {}, 'Cloud runtime')}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top font-semibold text-slate-700 dark:text-slate-200">
                          {formatNumber(issue.count)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-top">
                          <button
                            type="button"
                            aria-label={`${t('admin.troubleshooting.inspect', {}, 'Inspect')} ${issueTitle(issue, t)}`}
                            aria-pressed={selected}
                            aria-controls="runtime-diagnostic-inspector"
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
            </AdminDataTableFrame>
          ) : (
            <div data-ui="runtime-diagnostic-empty-state">
              <BackofficeEmptyState
                className="admin-compact-surface py-5"
                title={data?.totals.runs === 0
                  ? t('admin.troubleshooting.no_sample_title', {}, 'No runtime runs observed')
                  : t('admin.troubleshooting.no_issue_title', {}, 'No active runtime anomalies')}
                description={data?.totals.runs === 0
                  ? t('admin.troubleshooting.no_sample_desc', { window: selectedWindowLabel }, 'No diagnostic sample was recorded in the selected {{window}} window. Try a longer window if you need historical evidence.')
                  : t('admin.troubleshooting.no_issue_desc', {}, 'The selected window has no runtime telemetry alerts. Continue with a narrow evidence lane only when investigating a specific support question.')}
              />
            </div>
          )}
        </div>

        <EditorAssistQualityPanel
          windowHours={windowHours}
          refreshSignal={qualityRefreshSignal}
          onRequestStateChange={setQualityRequestState}
        />

          <details id="evidence-lanes" className="group admin-compact-surface overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer list-none px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.troubleshooting.lanes_title', {}, 'Evidence lanes')}</h2>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.lanes_desc', {}, 'Open the narrowest read-only detail view that matches the support question.')}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
              {t('admin.troubleshooting.lane_count', { count: String(evidenceLanes.length) }, 'View all {{count}} channels')}
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
            </span>
          </div>
        </summary>
        <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
          <table
            data-ui="runtime-evidence-lane-table"
            className="w-full min-w-[42rem] table-fixed text-left text-sm"
            aria-label={t('admin.troubleshooting.lanes_title', {}, 'Evidence lanes')}
          >
            <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-400">
              <tr>
                <th className="w-[28%] px-3 py-2" scope="col">{t('admin.troubleshooting.lane_column_channel', {}, 'Channel')}</th>
                <th className="px-3 py-2" scope="col">{t('admin.troubleshooting.lane_column_evidence', {}, 'Evidence scope')}</th>
                <th className="w-[6rem] px-3 py-2 text-right" scope="col">{t('admin.troubleshooting.column_action', {}, 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {evidenceLanes.map((lane) => (
                <tr key={lane.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                  <th className="px-3 py-2.5 text-sm font-semibold text-slate-950 dark:text-white" scope="row">{t(lane.titleKey, {}, lane.titleFallback)}</th>
                  <td className="px-3 py-2.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{t(lane.descKey, {}, lane.descFallback)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={lane.href} className="text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300">
                      {t('admin.troubleshooting.inspect', {}, 'Inspect')} →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </details>

          <details id="runtime-evidence" className="group admin-compact-surface border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-900 marker:hidden dark:text-white [&::-webkit-details-marker]:hidden">
          <span>{t('admin.troubleshooting.runtime_metadata_title', {}, 'Runtime evidence guide')}</span>
          <span aria-hidden="true" className="text-blue-700 transition-transform group-open:rotate-90 dark:text-blue-300">›</span>
        </summary>
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 md:px-6">
            <div className="max-w-3xl space-y-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              <p>{t('admin.advanced.runtime_evidence_boundary', {}, 'Evidence source remains Cloud runtime metadata such as run records, provider-call records, usage meter events, runtime profiles, and capability projection rows.')}</p>
              <p>{t('admin.troubleshooting.boundary', {}, 'Diagnostics are read-only Cloud runtime evidence. They do not change providers, model routing, local abilities, prompts, approval state, or WordPress content.')}</p>
            </div>
            <Link href="/admin/runtime-profiles" className="btn btn-secondary btn-sm">{t('admin.advanced.action_open_runtime_profiles', {}, 'Open runtime profiles')}</Link>
          </div>
        </div>
          </details>
      </div>

      <AdminWorkbenchDialog
        open={Boolean(selectedIssue)}
        presentation="drawer"
        density="compact"
        width="compact"
        title={selectedIssue ? issueTitle(selectedIssue, t) : t('admin.troubleshooting.inspector_eyebrow', {}, 'Selected anomaly')}
        titleId="runtime-diagnostic-inspector-title"
        headerAccessory={selectedIssue ? (
          <>
            <BackofficeStatusBadge label={severityLabel(selectedIssue.severity, t)} status={statusTone(selectedIssue.severity)} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {t('common.read_only', {}, 'Read only')}
            </span>
          </>
        ) : null}
        saving={false}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.close', {}, 'Close')}
        saveLabel={t('admin.troubleshooting.open_evidence', {}, 'Open matching evidence')}
        savingLabel={t('admin.troubleshooting.open_evidence', {}, 'Open matching evidence')}
        footerNotice={t('admin.troubleshooting.drawer_notice', {}, 'Read-only diagnostic detail. Closing returns to the anomaly queue.')}
        footerActions={selectedIssue ? (
          <Link href={issueDestination(selectedIssue)} className="btn btn-primary justify-center">
            {t('admin.troubleshooting.open_evidence', {}, 'Open matching evidence')}
          </Link>
        ) : null}
        onClose={() => updateUrl({ focus: null })}
        onSubmit={() => {}}
      >
        {selectedIssue ? (
          <div id="runtime-diagnostic-inspector" className="space-y-4">
            <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{issueSummary(selectedIssue, t)}</p>
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.issue_code', {}, 'Evidence code')}</dt><dd className="mt-1 break-all font-mono text-xs text-slate-800 dark:text-slate-100">{selectedIssue.code}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.affected_runs', {}, 'Affected runs')}</dt><dd className="mt-1 font-semibold text-slate-800 dark:text-slate-100">{formatNumber(selectedIssue.count)}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.affected_scope', {}, 'Affected scope')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{selectedIssue.capabilities.join(', ') || t('admin.troubleshooting.runtime_scope', {}, 'Cloud runtime')}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.suggested_action', {}, 'Suggested diagnostic step')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{issueAction(selectedIssue, t) || data?.governanceGaps.reviewGuidance || data?.alertSummary.nextAction}</dd></div>
            </dl>
          </div>
        ) : null}
      </AdminWorkbenchDialog>
    </BackofficePageStack>
  );
}
