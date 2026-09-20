'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

const client = createApiClient({ idempotencyPrefix: 'plugin_history' });
type Item = { id?: number; event_id?: string; site_id: string; plugin_slug: string; event_kind: string; received_at: string; events?: number; failed?: number; status?: string; run_id?: string | null };
type Snapshot = { at: string; id: number };
type History = { items: Item[]; page: number; pages: number; total: number; totals: { events: number; succeeded: number; failed: number }; snapshot: Snapshot };

export function PluginHistory({ hours, site, recordScope }: { hours: number; site: string; recordScope: string }) {
  const { locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const [filters, setFilters] = useState({ status: 'all', sort: 'latest', view: 'groups', page: 1, group: null as Item | null });
  const [result, setResult] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const snapshot = useRef<Snapshot | null>(null);
  const change = (patch: Partial<typeof filters>) => { snapshot.current = null; setFilters(value => ({ ...value, ...patch, page: 1 })); };
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false); setResult(null);
    const query = new URLSearchParams({ window_hours: String(hours), site_id: filters.group?.site_id || site, record_scope: recordScope, status: filters.status, sort: filters.sort, view: filters.view, page: String(filters.page), page_size: '20' });
    if (filters.group) { query.set('plugin_slug', filters.group.plugin_slug); query.set('event_kind', filters.group.event_kind); }
    if (snapshot.current) { query.set('snapshot_at', snapshot.current.at); query.set('snapshot_id', String(snapshot.current.id)); }
    void client.request<History>(`/api/admin/plugin-observability/history?${query}`, { signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return;
      snapshot.current = response.data.snapshot; setResult(response.data);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [hours, site, recordScope, filters, retry]);
  const names: Record<string, string> = {
    'addon.monitoring.state_projected': c('插件状态同步', 'Plugin state sync'),
    'addon.monitoring.health_reported': c('插件健康上报', 'Plugin health report'),
    'validation.technical_monitoring_only': c('技术验证', 'Technical validation'),
    'abilities.callback.completed': c('能力回调完成', 'Ability callback completed'),
    'abilities.callback.failed': c('能力回调失败', 'Ability callback failed'),
    'core.proposal.create': c('创建操作提案', 'Proposal created'),
    'addon.editor_assist.generation.presented': c('编辑辅助结果已呈现', 'Editorial generation presented'),
    'addon.editor_assist.generation.superseded': c('编辑辅助结果已被新结果替代', 'Editorial generation superseded'),
    'addon.editor_assist.outcome.observed': c('编辑结果已观测', 'Editorial outcome observed'),
    'addon.editor_assist.outcome.expired': c('编辑结果观测过期', 'Editorial observation expired'),
    'addon.media_recognition.completed': c('媒体识别完成', 'Media recognition completed'),
    'addon.media_recognition.failed': c('媒体识别失败', 'Media recognition failed'),
    runtime_request: c('运行请求', 'Runtime request'),
  };
  const statusName = (value?: string) => ({ ok: c('成功', 'Succeeded'), succeeded: c('成功', 'Succeeded'), error: c('失败', 'Failed'), failed: c('失败', 'Failed'), warning: c('需关注', 'Warning') }[value || ''] || c('其他状态', 'Other status'));
  const groups = filters.view === 'groups';
  return <AdminDataTableFrame title={c('插件事件', 'Plugin events')} dataUi="usage-recent-activity" bodyClassName="max-h-[var(--admin-diagnostic-queue-max-height)] overflow-auto"
    resultLabel={result ? c(`${result.totals.events} 条记录 · ${result.totals.failed} 条失败`, `${result.totals.events} records · ${result.totals.failed} failed`) : c('读取已留存记录', 'Reading retained records')}
    headerActions={<div className="flex flex-wrap items-center gap-2">
      {filters.group ? <button className="btn btn-secondary btn-sm" onClick={() => change({ group: null, view: 'groups' })}>{c('返回分组', 'Back to groups')}</button> : <label className="text-xs">{c('展示', 'View')} <select className="btn btn-secondary btn-sm" aria-label={c('记录展示', 'Record view')} value={filters.view} onChange={e => change({ view: e.target.value })}><option value="groups">{c('按事件分组', 'Event groups')}</option><option value="events">{c('逐条记录', 'Individual records')}</option></select></label>}
      <select className="btn btn-secondary btn-sm" aria-label={c('状态筛选', 'Status filter')} value={filters.status} onChange={e => change({ status: e.target.value })}><option value="all">{c('全部状态', 'All statuses')}</option><option value="ok">{c('成功', 'Succeeded')}</option><option value="failed">{c('失败', 'Failed')}</option><option value="other">{c('其他状态', 'Other statuses')}</option></select>
      <button className="btn btn-secondary btn-sm" onClick={() => change({ sort: filters.sort === 'latest' ? 'failures' : 'latest' })}>{filters.sort === 'latest' ? c('失败优先', 'Failures first') : c('最新优先', 'Latest first')}</button>
    </div>}
    footer={<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
      <span>{result ? c(`共 ${result.total} ${groups ? '组' : '条'} · 第 ${result.page} / ${result.pages} 页`, `${result.total} ${groups ? 'groups' : 'records'} · Page ${result.page} of ${result.pages}`) : '—'}</span>
      {result && result.pages > 1 ? <div className="flex gap-3"><button disabled={loading || result.page <= 1} onClick={() => setFilters(value => ({ ...value, page: result.page - 1 }))}>{c('上一页', 'Previous')}</button><button disabled={loading || result.page >= result.pages} onClick={() => setFilters(value => ({ ...value, page: result.page + 1 }))}>{c('下一页', 'Next')}</button></div> : null}
      <p className="w-full text-slate-500">{c('所选时段的已留存上报，每页 20 项；未上报或已清理的数据不在范围内。', 'Retained reports in this period, 20 per page; unreported or purged data is excluded.')} {result ? `${c('快照', 'Snapshot')}: ${formatDateTime(result.snapshot.at, locale)}` : ''}</p>
    </div>}>
    {filters.group ? <p className="px-3 py-2 text-sm">{names[filters.group.event_kind] || filters.group.event_kind} · {filters.group.site_id}</p> : null}
    {failed ? <p role="alert" className="px-3 py-4">{c('记录加载失败，请重试。', 'History could not be loaded.')} <button className="btn btn-secondary btn-sm" onClick={() => setRetry(value => value + 1)}>{c('重试', 'Retry')}</button></p> : loading ? <p role="status" className="px-3 py-4">{c('正在加载记录…', 'Loading records…')}</p> : <table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900"><tr>{[c('时间', 'Time'), groups ? c('次数 / 失败', 'Events / failed') : c('状态', 'Status'), c('事件', 'Event'), c('来源 / 站点', 'Source / site'), c('查看', 'Inspect')].map(label => <th className="px-3 py-2" key={label}>{label}</th>)}</tr></thead><tbody>
      {result?.items.map(item => <tr key={item.id ?? JSON.stringify([item.site_id, item.plugin_slug, item.event_kind])} className="border-t border-slate-200 dark:border-slate-800">
        <td className="px-3 py-2 text-xs">{formatDateTime(item.received_at, locale)}</td>
        <td className="px-3 py-2">{groups ? `${item.events} / ${item.failed}` : statusName(item.status)}</td>
        <td className="px-3 py-2"><details><summary className="cursor-pointer">{names[item.event_kind] || `${c('其他事件', 'Other event')} · ${item.event_kind}`}</summary><code className="break-all text-xs text-slate-500">{item.event_kind}</code>{item.run_id ? <p className="break-all text-xs text-slate-500">{item.run_id}</p> : null}{item.event_id ? <p className="break-all text-xs text-slate-500">{item.event_id}</p> : null}</details></td>
        <td className="break-all px-3 py-2 text-xs">{item.plugin_slug}<br />{item.site_id}</td>
        <td className="px-3 py-2">{groups ? <button className="text-blue-700 underline dark:text-blue-400" onClick={() => change({ view: 'events', group: item })}>{c('查看记录', 'View records')}</button> : item.run_id ? <Link className="text-blue-700 underline dark:text-blue-400" href={`/admin/troubleshooting?window=${hours}&site=${encodeURIComponent(item.site_id)}&from=usage-statistics`}>{c('站点诊断', 'Site diagnostics')}</Link> : <span className="text-xs text-slate-500">{c('未关联', 'Unlinked')}</span>}</td>
      </tr>)}
      {!result?.items.length ? <tr><td className="px-3 py-4" colSpan={5}>{c('所选范围暂无记录。', 'No records in this scope.')}</td></tr> : null}
    </tbody></table>}
  </AdminDataTableFrame>;
}
