'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/utils';

const editorQualityClient = createApiClient({ idempotencyPrefix: 'editor_assist_quality' });

type QualityTotals = {
  sessionTotal: number;
  resolvedSessionTotal: number;
  repeatRate: number;
  exactSavedRate: number;
  unmatchedSavedRate: number;
  expiredRate: number;
  sampleStage: string;
};

type QualityTrend = {
  label: string;
  sessionTotal: number;
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
  windowHours: 24 | 72 | 168;
  refreshSignal: number;
  onRequestStateChange?: (state: EditorAssistQualityRequestState) => void;
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
      repeatRate: asNumber(totals.repeat_session_rate),
      exactSavedRate: asNumber(totals.exact_saved_rate),
      unmatchedSavedRate: asNumber(totals.unmatched_saved_rate),
      expiredRate: asNumber(totals.expired_without_save_rate),
      sampleStage: String(totals.sample_stage ?? 'insufficient'),
    },
    trend: Array.isArray(raw?.trend)
      ? raw.trend.map((item: any) => ({
          label: String(item?.label ?? ''),
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

export function EditorAssistQualityPanel({
  windowHours,
  refreshSignal,
  onRequestStateChange,
}: EditorAssistQualityPanelProps) {
  const { t } = useLocale();
  const [taskKey, setTaskKey] = useState('');
  const [data, setData] = useState<EditorQualitySummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestSequenceRef = useRef(0);

  const loadQuality = useCallback(async () => {
    const sequence = ++requestSequenceRef.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ window_hours: String(windowHours) });
      if (taskKey) params.set('task_key', taskKey);
      const response = await editorQualityClient.request<unknown>(
        `/api/admin/editor-assist-quality?${params.toString()}`
      );
      if (sequence !== requestSequenceRef.current) return;
      setData(normalizeEditorQuality(response.data));
    } catch (loadError) {
      if (sequence !== requestSequenceRef.current) return;
      setError(resolveUiErrorMessage(
        loadError,
        t('admin.editor_quality.load_error', {}, 'Failed to load editor-assist quality.')
      ));
    } finally {
      if (sequence === requestSequenceRef.current) setLoading(false);
    }
  }, [t, taskKey, windowHours]);

  useEffect(() => {
    void loadQuality();
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
  if (actionableTotal > 0) {
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
    value: Math.round(item.exactSavedRate * 100),
    secondaryValue: Math.round(item.repeatRate * 100),
  }));
  const hasTrendEvidence = (data?.trend || []).some((item) => item.sessionTotal > 0);

  return (
    <details
      data-ui="editor-assist-quality-panel"
      className="admin-compact-surface overflow-hidden border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="editor-assist-quality-title" className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('admin.editor_quality.title', {}, 'Editor-assist quality')}
              </h2>
              <BackofficeStatusBadge label={statusLabel} status={status} />
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {t(
                'admin.editor_quality.description',
                {},
                'Silent WordPress adoption signals. Low-volume results validate instrumentation only.'
              )}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.resolved_sessions', {}, 'Resolved / total')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {loading && !data ? '—' : `${formatNumber(data?.totals.resolvedSessionTotal || 0)} / ${formatNumber(data?.totals.sessionTotal || 0)}`}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.sample_label', {}, 'Sample stage')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{loading && !data ? '—' : sampleLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.candidate_count', {}, 'Review candidates')}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{loading && !data ? '—' : formatNumber(actionableTotal)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.editor_quality.updated_at', {}, 'Updated')}</dt>
              <dd className="mt-0.5 whitespace-nowrap font-semibold text-slate-900 dark:text-white">
                {data?.generatedAt ? formatDate(data.generatedAt) : '—'}
              </dd>
            </div>
          </dl>
          <span className="shrink-0 text-xs font-semibold text-blue-700 dark:text-blue-300">
            {t('admin.editor_quality.show_details', {}, 'View details')} ↓
          </span>
        </div>
      </summary>

      <div className="border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.editor_quality.detail_title', {}, 'Quality evidence detail')}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('admin.editor_quality.sample_stage', { stage: sampleLabel }, 'Sample stage: {{stage}}')}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>{t('admin.editor_quality.task_filter', {}, 'Task')}</span>
            <select
              className="min-w-32 cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              value={taskKey}
              onChange={(event) => setTaskKey(event.target.value)}
            >
              {TASK_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {t(option.labelKey, {}, option.fallback)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <div className="border-y border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200 md:px-6" role="alert">
            {error}
          </div>
        ) : null}

        <dl className="grid divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          {[
            [t('admin.editor_quality.repeat_rate', {}, 'Repeat rate'), formatRate(data?.totals.repeatRate || 0)],
            [t('admin.editor_quality.exact_rate', {}, 'Exact adoption'), formatRate(data?.totals.exactSavedRate || 0)],
            [t('admin.editor_quality.unmatched_rate', {}, 'Post-generation save (unmatched)'), formatRate(data?.totals.unmatchedSavedRate || 0)],
            [t('admin.editor_quality.expired_rate', {}, 'No-save expiry'), formatRate(data?.totals.expiredRate || 0)],
          ].map(([label, value]) => (
            <div key={label} className="px-5 py-3 md:px-6">
              <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{loading && !data ? '—' : value}</dd>
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
              primarySeriesName={t('admin.editor_quality.exact_rate', {}, 'Exact adoption')}
              secondarySeriesName={t('admin.editor_quality.repeat_rate', {}, 'Repeat rate')}
              primaryColor="#059669"
              secondaryColor="#d97706"
            />
          ) : (
            <div className="flex min-h-52 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
              {loading
                ? t('admin.editor_quality.loading', {}, 'Loading quality evidence...')
                : t('admin.editor_quality.empty', {}, 'No editor-assist sessions in this window.')}
            </div>
          )}
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
                      {t('admin.editor_quality.no_candidates', {}, 'No problem candidate meets the diagnostic threshold.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="border-t border-slate-200 px-5 py-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400 md:px-6">
          {t(
            'admin.editor_quality.boundary',
            {},
            'Read-only metadata. This view does not trigger evaluation, change prompts or models, or write WordPress content.'
          )}
        </p>
      </div>
    </details>
  );
}
