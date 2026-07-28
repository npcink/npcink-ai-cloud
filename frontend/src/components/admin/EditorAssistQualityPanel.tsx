'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatNumber } from '@/lib/utils';

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

  const actionableTotal = data?.candidates.filter((candidate) => candidate.actionable).length ?? 0;
  const sustainedTotal = data?.candidates.filter((candidate) => candidate.persistence === 'sustained').length ?? 0;
  const status = actionableTotal > 0
    ? 'warning'
    : data?.totals.sessionTotal
      ? 'success'
      : 'pending';
  const statusLabel = actionableTotal > 0
    ? t('admin.editor_quality.status_review', {}, 'Review')
    : data?.totals.sessionTotal
      ? t('admin.editor_quality.status_observing', {}, 'Observing')
      : t('admin.editor_quality.status_waiting', {}, 'Awaiting data');
  const sampleLabel = t(
    `admin.editor_quality.sample_${data?.totals.sampleStage || 'insufficient'}`,
    {},
    data?.totals.sampleStage || 'insufficient'
  );
  const trendData = (data?.trend || []).map((item) => ({
    label: item.label,
    value: Math.round(item.exactSavedRate * 100),
    secondaryValue: Math.round(item.repeatRate * 100),
  }));
  const hasTrendEvidence = (data?.trend || []).some((item) => item.sessionTotal > 0);

  return (
    <section
      data-ui="editor-assist-quality-panel"
      className="surface-panel overflow-hidden rounded-[1.35rem]"
      aria-labelledby="editor-assist-quality-title"
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between md:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="editor-assist-quality-title" className="text-lg font-semibold text-slate-950 dark:text-white">
              {t('admin.editor_quality.title', {}, 'Editor-assist quality')}
            </h2>
            <BackofficeStatusBadge label={statusLabel} status={status} />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              'admin.editor_quality.description',
              {},
              'Silent WordPress adoption signals. Low-volume results validate instrumentation only.'
            )}
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
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/25 dark:text-rose-200 md:px-6" role="alert">
          {error}
        </div>
      ) : null}

      <dl className="grid divide-y divide-slate-200 border-b border-slate-200 dark:divide-slate-800 dark:border-slate-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
        {[
          [t('admin.editor_quality.sessions', {}, 'Sessions'), formatNumber(data?.totals.sessionTotal || 0)],
          [t('admin.editor_quality.repeat_rate', {}, 'Repeat rate'), formatRate(data?.totals.repeatRate || 0)],
          [t('admin.editor_quality.exact_rate', {}, 'Exact adoption'), formatRate(data?.totals.exactSavedRate || 0)],
          [t('admin.editor_quality.unmatched_rate', {}, 'Post-generation save (unmatched)'), formatRate(data?.totals.unmatchedSavedRate || 0)],
          [t('admin.editor_quality.expired_rate', {}, 'No-save expiry'), formatRate(data?.totals.expiredRate || 0)],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-3.5 md:px-6">
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{loading && !data ? '—' : value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid divide-y divide-slate-200 dark:divide-slate-800 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] xl:divide-x xl:divide-y-0">
        <div className="min-w-0 px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.editor_quality.trend_title', {}, 'Adoption and repeat trend')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('admin.editor_quality.sample_stage', { stage: sampleLabel }, 'Sample stage: {{stage}}')}
            </span>
          </div>
          {hasTrendEvidence ? (
            <AnalyticsLineChart
              data={trendData}
              height={240}
              yAxisLabel="%"
              primarySeriesName={t('admin.editor_quality.exact_rate', {}, 'Exact adoption')}
              secondarySeriesName={t('admin.editor_quality.repeat_rate', {}, 'Repeat rate')}
              primaryColor="#059669"
              secondaryColor="#d97706"
            />
          ) : (
            <div className="flex min-h-60 items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
              {loading
                ? t('admin.editor_quality.loading', {}, 'Loading quality evidence...')
                : t('admin.editor_quality.empty', {}, 'No editor-assist sessions in this window.')}
            </div>
          )}
        </div>

        <div className="min-w-0 px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('admin.editor_quality.candidates_title', {}, 'Problem candidates')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t('admin.editor_quality.sustained_count', { count: String(sustainedTotal) }, '{{count}} sustained')}
            </span>
          </div>
          <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {(data?.candidates || []).map((candidate) => (
              <div key={`${candidate.taskKey}:${candidate.code}`} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-950 dark:text-white">
                    {t(`admin.editor_quality.issue_${candidate.code}`, {}, candidate.code)}
                  </p>
                  <BackofficeStatusBadge
                    label={t(
                      `admin.editor_quality.confidence_${candidate.confidence}`,
                      {},
                      candidate.confidence
                    )}
                    status={candidate.actionable ? 'warning' : 'pending'}
                  />
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {t(`admin.editor_quality.task_${candidate.taskKey}`, {}, candidate.taskKey)}
                  {' · '}
                  {t(
                    'admin.editor_quality.candidate_evidence',
                    {
                      rate: formatRate(candidate.observedRate),
                      sample: String(candidate.sampleSize),
                    },
                    '{{rate}} from {{sample}} sessions'
                  )}
                  {' · '}
                  {t(
                    `admin.editor_quality.persistence_${candidate.persistence}`,
                    {},
                    candidate.persistence
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  {t(`admin.editor_quality.action_${candidate.nextAction}`, {}, candidate.nextAction)}
                </p>
              </div>
            ))}
            {data?.candidates.length ? null : (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {t('admin.editor_quality.no_candidates', {}, 'No problem candidate meets the diagnostic threshold.')}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="border-t border-slate-200 px-5 py-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400 md:px-6">
        {t(
          'admin.editor_quality.boundary',
          {},
          'Read-only metadata. This view does not trigger evaluation, change prompts or models, or write WordPress content.'
        )}
      </p>
    </section>
  );
}
