'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BackofficePageHeader, BackofficePageStack, BackofficeSectionPanel } from '@/components/backoffice/BackofficeScaffold';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { EditorAssistQualityPanel } from '@/components/admin/EditorAssistQualityPanel';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { createApiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useLocale } from '@/contexts/LocaleContext';
import { AdminObservabilityTabs } from '@/components/admin/AdminObservabilityTabs';

const client = createApiClient({ idempotencyPrefix: 'admin_usage_statistics' });
type Row = { id: string; runs: number; failed: number; success_rate: number | null; avg_latency_ms: number | null };
type Stats = Row & { active_sites: number; latency_samples: number; possibly_truncated: boolean; sites: Row[]; functions: Row[]; timeline: (Row & { day: string })[] };
type Runtime = { generated_at: string; window: { since: string; until: string }; usage_statistics?: Stats };
type Plugins = { generated_at: string; totals: { events_total: number; active_site_count: number }; plugins: { plugin_slug: string; events_total: number; error_total: number; success_rate: number; avg_latency_ms: number }[]; timeline: { bucket_start_at: string; events_total: number; error_total: number }[]; recent_activity?: { event_id: string; plugin_slug: string; event_kind: string; status: string; site_id: string; received_at: string; run?: { run_id: string; status: string; started_at: string; finished_at: string; error_code: string } | null }[] };

export default function UsageStatisticsPage() {
  const { locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const params = useSearchParams();
  const hours = ([24, 72, 168].includes(Number(params.get('window'))) ? Number(params.get('window')) : 168) as 24 | 72 | 168;
  const dimension = ['sites', 'functions', 'plugins'].includes(params.get('group') || '') ? params.get('group')! : 'sites';
  const recordScope = params.get('records') === 'test' ? 'test' : 'operational';
  const siteFilter = params.get('site') || '';
  const functionFilter = params.get('function') || '';
  const sortMode = params.get('sort') === 'failures' ? 'failures' : 'volume';
  const pageSize = 20;
  const requestedPage = Math.max(1, Number(params.get('page') || 1) || 1);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [plugins, setPlugins] = useState<Plugins | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisView, setAnalysisView] = useState<'chart' | 'table'>('table');
  const [refresh, setRefresh] = useState(0);
  const [activityStatusFilter, setActivityStatusFilter] = useState('all');
  const [activitySort, setActivitySort] = useState<'latest' | 'failures'>('latest');
  const [activityPage, setActivityPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setRuntime(null); setPlugins(null); setErrors([]);
    void Promise.allSettled([
      client.request<Runtime>(`/api/admin/runtime-telemetry?recent_minutes=${hours * 60}&limit=100${siteFilter ? `&site_id=${encodeURIComponent(siteFilter)}` : ''}${functionFilter ? `&capability=${encodeURIComponent(functionFilter)}` : ''}`, { signal: controller.signal }),
      client.request<Plugins>(`/api/admin/plugin-observability?window_hours=${hours}&record_scope=${recordScope}`, { signal: controller.signal }),
    ]).then(([runResult, pluginResult]) => {
      if (controller.signal.aborted) return;
      if (runResult.status === 'fulfilled') setRuntime(runResult.value.data);
      if (pluginResult.status === 'fulfilled') setPlugins(pluginResult.value.data);
      setErrors([...(runResult.status === 'rejected' ? ['runtime'] : []), ...(pluginResult.status === 'rejected' ? ['plugins'] : [])]);
      setLoading(false);
    });
    return () => controller.abort();
  }, [hours, refresh, recordScope, siteFilter, functionFilter]);
  const filterHref = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.set(key, value); if (key !== 'page') next.delete('page'); return `/admin/usage-statistics?${next}`; };
  const stats = runtime?.usage_statistics;
  const number = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${Number(value.toFixed(1)).toLocaleString()}${suffix}`;
  const metrics = [
    { label: c('运行次数', 'Runs'), value: number(stats?.runs) },
    { label: c('有运行的站点', 'Sites with runs'), value: number(stats?.active_sites) },
    { label: c('运行成功率', 'Run success rate'), value: number(stats?.success_rate == null ? null : stats.success_rate * 100, '%') },
    { label: c('平均运行耗时', 'Average run duration'), value: number(stats?.avg_latency_ms == null ? null : stats.avg_latency_ms / 1000, c(' 秒', ' s')) },
    { label: c('运行状态', 'Runtime status'), value: stats?.failed ? c(`${stats.failed} 次失败`, `${stats.failed} failed`) : c('正常', 'Healthy'), detail: stats?.possibly_truncated ? c(`${number(stats?.runs)} 条样本 · 已截断`, `${number(stats?.runs)} runs · truncated`) : c(`${number(stats?.runs)} 条样本 · 完整`, `${number(stats?.runs)} runs · complete`), toneClassName: stats?.failed || stats?.possibly_truncated ? 'text-amber-700' : 'text-emerald-700' },
  ];
  const pluginMode = dimension === 'plugins';
  const localTime = (value?: string) => formatDateTime(value, locale) || '—';
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const rows: Row[] = pluginMode ? (plugins?.plugins || []).map(p => ({ id: p.plugin_slug, runs: p.events_total, failed: p.error_total, success_rate: p.events_total ? p.success_rate : null, avg_latency_ms: p.events_total ? p.avg_latency_ms : null })) : dimension === 'functions' ? stats?.functions || [] : stats?.sites || [];
  const displayRows = [...rows].sort((left, right) => sortMode === 'failures'
    ? right.failed - left.failed || right.runs - left.runs || left.id.localeCompare(right.id)
    : right.runs - left.runs || right.failed - left.failed || left.id.localeCompare(right.id));
  const pageCount = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = displayRows.slice((page - 1) * pageSize, page * pageSize);
  const trend = stats?.timeline.map(p => ({ label: p.day.slice(5), value: p.runs, secondaryValue: p.failed }));
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
  const pluginNames: Record<string, string> = {
    'npcink-cloud-addon': c('WordPress 云端连接插件', 'WordPress Cloud connector'),
    'npcink-abilities-toolkit': c('站点能力工具包', 'Site abilities toolkit'),
    'npcink-governance-core': c('操作审核与执行插件', 'Operation review and execution'),
    'npcink-ai-client-adapter': c('AI 客户端连接插件', 'AI client connector'),
  };
  const testNames: Record<string, string> = {
    'npcink-tech-20260907-yhz7bh-a': c('站点 A 上报验证', 'Site A reporting validation'),
    'npcink-tech-20260907-yhz7bh-b': c('站点 B 上报验证', 'Site B reporting validation'),
  };
  const rowName = (id: string) => dimension === 'functions'
    ? <span title={`${c('功能编号', 'Function ID')}: ${id}`}>{functionNames[id] || `${c('未命名功能', 'Unnamed function')} (${id})`}</span>
    : pluginMode ? <span title={`${c('来源编号', 'Source ID')}: ${id}`}>{recordScope === 'test' ? `${c('测试记录', 'Test record')} · ${testNames[id] || pluginNames[id] || id}` : pluginNames[id] || id}</span>
    : id;
  const activityRows = (plugins?.recent_activity || []).filter(item => activityStatusFilter === 'all' || (activityStatusFilter === 'failed' ? ['error', 'failed'].includes(item.status) : item.status === activityStatusFilter)).sort((a,b) => activitySort === 'latest' ? b.received_at.localeCompare(a.received_at) : Number(['error','failed'].includes(b.status)) - Number(['error','failed'].includes(a.status)) || b.received_at.localeCompare(a.received_at));
  const activityNames: Record<string, string> = { 'addon.monitoring.state_projected': c('插件状态同步', 'Plugin state sync'), 'addon.monitoring.health_reported': c('插件健康上报', 'Plugin health report') };
  const activityGroups = Object.values(activityRows.reduce<Record<string, { item: typeof activityRows[number]; count: number; failed: number; items: typeof activityRows }>>((groups, item) => { const key = `${item.event_kind}|${item.plugin_slug}|${item.site_id}`; const group = groups[key] || (groups[key] = { item, count: 0, failed: 0, items: [] }); group.count += 1; group.failed += Number(['error','failed'].includes(item.status)); group.items.push(item); return groups; }, {}));
  const activityPageCount = Math.max(1, Math.ceil(activityGroups.length / 20));
  const activityPageGroups = activityGroups.slice((activityPage - 1) * 20, activityPage * 20);

  const activityStatus = (status: string) => ({ ok: c('成功', 'Succeeded'), succeeded: c('成功', 'Succeeded'), error: c('失败', 'Failed'), failed: c('失败', 'Failed'), warning: c('需关注', 'Warning') }[status] || c('其他状态', 'Other status'));
  return <BackofficePageStack className="space-y-4">
    <AdminObservabilityTabs />
    <BackofficePageHeader title={params.get('view') === 'quality' ? c('编辑质量证据', 'Editorial quality evidence') : c('使用统计', 'Usage Statistics')} description={params.get('view') === 'quality' ? c('查看编辑辅助运行的质量证据', 'Review quality evidence from editorial assistance runs') : c('发现运行趋势、分布和影响范围', 'Discover runtime trends, distribution, and impact')} summaryItems={params.get('view') === 'quality' ? [] : metrics.map(item => ({ ...item, size: 'compact' as const }))} primaryAction={params.get('view') === 'quality' ? undefined : <div className="text-right text-xs leading-5 text-slate-500 dark:text-slate-400">{c('当前工作范围', 'Current workspace')}: {c(`近 ${hours / 24} 天 · ${analysisView === 'chart' ? 'Cloud 运行' : dimension === 'sites' ? '按站点' : dimension === 'functions' ? '按功能' : '插件记录'}`, `Last ${hours / 24} days · ${analysisView === 'chart' ? 'Cloud runs' : dimension}`)}<br />{runtime ? `${c('数据更新于', 'Updated')} ${localTime(runtime.generated_at)} · ${timeZone}` : c('等待运行数据', 'Waiting for runtime data')}</div>} />
    {params.get('view') === 'quality' ? <EditorAssistQualityPanel disclosure={false} windowHours={hours} refreshSignal={refresh} /> : <>
    <div data-ui="usage-statistics-toolbar" className="relative z-10 flex w-full max-w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/70">
      {[24, 72, 168].map(h => <Link key={h} aria-current={hours === h ? 'page' : undefined} className={`btn btn-sm ${hours === h ? 'btn-primary' : 'btn-secondary'}`} href={filterHref('window', String(h))}>{c(`近 ${h / 24} 天`, `Last ${h / 24} days`)}</Link>)}
      <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{c('刷新', 'Refresh')}</button>
      <div className="ml-auto flex shrink-0 gap-1" role="tablist" aria-label={c('运行分析视图', 'Runtime analysis view')}><button type="button" role="tab" aria-selected={analysisView === 'chart'} className={`btn btn-sm ${analysisView === 'chart' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAnalysisView('chart')}>{c('图表', 'Chart')}</button><button type="button" role="tab" aria-selected={analysisView === 'table'} className={`btn btn-sm ${analysisView === 'table' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAnalysisView('table')}>{c('表格', 'Table')}</button></div>
    </div>
    {siteFilter || functionFilter ? <p className="text-sm text-slate-600 dark:text-slate-300">{c('当前范围', 'Current scope')}: {siteFilter ? `${c('站点', 'Site')} ${siteFilter}` : null}{siteFilter && functionFilter ? ' · ' : null}{functionFilter ? `${c('功能', 'Function')} ${functionFilter}` : null}</p> : null}
    {loading ? <p role="status">{c('正在加载所选时段…', 'Loading selected period…')}</p> : null}
    {errors.length ? <p role="alert">{c('部分统计加载失败，已成功加载的数据仍可查看。点击刷新重试。', 'Some statistics failed to load. Available sources remain visible. Refresh to retry.')} ({errors.map(source => source === 'runtime' ? c('运行统计', 'Runtime') : c('插件上报', 'Plugin reports')).join('、')})</p> : null}
    <section data-ui="usage-statistics-workspace">
    <div hidden={analysisView !== 'table'}><div className="flex flex-wrap items-center gap-2 py-2" role="group" aria-label={c('统计维度', 'Statistics dimension')}>
      {([['sites', c('按站点', 'By site')], ['functions', c('按功能', 'By function')], ['plugins', c('插件运行记录', 'Plugin activity records')]]).map(([key, label]) => <Link key={key} className={`btn btn-sm ${dimension === key ? 'btn-primary' : 'btn-secondary'}`} aria-current={dimension === key ? 'page' : undefined} href={filterHref('group', key)}>{label}</Link>)}

    </div>
    </div>
      {stats?.possibly_truncated ? <span className="w-full text-xs font-semibold text-amber-700">{c('已达到 5000 条上限，趋势和分组仅代表返回样本', '5,000-run cap reached; trends and groups represent the returned sample only')}</span> : null}
    {analysisView === 'table' && pluginMode ? <>
      {recordScope === 'test' ? <div data-ui="usage-test-scope" className="flex flex-wrap items-center gap-3 py-2 text-sm"><span className="text-amber-700 dark:text-amber-400">{c('技术验证记录，不代表业务使用。', 'Technical validation records, not business usage.')}</span><Link className="text-blue-700 underline dark:text-blue-400" href={filterHref('records', 'operational')}>{c('返回运行记录', 'Back to activity records')}</Link></div> : null}
      <section data-ui="usage-recent-activity" className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div><h2 className="font-semibold">{c('插件事件', 'Plugin events')}</h2><p className="mt-1 text-xs text-slate-500">{c('最近 50 条上报按事件类型和来源分组', 'Latest 50 reports grouped by event type and source')}</p></div><div className="grid min-w-[min(100%,520px)] flex-1 grid-cols-4 gap-3 text-right"><div><p className="text-[11px] text-slate-500">{c('事件总数','Total events')}</p><strong>{number(plugins?.totals.events_total)}</strong></div><div><p className="text-[11px] text-slate-500">{c('成功','Succeeded')}</p><strong>{number((plugins?.totals.events_total || 0) - (plugins?.plugins?.reduce((n,p) => n + p.error_total, 0) || 0))}</strong></div><div><p className="text-[11px] text-slate-500">{c('失败','Failed')}</p><strong className="text-amber-700">{number(plugins?.plugins?.reduce((n,p) => n + p.error_total, 0))}</strong></div><div><p className="text-[11px] text-slate-500">{c('最近上报','Latest report')}</p><strong className="text-xs">{localTime(plugins?.recent_activity?.[0]?.received_at)}</strong></div></div><div className="flex gap-2"><select aria-label={c('状态筛选','Status filter')} className="rounded-md border border-slate-200 px-2 py-1 text-xs" value={activityStatusFilter} onChange={e => setActivityStatusFilter(e.target.value)}><option value="all">{c('全部','All')}</option><option value="ok">{c('成功','Succeeded')}</option><option value="failed">{c('失败','Failed')}</option></select><button type="button" className="btn btn-secondary btn-sm" onClick={() => setActivitySort(v => v === 'latest' ? 'failures' : 'latest')}>{activitySort === 'latest' ? c('失败优先','Failures first') : c('最新优先','Latest first')}</button></div></div>{activityGroups.length ? <><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="text-xs text-slate-500"><th className="px-4 py-2">{c('最近时间','Latest time')}</th><th className="px-4 py-2">{c('状态 / 次数','Status / count')}</th><th className="px-4 py-2">{c('事件类型','Event type')}</th><th className="px-4 py-2">{c('来源 / 站点','Source / site')}</th><th className="px-4 py-2">{c('证据','Evidence')}</th></tr></thead><tbody>{activityPageGroups.map((group,index) => <tr key={`${group.item.event_kind}-${index}`} className="border-t border-slate-100 dark:border-slate-800"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{localTime(group.item.received_at)}</td><td className="px-4 py-3 font-semibold">{group.failed ? <span className="text-amber-700">{c('含失败','Has failure')}</span> : activityStatus(group.item.status)} <span className="ml-1 text-xs font-normal text-slate-500">× {group.count}</span></td><td className="px-4 py-3"><details><summary className="cursor-pointer">{activityNames[group.item.event_kind] || c('其他插件事件','Other plugin event')}</summary><code className="mt-1 block text-xs text-slate-500">{group.item.event_kind}</code><div className="mt-2 space-y-1 text-xs text-slate-500">{group.items.slice(0,5).map((item,i) => <div key={i}>{localTime(item.received_at)} · {activityStatus(item.status)}</div>)}</div></details></td><td className="max-w-[260px] truncate px-4 py-3 text-slate-600" title={`${group.item.plugin_slug} · ${group.item.site_id}`}>{group.item.plugin_slug} · {group.item.site_id}</td><td className="px-4 py-3">{group.item.run ? <span className="text-blue-700">{c('已关联','Linked')}</span> : <span className="text-xs text-slate-500">{c('未关联','Unlinked')}</span>}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs dark:border-slate-800"><span>{c(`第 ${activityPage} / ${activityPageCount} 页 · 共 ${activityGroups.length} 组`, `Page ${activityPage} of ${activityPageCount} · ${activityGroups.length} groups`)}</span><span className="flex gap-2"><button type="button" disabled={activityPage <= 1} onClick={() => setActivityPage(v => Math.max(1, v - 1))}>{c('上一页','Previous')}</button><button type="button" disabled={activityPage >= activityPageCount} onClick={() => setActivityPage(v => Math.min(activityPageCount, v + 1))}>{c('下一页','Next')}</button></span></div></> : <p className="px-4 py-5 text-sm text-slate-500">{loading ? c('加载中…', 'Loading…') : c('所选范围暂无符合条件的上报记录。', 'No reports match this filter.')}</p>}</section></> : null}
    <section data-ui="usage-more-reference" hidden={analysisView !== 'chart'}>
      <section aria-label={c('趋势', 'Trends')} className={analysisView === 'chart' ? undefined : 'hidden'}><BackofficeSectionPanel className="space-y-2"><h2 className="font-semibold">{siteFilter || functionFilter ? c('当前范围运行趋势（UTC）', 'Scoped runtime trend (UTC)') : c('总体运行趋势（UTC）', 'Overall runtime trend (UTC)')}</h2>

      {trend?.length ? <AnalyticsLineChart data={trend} height={220} primarySeriesName={c('运行次数', 'Runs')} secondarySeriesName={c('失败数', 'Failures')} /> : <p>{loading ? c('加载中', 'Loading') : c('暂无趋势数据', 'No trend data')}</p>}
    </BackofficeSectionPanel></section>
    </section>
    <div className={analysisView === 'table' && !pluginMode ? undefined : 'hidden'}><AdminDataTableFrame title={c('使用明细', 'Usage breakdown')} resultLabel={`${displayRows.length} ${c('组', 'groups')}`} dataUi="usage-breakdown" headerVisibility="sr-only">
      <table className="w-full text-left text-sm"><thead><tr>{[nameColumn, pluginMode ? c('事件数', 'Events') : c('运行次数', 'Runs'), <Link key="failures" className="inline-flex items-center gap-1 underline decoration-slate-300 underline-offset-4" aria-current={sortMode === 'failures' ? 'page' : undefined} href={filterHref('sort', sortMode === 'failures' ? 'volume' : 'failures')}>{c('失败数', 'Failures')}{sortMode === 'failures' ? ' ↓' : ''}</Link>, pluginMode ? c('事件成功率', 'Event success rate') : c('运行成功率', 'Run success rate'), c('平均耗时', 'Average duration'), c('查看', 'Inspect')].map((label, index) => <th key={index} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>
      {pageRows.map(row => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800"><td className="break-all px-3 py-2">{rowName(row.id)}</td><td className="px-3 py-2">{number(row.runs)}</td><td className="px-3 py-2">{number(row.failed)}</td><td className="px-3 py-2">{number(row.success_rate == null ? null : row.success_rate * 100, '%')}</td><td className="px-3 py-2">{number(row.avg_latency_ms == null ? null : row.avg_latency_ms / 1000, c(' 秒', ' s'))}</td><td className="px-3 py-2"><Link className="text-blue-700 underline" href={pluginMode ? `/admin/plugin-observability?window=${hours}&plugin=${encodeURIComponent(row.id)}&from=usage-statistics` : `/admin/troubleshooting?window=${hours}&from=usage-statistics${dimension === 'sites' ? `&site=${encodeURIComponent(row.id)}` : `&function=${encodeURIComponent(row.id)}`}`}>{pluginMode ? c('插件记录', 'Plugin records') : dimension === 'sites' ? c('站点诊断', 'Site diagnostics') : c('功能诊断', 'Function diagnostics')}</Link></td></tr>)}
      {!displayRows.length ? <tr><td colSpan={6} className="px-3 py-5">{loading ? c('加载中', 'Loading') : c('所选来源暂无明细；无上报不代表没有使用。', 'No detail from this source; no reports do not imply no usage.')}</td></tr> : null}
      </tbody></table>
      {pageCount > 1 ? <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800"><span>{c(`第 ${page} / ${pageCount} 页`, `Page ${page} of ${pageCount}`)}</span><span className="flex gap-2"><Link aria-disabled={page <= 1} className={page <= 1 ? 'pointer-events-none text-slate-400' : 'text-blue-700 underline'} href={filterHref('page', String(Math.max(1, page - 1)))}>{c('上一页', 'Previous')}</Link><Link aria-disabled={page >= pageCount} className={page >= pageCount ? 'pointer-events-none text-slate-400' : 'text-blue-700 underline'} href={filterHref('page', String(Math.min(pageCount, page + 1)))}>{c('下一页', 'Next')}</Link></span></div> : null}
    </AdminDataTableFrame></div>

    </section>
    </>}
    <details data-ui="usage-definitions" className="max-w-[var(--admin-workbench-compact-max-width)] border-t border-slate-200 py-3">
      <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400">{analysisView === 'table' && pluginMode ? c('统计口径与测试记录', 'Definitions and test records') : c('统计口径', 'Definitions')}</summary>
      <p className="mt-2 text-sm">{c('运行成功率为成功运行数 / 所有运行数，包含仍在处理的任务。耗时仅统计已有起止时间的运行。一次任务可产生多条事件，事件数不等于任务数。调用记录缺失不等于任务失败。缺失值显示 —，不当作 0。', 'Run success rate is successful runs / all runs, including pending tasks. Duration uses runs with start and finish times. Multiple events may belong to one task. Missing call records do not imply failed tasks. Missing values display —, not zero.')}</p>
      {analysisView === 'table' && pluginMode ? <div className="mt-3 space-y-2 text-sm">
        <p>{c('未关联运行表示暂无对应运行证据，不代表调用失败。总事件数覆盖所选时段，表格仅对最近 50 条上报分组。', 'Unlinked means no matching run evidence; it does not imply failure. Total events cover the selected period; table groups use only the latest 50 reports.')}</p>
        <p className="text-xs text-slate-500">{c('统计更新于', 'Statistics updated')}: {localTime(plugins?.generated_at)} ({timeZone}) · {c('上报站点', 'Reporting sites')}: {number(plugins?.totals.active_site_count)}</p>
        <p>{c('测试记录是明确标记的技术验证事件，默认从运行记录中隔离；此入口只切换查看范围，不会创建或执行测试。', 'Test records are explicitly marked technical validation events, separated from activity records by default. This link only changes the viewing scope; it does not create or run tests.')}</p>
        {recordScope !== 'test' ? <Link className="inline-block text-blue-700 underline dark:text-blue-400" href={filterHref('records', 'test')}>{c('查看技术验证记录', 'View technical validation records')}</Link> : null}
      </div> : null}
    </details>
  </BackofficePageStack>;
}
