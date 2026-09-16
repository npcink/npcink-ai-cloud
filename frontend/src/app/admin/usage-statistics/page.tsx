'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BackofficePageHeader, BackofficePageStack, BackofficeSectionPanel } from '@/components/backoffice/BackofficeScaffold';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { EditorAssistQualityPanel } from '@/components/admin/EditorAssistQualityPanel';
import { DimensionTrend, type Comparison } from '@/features/admin/observability/DimensionTrend';
import { PluginHistory } from '@/features/admin/observability/PluginHistory';
import { createApiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useLocale } from '@/contexts/LocaleContext';
import { normalizeObservationWindow } from '@/features/admin/observability/window';
import { AdminObservabilityTabs } from '@/components/admin/AdminObservabilityTabs';

const client = createApiClient({ idempotencyPrefix: 'admin_usage_statistics' });
type Row = { id: string; runs: number; failed: number; success_rate: number | null; avg_latency_ms: number | null };
type Stats = Row & { active_sites: number; latency_samples: number; possibly_truncated: boolean; sites: Row[]; functions: Row[]; timeline: (Row & { day: string })[]; comparison?: { sites: Comparison; functions: Comparison } };
type Runtime = { generated_at: string; window: { since: string; until: string }; usage_statistics?: Stats };


export default function UsageStatisticsPage() {
  const { locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const params = useSearchParams();
  const hours = normalizeObservationWindow(params.get('window'));
  const qualityView = params.get('view') === 'quality';
  const dimension = ['sites', 'functions', 'plugins'].includes(params.get('group') || '') ? params.get('group')! : 'sites';
  const recordScope = params.get('records') === 'test' ? 'test' : 'operational';
  const siteFilter = params.get('site') || '';
  const functionFilter = params.get('function') || '';
  const sortMode = params.get('sort') === 'failures' ? 'failures' : 'volume';
  const pageSize = 20;
  const requestedPage = Math.max(1, Number(params.get('page') || 1) || 1);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const onQualityState = useCallback((state: { loading: boolean }) => setLoading(state.loading), []);
  const [analysisView, setAnalysisView] = useState<'chart' | 'table'>('table');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (qualityView) return;
    const controller = new AbortController();
    setLoading(true); setRuntime(null); setErrors([]);
    void client.request<Runtime>(`/api/admin/runtime-telemetry?recent_minutes=${hours * 60}&limit=100${siteFilter ? `&site_id=${encodeURIComponent(siteFilter)}` : ''}${functionFilter ? `&capability=${encodeURIComponent(functionFilter)}` : ''}`, { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setRuntime(response.data);
    }).catch(() => { if (!controller.signal.aborted) setErrors(['runtime']); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [hours, refresh, siteFilter, functionFilter, qualityView]);
  const filterHref = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.set(key, value); if (key !== 'page') next.delete('page'); return `/admin/usage-statistics?${next}`; };
  const stats = runtime?.usage_statistics;
  const number = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${Number(value.toFixed(1)).toLocaleString()}${suffix}`;
  const metrics = [
    { label: c('运行次数', 'Runs'), value: number(stats?.runs), detail: c('所选时间范围内的运行记录；最多统计 5,000 条样本。', 'Runtime records in the selected window; up to 5,000 samples.'), detailDisplay: 'hint' as const },
    { label: c('有运行的站点', 'Sites with runs'), value: number(stats?.active_sites), detail: c('至少包含一条运行记录的站点数量。', 'Sites with at least one runtime record.'), detailDisplay: 'hint' as const },
    { label: c('运行成功率', 'Run success rate'), value: number(stats?.success_rate == null ? null : stats.success_rate * 100, '%'), detail: c('成功运行数 ÷ 全部运行数，处理中任务计入分母。', 'Succeeded runs ÷ all runs; processing tasks remain in the denominator.'), detailDisplay: 'hint' as const },
    { label: c('平均运行耗时', 'Average run duration'), value: number(stats?.avg_latency_ms == null ? null : stats.avg_latency_ms / 1000, c(' 秒', ' s')), detail: c('仅统计同时具有开始和结束时间的运行。', 'Only runs with both start and finish times.'), detailDisplay: 'hint' as const },
    { label: c('运行状态', 'Runtime status'), value: !stats ? c('未知', 'Unknown') : stats.runs === 0 ? c('暂无运行', 'No runs') : stats.failed ? c(`${stats.failed} 次失败`, `${stats.failed} failed`) : c('正常', 'Healthy'), detail: !stats ? c('运行证据未加载', 'Runtime evidence unavailable') : stats.possibly_truncated ? c(`${number(stats?.runs)} 条样本 · 已截断`, `${number(stats?.runs)} runs · truncated`) : c(`${number(stats?.runs)} 条样本 · 完整`, `${number(stats?.runs)} runs · complete`), toneClassName: !stats || stats.runs === 0 ? 'text-slate-500' : stats.failed || stats.possibly_truncated ? 'text-amber-700' : 'text-emerald-700' },
  ];
  const pluginMode = dimension === 'plugins';
  const localTime = (value?: string) => formatDateTime(value, locale) || '—';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows: Row[] = dimension === 'functions' ? stats?.functions || [] : stats?.sites || [];
  const displayRows = [...rows].sort((left, right) => sortMode === 'failures'
    ? right.failed - left.failed || right.runs - left.runs || left.id.localeCompare(right.id)
    : right.runs - left.runs || right.failed - left.failed || left.id.localeCompare(right.id));
  const pageCount = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = displayRows.slice((page - 1) * pageSize, page * pageSize);
  const functionNames: Record<string, string> = {
    'media.upload': c('媒体上传', 'Media upload'),
    'media.transform.worker': c('图片处理', 'Image processing'),
    'content-format.managed': c('内容排版', 'Content formatting'),
    'vision.ai': c('图片内容识别', 'Image understanding'),
    'wp-ai.image-generation': c('AI 图片生成', 'AI image generation'),
    'wp-ai.audio-generation': c('AI 音频生成', 'AI audio generation'),
    'wp-ai.classification': c('内容分类', 'Classification'),
    'wp-ai.short-text': c('短文本生成', 'Short text'),
    'wp-ai.editorial': c('编辑辅助', 'Editorial assistance'),
    'site-knowledge.managed': c('站点知识库', 'Site knowledge'),
  };
  const nameColumn = dimension === 'functions' ? c('功能名称', 'Function name') : pluginMode ? c('插件', 'Plugin') : c('站点', 'Site');
  const rowName = (id: string) => dimension === 'functions'
    ? <span title={`${c('功能编号', 'Function ID')}: ${id}`}>{functionNames[id] || `${c('未命名功能', 'Unnamed function')} (${id})`}</span>
    : id;
  return <BackofficePageStack className="space-y-4">
    <AdminObservabilityTabs />
    <BackofficePageHeader secondaryAction={qualityView ? <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{c('刷新', 'Refresh')}</button> : undefined} title={params.get('view') === 'quality' ? c('编辑质量证据', 'Editorial quality evidence') : c('使用统计', 'Usage Statistics')} description={params.get('view') === 'quality' ? c('查看编辑辅助运行的质量证据', 'Review quality evidence from editorial assistance runs') : c('发现运行趋势、分布和影响范围', 'Discover runtime trends, distribution, and impact')} summaryItems={params.get('view') === 'quality' ? [] : metrics.map(item => ({ ...item, size: 'compact' as const }))} primaryAction={params.get('view') === 'quality' ? undefined : <div className="text-right text-xs leading-5 text-slate-500 dark:text-slate-400">{c('当前工作范围', 'Current workspace')}: {c(`近 ${hours / 24} 天 · ${analysisView === 'chart' ? 'Cloud 运行' : dimension === 'sites' ? '按站点' : dimension === 'functions' ? '按功能' : '插件记录'}`, `Last ${hours / 24} days · ${analysisView === 'chart' ? 'Cloud runs' : dimension}`)}<br />{runtime ? `${c('数据更新于', 'Updated')} ${localTime(runtime.generated_at)} · ${timeZone}` : c('等待运行数据', 'Waiting for runtime data')}</div>} />
    {params.get('view') === 'quality' ? <EditorAssistQualityPanel onRequestStateChange={onQualityState} disclosure={false} siteId={siteFilter} windowHours={hours} refreshSignal={refresh} /> : <>
    <div data-ui="usage-statistics-toolbar" className="relative z-10 flex w-full max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
      <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{c('刷新', 'Refresh')}</button>
      <div className="ml-auto flex shrink-0 gap-1" role="tablist" aria-label={c('运行分析视图', 'Runtime analysis view')}><button type="button" role="tab" aria-selected={analysisView === 'chart'} className={`btn btn-sm ${analysisView === 'chart' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setAnalysisView('chart'); if (pluginMode) window.history.replaceState(null, '', filterHref('group', 'sites')); }}>{c('图表', 'Chart')}</button><button type="button" role="tab" aria-selected={analysisView === 'table'} className={`btn btn-sm ${analysisView === 'table' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAnalysisView('table')}>{c('表格', 'Table')}</button></div>
    </div>
    {siteFilter || functionFilter ? <p className="text-sm text-slate-600 dark:text-slate-300">{c('当前范围', 'Current scope')}: {siteFilter ? `${c('站点', 'Site')} ${siteFilter}` : null}{siteFilter && functionFilter ? ' · ' : null}{functionFilter ? `${c('功能', 'Function')} ${functionFilter}` : null}</p> : null}
    {loading ? <p role="status">{c('正在加载所选时段…', 'Loading selected period…')}</p> : null}
    {errors.length ? <p role="alert">{errors.includes('runtime') ? c('统计暂不可用，无法判断当前运行状态。请刷新重试。', 'Statistics unavailable; runtime status is unknown. Refresh to retry.') : c('部分统计加载失败，已成功加载的数据仍可查看。点击刷新重试。', 'Some statistics failed to load. Available sources remain visible. Refresh to retry.')} ({errors.map(source => source === 'runtime' ? c('运行统计', 'Runtime') : c('插件上报', 'Plugin reports')).join('、')})</p> : null}
    <section data-ui="usage-statistics-workspace">
    <div><div className="flex flex-wrap items-center gap-2 py-2" role="group" aria-label={c('统计维度', 'Statistics dimension')}>
      {([['sites', c('按站点', 'By site')], ['functions', c('按功能', 'By function')], ['plugins', c('插件运行记录', 'Plugin activity records')]]).map(([key, label]) => <Link key={key} onClick={() => { if (key === 'plugins') setAnalysisView('table'); }} className={`btn btn-sm ${dimension === key ? 'btn-primary' : 'btn-secondary'}`} aria-current={dimension === key ? 'page' : undefined} href={filterHref('group', key)}>{label}</Link>)}

    </div>
    </div>
      {stats?.possibly_truncated ? <span className="w-full text-xs font-semibold text-amber-700">{c('已达到 5000 条上限，趋势和分组仅代表返回样本', '5,000-run cap reached; trends and groups represent the returned sample only')}</span> : null}
    {analysisView === 'table' && pluginMode ? <>
      {recordScope === 'test' ? <div data-ui="usage-test-scope" className="flex flex-wrap items-center gap-3 py-2 text-sm"><span className="text-amber-700 dark:text-amber-400">{c('技术验证记录，不代表业务使用。', 'Technical validation records, not business usage.')}</span><Link className="text-blue-700 underline dark:text-blue-400" href={filterHref('records', 'operational')}>{c('返回运行记录', 'Back to activity records')}</Link></div> : null}
      <PluginHistory key={`${hours}:${siteFilter}:${recordScope}:${refresh}`} hours={hours} site={siteFilter} recordScope={recordScope} /></> : null}
    <section data-ui="usage-more-reference" hidden={analysisView !== 'chart'}>
      <section aria-label={c('趋势', 'Trends')}><BackofficeSectionPanel className="space-y-2">
        {loading ? <p role="status">{c('加载中', 'Loading')}</p> : errors.includes('runtime') ? <p>{c('运行统计暂不可用', 'Runtime statistics unavailable')}</p> : <DimensionTrend comparison={dimension === 'functions' ? stats?.comparison?.functions : stats?.comparison?.sites} dimension={dimension} name={id => dimension === 'functions' ? `${functionNames[id] || id}` : id} />}
      </BackofficeSectionPanel></section>
    </section>
    <div className={analysisView === 'table' && !pluginMode ? undefined : 'hidden'}><AdminDataTableFrame title={c('使用明细', 'Usage breakdown')} resultLabel={`${displayRows.length} ${c('组', 'groups')}`} dataUi="usage-breakdown" headerVisibility="sr-only">
      <table className="w-full text-left text-sm"><thead><tr>{[nameColumn, pluginMode ? c('事件数', 'Events') : c('运行次数', 'Runs'), <Link key="failures" className="inline-flex items-center gap-1 underline decoration-slate-300 underline-offset-4" aria-current={sortMode === 'failures' ? 'page' : undefined} href={filterHref('sort', sortMode === 'failures' ? 'volume' : 'failures')}>{c('失败数', 'Failures')}{sortMode === 'failures' ? ' ↓' : ''}</Link>, pluginMode ? c('事件成功率', 'Event success rate') : c('运行成功率', 'Run success rate'), c('平均耗时', 'Average duration'), c('查看', 'Inspect')].map((label, index) => <th key={index} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>
      {pageRows.map(row => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800"><td className="break-all px-3 py-2">{rowName(row.id)}</td><td className="px-3 py-2">{number(row.runs)}</td><td className="px-3 py-2">{number(row.failed)}</td><td className="px-3 py-2">{number(row.success_rate == null ? null : row.success_rate * 100, '%')}</td><td className="px-3 py-2">{number(row.avg_latency_ms == null ? null : row.avg_latency_ms / 1000, c(' 秒', ' s'))}</td><td className="px-3 py-2"><Link className="text-blue-700 underline" href={pluginMode ? `/admin/plugin-observability?window=${hours}&plugin=${encodeURIComponent(row.id)}&from=usage-statistics` : `/admin/troubleshooting?window=${hours}&from=usage-statistics${dimension === 'sites' ? `&site=${encodeURIComponent(row.id)}` : `&function=${encodeURIComponent(row.id)}`}`}>{pluginMode ? c('插件记录', 'Plugin records') : dimension === 'sites' ? c('站点诊断', 'Site diagnostics') : c('功能诊断', 'Function diagnostics')}</Link></td></tr>)}
      {!displayRows.length ? <tr><td colSpan={6} className="px-3 py-5">{loading ? c('加载中', 'Loading') : errors.includes('runtime') ? c('运行统计暂不可用', 'Runtime statistics unavailable') : c('所选来源暂无明细；无上报不代表没有使用。', 'No detail from this source; no reports do not imply no usage.')}</td></tr> : null}
      </tbody></table>
      {pageCount > 1 ? <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800"><span>{c(`第 ${page} / ${pageCount} 页`, `Page ${page} of ${pageCount}`)}</span><span className="flex gap-2"><Link aria-disabled={page <= 1} className={page <= 1 ? 'pointer-events-none text-slate-400' : 'text-blue-700 underline'} href={filterHref('page', String(Math.max(1, page - 1)))}>{c('上一页', 'Previous')}</Link><Link aria-disabled={page >= pageCount} className={page >= pageCount ? 'pointer-events-none text-slate-400' : 'text-blue-700 underline'} href={filterHref('page', String(Math.min(pageCount, page + 1)))}>{c('下一页', 'Next')}</Link></span></div> : null}
    </AdminDataTableFrame></div>

    </section>
    </>}
    {!qualityView ? <details data-ui="usage-definitions" className="max-w-[var(--admin-workbench-compact-max-width)] border-t border-slate-200 py-3">
      <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400">{analysisView === 'table' && pluginMode ? c('统计口径与测试记录', 'Definitions and test records') : c('统计口径', 'Definitions')}</summary>
      {pluginMode && analysisView === 'table' ? <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <p>{c('插件记录只统计所选时段内已留存的上报，分组和逐条记录均由服务端分页；翻页保持同一快照。', 'Plugin records cover retained reports in the selected window. Groups and individual records are server-paginated over one snapshot.')}</p>
        <p>{c('一次任务可产生多条事件；未关联运行不代表调用失败。已清理或未上报的数据不在范围内。', 'One task may produce multiple events; an unlinked run does not imply failure. Purged or unreported data is outside the scope.')}</p>
        <p>{c('测试记录是明确标记的技术验证事件，默认与业务运行记录分开；此入口只切换查看范围，不会创建或执行测试。', 'Test records are explicitly marked technical validation events and are separated from operational records by default; this link only changes the viewing scope and never creates or runs tests.')}</p>
        {recordScope !== 'test' ? <Link className="inline-block text-blue-700 underline dark:text-blue-400" href={filterHref('records', 'test')}>{c('查看技术验证记录', 'View technical validation records')}</Link> : null}
      </div> : <dl className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <div><dt className="inline font-medium">{c('运行次数：', 'Runs: ')}</dt><dd className="inline">{c('所选时段内的运行记录，趋势和分组最多基于 5,000 条样本。', 'Records in the selected window; trends and groups use up to 5,000 samples.')}</dd></div>
        <div><dt className="inline font-medium">{c('成功率：', 'Success rate: ')}</dt><dd className="inline">{c('成功运行数 ÷ 全部运行数，处理中任务计入分母。', 'Succeeded runs ÷ all runs; processing tasks remain in the denominator.')}</dd></div>
        <div><dt className="inline font-medium">{c('耗时与缺失值：', 'Duration and missing values: ')}</dt><dd className="inline">{c('耗时仅统计有完整起止时间的运行；— 表示暂无数据，不等于 0。', 'Duration uses runs with complete start and finish times; — means unavailable, not zero.')}</dd></div>
      </dl>}
    </details> : null}
  </BackofficePageStack>;
}
