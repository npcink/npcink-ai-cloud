'use client';

import Link from 'next/link';
import { AdminNavigationScopeHint } from '@/components/admin/AdminNavigationScopeHint';
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
import { AdminHelpTip } from '@/components/admin/AdminHelpTip';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import { AdminObservationWindow } from '@/components/admin/AdminObservationWindow';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { useRuntimeRunEvidence } from '@/features/admin/observability/useRuntimeRunEvidence';
import { adminNavigationWindowHint, adminScopedNavigationHref } from '@/features/admin/navigation';
import { normalizeObservationWindow } from '@/features/admin/observability/window';
import {
  formatRate,
  normalizeRuntimeTelemetry,
  statusTone,
  type RuntimeTelemetrySummary,
} from '@/features/admin/observability/runtimeTelemetry';
import {
  evidenceLanes,
  issueAction,
  issueBreakdownMetric,
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
  const { t, locale } = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const windowHours = normalizeObservationWindow(searchParams.get('window'), 336);
  const requestedPanel = searchParams.get('panel');
  const activePanel = requestedPanel === 'records' || requestedPanel === 'trend' ? requestedPanel : 'overview';
  const focusedIssueCode = searchParams.get('focus') || '';
  const siteFilter = searchParams.get('site') || '';
  const capabilityFilter = searchParams.get('function') || '';
  const usageParams = new URLSearchParams({ window: String(windowHours), from: 'troubleshooting' });
  if (siteFilter) { usageParams.set('group', 'sites'); usageParams.set('site', siteFilter); }
  if (capabilityFilter) { if (!siteFilter) usageParams.set('group', 'functions'); usageParams.set('function', capabilityFilter); }
  const usageStatisticsHref = `/admin/usage-statistics?${usageParams}`;
  const telemetryScope = JSON.stringify([windowHours, siteFilter, capabilityFilter]);
  const [snapshot, setSnapshot] = useState<{ scope: string; data: RuntimeTelemetrySummary } | null>(null);
  const data = snapshot?.scope === telemetryScope ? snapshot.data : null;
  const [sourceError, setSourceError] = useState<{ scope: string; message: string } | null>(null);
  const error = sourceError?.scope === telemetryScope ? sourceError.message : '';
  const initialLoading = !data && !error;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [recordPage, setRecordPage] = useState<{ key: string; count: number } | null>(null);
  const [detail, setDetail] = useState<{ key: string; kind: 'record' | 'guide' | 'error'; runId?: string } | null>(null);
  const [copyStatus, setCopyStatus] = useState<{ key: string; success: boolean } | null>(null);
  const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');
  const requestSequenceRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);
  const loadedScopeRef = useRef('');

  const updateUrl = useCallback((updates: { window?: number | null; focus?: string | null; site?: string | null; function?: string | null; panel?: string | null }) => {
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
    if (refresh || loadedScopeRef.current === telemetryScope) setRefreshing(true);
    else setLoading(true);
    setSourceError(null);
    try {
      const params = new URLSearchParams({ recent_minutes: String(windowHours * 60), limit: '25' });
      if (siteFilter) params.set('site_id', siteFilter);
      if (capabilityFilter) params.set('capability', capabilityFilter);
      const response = await runtimeTelemetryClient.request<unknown>(
        `/api/admin/runtime-telemetry?${params.toString()}`,
        { signal: controller.signal }
      );
      if (sequence !== requestSequenceRef.current) return;
      setSnapshot({ scope: telemetryScope, data: normalizeRuntimeTelemetry(response.data) });
      loadedScopeRef.current = telemetryScope;
    } catch (loadError) {
      if (sequence !== requestSequenceRef.current) return;
      setSourceError({ scope: telemetryScope, message: resolveUiErrorMessage(loadError, t('admin.troubleshooting.load_error', {}, 'Failed to load runtime diagnostics.')) });
    } finally {
      if (sequence === requestSequenceRef.current) {
        requestAbortRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t, windowHours, siteFilter, capabilityFilter, telemetryScope]);

  useEffect(() => {
    void loadTelemetry();
    return () => {
      requestSequenceRef.current += 1;
      requestAbortRef.current?.abort();
    };
  }, [loadTelemetry]);

  const issues = data?.alertSummary.alerts || [];
  const selectedIssue = issues.find((issue) => issue.code === focusedIssueCode) || issues[0] || null;
  useEffect(() => {
    if (selectedIssue && selectedIssue.code !== focusedIssueCode) updateUrl({ focus: selectedIssue.code, panel: null });
  }, [selectedIssue, focusedIssueCode, updateUrl]);
  const panelTabs = [
    { id: 'overview', label: t('admin.troubleshooting.tab_overview') },
    { id: 'records', label: t('admin.troubleshooting.tab_records') },
    { id: 'trend', label: t('admin.troubleshooting.tab_trend') },
  ];
  const navigationScope = new URLSearchParams({ window: String(windowHours) });
  if (siteFilter) navigationScope.set('site', siteFilter);
  if (capabilityFilter) navigationScope.set('function', capabilityFilter);
  const scopedHref = (href: string) => adminScopedNavigationHref(href, navigationScope);
  const selectedGroups = data?.capabilityGroups.filter((group) => selectedIssue?.capabilities.includes(group.id)) || [];
  const breakdownMetric = selectedIssue ? issueBreakdownMetric(selectedIssue, t) : null;
  const sortedGroups = breakdownMetric
    ? [...selectedGroups].sort((a, b) => {
        const diff = a[breakdownMetric.metric] - b[breakdownMetric.metric];
        return breakdownMetric.ascending ? diff : -diff;
      })
    : selectedGroups;
  const runEvidenceState = useRuntimeRunEvidence({
    issueCode: selectedIssue?.code ?? '', capabilities: selectedIssue?.capabilities ?? [],
    site: siteFilter, capability: capabilityFilter, windowHours, refreshSignal,
  });
  const runEvidence = runEvidenceState.items;
  const runEvidenceLoading = runEvidenceState.loading;
  const refreshInProgress = loading || initialLoading || refreshing;
  const conclusionStatus = data?.alertSummary.status || (initialLoading ? 'pending' : 'inactive');
  const conclusionLabel = statusTone(conclusionStatus) === 'success'
    ? t('admin.troubleshooting.status_healthy', {}, 'Healthy')
    : statusTone(conclusionStatus) === 'error'
      ? t('admin.troubleshooting.status_critical', {}, 'Critical')
      : statusTone(conclusionStatus) === 'warning'
        ? t('admin.troubleshooting.status_warning', {}, 'Needs attention')
        : t('admin.troubleshooting.status_unknown', {}, 'Awaiting evidence');
  const conclusionSummary = issues.length
    ? ''
    : data?.totals.runs === 0
      ? t('admin.troubleshooting.no_requests', {}, 'No requests in this period; runtime health cannot be assessed.')
      : t('admin.troubleshooting.conclusion_healthy', {}, 'No monitored anomalies found in this period.');

  const trendControls = (groupLabel: string, onDownload: () => void) => (
    <div className="flex gap-1" role="group" aria-label={groupLabel}>
      <button type="button" aria-pressed={trendView === 'chart'} onClick={() => setTrendView('chart')} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${trendView === 'chart' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}>{t('admin.troubleshooting.view_chart', {}, 'Chart')}</button>
      <button type="button" aria-pressed={trendView === 'table'} onClick={() => setTrendView('table')} className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${trendView === 'table' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'}`}>{t('admin.troubleshooting.view_table', {}, 'Table')}</button>
      <button type="button" className="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900" onClick={onDownload}>{t('admin.troubleshooting.trend_download', {}, 'Download data')}</button>
    </div>
  );

  const evidenceContext = JSON.stringify([telemetryScope, selectedIssue?.code, refreshSignal]);
  const failures = selectedIssue?.code === 'hosted_model.provider_errors' ? data?.providerFailures ?? [] : [];
  // Join by run id: a failed call is context for a run, not proof that the run failed.
  const records = [
    ...runEvidence.map((run) => ({ id: run.run_id, run, failures: failures.filter((failure) => failure.runId === run.run_id) })),
    ...[...new Set(failures.map((failure) => failure.runId))]
      .filter((id) => !runEvidence.some((run) => run.run_id === id))
      .map((id) => ({ id, run: null, failures: failures.filter((failure) => failure.runId === id) })),
  ];
  const visibleCount = recordPage?.key === evidenceContext ? recordPage.count : 5;
  const currentDetail = detail?.key === evidenceContext ? detail : null;
  const detailRecord = currentDetail?.kind === 'record' ? records.find((record) => record.id === currentDetail.runId) : null;
  const openDetail = (kind: 'record' | 'guide' | 'error', runId?: string) => setDetail({ key: evidenceContext, kind, runId });
  const firstFailure = failures[0];
  const failureReasonKey = firstFailure && ['output_schema_invalid', 'invalid_request', 'timeout'].includes(firstFailure.reason) ? firstFailure.reason : 'unknown';
  // The quality view owns site/window scope, but cannot filter by function.
  const qualityHref = scopedHref('/admin/usage-statistics?view=quality');

  const issueTrendPanel = selectedIssue?.dailyCounts.length ? (
    <section data-ui="runtime-issue-trend" aria-label={t('admin.troubleshooting.issue_trend_title')}>
      <div className="flex justify-end">
        {trendControls(t('admin.troubleshooting.issue_trend_title'), () => {
          const blob = new Blob([JSON.stringify({ window_hours: windowHours, generated_at: data?.generatedAt, selected_issue: selectedIssue.code, unit: selectedIssue.code === 'hosted_model.provider_errors' ? 'calls' : 'runs', daily_counts: selectedIssue.dailyCounts }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url; link.download = `runtime-issue-trend-${windowHours}h.json`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        })}
      </div>
      {trendView === 'chart' ? <AnalyticsLineChart
        data={selectedIssue.dailyCounts.map((point) => ({ label: point.day, value: point.count }))}
        primarySeriesName={t(selectedIssue.code === 'hosted_model.provider_errors' ? 'admin.troubleshooting.provider_error_column' : 'admin.troubleshooting.affected_runs')}
        height={180}
        yAxisLabel={t(selectedIssue.code === 'hosted_model.provider_errors' ? 'admin.troubleshooting.unit_calls' : 'admin.troubleshooting.unit_runs')}
      /> : <table className="w-full text-left text-xs" aria-label={t('admin.troubleshooting.issue_trend_title')}>
        <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800"><tr>
          <th scope="col" className="px-2 py-2">{t('admin.troubleshooting.trend_day')}</th>
          <th scope="col" className="px-2 py-2 text-right">{t(selectedIssue.code === 'hosted_model.provider_errors' ? 'admin.troubleshooting.unit_calls' : 'admin.troubleshooting.unit_runs')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{selectedIssue.dailyCounts.map((point) => <tr key={point.day}><td className="px-2 py-2">{point.day}</td><td className="px-2 py-2 text-right tabular-nums">{formatNumber(point.count)}</td></tr>)}</tbody>
      </table>}
    </section>
  ) : <p className="text-xs text-slate-500">{t('admin.troubleshooting.issue_trend_missing')}</p>;

  return (
    <BackofficePageStack spacing="compact">
      <BackofficePageHeader
        density="compact"
        title={t('admin.troubleshooting.title', {}, 'Runtime diagnostics')}
        description={data?.generatedAt ? t('admin.troubleshooting.runtime_updated_at', { time: formatDate(data.generatedAt) }, 'Runtime updated {{time}}') : undefined}
        toolbarControls={<AdminObservationWindow defaultHours={336} />}
        secondaryAction={<div className="flex items-center gap-3">
          <Link className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300" href={usageStatisticsHref}>{t('admin.troubleshooting.back_to_usage', {}, 'Usage statistics')}</Link>
          <button className="btn btn-secondary btn-sm h-[var(--admin-compact-control-height)] min-h-0 py-1" disabled={refreshInProgress} onClick={() => { setRefreshSignal((current) => current + 1); void loadTelemetry(true); }}>
            {refreshInProgress ? t('admin.troubleshooting.refreshing', {}, 'Refreshing...') : t('admin.troubleshooting.refresh', {}, 'Refresh')}
          </button>
        </div>}
      />

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

      {data ? (
        <div data-ui="runtime-diagnostic-summary" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-slate-200 pb-3 text-xs dark:border-slate-800">
        <dl data-ui="runtime-diagnostic-metrics" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-2"><dt className="text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.runs')}</dt><dd><Link href={usageStatisticsHref} className="text-base font-semibold text-slate-900 dark:text-white">{formatNumber(data.totals.runs)}</Link></dd></div>
          {[
            { key: 'provider_coverage', label: t('admin.troubleshooting.provider_coverage'), value: data.totals.providerCallRunCoverageRate },
            { key: 'metering_coverage', label: t('admin.troubleshooting.metering_coverage'), value: data.totals.meteredRunCoverageRate },
          ].map((metric) => <div key={metric.key} data-ui="runtime-data-integrity" className="flex items-center gap-2">
            <dt className="inline-flex items-center text-slate-500 dark:text-slate-400">{metric.label}<AdminHelpTip label={metric.label}>{t('admin.troubleshooting.integrity_note')}</AdminHelpTip></dt>
            <dd><Link href={usageStatisticsHref} className={`font-semibold hover:underline ${metric.value < 1 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-white'}`}>{formatRate(metric.value)}</Link></dd>
          </div>)}
        </dl>
        <div data-ui="runtime-diagnostic-conclusion" className="flex flex-wrap items-center gap-2">
          <BackofficeStatusBadge label={conclusionLabel} status={statusTone(conclusionStatus)} />
          {!issues.length ? <span className="text-slate-500">{conclusionSummary}</span> : null}
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
          <button type="button" className="mt-2 text-xs underline" onClick={() => openDetail('error')}>{t('admin.troubleshooting.technical_error_details')}</button>
        </div>
      ) : null}

      {initialLoading ? (
        <BackofficeSectionPanel className="animate-pulse space-y-3" aria-label={t('admin.troubleshooting.loading', {}, 'Loading runtime diagnostics')}>
          <div className="h-5 w-48 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
          <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
        </BackofficeSectionPanel>
      ) : (
        <div className="space-y-3">
          <div data-ui="runtime-diagnostic-issue-grid" data-selected={Boolean(selectedIssue)}>
            <div className="min-w-0 self-start">
              <AdminDataTableFrame title={t('admin.troubleshooting.queue_title')} resultLabel={t('admin.troubleshooting.issue_count', { count: String(issues.length) })} dataUi="runtime-diagnostic-table-frame" density="compact" placement="adjacent">
                {issues.length ? <div className="max-h-[var(--admin-diagnostic-queue-max-height)] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {issues.map((issue) => {
                    const selected = selectedIssue?.code === issue.code;
                    return <button key={issue.code} type="button" data-ui="runtime-diagnostic-issue"
                      aria-pressed={selected} aria-controls={selectedIssue ? 'runtime-diagnostic-inspector' : undefined}
                      className={`block w-full cursor-pointer border-l-2 px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${selected ? 'border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/25' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/60'}`}
                      onClick={() => updateUrl({ focus: issue.code, panel: null })}>
                      <span className="flex items-start gap-2"><span className="min-w-0 flex-1 text-sm font-semibold">{issueTitle(issue, t)}</span><BackofficeStatusBadge label={severityLabel(issue.severity, t)} status={statusTone(issue.severity)} /></span>
                      <span className="mt-1 block text-sm font-semibold">{issueCount(issue, t)}</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{scopeLabel(issue.capabilities, t)}</span>
                    </button>;
                  })}
                </div> : <BackofficeEmptyState className="m-4"
                  title={error && !data ? t('admin.troubleshooting.queue_unavailable_title') : data?.totals.runs === 0 ? t('admin.troubleshooting.no_requests_title') : t('admin.troubleshooting.no_issue_title')}
                  description={error && !data ? t('admin.troubleshooting.queue_unavailable_desc') : data?.totals.runs === 0 ? t('admin.troubleshooting.no_requests') : t('admin.troubleshooting.no_issue_desc')}
                />}
              </AdminDataTableFrame>
            </div>
            {selectedIssue ? <section id="runtime-diagnostic-inspector" key={selectedIssue.code} data-ui="runtime-diagnostic-inspector" aria-label={issueTitle(selectedIssue, t)} className="admin-compact-surface min-w-0 border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div data-ui="runtime-inspector-header" className="flex min-h-[var(--admin-compact-row-height)] items-center justify-between gap-3 px-3 py-1.5">
                <h2 className="flex min-w-0 items-center text-sm font-semibold">{issueTitle(selectedIssue, t)}<AdminHelpTip label={t('admin.troubleshooting.issue_meaning')}>{issueEvidenceGuidance(selectedIssue, t)}</AdminHelpTip></h2>
                {selectedIssue.code === 'hosted_model.provider_errors' ? <span data-ui="provider-recovery-status" className="flex shrink-0 items-center text-xs text-amber-700 dark:text-amber-300">{t('admin.troubleshooting.recovery_pending')}<AdminHelpTip label={t('admin.troubleshooting.recovery_pending')}>{t('admin.troubleshooting.failure_recovery_unverified')}</AdminHelpTip></span> : <span className="text-xs text-slate-500">{t(selectedIssue.code === 'hosted_model.provider_call_gap' || selectedIssue.code === 'hosted_model.unmetered_runs' ? 'admin.troubleshooting.evidence_gap' : 'admin.troubleshooting.recorded_error')}</span>}
              </div>
              <div role="tablist" aria-label={t('admin.troubleshooting.issue_views')} className="mx-3 flex gap-4 border-b border-slate-200 dark:border-slate-800">
                {panelTabs.map((tab, index) => <button key={tab.id} id={`diagnostic-tab-${tab.id}`} type="button" role="tab"
                  aria-selected={activePanel === tab.id} aria-controls={`diagnostic-panel-${tab.id}`} tabIndex={activePanel === tab.id ? 0 : -1}
                  onClick={() => updateUrl({ panel: tab.id === 'overview' ? null : tab.id })}
                  onKeyDown={(event) => {
                    const next = event.key === 'ArrowRight' ? (index + 1) % panelTabs.length : event.key === 'ArrowLeft' ? (index + panelTabs.length - 1) % panelTabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? panelTabs.length - 1 : null;
                    if (next === null) return;
                    event.preventDefault(); document.getElementById(`diagnostic-tab-${panelTabs[next].id}`)?.focus();
                  }}
                  className={`cursor-pointer border-b-2 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activePanel === tab.id ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{tab.label}{tab.id === 'records' && runEvidenceState.failedScopes ? <span className="ml-1 text-amber-700" aria-label={t('admin.troubleshooting.run_evidence_error')}>!</span> : null}</button>)}
              </div>
              <section id="diagnostic-panel-overview" role="tabpanel" aria-labelledby="diagnostic-tab-overview" hidden={activePanel !== 'overview'} className="p-3">
                <div data-ui="runtime-diagnostic-overview-grid">
                <section data-ui="runtime-inspector-summary" className="min-w-0 space-y-2">
                {firstFailure ? <p className="text-xs text-amber-700 dark:text-amber-300">{t('admin.troubleshooting.latest_failure')}: {t(`admin.troubleshooting.failure_reason_${failureReasonKey}`)}</p> : null}
                <section data-ui="runtime-issue-evidence" className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('admin.troubleshooting.open_evidence')}</h3>
                  {sortedGroups.length ? <div className="overflow-x-auto"><table className="w-full min-w-[var(--admin-diagnostic-table-min-width)] table-fixed text-left text-xs" aria-label={t('admin.troubleshooting.open_evidence')}>
                    <colgroup><col /><col className="w-[var(--admin-diagnostic-number-column)]" />{breakdownMetric ? <col className="w-[var(--admin-diagnostic-number-column)]" /> : null}</colgroup>
                    <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800"><tr>
                      <th scope="col" className="px-2 py-2">{t('admin.troubleshooting.column_scope')}</th>
                      <th scope="col" className="px-2 py-2 text-right"><span className="inline-flex items-center gap-1"><AdminHelpTip label={t('admin.troubleshooting.function_total_runs')}>{t('admin.troubleshooting.group_scope_note')}</AdminHelpTip>{t('admin.troubleshooting.function_total_runs')}</span></th>
                      {breakdownMetric ? <th scope="col" className="px-2 py-2 text-right">{breakdownMetric.label}</th> : null}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{sortedGroups.map((group) => <tr key={group.id}>
                      <th scope="row" className="px-2 py-2 font-medium">{scopeLabel([group.id], t)}</th><td className="px-2 py-2 text-right tabular-nums">{formatNumber(group.runs)}</td>
                      {breakdownMetric ? <td className="px-2 py-2 text-right font-semibold tabular-nums">{breakdownMetric.metric.endsWith('Coverage') ? formatRate(group[breakdownMetric.metric]) : formatNumber(group[breakdownMetric.metric])}</td> : null}
                    </tr>)}</tbody>
                  </table></div> : <p className="text-xs text-slate-500">{t('admin.troubleshooting.groups_unavailable')}</p>}
                </section>
                </section>
              <section data-ui="runtime-investigation-actions" className="min-w-0 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                <div className="flex flex-wrap items-baseline gap-3"><h3 className="text-sm font-semibold">{t('admin.troubleshooting.next_action')}</h3><span className="text-xs text-slate-500">{t('admin.troubleshooting.owner_label')}: {issueOwner(selectedIssue, t)}</span></div>
                <p className="text-sm leading-6">{firstFailure ? t(`admin.troubleshooting.failure_step_${failureReasonKey === 'output_schema_invalid' ? 'schema' : failureReasonKey === 'timeout' ? 'timeout' : 'unknown'}`) : selectedIssue.code === 'hosted_model.provider_errors' ? t('admin.troubleshooting.action_check_provider_health') : issueAction(selectedIssue, t)}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {selectedIssue.code === 'hosted_model.unmetered_runs' ? <Link href={usageStatisticsHref} className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_metering')}</Link>
                    : selectedIssue.code === 'hosted_model.provider_call_gap' ? <Link href={scopedHref('/admin/plugin-observability')} className="btn btn-secondary btn-sm">{t('admin.troubleshooting.view_plugin_errors')}</Link>
                    : <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateUrl({ panel: 'records' })}>{t('admin.troubleshooting.inspect_failures')}</button>}
                  {selectedIssue.capabilities.includes('knowledge') ? <Link href={scopedHref('/admin/vector-observability')} className="text-xs text-blue-700 hover:underline dark:text-blue-300">{t('admin.troubleshooting.view_knowledge')}</Link> : null}
                  {selectedIssue.code === 'hosted_model.provider_call_gap' || selectedIssue.code === 'hosted_model.provider_errors' ? <Link href="/admin/ai-resources" className="text-xs text-blue-700 hover:underline dark:text-blue-300">{t('admin.troubleshooting.view_suppliers')}</Link> : null}
                  <Link href="/admin/runtime-profiles" className="text-xs text-blue-700 hover:underline dark:text-blue-300">{t('admin.troubleshooting.view_runtime_profiles')}</Link>
                  {selectedIssue.code === 'hosted_model.provider_errors' && failures.length ? <button type="button" data-ui="provider-failure-details" className="text-xs text-blue-700 hover:underline dark:text-blue-300" onClick={() => {
                    const blob = new Blob([JSON.stringify({ windowHours, generatedAt: data?.generatedAt, recovery: 'unverified', failures }, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob); const link = document.createElement('a');
                    link.href = url; link.download = 'runtime-failure-evidence.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}>{t('admin.troubleshooting.failure_export')}</button> : null}
                </div>
                {selectedIssue.code === 'hosted_model.provider_errors' && !failures.length ? <p className="text-xs text-slate-500">{t('admin.troubleshooting.failures_unavailable')}</p> : null}
              </section>
                </div>
              </section>
              <section data-ui="runtime-run-evidence" id="diagnostic-panel-records" role="tabpanel" aria-labelledby="diagnostic-tab-records" hidden={activePanel !== 'records'} className="space-y-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">{t('admin.troubleshooting.run_evidence_title')}<AdminHelpTip label={t('admin.troubleshooting.record_bounded')}>{t(selectedIssue.code === 'hosted_model.provider_call_gap' ? 'admin.troubleshooting.run_evidence_scope_note' : 'admin.troubleshooting.run_evidence_sample_note')}</AdminHelpTip></h3>
                  {records.length ? <span className="text-xs text-slate-500">{t('admin.troubleshooting.record_sample', { shown: String(Math.min(visibleCount, records.length)), count: String(records.length) })}{runEvidenceState.truncated ? ` · ${t('admin.troubleshooting.record_bounded')}` : ''}</span> : null}
                </div>
                {runEvidenceState.failedScopes ? <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300"><p>{t(runEvidence.length ? 'admin.troubleshooting.run_evidence_partial_error' : 'admin.troubleshooting.run_evidence_error')}</p><button type="button" className="btn btn-secondary btn-sm" onClick={runEvidenceState.retry}>{t('admin.troubleshooting.retry_evidence')}</button></div> : null}
                {runEvidenceLoading ? <p role="status" className="text-xs text-slate-500">{t('admin.troubleshooting.run_evidence_loading')}</p> : null}
                {records.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs" aria-label={t('admin.troubleshooting.run_evidence_title')}>
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800"><tr>
                    <th scope="col" className="w-2/5 py-2 pr-3">{t('admin.troubleshooting.run_record')}</th>
                    <th scope="col" className="hidden px-2 py-2 sm:table-cell">{t('admin.troubleshooting.record_time')}</th>
                    <th scope="col" className="px-2 py-2 text-right">{t('admin.troubleshooting.run_provider_calls')}</th>
                    <th scope="col" className="px-2 py-2">{t('admin.troubleshooting.run_metering')}</th>
                    <th scope="col" className="px-2 py-2"><span className="sr-only">{t('admin.troubleshooting.view_record')}</span></th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{records.slice(0, visibleCount).map((record) => {
                    const run = record.run;
                    const failure = record.failures[0];
                    return <tr key={record.id}>
                      <td className="max-w-0 py-2 pr-3 align-top">
                        <div className="flex min-w-0 items-center gap-2"><span className="shrink-0 whitespace-nowrap"><BackofficeStatusBadge label={run ? runStatusLabel(run.status, t) : t('admin.troubleshooting.issue_provider_errors')} status={run ? statusTone(run.status) : 'error'} /></span><span className="truncate text-slate-600 dark:text-slate-300" title={`${run?.site_id || failure?.siteId} · ${run?.ability_name || failure?.profileId}`}>{run?.site_id || failure?.siteId} · {run?.ability_name || failure?.profileId}</span></div>
                      </td>
                      <td className="hidden whitespace-nowrap px-2 py-2 align-top text-slate-500 sm:table-cell">{run?.started_at || failure?.occurredAt ? formatDate(run?.started_at || failure!.occurredAt) : '—'}</td>
                      <td className="px-2 py-2 text-right align-top tabular-nums">{run?.provider_call_count ?? '—'}</td>
                      <td className="px-2 py-2 align-top">{run ? t(run.has_meter_event ? 'admin.troubleshooting.metered' : 'admin.troubleshooting.unmetered') : '—'}</td>
                      <td className="px-2 py-2 align-top"><button type="button" className="whitespace-nowrap text-blue-700 hover:underline dark:text-blue-300" onClick={() => openDetail('record', record.id)}>{t('admin.troubleshooting.view_record')}</button></td>
                    </tr>;
                  })}</tbody>
                </table></div> : !runEvidenceLoading && !runEvidenceState.failedScopes ? <p className="text-xs text-slate-500">{t('admin.troubleshooting.run_evidence_unavailable')}</p> : null}
                {records.length > visibleCount ? <button type="button" className="text-xs text-blue-700 hover:underline dark:text-blue-300" onClick={() => setRecordPage({ key: evidenceContext, count: visibleCount + 5 })}>{t('admin.troubleshooting.more_records')}</button> : null}
              </section>

              <section id="diagnostic-panel-trend" role="tabpanel" aria-labelledby="diagnostic-tab-trend" hidden={activePanel !== 'trend'} className="p-3">{activePanel === 'trend' ? issueTrendPanel : null}</section>
            </section> : null}
          </div>
        </div>
      )}
      <section data-ui="runtime-diagnostic-tools" aria-labelledby="runtime-diagnostic-tools-title" className="space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="runtime-diagnostic-tools-title" className="font-medium text-slate-500 dark:text-slate-400">{t('admin.troubleshooting.lanes_title')}</h2>
          <button id="runtime-evidence" type="button" className="inline-flex min-h-[var(--admin-compact-control-height)] items-center text-slate-500 hover:text-blue-700 hover:underline dark:text-slate-400 dark:hover:text-blue-300" onClick={() => openDetail('guide')}>{t('admin.troubleshooting.runtime_metadata_title')}</button>
        </div>
        <nav id="evidence-lanes" data-ui="runtime-evidence-lane-list" aria-labelledby="runtime-diagnostic-tools-title" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {evidenceLanes.map((lane) => <span key={lane.id} className="inline-flex items-center"><Link href={scopedHref(lane.href)} title={adminNavigationWindowHint(lane.href, navigationScope, locale)} className="inline-flex min-h-[var(--admin-compact-control-height)] items-center text-blue-700 hover:underline dark:text-blue-300">{t(lane.titleKey, {}, lane.titleFallback)}</Link><AdminNavigationScopeHint href={lane.href} params={navigationScope} /></span>)}
          {!capabilityFilter ? <span className="inline-flex items-center"><Link data-ui="runtime-quality-link" href={qualityHref} title={adminNavigationWindowHint('/admin/usage-statistics?view=quality', navigationScope, locale)} className="inline-flex min-h-[var(--admin-compact-control-height)] items-center text-blue-700 hover:underline dark:text-blue-300">{t('admin.troubleshooting.quality_link')}</Link><AdminNavigationScopeHint href="/admin/usage-statistics?view=quality" params={navigationScope} /></span> : null}
        </nav>
      </section>
      <AdminInspectorDrawer open={Boolean(currentDetail && (currentDetail.kind !== 'record' || detailRecord))}
        title={t(currentDetail?.kind === 'guide' ? 'admin.troubleshooting.runtime_metadata_title' : currentDetail?.kind === 'error' ? 'admin.troubleshooting.technical_error_details' : 'admin.troubleshooting.record_detail')}
        titleId="runtime-record-detail-title" closeLabel={t('common.close')} onClose={() => setDetail(null)}>
        {currentDetail?.kind === 'guide' ? <dl className="space-y-4">{selectedIssue ? <div><dt className="text-sm font-semibold">{t('admin.troubleshooting.issue_code')}</dt><dd className="mt-1 break-all text-xs"><code className="select-all">{selectedIssue.code}</code><button type="button" className="ml-3 text-blue-700 hover:underline dark:text-blue-300" onClick={async () => { try { await navigator.clipboard.writeText(selectedIssue.code); setCopyStatus({ key: evidenceContext, success: true }); } catch { setCopyStatus({ key: evidenceContext, success: false }); } }}>{t('admin.troubleshooting.copy_code')}</button>{copyStatus?.key === evidenceContext ? <span role="status" className="ml-2">{t(copyStatus.success ? 'admin.troubleshooting.copy_done' : 'admin.troubleshooting.copy_failed')}</span> : null}</dd></div> : null}{runtimeEvidenceItems.map((item) => <div key={item.titleKey}><dt className="text-sm font-semibold">{t(item.titleKey, {}, item.titleFallback)}</dt><dd className="mt-1 text-xs leading-5 text-slate-500">{t(item.descKey, {}, item.descFallback)}</dd></div>)}</dl> : currentDetail?.kind === 'error' ? <p className="break-words font-mono text-xs">{error}</p> : detailRecord ? <div className="space-y-4">
          <dl className="space-y-3 break-all text-xs">
            <div><dt className="text-slate-500">{t('admin.troubleshooting.failure_run_id')}</dt><dd><code className="select-all">{detailRecord.id}</code></dd></div>
            <div><dt className="text-slate-500">{t('admin.troubleshooting.site_filter')}</dt><dd>{detailRecord.run?.site_id || detailRecord.failures[0]?.siteId}</dd></div>
            <div><dt className="text-slate-500">{t('admin.troubleshooting.record_time')}</dt><dd>{detailRecord.run?.started_at || detailRecord.failures[0]?.occurredAt ? formatDate(detailRecord.run?.started_at || detailRecord.failures[0].occurredAt) : '—'}</dd></div>
            <div><dt className="text-slate-500">{t('admin.troubleshooting.run_profile')}</dt><dd>{detailRecord.run?.profile_id || detailRecord.failures[0]?.profileId}</dd></div>
            {detailRecord.run ? <>
              <div><dt className="text-slate-500">{t('admin.troubleshooting.run_record')}</dt><dd>{runStatusLabel(detailRecord.run.status, t)} · {detailRecord.run.ability_name} · {scopeLabel([detailRecord.run.ability_family], t)}</dd></div>
              <div><dt className="text-slate-500">{t('admin.troubleshooting.run_duration')}</dt><dd>{detailRecord.run.duration_ms == null ? '—' : `${detailRecord.run.duration_ms} ms`}</dd></div>
              <div><dt className="text-slate-500">{t('admin.troubleshooting.run_error_code')}</dt><dd>{detailRecord.run.error_code || t('admin.troubleshooting.no_run_error_code')}</dd></div>
            </> : null}
          </dl>
          {detailRecord.failures.length ? <section className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800"><h3 className="text-sm font-semibold">{t('admin.troubleshooting.issue_provider_errors')}</h3><p className="text-xs text-slate-500">{t('admin.troubleshooting.failures_limit')}</p>{detailRecord.failures.map((failure, index) => <div key={index} className="space-y-1 break-all text-xs"><p>{formatDate(failure.occurredAt)} · {failure.providerId} / {failure.modelId}</p><p><code>{failure.errorCode}</code></p><p>{t(`admin.troubleshooting.failure_reason_${['output_schema_invalid', 'invalid_request', 'timeout'].includes(failure.reason) ? failure.reason : 'unknown'}`)}</p></div>)}</section> : null}
        </div> : null}
      </AdminInspectorDrawer>
    </BackofficePageStack>
  );
}
