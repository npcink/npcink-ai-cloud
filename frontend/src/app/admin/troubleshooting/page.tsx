'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackofficeFilterPill } from '@/components/backoffice/BackofficeFilterPill';
import {
  BackofficeEmptyState,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  EditorAssistQualityPanel,
} from '@/components/admin/EditorAssistQualityPanel';
import { AdminObservationWindow } from '@/components/admin/AdminObservationWindow';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { normalizeObservationWindow } from '@/features/admin/observability/window';
import {
  formatRate,
  normalizeRuntimeTelemetry,
  statusTone,
  type RuntimeRunEvidence,
  type RuntimeTelemetrySummary,
} from '@/features/admin/observability/runtimeTelemetry';
import {
  evidenceLanes,
  issueAction,
  issueCount,
  issueEvidenceGuidance,
  issueOwner,
  issueTitle,
  runtimeEvidenceItems,
  runStatusLabel,
  scopeLabel,
  severityLabel,
} from '@/features/admin/observability/runtimeIssueCatalog';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/utils';

const runtimeTelemetryClient = createApiClient({ idempotencyPrefix: 'runtime_telemetry' });

export default function AdminTroubleshootingPage() {
  const { t } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const windowHours = normalizeObservationWindow(searchParams.get('window'), 336);
  const focusedIssueCode = searchParams.get('focus') || '';
  const siteFilter = searchParams.get('site') || '';
  const capabilityFilter = searchParams.get('function') || '';
  const usageStatisticsHref = `/admin/usage-statistics?window=${windowHours}&from=troubleshooting${siteFilter ? `&group=sites&site=${encodeURIComponent(siteFilter)}` : capabilityFilter ? `&group=functions&function=${encodeURIComponent(capabilityFilter)}` : ''}`;
  const [data, setData] = useState<RuntimeTelemetrySummary | null>(null);
  const [runEvidence, setRunEvidence] = useState<RuntimeRunEvidence[]>([]);
  const [runEvidenceMeta, setRunEvidenceMeta] = useState({ sampled: false, truncated: false });
  const [runEvidenceLoading, setRunEvidenceLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qualityRefreshSignal, setQualityRefreshSignal] = useState(0);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');
  const [inspectorTab, setInspectorTab] = useState<'breakdown' | 'runs' | 'actions' | 'trend'>('breakdown');
  const requestSequenceRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);

  const updateUrl = useCallback((updates: { window?: number | null; focus?: string | null; site?: string | null; function?: string | null }) => {
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
  const firstIssue = issues[0];
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
    ? issues.length > 1
      ? t('admin.troubleshooting.conclusion_issues', { count: String(issues.length), issue: issueTitle(firstIssue, t) }, '{{count}} problem types found in this period. Check {{issue}} first.')
      : `${issueTitle(firstIssue, t)} · ${issueCount(firstIssue, t)}`
    : data?.totals.runs === 0
      ? t('admin.troubleshooting.no_requests', {}, 'No requests in this period; runtime health cannot be assessed.')
      : t('admin.troubleshooting.conclusion_healthy', {}, 'No monitored anomalies found in this period.');

  const failedTotal = data?.capabilityGroups.reduce((total, group) => total + group.failed, 0) ?? 0;

  const trendPanel = data ? (
          <section data-ui="runtime-diagnostic-trend" aria-label={t('admin.troubleshooting.trend_title', {}, 'Window trend')} className="admin-tier-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.troubleshooting.trend_title', {}, 'Window trend')}</h2>
              <div className="flex gap-1" role="group" aria-label={t('admin.troubleshooting.trend_title', {}, 'Window trend')}>
                <button type="button" aria-pressed={trendView === 'chart'} onClick={() => setTrendView('chart')} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${trendView === 'chart' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}>{t('admin.troubleshooting.view_chart', {}, 'Chart')}</button>
                <button type="button" aria-pressed={trendView === 'table'} onClick={() => setTrendView('table')} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${trendView === 'table' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}>{t('admin.troubleshooting.view_table', {}, 'Table')}</button>
                <button type="button" className="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900" onClick={() => {
                  const blob = new Blob([JSON.stringify({ window_hours: windowHours, generated_at: data.generatedAt, timeline: data.usageTimeline }, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url; link.download = `runtime-trend-${windowHours}h.json`; link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>{t('admin.troubleshooting.trend_download', {}, 'Download data')}</button>
              </div>
            </div>
            <div className="mt-2">
              {data.usageTimeline.length ? (trendView === 'chart' ? (
                <AnalyticsLineChart
                  data={data.usageTimeline.map((point) => ({ label: point.day, value: point.runs }))}
                  comparisonSeries={[{ name: t('admin.troubleshooting.failed_requests', {}, 'Failed requests'), values: data.usageTimeline.map((point) => point.failed) }]}
                  yAxisLabel={t('admin.troubleshooting.runs', {}, 'Runs')}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs" aria-label={t('admin.troubleshooting.trend_title', {}, 'Window trend')}>
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800"><tr>
                      <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.trend_day', {}, 'Day')}</th>
                      <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.runs', {}, 'Runs')}</th>
                      <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.trend_succeeded', {}, 'Succeeded')}</th>
                      <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.failed_requests', {}, 'Failed requests')}</th>
                      <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.trend_success_rate', {}, 'Success rate')}</th>
                      <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.trend_avg_latency', {}, 'Avg duration')}</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.usageTimeline.map((point) => <tr key={point.day}>
                        <td className="px-2 py-2">{point.day}</td>
                        <td className="px-2 py-2 font-semibold">{formatNumber(point.runs)}</td>
                        <td className="px-2 py-2">{formatNumber(point.succeeded)}</td>
                        <td className={`px-2 py-2 ${point.failed ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>{formatNumber(point.failed)}</td>
                        <td className="px-2 py-2">{point.successRate == null ? '—' : formatRate(point.successRate)}</td>
                        <td className="whitespace-nowrap px-2 py-2">{point.avgLatencyMs == null ? '—' : `${Math.round(point.avgLatencyMs)} ms`}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              )) : <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.trend_empty', {}, 'No trend data in this window.')}</p>}
            </div>
          </section>
  ) : null;

  return (
    <BackofficePageStack spacing="compact">
      <BackofficePageHeader
        density="compact"
        title={t('admin.troubleshooting.title', {}, 'Runtime diagnostics')}
        description={data?.generatedAt ? t('admin.troubleshooting.runtime_updated_at', { time: formatDate(data.generatedAt) }, 'Runtime updated {{time}}') : undefined}
        secondaryAction={<div className="flex items-center gap-3">
          <Link className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300" href={usageStatisticsHref}>{t('admin.troubleshooting.back_to_usage', {}, 'Usage statistics')}</Link>
          <button className="btn btn-secondary btn-sm" disabled={refreshInProgress} onClick={() => { setQualityRefreshSignal((current) => current + 1); void loadTelemetry(true); }}>
            {refreshInProgress ? t('admin.troubleshooting.refreshing', {}, 'Refreshing...') : t('admin.troubleshooting.refresh', {}, 'Refresh')}
          </button>
        </div>}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <AdminObservationWindow defaultHours={336} />
          {siteFilter || capabilityFilter ? (
            <div className="flex flex-wrap items-center gap-2" data-ui="runtime-diagnostic-scope-filters">
              {siteFilter ? (
                <BackofficeFilterPill
                  active
                  tone="info"
                  aria-label={t('admin.troubleshooting.clear_site_filter', {}, 'Clear site filter')}
                  onClick={() => updateUrl({ site: null })}
                >
                  {t('admin.troubleshooting.site_filter', {}, 'Site')}: {siteFilter}<span aria-hidden="true"> ×</span>
                </BackofficeFilterPill>
              ) : null}
              {capabilityFilter ? (
                <BackofficeFilterPill
                  active
                  tone="info"
                  aria-label={t('admin.troubleshooting.clear_function_filter', {}, 'Clear function filter')}
                  onClick={() => updateUrl({ function: null })}
                >
                  {t('admin.troubleshooting.function_filter', {}, 'Function')}: {capabilityFilter}<span aria-hidden="true"> ×</span>
                </BackofficeFilterPill>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {data ? (
        <>
        <div data-ui="runtime-diagnostic-metrics" className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {[
            { label: t('admin.troubleshooting.runs', {}, 'Runs'), value: formatNumber(data.totals.runs) },
            { label: t('admin.troubleshooting.metric_provider_calls', {}, 'Provider calls'), value: formatNumber(data.totals.providerCalls) },
            { label: t('admin.troubleshooting.failed_requests', {}, 'Failed requests'), value: formatNumber(failedTotal), warn: failedTotal > 0 },
            { label: t('admin.troubleshooting.provider_error_column', {}, 'Provider errors'), value: formatNumber(data.capabilityGroups.reduce((total, group) => total + group.providerErrors, 0)), warn: data.capabilityGroups.some((group) => group.providerErrors > 0) },
            { label: t('admin.troubleshooting.provider_coverage', {}, 'Call record completeness'), value: formatRate(data.totals.providerCallRunCoverageRate), warn: data.totals.providerCallRunCoverageRate < 1, integrity: true },
            { label: t('admin.troubleshooting.metering_coverage', {}, 'Usage record completeness'), value: formatRate(data.totals.meteredRunCoverageRate), warn: data.totals.meteredRunCoverageRate < 1, integrity: true },
          ].map((tile) => tile.integrity ? (
            <Link
              key={tile.label}
              href={usageStatisticsHref}
              data-ui="runtime-data-integrity"
              title={t('admin.troubleshooting.integrity_note', {}, 'These rates measure record completeness for requests requiring AI evidence, not request success or billing accuracy.')}
              className="admin-tier-card block px-3 py-2"
            >
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
              <p className={`mt-0.5 text-lg font-semibold leading-7 ${tile.warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white'}`}>{tile.value}</p>
            </Link>
          ) : (
            <Link key={tile.label} href={usageStatisticsHref} className="admin-tier-card block px-3 py-2">
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
              <p className={`mt-0.5 text-lg font-semibold leading-7 ${tile.warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white'}`}>{tile.value}</p>
            </Link>
          ))}
        </div>
        {!selectedIssue ? trendPanel : null}
        </>
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
        <div className="space-y-3">
          <AdminDataTableFrame
              title={t('admin.troubleshooting.queue_title', {}, 'Problems in this period')}
              resultLabel={t('admin.troubleshooting.issue_count', { count: String(issues.length) }, '{{count}} problem types')}
              dataUi="runtime-diagnostic-table-frame"
              density="compact"
              headerActions={data ? (
                <div data-ui="runtime-diagnostic-conclusion" className="flex min-w-0 flex-wrap items-center gap-2">
                  <BackofficeStatusBadge label={conclusionLabel} status={statusTone(conclusionStatus)} />
                  <span className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">{conclusionSummary}</span>
                </div>
              ) : undefined}
            >
              {issues.length ? (
                <div
                  data-ui="runtime-diagnostic-issue-grid"
                  className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2 lg:grid-cols-3"
                >
                  {issues.map((issue) => {
                    const selected = selectedIssue?.code === issue.code;
                    return (
                      <button
                        key={issue.code}
                        type="button"
                        data-ui="runtime-diagnostic-issue"
                        aria-expanded={selected}
                        className="admin-tier-card block cursor-pointer p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        onClick={() => updateUrl({ focus: selected ? null : issue.code })}
                      >
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950 dark:text-white">{issueTitle(issue, t)}</span>
                          <BackofficeStatusBadge label={severityLabel(issue.severity, t)} status={statusTone(issue.severity)} />
                        </span>
                        <span className="mt-1.5 block text-lg font-semibold leading-7 text-slate-900 dark:text-slate-100">{issueCount(issue, t)}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{scopeLabel(issue.capabilities, t)} · {issueOwner(issue, t)}</span>
                        <span className="mt-1.5 block line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{issueEvidenceGuidance(issue, t)}</span>
                      </button>
                    );
                  })}
                </div>
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
              {selectedIssue ? (
                <section
                  id="runtime-diagnostic-inspector"
                  data-ui="runtime-diagnostic-inspector"
                  aria-label={issueTitle(selectedIssue, t)}
                  className="mx-3 mb-3 rounded-r-lg border-l-2 border-slate-900 bg-slate-50/75 p-4 dark:border-slate-300 dark:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-slate-950 dark:text-white">{issueTitle(selectedIssue, t)}</h2>
                      <BackofficeStatusBadge label={severityLabel(selectedIssue.severity, t)} status={statusTone(selectedIssue.severity)} />
                    </div>
                    <button
                      type="button"
                      aria-label={t('common.close', {}, 'Close')}
                      className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                      onClick={() => updateUrl({ focus: null })}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    <section data-ui="runtime-inspector-summary" className="border-b border-slate-200 pb-3 dark:border-slate-800">
                      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t('admin.troubleshooting.column_scope', {}, 'Affected scope')} <span className="font-semibold text-slate-800 dark:text-slate-200">{scopeLabel(selectedIssue.capabilities, t)} · {issueCount(selectedIssue, t)}</span>
                        {' · '}
                        {t('admin.troubleshooting.owner_label', {}, 'Recommended owner')} <span className="font-semibold text-slate-800 dark:text-slate-200">{issueOwner(selectedIssue, t)}</span>
                      </p>
                      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t('admin.troubleshooting.next_action', {}, 'Next action')}: <span className="font-semibold text-slate-800 dark:text-slate-200">{issueAction(selectedIssue, t)}</span>
                      </p>
                    </section>

                    <div role="tablist" aria-label={issueTitle(selectedIssue, t)} className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-800">
                      {([
                        ['breakdown', 'admin.troubleshooting.open_evidence', 'Breakdown by function'],
                        ['runs', 'admin.troubleshooting.run_evidence_title', 'Affected run evidence'],
                        ['actions', 'admin.troubleshooting.tab_actions', 'Actions'],
                        ['trend', 'admin.troubleshooting.tab_trend', 'Trend'],
                      ] as const).map(([value, key, fallback]) => (
                        <button
                          key={value}
                          type="button"
                          role="tab"
                          aria-selected={inspectorTab === value}
                          onClick={() => setInspectorTab(value)}
                          className={`-mb-px whitespace-nowrap border-b-2 px-2 py-2 text-center text-sm font-semibold transition ${inspectorTab === value ? 'border-slate-900 text-slate-900 dark:border-slate-200 dark:text-slate-100' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white'}`}
                        >
                          {t(key, {}, fallback)}
                        </button>
                      ))}
                    </div>
                    <div hidden={inspectorTab !== 'breakdown'}>
                    <section key={selectedIssue.code} data-ui="runtime-issue-evidence">
                      <h3 className="pb-2 text-sm font-semibold">{t('admin.troubleshooting.open_evidence', {}, 'Breakdown by function')}</h3>
                      <div className="space-y-3">
                        <p className="text-sm">{t(selectedIssue.code === 'hosted_model.provider_errors' ? 'admin.troubleshooting.provider_error_count' : 'admin.troubleshooting.affected_runs', {}, 'Affected requests')}: {formatNumber(selectedIssue.count)}</p>
                        {selectedGroups.length ? <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs" aria-label={t('admin.troubleshooting.open_evidence', {}, 'Breakdown by function')}>
                            <thead className="border-b border-slate-200 dark:border-slate-800"><tr>
                              <th className="whitespace-nowrap px-2 py-2">{t('admin.troubleshooting.column_scope', {}, 'Affected scope')}</th>
                              <th className="whitespace-nowrap px-2 py-2">{t('admin.troubleshooting.runs', {}, 'Requests')}</th>
                              <th className="whitespace-nowrap px-2 py-2">{t('admin.troubleshooting.failed_requests', {}, 'Failed requests')}</th>
                              <th className="whitespace-nowrap px-2 py-2">{t('admin.troubleshooting.provider_error_column', {}, 'Provider errors')}</th>
                              <th className="whitespace-nowrap px-2 py-2">{t('admin.troubleshooting.coverage_header', {}, 'Coverage (calls / usage)')}</th>
                            </tr></thead>
                            <tbody>{selectedGroups.map((group) => <tr key={group.id} className="border-b border-slate-100 dark:border-slate-800">
                              <th className="px-2 py-2">{scopeLabel([group.id], t)}</th><td className="px-2 py-2">{formatNumber(group.runs)}</td><td className="px-2 py-2">{formatNumber(group.failed)}</td><td className="px-2 py-2">{formatNumber(group.providerErrors)}</td><td className="whitespace-nowrap px-2 py-2">{formatRate(group.providerCoverage)} / {formatRate(group.meteringCoverage)}</td>
                            </tr>)}</tbody>
                          </table>
                        </div> : <p className="text-sm">{t('admin.troubleshooting.groups_unavailable', {}, 'No matching function-level data was returned.')}</p>}
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.group_scope_note', {}, 'Totals for the returned functions in this period, not individual failure records. Functions may be omitted from the bounded response.')}</p>
                      </div>
                    </section>
                    </div>
                    <div hidden={inspectorTab !== 'runs'}>
                    <section data-ui="runtime-run-evidence" className="space-y-2 pt-1 dark:border-slate-800">
                      <h3 className="text-sm font-semibold">{t('admin.troubleshooting.run_evidence_title', {}, 'Affected run evidence')}</h3>
                      {runEvidenceLoading ? <p className="text-xs text-slate-500">{t('admin.troubleshooting.run_evidence_loading')}</p> : runEvidence.length ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs" aria-label={t('admin.troubleshooting.run_evidence_title')}>
                            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800"><tr>
                              <th className="whitespace-nowrap py-2 pr-3" scope="col">{t('admin.troubleshooting.run_record')}</th>
                              <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.run_duration')}</th>
                              <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.run_provider_calls')}</th>
                              <th className="whitespace-nowrap px-2 py-2" scope="col">{t('admin.troubleshooting.run_metering')}</th>
                            </tr></thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {runEvidence.map((run) => <tr key={run.run_id}>
                                <td className="py-3 pr-3 align-top">
                                  <div className="flex flex-wrap items-center gap-2"><BackofficeStatusBadge label={runStatusLabel(run.status, t)} status={statusTone(run.status)} /><span className="break-all">{run.site_id}</span></div>
                                  <p className="mt-1 break-all text-slate-500">{run.ability_name}</p>
                                  <details className="mt-2 text-slate-500"><summary className="cursor-pointer">{t('admin.troubleshooting.technical_detail_title')}</summary>
                                    <dl className="space-y-1 break-all pt-2">
                                      <dt>{t('admin.troubleshooting.failure_run_id')}</dt><dd><code>{run.run_id}</code></dd>
                                      <dt>{t('admin.troubleshooting.run_error_code')}</dt><dd>{run.error_code || t('admin.troubleshooting.no_run_error_code')}</dd>
                                      <dt>{t('admin.troubleshooting.run_profile')}</dt><dd>{run.profile_id} · {run.ability_family}</dd>
                                    </dl>
                                  </details>
                                </td>
                                <td className="whitespace-nowrap px-2 py-3 align-top">{run.duration_ms == null ? '—' : `${run.duration_ms} ms`}</td>
                                <td className="px-2 py-3 align-top">{run.provider_call_count}</td>
                                <td className="px-2 py-3 align-top">{run.has_meter_event ? t('admin.troubleshooting.metered') : t('admin.troubleshooting.unmetered')}</td>
                              </tr>)}
                            </tbody>
                          </table>
                        </div>
                      ) : <p className="text-xs text-slate-500">{t('admin.troubleshooting.run_evidence_unavailable')}</p>}

                      {runEvidenceMeta.truncated ? <p className="text-xs text-amber-700">{t('admin.troubleshooting.run_evidence_truncated', {}, 'Showing a bounded sample of matching runs.')}</p> : null}
                    </section>
                    </div>
                    <div hidden={inspectorTab !== 'actions'}>
                    {selectedIssue.code === 'hosted_model.provider_errors' ? <section data-ui="provider-failure-details" className="space-y-3 pt-1 dark:border-slate-800">
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
                        {data?.providerFailures.length ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                          const blob = new Blob([JSON.stringify({ windowHours, generatedAt: data.generatedAt, recovery: 'unverified', failures: data.providerFailures }, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url; link.download = 'runtime-failure-evidence.json'; link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        }}>{t('admin.troubleshooting.failure_export')}</button> : null}
                      </div>
                      {data?.providerFailures.length ? (() => {
                        const first = data.providerFailures[0];
                        const reasonKey = ['output_schema_invalid', 'invalid_request', 'timeout'].includes(first.reason) ? first.reason : 'unknown';
                        return <>
                          <article className="space-y-2 py-1">
                            <p className="font-semibold">{t(`admin.troubleshooting.failure_reason_${reasonKey}`)} · {data.providerFailures.length} {t('admin.troubleshooting.failure_count_suffix')}</p>
                            <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{first.siteId} · {first.providerId} / {first.modelId} · {first.profileId}</p>
                            <p className="text-sm">{t(`admin.troubleshooting.failure_step_${first.reason === 'output_schema_invalid' ? 'schema' : first.reason === 'timeout' ? 'timeout' : 'unknown'}`)}</p>
                            <p className="text-xs text-amber-700">{t('admin.troubleshooting.failure_recovery_unverified')}</p>
                          </article>
                          <details className="border-t border-slate-200 pt-2 dark:border-slate-800"><summary className="cursor-pointer text-sm font-semibold">{t('admin.troubleshooting.failure_records_summary', { count: String(data.providerFailures.length) })}</summary><div className="space-y-3 pt-3">{data.providerFailures.map((failure, index) => <div key={`${failure.runId}-${index}`} className="text-xs"><p>{failure.occurredAt ? formatDate(failure.occurredAt) : '—'} · {failure.profileId}</p><details><summary className="cursor-pointer">{t('admin.troubleshooting.technical_detail_title')}</summary><dl className="space-y-1 break-all py-2"><dt>{t('admin.troubleshooting.failure_run_id')}</dt><dd><code>{failure.runId}</code></dd><dt>{t('admin.troubleshooting.issue_code')}</dt><dd><code>{failure.errorCode}</code></dd></dl></details></div>)}</div></details>
                        </>;
                      })() : <p className="text-sm">{t('admin.troubleshooting.failures_unavailable')}</p>}
                    </section> : null}

                    {selectedIssue.code !== 'hosted_model.provider_errors' ? <div className="space-y-2 text-sm" data-ui="runtime-investigation-actions">
                      <h3 className="font-semibold">{t('admin.troubleshooting.operator_action_title', {}, '按这个顺序处理')}</h3>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link href={`/admin/plugin-observability?window=${windowHours}`} className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_plugin_errors', {}, '查看相关运行记录')}</Link>
                        {selectedIssue.code === 'hosted_model.provider_call_gap' ? <Link href="/admin/ai-resources" className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_suppliers', {}, '检查模型供应商')}</Link> : null}
                        {selectedIssue.capabilities.some(scope => scope.toLowerCase().includes('knowledge') || scope.includes('知识')) ? <Link href="/admin/vector-observability" className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_knowledge', {}, '检查站点知识库')}</Link> : null}
                        <Link href="/admin/runtime-profiles" className="btn btn-ghost btn-sm">{t('admin.troubleshooting.view_runtime_profiles', {}, '查看运行配置')}</Link>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.operator_no_mutation_notice', {}, '跳转不会自动修改设置；供应商和运行配置页面包含修改操作，请确认原因后再调整。')}</p>
                      <details className="text-xs text-slate-500 dark:text-slate-400">
                        <summary className="cursor-pointer">{t('admin.troubleshooting.investigation_checklist')}</summary>
                      <ol className="list-decimal space-y-3 pl-5">
                        <li>{t('admin.troubleshooting.operator_step_confirm_scope', {}, '先确认影响范围：上面的功能分组和次数，表示需要核对的请求数量。')}</li>
                        <li>{t('admin.troubleshooting.operator_step_check_followup', {}, '查看同时段插件错误以寻找线索；该入口不含完整成功记录，不能据此确认恢复。')}</li>
                        <li>{t('admin.troubleshooting.operator_step_check_config', {}, '如果持续发生，再检查模型供应商连接或运行配置。')}</li>
                      </ol>
                      </details>
                    </div> : null}

                    </div>
                    {inspectorTab === 'trend' && trendPanel}
                    <details className="border-t border-slate-200 pt-3 dark:border-slate-800"><summary className="cursor-pointer text-sm">{t('admin.troubleshooting.technical_detail_title', {}, '技术详情')}</summary><p className="mt-2 break-all text-xs text-slate-500">{t('admin.troubleshooting.issue_code', {}, '诊断代码')}: <code>{selectedIssue.code}</code></p></details>
                  </div>
              </section>
          ) : null}
            </AdminDataTableFrame>

            <nav id="evidence-lanes" aria-label={t('admin.troubleshooting.lanes_title', {}, 'Evidence lanes')} className="border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-ui="runtime-evidence-lane-list">
          <span className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.troubleshooting.lanes_title', {}, 'Evidence lanes')}</span>
          {evidenceLanes.map((lane) => <Link key={lane.id} href={lane.href} className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">{t(lane.titleKey, {}, lane.titleFallback)} →</Link>)}
        </div>
            </nav>

            <EditorAssistQualityPanel
              windowHours={windowHours}
              refreshSignal={qualityRefreshSignal}
            />
        </div>
      )}

      <details id="runtime-evidence" className="border-t border-slate-200 dark:border-slate-800">
        <summary className="cursor-pointer select-none py-3 text-sm font-semibold text-slate-900 dark:text-white">{t('admin.troubleshooting.runtime_metadata_title', {}, 'Runtime evidence guide')}</summary>
        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] table-fixed text-left text-sm" aria-label={t('admin.troubleshooting.runtime_metadata_title', {}, 'Runtime evidence guide')}>
              <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-400">
                <tr>
                  <th className="w-[30%] px-3 py-2.5" scope="col">{t('admin.troubleshooting.metadata_column_type', {}, 'Evidence type')}</th>
                  <th className="px-3 py-2.5" scope="col">{t('admin.troubleshooting.metadata_column_purpose', {}, 'Purpose')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {runtimeEvidenceItems.map((item) => (
                  <tr key={item.titleKey}>
                    <th className="px-3 py-3 font-semibold text-slate-950 dark:text-white" scope="row">{t(item.titleKey, {}, item.titleFallback)}</th>
                    <td className="px-3 py-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{t(item.descKey, {}, item.descFallback)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 dark:border-slate-800"><p className="max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">{t('admin.advanced.runtime_evidence_boundary', {}, 'Evidence source remains Cloud runtime metadata such as run records, provider-call records, usage meter events, runtime profiles, and capability projection rows.')}</p><Link href="/admin/runtime-profiles" className="btn btn-secondary btn-sm">{t('admin.advanced.action_open_runtime_profiles', {}, 'Open runtime profiles')}</Link></div>
        </div>
      </details>

    </BackofficePageStack>
  );
}
