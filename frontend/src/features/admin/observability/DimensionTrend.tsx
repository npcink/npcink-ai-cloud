'use client';

import { useState } from 'react';
import { AnalyticsLineChart } from '@/components/ui/EChartsWrapper';
import { useLocale } from '@/contexts/LocaleContext';

type Point = { day: string; runs: number; failed: number };
export type Comparison = { series: { id: string; points: Point[] }[]; other: Point[]; group_count: number };

export function DimensionTrend({ comparison, name, dimension }: {
  comparison?: Comparison; name: (id: string) => string; dimension: string;
}) {
  const { locale } = useLocale();
  const c = (zh: string, en: string) => locale === 'zh-CN' ? zh : en;
  const [metric, setMetric] = useState<'runs' | 'failed'>('runs');
  if (!comparison) return <p role="status">{c('维度趋势暂不可用，请刷新重试。', 'Dimension trends unavailable. Refresh to retry.')}</p>;
  if (!comparison.series.length) return <p>{c('所选范围暂无运行记录。', 'No runs in this scope.')}</p>;
  const series = comparison.series.map(item => ({ name: name(item.id), values: item.points.map(point => point[metric]) }));
  if (comparison.other.length) series.push({ name: c('其他（合计）', 'Others (combined)'), values: comparison.other.map(point => point[metric]) });
  const days = comparison.series[0].points;
  return <div data-ui="dimension-trend" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{dimension === 'functions' ? c('按功能对比（UTC）', 'Function comparison (UTC)') : c('按站点对比（UTC）', 'Site comparison (UTC)')}</h2>
      <label className="flex items-center gap-2 text-sm">{c('指标', 'Metric')}<select className="btn btn-secondary btn-sm" value={metric} onChange={e => setMetric(e.target.value as 'runs' | 'failed')}><option value="runs">{c('运行次数', 'Runs')}</option><option value="failed">{c('失败数', 'Failures')}</option></select></label>
    </div>
    <AnalyticsLineChart data={days.map(point => ({ label: point.day, value: point[metric] }))} comparisonSeries={series} yAxisLabel={metric === 'runs' ? c('运行次数', 'Runs') : c('失败数', 'Failures')} />
    <p className="text-xs text-slate-500">{comparison.group_count > 5 ? c(`按运行量展示前 5 项，其余 ${comparison.group_count - 5} 项合并为其他。`, `Top 5 by run volume; ${comparison.group_count - 5} remaining groups combined.`) : c(`共 ${comparison.group_count} 项。`, `${comparison.group_count} groups.`)} {c('点击图例可显示或隐藏曲线。', 'Select a legend to show or hide its line.')}</p>
    <table className="sr-only" aria-label={c('对比趋势数据', 'Comparison trend data')}><thead><tr><th>{c('日期', 'Date')}</th>{series.map(item => <th key={item.name}>{item.name}</th>)}</tr></thead><tbody>{days.map((point, index) => <tr key={point.day}><th>{point.day}</th>{series.map(item => <td key={item.name}>{item.values[index]}</td>)}</tr>)}</tbody></table>
  </div>;
}
