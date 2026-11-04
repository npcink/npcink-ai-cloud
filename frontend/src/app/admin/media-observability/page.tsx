'use client';

import Link from 'next/link';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import {
  BackofficeEmptyState,
  BackofficeDiagnosticNotice,
  BackofficeDisclosure,
  BackofficePageHeader,
  BackofficePageStack,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { normalizeObservationWindow } from '@/features/admin/observability/window';
import { AdminObservabilityTabs } from '@/components/admin/AdminObservabilityTabs';
import { BackofficeFilterPill } from '@/components/backoffice/BackofficeFilterPill';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeTag } from '@/components/backoffice/BackofficeTag';
import {
  CloudWorkflowMetadataPanel,
  normalizeCloudWorkflowMetadata,
  type CloudWorkflowMetadata,
} from '@/components/backoffice/CloudWorkflowMetadataPanel';
import { AnalyticsBarChart } from '@/components/ui/EChartsWrapper';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/utils';

import { ObservationTrend } from '@/features/admin/observability/ObservationTrend';

const mediaObservabilityClient = createApiClient({ idempotencyPrefix: 'media_observability' });

type MediaObservabilityData = {
  generatedAt: string;
  workflowMetadata: CloudWorkflowMetadata;
  window: { hours: number; startAt: string; endAt: string };
  totals: {
    jobsTotal: number;
    succeededTotal: number;
    failedTotal: number;
    successRate: number;
    avgProcessingDurationMs: number;
    p95ProcessingDurationMs: number;
    avgQueueWaitMs: number;
    sourceBytesTotal: number;
    outputBytesTotal: number;
    bytesSavedTotal: number;
    compressionRatio: number;
    deliveryStartedCount: number;
    deliveryStreamCompletedCount: number;
    deliveryAcknowledgedCount: number;
    streamCompletionRate: number;
    acknowledgementRate: number;
    lastFinishedAt: string;
    activeSiteCount: number;
    activeAccountCount: number;
    watermarkJobCount: number;
    activeArtifactCount: number;
    activeArtifactBytes: number;
  };
  health: { status: string; score: number; summary: string };
  timeline: Array<{
    bucketStartAt: string;
    bucketEndAt: string;
    jobsTotal: number;
    failedTotal: number;
    bytesSavedTotal: number;
  }>;
  formats: Array<{
    targetFormat: string;
    jobsTotal: number;
    succeededTotal: number;
    failedTotal: number;
    successRate: number;
    sourceBytesTotal: number;
    outputBytesTotal: number;
    bytesSavedTotal: number;
    compressionRatio: number;
    avgProcessingDurationMs: number;
  }>;
  sites: Array<{
    siteId: string;
    jobsTotal: number;
    succeededTotal: number;
    failedTotal: number;
    successRate: number;
    sourceBytesTotal: number;
    outputBytesTotal: number;
    bytesSavedTotal: number;
    compressionRatio: number;
    avgProcessingDurationMs: number;
    lastFinishedAt: string;
  }>;
  deliveriesByOperation: Array<{ operation: string; started: number; completed: number; acknowledged: number }>;
  errors: Array<{ errorCode: string; count: number; lastSeenAt: string }>;
  recentFailures: Array<{
    runId: string;
    siteId: string;
    targetFormat: string;
    errorCode: string;
    sourceBytes: number;
    queueWaitMs: number;
    processingDurationMs: number;
    finishedAt: string;
  }>;
};



const FORMAT_OPTIONS = [
  { labelKey: 'admin.media_obs.format_all', label: 'All formats', value: '' },
  { labelKey: 'admin.media_obs.format_webp', label: 'WebP', value: 'webp' },
  { labelKey: 'admin.media_obs.format_jpeg', label: 'JPEG', value: 'jpeg' },
  { labelKey: 'admin.media_obs.format_png', label: 'PNG', value: 'png' },
  { labelKey: 'admin.media_obs.format_avif', label: 'AVIF', value: 'avif' },
  { labelKey: 'admin.media_obs.format_original', label: 'Original', value: 'original' },
];

function normalizeMediaObservability(raw: any): MediaObservabilityData {
  const totals = raw?.totals ?? {};
  const window = raw?.window ?? {};
  const health = raw?.health ?? {};
  return {
    generatedAt: String(raw?.generated_at ?? ''),
    workflowMetadata: normalizeCloudWorkflowMetadata(raw?.workflow_metadata ?? {}),
    window: {
      hours: Number(window.hours ?? 24),
      startAt: String(window.start_at ?? ''),
      endAt: String(window.end_at ?? ''),
    },
    totals: {
      jobsTotal: Number(totals.jobs_total ?? 0),
      succeededTotal: Number(totals.succeeded_total ?? 0),
      failedTotal: Number(totals.failed_total ?? 0),
      successRate: Number(totals.success_rate ?? 0),
      avgProcessingDurationMs: Number(totals.avg_processing_duration_ms ?? 0),
      p95ProcessingDurationMs: Number(totals.p95_processing_duration_ms ?? 0),
      avgQueueWaitMs: Number(totals.avg_queue_wait_ms ?? 0),
      sourceBytesTotal: Number(totals.source_bytes_total ?? 0),
      outputBytesTotal: Number(totals.output_bytes_total ?? 0),
      bytesSavedTotal: Number(totals.bytes_saved_total ?? 0),
      compressionRatio: Number(totals.compression_ratio ?? 0),
      deliveryStartedCount: Number(totals.delivery_started_count ?? 0),
      deliveryStreamCompletedCount: Number(totals.delivery_stream_completed_count ?? 0),
      deliveryAcknowledgedCount: Number(totals.delivery_acknowledged_count ?? 0),
      streamCompletionRate: Number(totals.stream_completion_rate ?? 0),
      acknowledgementRate: Number(totals.acknowledgement_rate ?? 0),
      lastFinishedAt: String(totals.last_finished_at ?? ''),
      activeSiteCount: Number(totals.active_site_count ?? 0),
      activeAccountCount: Number(totals.active_account_count ?? 0),
      watermarkJobCount: Number(totals.watermark_job_count ?? 0),
      activeArtifactCount: Number(totals.active_artifact_count ?? 0),
      activeArtifactBytes: Number(totals.active_artifact_bytes ?? 0),
    },
    health: {
      status: String(health.status ?? 'inactive'),
      score: Number(health.score ?? 0),
      summary: String(health.summary ?? ''),
    },
    timeline: Array.isArray(raw?.timeline)
      ? raw.timeline.map((item: any, index: number) => ({
          bucketStartAt: String(item.bucket_start_at ?? ''),
          bucketEndAt: String(item.bucket_end_at ?? raw.timeline[index + 1]?.bucket_start_at ?? window.end_at ?? ''),
          jobsTotal: Number(item.jobs_total ?? 0),
          failedTotal: Number(item.failed_total ?? 0),
          bytesSavedTotal: Number(item.bytes_saved_total ?? 0),
        }))
      : [],
    formats: Array.isArray(raw?.formats)
      ? raw.formats.map((item: any) => ({
          targetFormat: String(item.target_format ?? ''),
          jobsTotal: Number(item.jobs_total ?? 0),
          succeededTotal: Number(item.succeeded_total ?? 0),
          failedTotal: Number(item.failed_total ?? 0),
          successRate: Number(item.success_rate ?? 0),
          sourceBytesTotal: Number(item.source_bytes_total ?? 0),
          outputBytesTotal: Number(item.output_bytes_total ?? 0),
          bytesSavedTotal: Number(item.bytes_saved_total ?? 0),
          compressionRatio: Number(item.compression_ratio ?? 0),
          avgProcessingDurationMs: Number(item.avg_processing_duration_ms ?? 0),
        }))
      : [],
    sites: Array.isArray(raw?.sites)
      ? raw.sites.map((item: any) => ({
          siteId: String(item.site_id ?? ''),
          jobsTotal: Number(item.jobs_total ?? 0),
          succeededTotal: Number(item.succeeded_total ?? 0),
          failedTotal: Number(item.failed_total ?? 0),
          successRate: Number(item.success_rate ?? 0),
          sourceBytesTotal: Number(item.source_bytes_total ?? 0),
          outputBytesTotal: Number(item.output_bytes_total ?? 0),
          bytesSavedTotal: Number(item.bytes_saved_total ?? 0),
          compressionRatio: Number(item.compression_ratio ?? 0),
          avgProcessingDurationMs: Number(item.avg_processing_duration_ms ?? 0),
          lastFinishedAt: String(item.last_finished_at ?? ''),
        }))
      : [],
    deliveriesByOperation: Array.isArray(raw?.delivery_evidence?.by_operation)
      ? raw.delivery_evidence.by_operation.map((item: any) => ({ operation: String(item.operation ?? ''), started: Number(item.delivery_started_count ?? 0), completed: Number(item.delivery_stream_completed_count ?? 0), acknowledged: Number(item.delivery_acknowledged_count ?? 0) })) : [],
    errors: Array.isArray(raw?.errors)
      ? raw.errors.map((item: any) => ({
          errorCode: String(item.error_code ?? ''),
          count: Number(item.count ?? 0),
          lastSeenAt: String(item.last_seen_at ?? ''),
        }))
      : [],
    recentFailures: Array.isArray(raw?.recent_failures)
      ? raw.recent_failures.map((item: any) => ({
          runId: String(item.run_id ?? ''),
          siteId: String(item.site_id ?? ''),
          targetFormat: String(item.target_format ?? ''),
          errorCode: String(item.error_code ?? ''),
          sourceBytes: Number(item.source_bytes ?? 0),
          queueWaitMs: Number(item.queue_wait_ms ?? 0),
          processingDurationMs: Number(item.processing_duration_ms ?? 0),
          finishedAt: String(item.finished_at ?? ''),
        }))
      : [],
  };
}

function formatBytes(value: number): string {
  const bytes = Number(value || 0);
  if (Math.abs(bytes) >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (Math.abs(bytes) >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (Math.abs(bytes) >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function formatPercent(value: number): string {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function statusForSuccess(successRate: number, failures: number): string {
  if (failures > 0 && successRate < 0.95) return 'error';
  if (failures > 0 || successRate < 0.99) return 'warning';
  return 'ok';
}

function mediaStatusLabel(
  t: (key: string, params?: Record<string, string>, fallback?: string) => string,
  status: string
): string {
  return t(`status.${status || 'unknown'}`, {}, status || 'unknown');
}

function mediaHealthSummary(
  t: (key: string, params?: Record<string, string>, fallback?: string) => string,
  data: MediaObservabilityData
): string {
  if (data.health.status === 'inactive') {
    return t('admin.media_obs.health_summary_inactive', {}, 'No media processing jobs in this window.');
  }
  return t(
    'admin.media_obs.health_summary_active',
    {
      jobs: formatNumber(data.totals.jobsTotal),
      failures: formatNumber(data.totals.failedTotal),
      p95: formatNumber(data.totals.p95ProcessingDurationMs),
    },
    '{{jobs}} jobs · {{failures}} failed · P95 {{p95}}ms'
  );
}



function normalizeTargetFormat(value: string | null): string {
  const normalized = value || '';
  return FORMAT_OPTIONS.some((option) => option.value === normalized) ? normalized : '';
}

function AdminMediaObservabilityContent() {
  const { t, locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const windowHours = normalizeObservationWindow(searchParams.get('window'), 336, 'media');
  const targetFormat = normalizeTargetFormat(searchParams.get('format'));
  const siteIdFilter = searchParams.get('site') || '';
  const focusedRunId = searchParams.get('focus') || '';
  const [data, setData] = useState<MediaObservabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [siteIdInput, setSiteIdInput] = useState(siteIdFilter);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  const updateUrl = useCallback((updates: { window?: number | null; format?: string | null; site?: string | null; focus?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
      else params.delete(key);
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadData = useCallback(async (refresh = false) => {
    requestControllerRef.current?.abort();
    const sequence = ++requestSequenceRef.current;
    setLoading(true);
    if (!refresh) setData(null);
    setError('');
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
    try {
      const params = new URLSearchParams();
      params.set('window_hours', String(windowHours));
      if (siteIdFilter.trim()) {
        params.set('site_id', siteIdFilter.trim());
      }
      if (targetFormat) {
        params.set('target_format', targetFormat);
      }
      const response = await mediaObservabilityClient.request<unknown>(`/api/admin/media-observability?${params.toString()}`, {
        signal: controller.signal,
      });
      if (sequence !== requestSequenceRef.current) return;
      setData(normalizeMediaObservability(response.data));
    } catch (err) {
      if (sequence !== requestSequenceRef.current) return;
      setError(resolveUiErrorMessage(err, t('admin.media_obs.load_error', {}, 'Failed to load media processing diagnostics.')));
    } finally {
      globalThis.clearTimeout(timeout);
      if (sequence === requestSequenceRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [siteIdFilter, t, targetFormat, windowHours]);

  useEffect(() => {
    void loadData();
    return () => { requestSequenceRef.current += 1; requestControllerRef.current?.abort(); };
  }, [loadData]);

  useEffect(() => {
    setSiteIdInput(siteIdFilter);
  }, [siteIdFilter]);

  const formatData = useMemo(
    () =>
      (data?.formats || []).map((item) => ({
        label: item.targetFormat || t('common.unknown', {}, 'Unknown'),
        value: item.jobsTotal,
        color: item.failedTotal > 0 ? '#f59e0b' : '#2563eb',
      })),
    [data, t]
  );
  const savingsData = useMemo(
    () =>
      (data?.formats || []).map((item) => ({
        label: item.targetFormat || t('common.unknown', {}, 'Unknown'),
        value: item.bytesSavedTotal,
        color: item.bytesSavedTotal < 0 ? '#f59e0b' : '#10b981',
      })),
    [data, t]
  );
  const selectedFailure = focusedRunId
    ? data?.recentFailures.find((item) => item.runId === focusedRunId) || null
    : data?.recentFailures[0] || null;
  const absentFocus = Boolean(data && focusedRunId && !selectedFailure);
  const isEmpty = data !== null && data.totals.jobsTotal === 0;


  return (
    <BackofficePageStack spacing="compact">
      <AdminObservabilityTabs />
      <BackofficePageHeader
        density="compact"
        title={t('admin.media_obs.title', {}, 'Media Processing Observability')}
        description={t(
          'admin.media_obs.desc',
          {},
          'Cross-site runtime metrics for Cloud image derivative jobs. This view tracks processing health, temporary artifact pressure, and compression value without exposing image payloads.'
        )}
        secondaryAction={<button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadData(true)} disabled={loading}>{t('common.refresh', {}, 'Refresh')}</button>}
      />

      {loading ? <p role="status" className="text-sm text-slate-500">{t('common.loading', {}, 'Loading…')}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-ui="media-observability-scope-row">
        {FORMAT_OPTIONS.map((opt) => (
          <BackofficeFilterPill
            key={opt.value || 'all'}
            active={targetFormat === opt.value}
            tone="accent"
            onClick={() => updateUrl({ format: opt.value || null, focus: null })}
          >
            {t(opt.labelKey, {}, opt.label)}
          </BackofficeFilterPill>
        ))}
        <input type="text" value={siteIdInput} aria-label={t('admin.media_obs.site_filter_label', {}, 'Filter by site ID')} onChange={(event) => setSiteIdInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') updateUrl({ site: siteIdInput.trim() || null, focus: null }); }} placeholder={t('admin.media_obs.site_filter', {}, 'Site ID')} className="input h-8 w-44 min-w-0" />
        <button type="button" onClick={() => updateUrl({ site: siteIdInput.trim() || null, focus: null })} className="btn btn-secondary btn-sm justify-center">{t('common.apply', {}, 'Apply')}</button>
        {siteIdFilter ? <button type="button" className="btn btn-ghost btn-sm justify-center" onClick={() => { setSiteIdInput(''); updateUrl({ site: null, focus: null }); }}>{t('common.clear_filters', {}, 'Clear filters')}</button> : null}
        {data?.generatedAt ? <p className="ml-auto text-xs text-slate-500 dark:text-slate-400">{t('common.updated_at', {}, 'Updated')}: {formatDate(data.generatedAt)}</p> : null}
        {data ? <BackofficeStatusBadge status={data.health.status} label={`${mediaStatusLabel(t, data.health.status)} · ${data.health.score}`} /> : null}
      </div>

      {error ? <BackofficeDiagnosticNotice message={error} staleDescription={data ? t('admin.media_obs.stale_notice', {}, 'The last successfully loaded media snapshot remains visible.') : undefined} retryLabel={t('common.retry')} onRetry={() => void loadData(true)} /> : null}

      {data ? <>
        <p data-ui="media-history-scope" className="text-xs text-slate-500">{c('图片衍生处理为只读历史；新衍生及优化任务已暂停。普通图片生成、ALT 和媒体交付保留。', 'Image derivatives are read-only history; new derivative and optimization jobs are paused. Ordinary image generation, ALT and media delivery remain available.')}</p>
        {absentFocus ? <div data-ui="media-focus-absent" role="status" className="border border-slate-200 p-3 text-sm dark:border-slate-800">{c('指定运行不在当前范围或最近失败列表中；未选择其他运行。', 'The requested run is outside this scope or recent failure list; no other run was selected.')} <code className="break-all">{focusedRunId}</code><button type="button" className="btn btn-ghost btn-sm" onClick={() => updateUrl({ focus: null })}>{c('清除定位', 'Clear focus')}</button></div> : null}
        <section data-ui="media-delivery-evidence" className="border-y border-slate-200 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold">{c('媒体交付', 'Media delivery')}</h2>
          <p className="mt-1 text-xs text-slate-500">{targetFormat ? c('当前格式仅统计关联衍生任务的交付；普通图片交付不在此格式范围。', 'This format includes only deliveries linked to derivative jobs; ordinary image delivery is outside this format scope.') : c('按交付开始时间统计所选时段，包含各类媒体操作；与衍生任务数不是同一口径。', 'Selected-period deliveries by start time across media operations; this differs from derivative job counts.')} {c('流完成与客户端收件只证明传输，不证明 WordPress 保存或采纳。', 'Stream completion and client receipt prove transfer, not WordPress saving or adoption.')}</p>
          <p className="mt-2 text-sm">{c('已开始 / 流完成 / 收件验证', 'Started / stream complete / receipt verified')}: {data.totals.deliveryStartedCount} / {data.totals.deliveryStreamCompletedCount} / {data.totals.deliveryAcknowledgedCount}</p>
          {data.deliveriesByOperation.length ? <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">{c('操作', 'Operation')}</th><th>{c('已开始', 'Started')}</th><th>{c('流完成', 'Stream complete')}</th><th>{c('收件验证', 'Receipt verified')}</th></tr></thead><tbody>{data.deliveriesByOperation.map(item => <tr key={item.operation}><td className="py-2 font-mono break-all">{item.operation}</td><td>{item.started}</td><td>{item.completed}</td><td>{item.acknowledged}</td></tr>)}</tbody></table></div> : <p className="mt-1 text-xs text-slate-500">{data.totals.deliveryStartedCount ? c('当前响应未提供操作分组。', 'Operation breakdown is unavailable in this response.') : c('所选范围没有交付开始记录。', 'No delivery starts in this scope.')}</p>}
          <p className="mt-2 text-xs text-slate-500">{c('当前衍生工件存量（未过期且未清理，非时段增量）', 'Current derivative artifacts (unexpired and unpurged, not period additions)')}: {data.totals.activeArtifactCount} · {formatBytes(data.totals.activeArtifactBytes)} · {c('快照', 'Snapshot')}: {formatDate(data.generatedAt)}</p>
        </section>
      </> : null}
      {!data ? null : isEmpty ? (
        <BackofficeEmptyState
          title={t('admin.media_obs.empty_title', {}, 'No media jobs yet')}
          description={t(
            'admin.media_obs.empty_desc',
            {},
            'Media processing metrics will appear after sites send image derivative jobs to Cloud.'
          )}
        />
      ) : (
        <>
          <p className="text-xs text-slate-500">{c('以下为所选时段的衍生处理历史；体积变化正值表示节省、负值表示增大。小样本 P95 使用排序后 floor((N−1)×0.95) 的值。', 'Derivative processing history for the selected period. Positive size change means savings; negative means growth. Small-sample P95 uses the sorted floor((N−1)×0.95) value.')} N={data.totals.jobsTotal} · {t('admin.media_obs.queue_wait')}: {formatNumber(data.totals.avgQueueWaitMs)}ms</p>
          <div data-ui="media-observability-metrics" className="grid grid-cols-3 gap-2 md:grid-cols-6">
            {[
              { label: t('admin.media_obs.jobs', {}, 'Jobs'), value: formatNumber(data.totals.jobsTotal) },
              { label: t('admin.media_obs.failures', {}, 'Failures'), value: formatNumber(data.totals.failedTotal), warn: data.totals.failedTotal > 0 },
              { label: t('admin.media_obs.success_rate', {}, 'Success rate'), value: formatPercent(data.totals.successRate), warn: statusForSuccess(data.totals.successRate, data.totals.failedTotal) !== 'ok' },
              { label: t('admin.media_obs.avg_processing', {}, 'Avg processing'), value: `${formatNumber(data.totals.avgProcessingDurationMs)}ms` },
              { label: t('admin.media_obs.p95_processing', {}, 'P95 processing'), value: `${formatNumber(data.totals.p95ProcessingDurationMs)}ms` },
              { label: t('admin.media_obs.saved', {}, 'Size change'), value: formatBytes(data.totals.bytesSavedTotal), warn: data.totals.bytesSavedTotal < 0 },
            ].map((tile) => (
              <div key={tile.label} className="admin-tier-card px-3 py-2">
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{tile.label}</p>
                <p className={`mt-0.5 text-lg font-semibold leading-7 ${tile.warn ? 'text-amber-700 dark:text-amber-300' : 'text-slate-950 dark:text-white'}`}>{tile.value}</p>
              </div>
            ))}
          </div>
          <section className="admin-tier-card overflow-hidden p-3">
            <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.media_obs.trend_title', {}, 'Jobs and failures')}</h2>
            <div className="mt-2">
              <ObservationTrend points={data.timeline.map(point => ({ startAt: point.bucketStartAt, endAt: point.bucketEndAt, values: [point.jobsTotal, point.failedTotal] }))} series={[
                { name: t('admin.media_obs.jobs'), color: '#2563eb' }, { name: t('admin.media_obs.failures'), color: '#f59e0b' },
              ]} />
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-2">
            <section className="admin-tier-card overflow-hidden p-3">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.media_obs.format_mix', {}, 'Format mix')}</h2>
              <div className="mt-2">
                <AnalyticsBarChart data={formatData} height={200} barColor="#2563eb" />
              </div>
            </section>
            <section className="admin-tier-card overflow-hidden p-3">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.media_obs.savings_title', {}, 'Size change by format')}</h2>
              <div className="mt-2">
                <AnalyticsBarChart data={savingsData} height={200} barColor="#10b981" />
              </div>
            </section>
          </div>

          {(data?.sites || []).length > 1 ? <section className="admin-tier-card overflow-hidden p-0">
            <div className="border-b border-slate-200/80 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('admin.media_obs.sites_title', {}, 'Site breakdown')}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200/80 text-sm dark:divide-slate-800">
                <thead className="bg-slate-50/80 text-xs uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-950/30 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">{t('common.site', {}, 'Site')}</th>
                    <th className="px-5 py-3 text-right font-semibold">{t('admin.media_obs.jobs', {}, 'Jobs')}</th>
                    <th className="px-5 py-3 text-right font-semibold">{t('admin.media_obs.success', {}, 'Success')}</th>
                    <th className="px-5 py-3 text-right font-semibold">{t('admin.media_obs.saved', {}, 'Size change')}</th>
                    <th className="px-5 py-3 text-right font-semibold">{t('admin.media_obs.avg_ms', {}, 'Avg ms')}</th>
                    <th className="px-5 py-3 text-right font-semibold">{t('admin.media_obs.last', {}, 'Last')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {(data?.sites || []).map((site) => (
                    <tr key={site.siteId} className="bg-white/55 dark:bg-slate-950/20">
                      <td className="px-5 py-3">
                        <BackofficeIdentifier value={site.siteId} />
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200">
                        {formatNumber(site.jobsTotal)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <BackofficeTag tone={site.failedTotal > 0 ? 'warning' : 'info'}>
                          {formatPercent(site.successRate)}
                        </BackofficeTag>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200">
                        {formatBytes(site.bytesSavedTotal)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-700 dark:text-slate-200">
                        {formatNumber(site.avgProcessingDurationMs)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500 dark:text-slate-400">
                        {site.lastFinishedAt ? formatDate(site.lastFinishedAt) : t('common.not_found')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section> : null}

          {data.recentFailures.length ? <section className="admin-tier-card overflow-hidden p-0 md:p-0">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800 md:px-6"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('admin.media_obs.recent_label', {}, 'Recent')}</p><h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{t('admin.media_obs.failure_queue_title', {}, 'Recent failure queue')}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t('admin.media_obs.failure_queue_desc', {}, 'Select a failed media job to inspect its site, format, size, queue wait, and processing evidence.')}</p></div>
            <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="max-h-[36rem] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                {data.recentFailures.map((item) => { const selected = selectedFailure?.runId === item.runId; return <button key={item.runId} type="button" data-ui="media-failure-item" aria-pressed={selected} aria-controls="media-failure-inspector" className={`grid w-full cursor-pointer gap-3 px-5 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/45 md:grid-cols-[minmax(0,1fr)_8rem] md:items-center md:px-6 ${selected ? 'bg-blue-50/65 dark:bg-blue-950/20' : ''}`} onClick={() => updateUrl({ focus: item.runId })}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-950 dark:text-white">{item.errorCode}</span><BackofficeTag tone="warning">{item.targetFormat}</BackofficeTag></div><p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-300">{item.siteId} · {formatBytes(item.sourceBytes)} · {item.finishedAt ? formatDate(item.finishedAt) : t('common.not_found')}</p></div><div className="text-sm font-medium text-slate-500 md:text-right dark:text-slate-400">{formatNumber(item.processingDurationMs)}ms</div></button>; })}
              </div>
              <div id="media-failure-inspector" className="border-t border-slate-200 p-5 dark:border-slate-800 xl:border-l xl:border-t-0 xl:p-6">
                {selectedFailure ? <div className="space-y-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{t('admin.media_obs.selected_failure', {}, 'Selected failure')}</p><h3 className="mt-2 text-lg font-semibold text-slate-950 dark:text-white">{selectedFailure.errorCode}</h3><Link className="text-sm text-blue-700 underline dark:text-blue-300" href={`/admin/troubleshooting?window=${windowHours}&site=${encodeURIComponent(selectedFailure.siteId)}&run_id=${encodeURIComponent(selectedFailure.runId)}`}>{c('查看此运行', 'Inspect this run')}</Link><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selectedFailure.finishedAt ? formatDate(selectedFailure.finishedAt) : t('common.not_found')}</p></div><dl className="grid gap-3 text-sm"><div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('admin.media_obs.run_id', {}, 'Run ID')}</dt><dd className="mt-1"><BackofficeIdentifier value={selectedFailure.runId} /></dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('common.site', {}, 'Site')}</dt><dd className="mt-1"><BackofficeIdentifier value={selectedFailure.siteId} /></dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('admin.media_obs.failure_format_size', {}, 'Format and source size')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{selectedFailure.targetFormat} · {formatBytes(selectedFailure.sourceBytes)}</dd></div><div><dt className="text-xs text-slate-500 dark:text-slate-400">{t('admin.media_obs.failure_timing', {}, 'Queue and processing time')}</dt><dd className="mt-1 text-slate-800 dark:text-slate-100">{formatNumber(selectedFailure.queueWaitMs)}ms · {formatNumber(selectedFailure.processingDurationMs)}ms</dd></div></dl><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:bg-slate-900/45 dark:text-slate-400">{t('admin.media_obs.failure_boundary', {}, 'Failure evidence is metadata-only. Image payloads and temporary artifact contents are not exposed here.')}</p></div> : null}
              </div>
            </div>
          </section> : <p className="text-xs text-slate-500 dark:text-slate-400">{t('admin.media_obs.no_recent_failures', {}, 'No recent failures.')}</p>}
        </>
      )}

      {data ? <BackofficeDisclosure summary={t('admin.media_obs.advanced_evidence', {}, 'Advanced workflow and error evidence')} contentClassName="space-y-5"><CloudWorkflowMetadataPanel metadata={data.workflowMetadata} /><div><h3 className="text-base font-semibold text-slate-950 dark:text-white">{t('admin.media_obs.errors_title', {}, 'Error codes')}</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{data.errors.length ? data.errors.map((item) => <div key={`${item.errorCode}-${item.lastSeenAt}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800"><div className="min-w-0"><p className="truncate font-mono text-sm font-semibold text-slate-950 dark:text-white">{item.errorCode}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.lastSeenAt ? formatDate(item.lastSeenAt) : t('common.not_found')}</p></div><BackofficeTag tone="warning">{formatNumber(item.count)}</BackofficeTag></div>) : <p className="text-sm text-slate-600 dark:text-slate-300">{t('admin.media_obs.no_errors', {}, 'No media processing failures in this window.')}</p>}</div></div></BackofficeDisclosure> : null}
    </BackofficePageStack>
  );
}

export default function AdminMediaObservabilityPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminMediaObservabilityContent />
    </Suspense>
  );
}
