'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BackofficePageHeader, BackofficePageStack, BackofficeSectionPanel, BackofficeMetricStrip } from '@/components/backoffice/BackofficeScaffold';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { EditorAssistQualityPanel } from '@/components/admin/EditorAssistQualityPanel';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { createApiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { useLocale } from '@/contexts/LocaleContext';

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
  const sortMode = params.get('sort') === 'failures' ? 'failures' : 'volume';
  const pageSize = 20;
  const requestedPage = Math.max(1, Number(params.get('page') || 1) || 1);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [plugins, setPlugins] = useState<Plugins | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [quality, setQuality] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setRuntime(null); setPlugins(null); setErrors([]);
    void Promise.allSettled([
      client.request<Runtime>(`/api/admin/runtime-telemetry?recent_minutes=${hours * 60}&limit=100`, { signal: controller.signal }),
      client.request<Plugins>(`/api/admin/plugin-observability?window_hours=${hours}&record_scope=${recordScope}`, { signal: controller.signal }),
    ]).then(([runResult, pluginResult]) => {
      if (controller.signal.aborted) return;
      if (runResult.status === 'fulfilled') setRuntime(runResult.value.data);
      if (pluginResult.status === 'fulfilled') setPlugins(pluginResult.value.data);
      setErrors([...(runResult.status === 'rejected' ? ['runtime'] : []), ...(pluginResult.status === 'rejected' ? ['plugins'] : [])]);
      setLoading(false);
    });
    return () => controller.abort();
  }, [hours, refresh, recordScope]);
  const filterHref = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.set(key, value); if (key !== 'page') next.delete('page'); return `/admin/usage-statistics?${next}`; };
  const stats = runtime?.usage_statistics;
  const number = (value: number | null | undefined, suffix = '') => value == null ? '—' : `${Number(value.toFixed(1)).toLocaleString()}${suffix}`;
  const metrics = [
    { label: c('运行次数', 'Runs'), value: number(stats?.runs) },
    { label: c('有运行的站点', 'Sites with runs'), value: number(stats?.active_sites) },
    { label: c('运行成功率', 'Run success rate'), value: number(stats?.success_rate == null ? null : stats.success_rate * 100, '%') },
    { label: c('平均运行耗时', 'Average run duration'), value: number(stats?.avg_latency_ms == null ? null : stats.avg_latency_ms / 1000, c(' 秒', ' s')) },
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
  const trend = pluginMode ? plugins?.timeline.map(p => ({ label: localTime(p.bucket_start_at), value: p.events_total, secondaryValue: p.error_total })) : stats?.timeline.map(p => ({ label: p.day.slice(5), value: p.runs, secondaryValue: p.failed }));
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
  const activityStatus = (status: string) => ({ ok: c('成功', 'Succeeded'), succeeded: c('成功', 'Succeeded'), error: c('失败', 'Failed'), failed: c('失败', 'Failed'), warning: c('需关注', 'Warning') }[status] || c('其他状态', 'Other status'));
  return <BackofficePageStack>
    <BackofficePageHeader title={c('使用统计', 'Usage Statistics')} description={c('查看用了多少、哪些站点在用，以及使用变化。', 'Explore usage, active sites and trends.')} />
    <div className="flex flex-wrap items-center gap-2">
      {[24, 72, 168].map(h => <Link key={h} aria-current={hours === h ? 'page' : undefined} className={`btn btn-sm ${hours === h ? 'btn-primary' : 'btn-secondary'}`} href={filterHref('window', String(h))}>{c(`近 ${h / 24} 天`, `Last ${h / 24} days`)}</Link>)}
      <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{c('刷新', 'Refresh')}</button>
      <Link className="btn btn-ghost btn-sm" href={`/admin/troubleshooting?window=${hours}&from=usage-statistics`}>{c('查看运行诊断', 'Open runtime diagnostics')}</Link>
    </div>
    {loading ? <p role="status">{c('正在加载所选时段…', 'Loading selected period…')}</p> : null}
    {errors.length ? <p role="alert">{c('部分统计加载失败，已成功加载的数据仍可查看。点击刷新重试。', 'Some statistics failed to load. Available sources remain visible. Refresh to retry.')} ({errors.map(source => source === 'runtime' ? c('运行统计', 'Runtime') : c('插件上报', 'Plugin reports')).join('、')})</p> : null}
    <section data-ui="usage-statistics-workspace" className="space-y-3">
      <div className="border-b border-slate-200 pb-2 dark:border-slate-800"><h2 className="text-sm font-semibold">{c('Cloud 运行', 'Cloud runtime runs')}</h2><p className="mt-1 text-xs text-slate-500">{c('以下数字来自 Cloud 运行记录，不包含插件事件或编辑效果判断。', 'These figures come from Cloud run records; plugin events and editorial outcomes are separate evidence.')}</p></div>
      <BackofficeMetricStrip items={metrics} columnsClassName="grid-cols-2 md:grid-cols-4" />
      <p className="text-xs text-slate-500">{runtime ? `${localTime(runtime.window.since)} — ${localTime(runtime.window.until)} (${timeZone}) · ${c('更新于', 'Updated')} ${localTime(runtime.generated_at)}` : c('运行统计暂无数据', 'Runtime statistics unavailable')}</p>
      <p className={`text-xs ${stats?.possibly_truncated ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>{c('运行样本', 'Run sample')}: {number(stats?.runs)} · {c('耗时样本', 'Duration sample')}: {number(stats?.latency_samples)} · {stats?.possibly_truncated ? c('已达到 5000 条上限，趋势和分组仅代表返回样本', '5,000-run cap reached; trends and groups represent the returned sample only') : c('按所选时段返回的运行记录统计', 'Based on returned runs in this period')}</p>
    </section>
    <div className="flex flex-wrap gap-2" role="group" aria-label={c('统计维度', 'Statistics dimension')}>
      {([['sites', c('按站点', 'By site')], ['functions', c('按功能', 'By function')], ['plugins', c('插件运行记录', 'Plugin activity records')]]).map(([key, label]) => <Link key={key} className={`btn btn-sm ${dimension === key ? 'btn-primary' : 'btn-secondary'}`} aria-current={dimension === key ? 'page' : undefined} href={filterHref('group', key)}>{label}</Link>)}
      <Link className={`btn btn-sm ${sortMode === 'failures' ? 'btn-primary' : 'btn-secondary'}`} aria-current={sortMode === 'failures' ? 'page' : undefined} href={filterHref('sort', sortMode === 'failures' ? 'volume' : 'failures')}>{sortMode === 'failures' ? c('按失败数排序', 'Failures first') : c('优先查看失败', 'Prioritize failures')}</Link>
    </div>
    {pluginMode ? <><div className="border-b border-slate-200 pb-2 dark:border-slate-800"><h2 className="text-sm font-semibold">{c('插件上报事件', 'Plugin activity reports')}</h2><p className="mt-1 text-xs text-slate-500">{recordScope === 'test' ? c('以下是技术验证记录，不代表真实业务使用。', 'These are technical validation records, not actual business usage.') : c('以下是插件发送到 Cloud 的事件，不等于任务次数；明确标记的技术验证事件已单独隔离。', 'These are plugin events received by Cloud, not task counts; explicitly marked technical validation events are separated.')}</p></div><div className="flex flex-wrap items-center gap-3 text-sm"><Link className="text-blue-700 underline" href={filterHref('records', recordScope === 'test' ? 'operational' : 'test')}>{recordScope === 'test' ? c('返回运行记录', 'Back to activity records') : c('查看测试记录', 'View test records')}</Link></div><section data-ui="usage-recent-activity" className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"><div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="font-semibold">{c('近期上报记录', 'Recent reports')}</h2><p className="mt-1 text-xs text-slate-500">{c('先看具体记录，再查看统计。最多显示最近 50 条。', 'Start with individual records, then review totals. Showing up to 50 recent records.')}</p></div>{plugins?.recent_activity?.length ? <div>{plugins.recent_activity.map((item, index) => <div key={`${item.event_id}-${index}`} className="border-b border-slate-100 px-4 py-3 text-sm last:border-0 dark:border-slate-800"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><strong>{activityStatus(item.status)}</strong><span>{item.event_kind}</span><span>{item.plugin_slug}</span><span className="text-slate-500">{item.site_id}</span></div><p className="mt-1 text-xs text-slate-500">{c('收到上报', 'Report received')}: {localTime(item.received_at)} ({timeZone})</p>{item.run ? <details className="mt-2"><summary className="cursor-pointer text-blue-700">{c('查看对应运行', 'View linked run')}</summary><div className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300"><span>{c('运行状态', 'Run status')}: {activityStatus(item.run.status)}</span><span>{c('实际开始', 'Execution started')}: {localTime(item.run.started_at)}</span><span>{c('实际完成', 'Execution finished')}: {localTime(item.run.finished_at)}</span><code>{item.run.run_id}</code></div></details> : <p className="mt-2 text-xs text-slate-500">{c('未关联 Cloud 运行；不代表调用失败。', 'No linked Cloud run; this does not imply failure.')}</p>}</div>)}</div> : <p className="px-4 py-5 text-sm text-slate-500">{loading ? c('加载中…', 'Loading…') : c('所选范围暂无上报记录。', 'No reports in the selected scope.')}</p>}</section></> : null}
    <details className="border-t border-slate-200 py-3"><summary className="cursor-pointer text-sm font-semibold">{c('查看统计与趋势', 'View totals and trends')}</summary><BackofficeSectionPanel className="mt-3 space-y-2"><h2 className="font-semibold">{pluginMode ? c('插件事件趋势', 'Plugin event trend') : c('每日运行趋势（UTC）', 'Daily run trend (UTC)')}</h2>
      {pluginMode ? <p className="text-xs text-slate-500">{c('按 Cloud 收到上报的时间统计，并非实际运行时间。连接插件通常每小时批量上报，站点定时任务可能进一步延迟。', 'Grouped by Cloud receipt time, not execution time. The connector normally reports hourly; site scheduling may add delays.')} {c('本地时区', 'Local time zone')}: {timeZone}</p> : null}
      {trend?.length ? <AnalyticsLineChart data={trend} height={220} primarySeriesName={pluginMode ? c('事件数', 'Events') : c('运行次数', 'Runs')} secondarySeriesName={c('失败数', 'Failures')} /> : <p>{loading ? c('加载中', 'Loading') : c('暂无趋势数据', 'No trend data')}</p>}
    </BackofficeSectionPanel></details>
    <AdminDataTableFrame title={c('使用明细', 'Usage breakdown')} resultLabel={`${displayRows.length} ${c('组', 'groups')}`} dataUi="usage-breakdown">
      <table className="w-full text-left text-sm"><thead><tr>{[nameColumn, pluginMode ? c('事件数', 'Events') : c('运行次数', 'Runs'), c('失败数', 'Failures'), pluginMode ? c('事件成功率', 'Event success rate') : c('运行成功率', 'Run success rate'), c('平均耗时', 'Average duration'), c('查看', 'Inspect')].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>
      {pageRows.map(row => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800"><td className="break-all px-3 py-2">{rowName(row.id)}</td><td className="px-3 py-2">{number(row.runs)}</td><td className="px-3 py-2">{number(row.failed)}</td><td className="px-3 py-2">{number(row.success_rate == null ? null : row.success_rate * 100, '%')}</td><td className="px-3 py-2">{number(row.avg_latency_ms == null ? null : row.avg_latency_ms / 1000, c(' 秒', ' s'))}</td><td className="px-3 py-2"><Link className="text-blue-700 underline" href={pluginMode ? `/admin/plugin-observability?window=${hours}&plugin=${encodeURIComponent(row.id)}&from=usage-statistics` : `/admin/troubleshooting?window=${hours}&from=usage-statistics${dimension === 'sites' ? `&site=${encodeURIComponent(row.id)}` : `&function=${encodeURIComponent(row.id)}`}`}>{pluginMode ? c('插件记录', 'Plugin records') : dimension === 'sites' ? c('站点诊断', 'Site diagnostics') : c('功能诊断', 'Function diagnostics')}</Link></td></tr>)}
      {!displayRows.length ? <tr><td colSpan={6} className="px-3 py-5">{loading ? c('加载中', 'Loading') : c('所选来源暂无明细；无上报不代表没有使用。', 'No detail from this source; no reports do not imply no usage.')}</td></tr> : null}
      </tbody></table>
      {pageCount > 1 ? <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800"><span>{c(`第 ${page} / ${pageCount} 页`, `Page ${page} of ${pageCount}`)}</span><span className="flex gap-2"><Link aria-disabled={page <= 1} className={page <= 1 ? 'pointer-events-none text-slate-400' : 'text-blue-700 underline'} href={filterHref('page', String(Math.max(1, page - 1)))}>{c('上一页', 'Previous')}</Link><Link aria-disabled={page >= pageCount} className={page >= pageCount ? 'pointer-events-none text-slate-400' : 'text-blue-700 underline'} href={filterHref('page', String(Math.min(pageCount, page + 1)))}>{c('下一页', 'Next')}</Link></span></div> : null}
    </AdminDataTableFrame>
    {pluginMode ? <p className="text-xs text-slate-500">{c('插件上报事件不等于任务次数；成功率与耗时仅代表上报事件。', 'Plugin events are not tasks; rates and duration describe reported events.')} {c('上报站点', 'Reporting sites')}: {number(plugins?.totals.active_site_count)} · {c('事件样本', 'Event sample')}: {number(plugins?.totals.events_total)} · {c('更新于', 'Updated')}: {localTime(plugins?.generated_at)} ({timeZone})</p> : null}
    <details className="border-t border-slate-200 py-3"><summary className="cursor-pointer text-sm">{c('统计口径与数据范围', 'Definitions and data scope')}</summary><p className="mt-2 text-sm">{c('运行成功率为成功运行数 / 所有运行数，包含仍在处理的任务。耗时仅统计已有起止时间的运行。一次任务可产生多条事件，事件数不等于任务数。调用记录缺失不等于任务失败。缺失值显示 —，不当作 0。', 'Run success rate is successful runs / all runs, including pending tasks. Duration uses runs with start and finish times. Multiple events may belong to one task. Missing call records do not imply failed tasks. Missing values display —, not zero.')}</p></details>
    <section data-ui="usage-editorial-outcomes" className="border-t border-slate-200 pt-3 dark:border-slate-800"><div className="flex flex-wrap items-center gap-3"><div><h2 className="text-sm font-semibold">{c('编辑效果（专题证据）', 'Editorial outcomes (specialized evidence)')}</h2><p className="mt-1 text-xs text-slate-500">{c('这是编辑辅助质量证据，不代表运行健康、调用成功或业务采纳结论。', 'This is editorial quality evidence; it does not represent runtime health, call success, or adoption.')}</p></div><button type="button" className="btn btn-secondary btn-sm" aria-expanded={quality} onClick={() => setQuality(v => !v)}>{quality ? c('收起编辑效果', 'Hide editorial outcomes') : c('查看编辑效果', 'View editorial outcomes')}</button></div>{quality ? <div className="mt-3"><EditorAssistQualityPanel disclosure={false} windowHours={hours} refreshSignal={refresh} /></div> : null}</section>
    <div className="flex gap-4 text-sm"><Link href={`/admin/media-observability?window=${hours}`}>{c('媒体观测', 'Media observability')}</Link><Link href={`/admin/vector-observability?window=${hours}`}>{c('向量观测', 'Vector observability')}</Link></div>
  </BackofficePageStack>;
}
