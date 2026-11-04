'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils';

const editorQualityClient = createApiClient({ idempotencyPrefix: 'editor_assist_quality' });

type QualityTotals = {
  sessionTotal: number;
  resolvedSessionTotal: number;
  pendingSessionTotal: number;
  exactSavedSessionTotal: number;
  unmatchedSavedSessionTotal: number;
  expiredSessionTotal: number;
  repeatedSessionTotal: number;
  repeatRate: number;
  exactSavedRate: number;
  unmatchedSavedRate: number;
  expiredRate: number;
  sampleStage: string;
};

type QualityTrend = {
  label: string;
  startAt: string;
  endAt: string;
  sessionTotal: number;
  resolvedSessionTotal: number;
  repeatedSessionTotal: number;
  exactSavedSessionTotal: number;
  repeatRate: number;
  exactSavedRate: number;
};

type QualityCandidate = {
  code: string;
  taskKey: string;
  sampleSize: number;
  observedRate: number;
  confidence: string;
  persistence: string;
  actionable: boolean;
  nextAction: string;
};

type EditorQualitySummary = {
  generatedAt: string;
  totals: QualityTotals;
  trend: QualityTrend[];
  candidates: QualityCandidate[];
};

type EditorAssistQualityPanelProps = {
  windowHours: number;
  taskKey: string;
  onTaskKeyChange: (value: string) => void;
  onClearSite: () => void;
  siteId?: string;
  refreshSignal: number;
  onRequestStateChange?: (state: EditorAssistQualityRequestState) => void;
  disclosure?: boolean;
};

export type EditorAssistQualityRequestState = {
  loading: boolean;
  error: string;
  generatedAt: string;
};

const TASK_OPTIONS = [
  { value: '', labelKey: 'admin.editor_quality.task_all', fallback: 'All tasks' },
  { value: 'title_generation', labelKey: 'admin.editor_quality.task_title', fallback: 'Title' },
  { value: 'content_summary', labelKey: 'admin.editor_quality.task_summary', fallback: 'Summary' },
  { value: 'content_rewrite', labelKey: 'admin.editor_quality.task_rewrite', fallback: 'Rewrite' },
] as const;

function asNumber(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function normalizeEditorQuality(raw: any): EditorQualitySummary {
  const totals = raw?.totals ?? {};
  return {
    generatedAt: String(raw?.generated_at ?? ''),
    totals: {
      sessionTotal: asNumber(totals.session_total),
      resolvedSessionTotal: asNumber(totals.resolved_session_total),
      pendingSessionTotal: asNumber(totals.pending_session_total),
      repeatedSessionTotal: asNumber(totals.repeated_session_total),
      exactSavedSessionTotal: asNumber(totals.exact_saved_session_total),
      unmatchedSavedSessionTotal: asNumber(totals.unmatched_saved_session_total),
      expiredSessionTotal: asNumber(totals.expired_without_save_session_total),
      repeatRate: asNumber(totals.repeat_session_rate),
      exactSavedRate: asNumber(totals.exact_saved_rate),
      unmatchedSavedRate: asNumber(totals.unmatched_saved_rate),
      expiredRate: asNumber(totals.expired_without_save_rate),
      sampleStage: String(totals.sample_stage ?? 'insufficient'),
    },
    trend: Array.isArray(raw?.trend)
      ? raw.trend.map((item: any) => ({
          label: String(item?.label ?? ''),
          startAt: String(item?.start_at ?? ''),
          endAt: String(item?.end_at ?? ''),
          resolvedSessionTotal: asNumber(item?.resolved_session_total),
          repeatedSessionTotal: asNumber(item?.repeated_session_total),
          exactSavedSessionTotal: asNumber(item?.exact_saved_session_total),
          sessionTotal: asNumber(item?.session_total),
          repeatRate: asNumber(item?.repeat_session_rate),
          exactSavedRate: asNumber(item?.exact_saved_rate),
        }))
      : [],
    candidates: Array.isArray(raw?.issue_candidates)
      ? raw.issue_candidates.map((item: any) => ({
          code: String(item?.code ?? ''),
          taskKey: String(item?.task_key ?? ''),
          sampleSize: asNumber(item?.sample_size),
          observedRate: asNumber(item?.observed_rate),
          confidence: String(item?.confidence ?? 'low'),
          persistence: String(item?.persistence ?? 'new'),
          actionable: item?.actionable === true,
          nextAction: String(item?.next_action ?? ''),
        }))
      : [],
  };
}

function formatRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function downloadJson(payload: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([
    `${JSON.stringify(payload, null, 2)}\n`,
  ], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function EditorAssistQualityPanel({
  windowHours,
  taskKey,
  onTaskKeyChange,
  onClearSite,
  siteId = '',
  refreshSignal,
  onRequestStateChange,
  disclosure = true,
}: EditorAssistQualityPanelProps) {
  const { t, locale } = useLocale();
  const [data, setData] = useState<EditorQualitySummary | null>(null);
  const [exportData, setExportData] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestSequenceRef = useRef(0);

  const loadQuality = useCallback(async () => {
    const sequence = ++requestSequenceRef.current;
    setLoading(true);
    setError('');
    setData(null);
    setExportData(null);
    try {
      const params = new URLSearchParams({ window_hours: String(windowHours) });
      if (siteId) params.set('site_id', siteId);
      if (taskKey) params.set('task_key', taskKey);
      const response = await editorQualityClient.request<unknown>(
        `/api/admin/editor-assist-quality?${params.toString()}`
      );
      if (sequence !== requestSequenceRef.current) return;
      setData(normalizeEditorQuality(response.data));
      setExportData(response.data);
    } catch {
      if (sequence !== requestSequenceRef.current) return;
      setError(t('admin.editor_quality.load_error', {}, 'Failed to load editor-assist quality.'));
    } finally {
      if (sequence === requestSequenceRef.current) setLoading(false);
    }
  }, [t, taskKey, windowHours, siteId]);

  useEffect(() => {
    void loadQuality();
    return () => { requestSequenceRef.current += 1; };
  }, [loadQuality, refreshSignal]);

  useEffect(() => {
    onRequestStateChange?.({
      loading,
      error,
      generatedAt: data?.generatedAt || '',
    });
  }, [data?.generatedAt, error, loading, onRequestStateChange]);

  const actionableTotal = data?.candidates.filter((candidate) => candidate.actionable).length ?? 0;
  const sustainedTotal = data?.candidates.filter((candidate) => candidate.persistence === 'sustained').length ?? 0;
  const sampleStage = data?.totals.sampleStage || 'insufficient';
  const hasDecisionSample = ['observation', 'decision'].includes(sampleStage);
  let status: 'success' | 'warning' | 'pending' = 'pending';
  let statusLabel = t('admin.editor_quality.status_waiting', {}, 'Awaiting data');
  if (error) {
    status = 'warning';
    statusLabel = t('admin.editor_quality.status_unavailable', {}, 'Quality data unavailable');
  } else if (actionableTotal > 0) {
    status = 'warning';
    statusLabel = t('admin.editor_quality.status_review', {}, 'Review');
  } else if (data?.totals.sessionTotal && hasDecisionSample) {
    status = 'success';
    statusLabel = t('admin.editor_quality.status_clear', {}, 'No review candidate');
  } else if (data?.totals.sessionTotal) {
    statusLabel = t('admin.editor_quality.status_collecting', {}, 'Collecting evidence');
  }
  const sampleLabel = t(
    `admin.editor_quality.sample_${sampleStage}`,
    {},
    sampleStage
  );
  const trendData = (data?.trend || []).map((item) => ({
    label: item.label,
    value: 0,
  }));
  const hasTrendEvidence = (data?.trend || []).some((item) => item.sessionTotal > 0);
  const exportFilename = [
    'npcink-editor-assist-quality',
    taskKey || 'all',
    `${windowHours}h`,
    (data?.generatedAt || new Date().toISOString()).slice(0, 10),
  ].join('-') + '.json';

  return (
    <details
      data-ui="editor-assist-quality-panel"
      open={!disclosure || undefined}
      className="overflow-hidden border-t border-slate-200 dark:border-slate-800"
    >
      <summary className={disclosure ? 'cursor-pointer py-3' : 'hidden'}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="editor-assist-quality-title" className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('admin.editor_quality.title', {}, 'Editor-assist quality')}
              </h2>
              <BackofficeStatusBadge label={statusLabel} status={status} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t(
                'admin.editor_quality.description',
                {},
                'Silent WordPress adoption signals. Low-volume results validate instrumentation only.'
              )}
            </p>
          </div>
          <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
            {data ? `${sampleLabel} · ${formatNumber(data.totals.sessionTotal)} ${t('admin.editor_quality.sessions', {}, 'sessions')}` : '—'}
          </span>
        </div>
      </summary>

      <div className="border-t border-slate-200 dark:border-slate-800">
        <div data-ui="editor-quality-scope" className="flex flex-wrap items-center gap-2 px-5 py-3 text-xs text-slate-600 dark:text-slate-300 md:px-6">
          <span>{t('admin.editor_quality.current_scope', {}, 'Current scope')}: {windowHours / 24} {t('admin.editor_quality.days', {}, 'days')} · {siteId || t('admin.editor_quality.all_sites', {}, 'All sites')} · {t(TASK_OPTIONS.find(option => option.value === taskKey)?.labelKey || 'admin.editor_quality.task_all', {}, taskKey || 'All tasks')}</span>
          {siteId ? <button type="button" className="underline underline-offset-4" onClick={onClearSite}>{t('admin.editor_quality.clear_site', {}, 'Clear site filter')}</button> : null}
          {taskKey ? <button type="button" className="underline underline-offset-4" onClick={() => onTaskKeyChange('')}>{t('admin.editor_quality.clear_task', {}, 'Clear task filter')}</button> : null}
        </div>
        <p data-ui="editor-quality-sample-limit" className="px-5 pb-3 text-sm font-medium text-slate-700 dark:text-slate-200 md:px-6">
          {t('admin.editor_quality.description', {}, 'Silent WordPress adoption signals. Low-volume results validate instrumentation only.')}
          {' '}{t('admin.editor_quality.pending_count', { count: String(data?.totals.pendingSessionTotal ?? '—') }, '{{count}} sessions pending; save rates use resolved sessions only.')}
        </p>
          <dl className="grid grid-cols-2 gap-4 px-5 py-3 text-sm sm:grid-cols-4 md:px-6">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.resolved_sessions', {}, 'Resolved / total')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {!data ? '—' : `${formatNumber(data?.totals.resolvedSessionTotal || 0)} / ${formatNumber(data?.totals.sessionTotal || 0)}`}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.sample_label', {}, 'Sample stage')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{!data ? '—' : sampleLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.candidate_count', {}, 'Review candidates')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{!data ? '—' : formatNumber(actionableTotal)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.updated_at', {}, 'Updated')}</dt>
              <dd className="mt-0.5 whitespace-nowrap font-semibold text-slate-900 dark:text-white">
                {data?.generatedAt ? formatDate(data.generatedAt) : '—'}
              </dd>
            </div>
          </dl>
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{statusLabel}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <span>{t('admin.editor_quality.task_filter', {}, 'Task')}</span>
              <select
                className="min-w-32 cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                value={taskKey}
                onChange={(event) => onTaskKeyChange(event.target.value)}
              >
                {TASK_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {t(option.labelKey, {}, option.fallback)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? (
          <div className="border-y border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200 md:px-6" role="alert">
            {error}
          </div>
        ) : null}

        {!error ? <>
        <p className="px-5 pb-2 text-xs text-slate-500 dark:text-slate-400 md:px-6">{t('admin.editor_quality.current_sample', {}, 'Rates in the current sample')}</p>
        <dl className="grid divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          {[
            { label: t('admin.editor_quality.repeat_rate', {}, 'Repeat rate'), rate: data?.totals.repeatRate, numerator: data?.totals.repeatedSessionTotal, denominator: data?.totals.sessionTotal },
            { label: t('admin.editor_quality.exact_rate', {}, 'Exact adoption'), rate: data?.totals.exactSavedRate, numerator: data?.totals.exactSavedSessionTotal, denominator: data?.totals.resolvedSessionTotal },
            { label: t('admin.editor_quality.unmatched_rate', {}, 'Post-generation save (unmatched)'), rate: data?.totals.unmatchedSavedRate, numerator: data?.totals.unmatchedSavedSessionTotal, denominator: data?.totals.resolvedSessionTotal },
            { label: t('admin.editor_quality.expired_rate', {}, 'No-save expiry'), rate: data?.totals.expiredRate, numerator: data?.totals.expiredSessionTotal, denominator: data?.totals.resolvedSessionTotal },
          ].map(({ label, rate, numerator, denominator }) => (
            <div key={label} data-ui="editor-quality-rate" className="px-5 py-3 md:px-6">
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 text-base font-semibold text-slate-950 dark:text-white">{denominator ? formatRate(rate ?? 0) : '—'}</dd>
              <p className="text-xs text-slate-500 dark:text-slate-400">{!data ? '—' : denominator ? `${formatNumber(numerator ?? 0)} / ${formatNumber(denominator)}` : t('admin.editor_quality.no_sample', {}, 'No sample')}</p>
            </div>
          ))}
        </dl>
        <div className="min-w-0 px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.editor_quality.trend_title', {}, 'Adoption and repeat trend')}
            </h3>
          </div>
          {hasTrendEvidence ? (
            <AnalyticsLineChart
              data={trendData}
              height={200}
              yAxisLabel="%"
              comparisonSeries={[
                { name: t('admin.editor_quality.exact_rate', {}, 'Exact adoption'), color: '#059669', values: (data?.trend || []).map(item => item.resolvedSessionTotal > 0 ? Math.round(item.exactSavedRate * 100) : null) },
                { name: t('admin.editor_quality.repeat_rate', {}, 'Repeat rate'), color: '#d97706', values: (data?.trend || []).map(item => item.sessionTotal > 0 ? Math.round(item.repeatRate * 100) : null) },
              ]}
            />
          ) : (
            <div className="py-4 text-sm text-slate-500 dark:text-slate-400">
              {loading
                ? t('admin.editor_quality.loading', {}, 'Loading quality evidence...')
                : data?.totals.sessionTotal
                  ? t('admin.editor_quality.no_trend', {}, 'No interval trend evidence returned for the current sample.')
                  : t('admin.editor_quality.empty', {}, 'No editor-assist sessions in this window.')}
            </div>
          )}
          {hasTrendEvidence ? <details className="mt-2 text-xs text-slate-600 dark:text-slate-300" data-ui="editor-quality-trend-samples">
            <summary className="cursor-pointer">{t('admin.editor_quality.trend_samples', {}, 'Intervals and samples (local time); gaps mean no sample')}</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left">
                <thead><tr>
                  <th className="px-2 py-2">{t('admin.editor_quality.interval', {}, 'Interval')}</th>
                  <th className="px-2 py-2">{t('admin.editor_quality.resolved_sessions', {}, 'Resolved / total')}</th>
                  <th className="px-2 py-2">{t('admin.editor_quality.exact_rate', {}, 'Exact adoption')}</th>
                  <th className="px-2 py-2">{t('admin.editor_quality.repeat_rate', {}, 'Repeat rate')}</th>
                </tr></thead>
                <tbody>{(data?.trend || []).map(item => <tr key={item.startAt || item.label} className="border-t border-slate-200 dark:border-slate-800">
                  <th scope="row" className="px-2 py-2 font-normal">{formatDateTime(item.startAt, locale) || item.label} – {formatDateTime(item.endAt, locale) || '—'}</th>
                  <td className="px-2 py-2">{item.resolvedSessionTotal} / {item.sessionTotal}</td>
                  <td className="px-2 py-2">{item.resolvedSessionTotal ? `${formatRate(item.exactSavedRate)} (${item.exactSavedSessionTotal} / ${item.resolvedSessionTotal})` : '—'}</td>
                  <td className="px-2 py-2">{item.sessionTotal ? `${formatRate(item.repeatRate)} (${item.repeatedSessionTotal} / ${item.sessionTotal})` : '—'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details> : null}
        </div>

        <div className="min-w-0 border-t border-slate-200 px-5 py-5 dark:border-slate-800 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.editor_quality.candidates_title', {}, 'Problem candidates')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('admin.editor_quality.sustained_count', { count: String(sustainedTotal) }, '{{count}} sustained')}
            </span>
          </div>
          <div className="mt-3 overflow-x-auto border-y border-slate-200 dark:border-slate-800">
            <table
              data-ui="editor-assist-quality-candidate-table"
              className="w-full min-w-[42rem] table-fixed text-left text-xs"
              aria-label={t('admin.editor_quality.candidates_title', {}, 'Problem candidates')}
            >
              <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-400">
                <tr>
                  <th className="w-[24%] px-3 py-2" scope="col">{t('admin.editor_quality.column_issue', {}, 'Problem')}</th>
                  <th className="w-[13%] px-3 py-2" scope="col">{t('admin.editor_quality.column_task', {}, 'Task')}</th>
                  <th className="w-[17%] px-3 py-2" scope="col">{t('admin.editor_quality.column_evidence', {}, 'Rate / sample')}</th>
                  <th className="w-[20%] px-3 py-2" scope="col">{t('admin.editor_quality.column_confidence', {}, 'Confidence / persistence')}</th>
                  <th className="px-3 py-2" scope="col">{t('admin.editor_quality.column_next_action', {}, 'Next action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(data?.candidates || []).map((candidate) => (
                  <tr key={`${candidate.taskKey}:${candidate.code}`} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                    <th className="px-3 py-2.5 font-semibold leading-5 text-slate-950 dark:text-white" scope="row">
                      {t(`admin.editor_quality.issue_${candidate.code}`, {}, candidate.code)}
                    </th>
                    <td className="px-3 py-2.5 leading-5 text-slate-600 dark:text-slate-300">
                      {t(`admin.editor_quality.task_${candidate.taskKey}`, {}, candidate.taskKey)}
                    </td>
                    <td className="px-3 py-2.5 leading-5 text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-white">{formatRate(candidate.observedRate)}</span>
                      <span className="block text-slate-500 dark:text-slate-400">
                        {t('admin.editor_quality.sample_count', { count: String(candidate.sampleSize) }, '{{count}} sessions')}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 leading-5 text-slate-600 dark:text-slate-300">
                      <BackofficeStatusBadge
                        label={t(
                          `admin.editor_quality.confidence_${candidate.confidence}`,
                          {},
                          candidate.confidence
                        )}
                        status={candidate.actionable ? 'warning' : 'pending'}
                      />
                      <span className="mt-1 block text-slate-500 dark:text-slate-400">
                        {t(
                          `admin.editor_quality.persistence_${candidate.persistence}`,
                          {},
                          candidate.persistence
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 leading-5 text-slate-600 dark:text-slate-300">
                      {t(`admin.editor_quality.action_${candidate.nextAction}`, {}, candidate.nextAction)}
                    </td>
                  </tr>
                ))}
                {data?.candidates.length ? null : (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      {loading
                        ? t('admin.editor_quality.loading', {}, 'Loading quality evidence...')
                        : t('admin.editor_quality.no_candidates', {}, 'No problem candidate meets the diagnostic threshold.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </> : null}
        <details data-ui="editor-quality-reference" className="border-t border-slate-200 px-5 py-3 dark:border-slate-800 md:px-6">
          <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-300">{t('admin.editor_quality.reference', {}, 'Evidence boundary and export')}</summary>
          <div className="mt-3 space-y-3">
            <button
              data-ui="editor-assist-quality-export"
              type="button"
              className="btn btn-secondary btn-sm whitespace-nowrap"
              disabled={loading || Boolean(error) || exportData === null}
              onClick={() => downloadJson(exportData, exportFilename)}
            >
              {t('admin.editor_quality.export_json', {}, 'Export JSON')}
            </button>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t(
                'admin.editor_quality.boundary',
                {},
                'Read-only metadata. This view does not trigger evaluation, change prompts or models, or write WordPress content.'
              )}
            </p>
          </div>
        </details>
      </div>
    </details>
  );
}
