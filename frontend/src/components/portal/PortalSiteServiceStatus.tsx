'use client';

import Link from 'next/link';
import { PortalActionIcon } from '@/components/portal/PortalRowActions';
import {
  PortalCard,
  PortalSection,
} from '@/components/portal/PortalScaffold';
import { PortalStatusBadge, PortalStatusInline } from '@/components/portal/PortalStatusBadge';
import type { PortalMonitoringOverviewSummary } from '@/lib/portal-client';
import {
  getPortalServiceOperationStatus,
  hasPortalQuotaPressure,
} from '@/lib/portal-monitoring-display';
import { formatDate, formatNumber } from '@/lib/utils';
import { PortalLoadingState } from '@/components/portal/PortalPageState';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type PortalSiteAttentionAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
};

type PortalSiteServiceStatusProps = {
  t: TranslateFn;
  overview: PortalMonitoringOverviewSummary | null;
  isLoading: boolean;
  error: string;
  onRefresh: () => void;
  /** True while a user-triggered recheck is in flight. */
  isRefreshing?: boolean;
  /** Outcome of the latest user-triggered recheck. */
  refreshNotice?: 'success' | 'error' | null;
  /** When set, render the primary yellow attention surface inside this card. */
  attention?: {
    title: string;
    detail?: string;
    action: PortalSiteAttentionAction;
    /** Optional secondary control (e.g. Recheck when primary is Contact support). */
    secondaryAction?: PortalSiteAttentionAction | null;
    /** Extra text CTA when clear errors are present (e.g. contact support). */
    supportHref?: string | null;
    supportLabel?: string;
  } | null;
};

export function PortalSiteServiceStatus({
  t,
  overview,
  isLoading,
  error,
  onRefresh,
  isRefreshing = false,
  refreshNotice = null,
  attention = null,
}: PortalSiteServiceStatusProps) {
  const hasQuotaPressure = Boolean(overview && hasPortalQuotaPressure(overview));
  const serviceStatus = overview ? getPortalServiceOperationStatus(overview) : 'inactive';
  const latestActivityAt = overview?.activity.last_seen_at || overview?.generated_at || '';

  const serviceOperationStatus = overview
    ? getPortalServiceOperationStatus(overview)
    : 'inactive';
  const errorCount = Number(overview?.activity.plugin_errors_total || 0);
  const showRefresh = Boolean(
    error || serviceStatus === 'inactive' || serviceStatus === 'error' || refreshNotice === 'error'
  );
  const showQuotaRow = hasQuotaPressure && !(attention && attention.action.href?.includes('package-options'));
  const showDetails = Boolean(
    error
    || serviceStatus !== 'active'
    || showQuotaRow
    || errorCount > 0
  );
  // When the top attention already explains the non-knowledge warning, do not
  // paint a second yellow 「需要关注」 on the service-operation row.
  const serviceWarningCoveredByAttention = Boolean(
    attention
    && serviceOperationStatus === 'warning'
    && errorCount === 0
  );

  const recheckLabel = isRefreshing
    ? t('portal.retry.rechecking', {}, 'Checking…')
    : t('portal.retry.recheck_service', {}, 'Recheck service');

  // Prefer explicit parent prop (including null = hide). Only auto-link when omitted.
  const supportHref = attention
    ? (attention.supportHref !== undefined
      ? attention.supportHref
      : (errorCount > 0 && overview?.site_id
        ? `/portal/support?new=1&topic=site&site=${encodeURIComponent(overview.site_id)}`
        : null))
    : null;
  const supportLabel = attention?.supportLabel
    || t('portal.site_attention_contact_support', {}, 'Contact support');

  // Quiet default: do not paint an empty 「服务状态」 shell when there is
  // nothing actionable (no attention, no evidence, no load/error/recheck notice).
  const hasContent = Boolean(
    attention
    || error
    || refreshNotice
    || (isLoading && !overview)
    || showDetails
  );
  if (!hasContent) {
    return null;
  }

  const renderAttentionAction = (action: PortalSiteAttentionAction) => {
    const className = 'btn btn-secondary btn-sm shrink-0';
    const testId = action.testId || 'attention-cta';
    if (action.href) {
      return (
        <Link
          href={action.href}
          className={className}
          data-portal-site={testId}
        >
          {action.label}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={className}
        disabled={action.disabled}
        onClick={action.onClick}
        data-portal-site={testId}
      >
        {action.label}
      </button>
    );
  };

  return (
    <PortalSection id="service-status" className="scroll-mt-24 space-y-2 p-3 md:px-4 md:py-3" data-portal-site="service-status">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
          {t('portal.monitoring.overview_title', {}, 'Connection and runtime')}
        </h2>
        {showRefresh && !attention ? (
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-white"
            onClick={onRefresh}
            disabled={isLoading || isRefreshing}
            aria-label={recheckLabel}
            title={recheckLabel}
            data-portal-site="recheck"
          >
            <PortalActionIcon id="recheck" />
          </button>
        ) : null}
      </div>

      {attention ? (
        <div
          className="w-fit max-w-full overflow-hidden rounded-xl border border-amber-200/90 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
          data-portal-site="attention-focus"
        >
          <div className="space-y-2 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">
                {attention.title}
              </p>
              {attention.detail ? (
                <p
                  className="mt-1 text-xs leading-5 text-amber-900/90 dark:text-amber-100/90"
                  data-portal-site="attention-detail"
                >
                  {attention.detail}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {renderAttentionAction(attention.action)}
              {attention.secondaryAction
                ? renderAttentionAction(attention.secondaryAction)
                : null}
              {supportHref && errorCount > 0 ? (
                <Link
                  href={supportHref}
                  className="btn btn-secondary btn-sm shrink-0"
                  data-portal-site="attention-support"
                >
                  {supportLabel}
                </Link>
              ) : null}
            </div>
          </div>
          {refreshNotice === 'success' ? (
            <p className="border-t border-amber-200/70 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:text-amber-200" data-portal-site="recheck-notice">
              {t('portal.retry.recheck_still_attention', {}, 'Rechecked — this site still needs attention.')}
            </p>
          ) : null}
          {refreshNotice === 'error' ? (
            <p className="border-t border-amber-200/70 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:text-amber-200" data-portal-site="recheck-notice">
              {t(
                'portal.retry.recheck_failed_next',
                {},
                'Try Recheck service again. If it still fails, reload the page or contact support.'
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {!attention && refreshNotice === 'success' && !error ? (
        <p className="text-sm text-slate-600 dark:text-slate-300" data-portal-site="recheck-notice">
          {t('portal.retry.recheck_ok', {}, 'Service status updated.')}
        </p>
      ) : null}

      {!attention && (refreshNotice === 'error' || error) ? (
        <PortalCard className="border-amber-200 bg-amber-50/70 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          <p>{error || t('portal.monitoring.load_failed', {}, 'Service status could not be loaded for the current site.')}</p>
          <p className="mt-2 text-xs leading-5">
            {t(
              'portal.retry.recheck_failed_next',
              {},
              'Try Recheck service again. If it still fails, reload the page or contact support.'
            )}
          </p>
        </PortalCard>
      ) : null}

      {isLoading && !overview ? (
        <PortalLoadingState message={t('common.loading')} compact />
      ) : null}

      {!isLoading && !error && overview && showDetails ? (
        <dl
          className="w-full divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800"
          data-portal-site="service-status-evidence"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <dt className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">
              {t('portal.monitoring.service_operation', {}, 'Service operation')}
            </dt>
            <dd className="min-w-0 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              {serviceWarningCoveredByAttention ? (
                <PortalStatusInline
                  label={t(
                    'portal.monitoring.service_explained_above',
                    {},
                    'See note above'
                  )}
                />
              ) : (
                <PortalStatusBadge
                  status={serviceOperationStatus}
                  label={serviceOperationStatus === 'inactive'
                    ? t('status.inactive', {}, 'Inactive')
                    : serviceOperationStatus === 'active'
                      ? t('portal.home.risk_level_normal', {}, 'Normal')
                      : t('portal.home.filter_attention_only', {}, 'Needs attention')}
                />
              )}
              <span>
                {latestActivityAt ? formatDate(latestActivityAt) : t('portal.home.package_pending_label', {}, 'To confirm')}
              </span>
            </dd>
          </div>
          {errorCount > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <dt className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">
                {t('portal.monitoring.recorded_errors', {}, 'Recorded error events')}
              </dt>
              <dd className="min-w-0 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <PortalStatusBadge
                  status="warning"
                  label={formatNumber(errorCount)}
                />
                <span>
                  {t('portal.monitoring.recorded_errors_present', {}, 'Recorded during the current monitoring window.')}
                </span>
              </dd>
            </div>
          ) : null}
          {showQuotaRow ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <dt className="shrink-0 text-sm font-semibold text-slate-950 dark:text-white">
                {t('portal.monitoring.quota_pressure', {}, 'Account usage pressure')}
              </dt>
              <dd className="min-w-0 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <PortalStatusBadge
                  status="warning"
                  label={t('portal.home.filter_attention_only', {}, 'Needs attention')}
                />
                <span>
                  {t('portal.monitoring.quota_evidence_attention', {}, 'The account is near or over its shared package limit.')}
                </span>
                <Link
                  href="/portal/account#package-options"
                  className="btn btn-secondary btn-sm shrink-0"
                  data-portal-site="view-plan"
                >
                  {t('portal.nav_billing', {}, 'View package')}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </PortalSection>
  );
}
