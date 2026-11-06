'use client';

import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { BackofficeDisclosure } from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { formatDate, formatNumber } from '@/lib/utils';

export type ObservationPoint = { startAt: string; endAt: string; values: number[] };

export function ObservationTrend({ points, series }: {
  points: ObservationPoint[];
  series: Array<{ name: string; color: string; chart?: boolean }>;
}) {
  const { locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const label = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  };
  return <div data-ui="observation-trend">
    <AnalyticsLineChart height={220}
      data={points.map(point => ({ label: `${label(point.startAt)} – ${label(point.endAt)}`, value: point.values[0] || 0 }))}
      comparisonSeries={series.flatMap((item, index) => item.chart === false ? [] : [{
        name: item.name, color: item.color, values: points.map(point => point.values[index]),
      }])}
    />
    <BackofficeDisclosure summary={c('查看区间与计数', 'View intervals and counts')}>
      <p className="mb-2 text-xs text-slate-500">{c('本地时区', 'Local time zone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      <div data-ui="observation-interval-scroll" role="region" aria-label={c('趋势区间明细滚动区', 'Trend interval details scroll region')} tabIndex={0} className="max-h-80 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><table data-ui="observation-interval-table" className="w-auto text-left text-xs [&_th]:text-left [&_th:not(:first-child)]:text-right [&_td:not(:first-child)]:text-right [&_th]:pr-6 [&_td]:pr-6" aria-label={c('趋势区间与计数', 'Trend intervals and counts')}>
        <thead><tr><th className="px-2 py-2">{c('区间（最后一桶包含结束时间）', 'Interval (final bucket includes end)')}</th>{series.map(item => <th className="px-2 py-2" key={item.name}>{item.name}</th>)}</tr></thead>
        <tbody>{points.map(point => <tr key={point.startAt}><td className="px-2 py-2 whitespace-nowrap">{formatDate(point.startAt)} – {formatDate(point.endAt)}</td>{series.map((item, index) => <td className="px-2 py-2" key={item.name}>{formatNumber(point.values[index])}</td>)}</tr>)}</tbody>
      </table></div>
    </BackofficeDisclosure>
  </div>;
}
