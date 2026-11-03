'use client';

import { BackofficeSectionPanel } from '@/components/backoffice/BackofficeScaffold';
import { BackofficeTag } from '@/components/backoffice/BackofficeTag';
import { useLocale } from '@/contexts/LocaleContext';
import { formatNumber } from '@/lib/utils';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function RecommendationQuality({ value }: { value: unknown }) {
  const { t } = useLocale();
  const summary = record(value);
  const minimum = count(summary.minimum_sample_size) || 20;
  const families = ['internal_links', 'related_articles'].map(id => ({ id, ...record(summary[id]) }));
  if (!families.some(family => count(record(family).events_total) > 0)) return null;
  const metrics = ['open_total', 'copy_total', 'apply_total', 'saved_sessions_total', 'undo_total'];

  return <BackofficeSectionPanel className="overflow-hidden p-0" data-ui="feedback-recommendation-quality">
    <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <h2 className="text-lg font-semibold">{t('admin.agent_feedback.recommendation_title')}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{t('admin.agent_feedback.recommendation_basis')}</p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[66rem] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800"><tr>
          <th className="px-5 py-3">{t('admin.agent_feedback.recommendation_kind')}</th>
          <th className="px-4 py-3">{t('admin.agent_feedback.impression_sessions')}</th>
          {metrics.map(metric => <th className="whitespace-nowrap px-4 py-3" key={metric}>{t(`admin.agent_feedback.recommendation_${metric}`)}</th>)}
          <th className="px-4 py-3">{t('admin.agent_feedback.recommendation_sample')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">{families.filter(family => count(record(family).events_total) > 0).map(family => {
          const row = record(family);
          const denominator = count(row.impression_sessions_total);
          return <tr key={family.id}>
            <td className="px-5 py-3"><p>{t(`admin.agent_feedback.recommendation_${family.id}`)}</p>{count(row.orphan_event_count) > 0 ? <p className="mt-1 text-xs text-slate-500">{t('admin.agent_feedback.recommendation_orphans', { count: formatNumber(count(row.orphan_event_count)) })}</p> : null}</td>
            <td className="px-4 py-3 tabular-nums">{formatNumber(denominator)}</td>
            {metrics.map(metric => <td key={metric} className="whitespace-nowrap px-4 py-3 tabular-nums">{denominator > 0 && row[metric] != null ? <>{formatNumber(count(row[metric]))} / {formatNumber(denominator)}<span className="ml-2 text-xs text-slate-500">{(count(row[metric]) / denominator * 100).toFixed(1)}%</span></> : '—'}</td>)}
            <td className="whitespace-nowrap px-4 py-3"><BackofficeTag tone="neutral">{t(denominator < minimum ? 'admin.agent_feedback.media_sample_insufficient' : 'admin.agent_feedback.media_sample_sufficient', { minimum: formatNumber(minimum) })}</BackofficeTag></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </BackofficeSectionPanel>;
}
