'use client';

import { PortalEmptyState } from '@/components/portal/PortalPageState';
import { PortalCard, PortalSection } from '@/components/portal/PortalScaffold';
import { UsageBarChart } from '@/components/ui/UsageChart';
import { DEFAULT_PORTAL_CURRENCY, formatPortalCurrency } from '@/lib/currency';
import type { PortalUsageWindow } from '@/lib/portal-client';
import { formatCompactNumber, formatDate, formatNumber } from '@/lib/utils';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;
type ChartPoint = { date: string; requests: number; tokens: number; cost: number };

type PortalUsageAdvancedDetailsProps = {
  t: TranslateFn;
  chartData: ChartPoint[];
  chartTotals: { requests: number; tokens: number; cost: number };
  usageWindow: PortalUsageWindow | null;
  hasEntitlements: boolean;
};

function toFinite(value: unknown): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function PortalUsageAdvancedDetails({
  t,
  chartData,
  chartTotals,
  usageWindow,
  hasEntitlements,
}: PortalUsageAdvancedDetailsProps) {
  const formatPreferredCurrency = (value: number) => formatPortalCurrency(value, { to: DEFAULT_PORTAL_CURRENCY });
  const trendCards = [
    {
      key: 'requests' as const,
      label: t('portal.usage.package_service_uses_label', {}, 'Service uses'),
      value: formatNumber(chartTotals.requests),
      detail: t('portal.usage.trend_service_detail', {}, 'Service uses recorded in this view.'),
    },
    {
      key: 'tokens' as const,
      label: t('portal.usage.breakdown_tokens', {}, 'Point usage'),
      value: formatCompactNumber(chartTotals.tokens),
      detail: t('portal.usage.trend_points_detail', {}, 'Points used by service requests in this view.'),
    },
    {
      key: 'cost' as const,
      label: t('portal.usage.package_budget_label', {}, 'Budget'),
      value: formatPreferredCurrency(chartTotals.cost),
      detail: t('portal.usage.trend_budget_detail', {}, 'Estimated service budget used in this view.'),
    },
  ];

  return (
    <details className="overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-950/45" data-portal-usage="usage-detail">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-950 hover:bg-slate-50 dark:text-white dark:hover:bg-slate-900/60">
        {t('portal.usage.detail_toggle', {}, 'Usage details')}
      </summary>
      <div className="space-y-5 border-t border-slate-200 p-4 dark:border-slate-800">
        {chartData.length > 0 ? (
          <PortalSection className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('portal.usage.trends_label', {}, 'Usage trends')}</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{t('portal.usage.trends_title', {}, 'Service uses, points, and budget')}</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {trendCards.map((card) => (
                <PortalCard key={card.key}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{card.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">{card.value}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">{card.detail}</p>
                  <div className="mt-3">
                    {chartTotals[card.key] > 0 ? (
                      <UsageBarChart data={chartData} type={card.key} height={120} />
                    ) : (
                      <div className="flex h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{t('portal.usage.trend_empty', {}, 'No data yet')}</div>
                    )}
                  </div>
                </PortalCard>
              ))}
            </div>
          </PortalSection>
        ) : null}

        {usageWindow ? (
          <PortalSection className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('portal.usage.cost_summary_label', {}, 'Budget summary')}</p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{t('portal.usage.cost_summary_title', {}, 'Service usage details')}</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <PortalCard className="bg-white/70 dark:bg-slate-950/35">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{t('portal.usage.estimated_total_cost', {}, 'Estimated service budget')}</p>
                <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">{formatPreferredCurrency(toFinite(usageWindow.cost_total))}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{`${formatDate(usageWindow.start_at)} - ${formatDate(usageWindow.end_at)}`}</p>
              </PortalCard>
              <PortalCard className="bg-white/70 dark:bg-slate-950/35">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{t('portal.usage.input_tokens', {}, 'Input points')}</p>
                <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">{formatCompactNumber(toFinite(usageWindow.tokens_in_total))}</p>
              </PortalCard>
              <PortalCard className="bg-white/70 dark:bg-slate-950/35">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{t('portal.usage.output_tokens', {}, 'Output points')}</p>
                <p className="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">{formatCompactNumber(toFinite(usageWindow.tokens_out_total))}</p>
              </PortalCard>
            </div>
          </PortalSection>
        ) : null}

        {!hasEntitlements ? (
          <PortalEmptyState
            title={t('portal.usage.empty_title', {}, 'Usage details are not ready yet')}
            description={t('portal.usage.empty_desc', {}, 'This account does not have a usage snapshot for the current period yet. Open Package to confirm coverage, or return to the workspace.')}
            actionLabel={t('portal.nav_package', {}, 'Package')}
            actionHref="/portal/billing"
          />
        ) : null}
      </div>
    </details>
  );
}
