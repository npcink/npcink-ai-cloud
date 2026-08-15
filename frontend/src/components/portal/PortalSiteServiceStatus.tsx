'use client';

import Link from 'next/link';
import {
  PortalCard,
  PortalSection,
} from '@/components/portal/PortalScaffold';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import type { PortalMonitoringOverviewSummary } from '@/lib/portal-client';
import {
  getPortalCustomerIssueTitle,
  getPortalServiceOperationStatus,
  hasPortalQuotaPressure,
} from '@/lib/portal-monitoring-display';
import { formatDate, formatNumber } from '@/lib/utils';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

type PortalSiteServiceStatusProps = {
  t: TranslateFn;
  overview: PortalMonitoringOverviewSummary | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
};

function statusLabel(status: string, issueCount: number, hasQuotaPressure: boolean, t: TranslateFn): string {
  if (status === 'ok' && issueCount === 0 && !hasQuotaPressure) return t('portal.home.risk_level_normal', {}, 'Normal');
  if (status === 'inactive') return t('status.inactive', {}, 'Inactive');
  return t('portal.home.filter_attention_only', {}, 'Needs attention');
}

function statusTone(status: string, issueCount: number, hasQuotaPressure: boolean): string {
  if (status === 'ok' && issueCount === 0 && !hasQuotaPressure) return 'active';
  if (status === 'error') return 'error';
  return 'warning';
}

export function PortalSiteServiceStatus({
  t,
  overview,
  isLoading,
  error,
  onRefresh,
}: PortalSiteServiceStatusProps) {
  const issueCount = overview?.action_required.length || 0;
  const healthStatus = overview?.health.status || 'inactive';
  const hasQuotaPressure = Boolean(overview && hasPortalQuotaPressure(overview));
  const currentStatusLabel = statusLabel(healthStatus, issueCount, hasQuotaPressure, t);
  const latestActivityAt = overview?.activity.last_seen_at || overview?.generated_at || '';

  const serviceOperationStatus = overview
    ? getPortalServiceOperationStatus(overview)
    : 'inactive';
  const errorCount = Number(overview?.activity.plugin_errors_total || 0);

  return (
    <PortalSection id="service-status" className="scroll-mt-24 space-y-4" data-portal-site="service-status">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            {t('portal.monitoring.overview_title', {}, 'Service status')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              'portal.monitoring.overview_desc',
              {},
              'Review connection, recorded errors, and usage pressure in one place.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PortalStatusBadge
            status={statusTone(healthStatus, issueCount, hasQuotaPressure)}
            label={overview ? currentStatusLabel : t('common.loading')}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={isLoading}>
            {t('common.refresh', {}, 'Refresh')}
          </button>
        </div>
      </div>

      {isLoading ? (
        <PortalCard className="text-sm text-slate-600 dark:text-slate-300">{t('common.loading')}</PortalCard>
      ) : null}

      {error ? (
        <PortalCard className="border-amber-200 bg-amber-50/70 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          {error}
        </PortalCard>
      ) : null}

      {!isLoading && !error && overview ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200/80 bg-slate-50/70 text-xs font-medium uppercase tracking-[0.1em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/45 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t('portal.monitoring.check_item', {}, 'Check')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('common.status', {}, 'Status')}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t('portal.monitoring.recent_evidence', {}, 'Recent evidence')}</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">{t('portal.sites.table_actions', {}, 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
              <tr>
                <th scope="row" className="px-4 py-3 font-semibold text-slate-950 dark:text-white">
                  {t('portal.monitoring.service_operation', {}, 'Service operation')}
                </th>
                <td className="px-4 py-3">
                  <PortalStatusBadge
                    status={serviceOperationStatus}
                    label={serviceOperationStatus === 'inactive'
                      ? t('status.inactive', {}, 'Inactive')
                      : serviceOperationStatus === 'active'
                        ? t('portal.home.risk_level_normal', {}, 'Normal')
                        : t('portal.home.filter_attention_only', {}, 'Needs attention')}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {latestActivityAt ? formatDate(latestActivityAt) : t('portal.home.package_pending_label', {}, 'To confirm')}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-slate-400">—</span>
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-semibold text-slate-950 dark:text-white">
                  {t('portal.monitoring.recorded_errors', {}, 'Recorded error events')}
                </th>
                <td className="px-4 py-3">
                  <PortalStatusBadge
                    status={errorCount > 0 ? 'warning' : 'active'}
                    label={formatNumber(errorCount)}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {errorCount > 0
                    ? t('portal.monitoring.recorded_errors_present', {}, 'Recorded during the current monitoring window.')
                    : t('portal.monitoring.recorded_errors_none', {}, 'No explicit errors were recorded.')}
                </td>
                <td className="px-4 py-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <th scope="row" className="px-4 py-3 font-semibold text-slate-950 dark:text-white">
                  {t('portal.monitoring.quota_pressure', {}, 'Usage pressure')}
                </th>
                <td className="px-4 py-3">
                  <PortalStatusBadge
                    status={hasQuotaPressure ? 'warning' : 'active'}
                    label={hasQuotaPressure ? t('portal.home.filter_attention_only', {}, 'Needs attention') : t('portal.home.risk_level_normal', {}, 'Normal')}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                  {hasQuotaPressure
                    ? t('portal.monitoring.quota_evidence_attention', {}, 'Usage is near or over the current package limit.')
                    : t('portal.monitoring.quota_evidence_normal', {}, 'Usage is below the current package reminder threshold.')}
                </td>
                <td className="px-4 py-3 text-right">
                  {hasQuotaPressure ? (
                    <Link href="/portal/billing" className="btn btn-secondary btn-sm">
                      {t('portal.nav_billing', {}, 'View package')}
                    </Link>
                  ) : <span className="text-slate-400">—</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {!isLoading && !error && overview && overview.action_required.length > 0 ? (
        <PortalCard className="space-y-2" data-portal-site="next-safe-action">
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">
            {t('portal.monitoring.next_safe_action', {}, 'Next safe action')}
          </h3>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {getPortalCustomerIssueTitle(overview.action_required[0], t)}
          </p>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {overview.action_required[0].suggested_action || t('portal.monitoring.attention_action', {}, 'If this continues, contact support and include the site name.')}
          </p>
          <Link href="/portal/support?new=1&topic=site" className="btn btn-secondary btn-sm w-fit">
            {t('portal.support_request_new_action', {}, 'Submit ticket')}
          </Link>
        </PortalCard>
      ) : null}

      {!isLoading && !error && overview && issueCount > 1 ? (
        <details className="rounded-xl border border-slate-200/80 px-4 py-3 text-sm dark:border-slate-800">
          <summary className="cursor-pointer font-medium text-slate-800 dark:text-slate-200">
            {t('portal.monitoring.additional_items', { count: String(issueCount) }, '{{count}} service items need attention')}
          </summary>
          <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
            {overview.action_required.slice(0, 3).map((item) => (
              <li key={`${item.code}-${item.source}`}>{getPortalCustomerIssueTitle(item, t)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </PortalSection>
  );
}
