'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { useRuntimeRunEvidence } from './useRuntimeRunEvidence';
import { providerEvidenceLabel, runStatusLabel } from './runtimeIssueCatalog';
import { formatDate } from '@/lib/utils';

export function ExactRuntimeRun({ runId, site, windowHours, since, refreshSignal, onClear }: {
  runId: string; site: string; windowHours: number; since: string; refreshSignal: number; onClear: () => void;
}) {
  const { t, locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const evidence = useRuntimeRunEvidence({ runId, site, windowHours, since, refreshSignal, issueCode: '', capabilities: [], capability: '' });
  const run = evidence.items[0];
  return <section data-ui="runtime-exact-run" className="border border-slate-200 p-4 dark:border-slate-800">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{c('指定运行', 'Requested run')}</h2><button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>{c('清除运行定位', 'Clear run focus')}</button></div>
    <p className="mt-2 text-xs text-slate-500">{site || c('未指定站点', 'No site selected')} · {windowHours}h · {c('仅匹配此运行，不替换为其他记录。下方汇总仍代表整个范围。', 'Matches only this run; no substitution. Summaries below still describe the whole scope.')}</p>
    <div className="mt-2"><BackofficeIdentifier value={runId} /></div>
    {!site ? <p role="status" className="mt-2 text-sm">{c('精确定位需要站点范围，请使用带站点的记录链接。', 'Exact lookup requires a site. Use a record link that includes its site.')}</p>
      : evidence.loading ? <p role="status" className="mt-2 text-sm">{t('common.loading')}</p>
      : evidence.failedScopes ? <p role="alert" className="mt-2 text-sm">{c('运行证据读取失败。', 'Run evidence could not be loaded.')} <button className="btn btn-secondary btn-sm" onClick={evidence.retry}>{t('common.retry')}</button></p>
      : !run ? <p role="status" className="mt-2 text-sm">{c('当前站点、时间范围或留存记录中未找到此运行。可扩大时间范围；未展示其他运行。', 'This run was not found in the current site, time range or retained records. Widen the window if needed; no other run is shown.')}</p>
      : <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <div><dt className="text-xs text-slate-500">{c('状态', 'Status')}</dt><dd>{runStatusLabel(run.status, t)}</dd></div>
        <div><dt className="text-xs text-slate-500">{c('能力', 'Ability')}</dt><dd className="break-all">{run.ability_name}</dd></div>
        <div><dt className="text-xs text-slate-500">{c('错误码', 'Error code')}</dt><dd className="break-all">{run.error_code || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">{c('开始 / 完成', 'Started / finished')}</dt><dd>{run.started_at ? formatDate(run.started_at) : '—'} / {run.finished_at ? formatDate(run.finished_at) : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">{c('运行存活时间', 'Run lifetime')}</dt><dd>{run.duration_ms === null ? '—' : `${run.duration_ms} ms`}</dd></div>
        <div><dt className="text-xs text-slate-500">{c('调用证据', 'Call evidence')}</dt><dd>{providerEvidenceLabel(run.provider_evidence_state, t)} · {run.provider_call_count}</dd></div>
      </dl>}
  </section>;
}
