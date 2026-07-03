'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { BackofficeTag } from '@/components/backoffice/BackofficeTag';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalErrorState, PortalLoadingState, PortalSignedOutState } from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type PortalDiagnosticAdvisorSummary,
  type PortalMonitoringOverviewSummary,
  type Site,
} from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { getPortalSiteDisplayName } from '@/lib/portal-site-display';
import { formatDate, formatNumber } from '@/lib/utils';

function resolveSelectedSite(
  sites: Site[],
  requestedSiteId: string,
  sessionSiteId: string
): Site | null {
  return (
    sites.find((site) => site.site_id === requestedSiteId && site.status !== 'archived') ||
    sites.find((site) => site.site_id === sessionSiteId && site.status !== 'archived') ||
    sites.find((site) => site.status !== 'archived') ||
    null
  );
}

function PortalMonitoringContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const { session, isLoading, isAuthenticated, selectSite } = useSession();
  const [monitoringOverview, setMonitoringOverview] = useState<PortalMonitoringOverviewSummary | null>(null);
  const [diagnosticAdvisor, setDiagnosticAdvisor] = useState<PortalDiagnosticAdvisorSummary | null>(null);
  const [isMonitoringOverviewLoading, setIsMonitoringOverviewLoading] = useState(false);
  const [isDiagnosticAdvisorLoading, setIsDiagnosticAdvisorLoading] = useState(false);
  const [monitoringOverviewError, setMonitoringOverviewError] = useState('');
  const [diagnosticAdvisorError, setDiagnosticAdvisorError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const lastLoadedSiteRef = useRef('');
  const requestedSiteId = searchParams.get('site') || '';
  const sites = session?.sites || [];
  const selectedSite = resolveSelectedSite(sites, requestedSiteId, session?.site_id || '');
  const selectedSiteId = selectedSite?.site_id || '';

  useEffect(() => {
    if (!selectedSiteId) {
      setMonitoringOverview(null);
      setDiagnosticAdvisor(null);
      setMonitoringOverviewError('');
      setDiagnosticAdvisorError('');
      return;
    }
    if (lastLoadedSiteRef.current !== selectedSiteId) {
      lastLoadedSiteRef.current = selectedSiteId;
      setMonitoringOverview(null);
      setDiagnosticAdvisor(null);
      setMonitoringOverviewError('');
      setDiagnosticAdvisorError('');
    }
  }, [selectedSiteId]);

  useEffect(() => {
    if (!selectedSiteId) {
      return;
    }

    let isCancelled = false;
    setIsMonitoringOverviewLoading(true);
    setMonitoringOverviewError('');
    void portalClient
      .getMonitoringOverview(selectedSiteId, { windowHours: 24 })
      .then((response) => {
        if (!isCancelled) {
          setMonitoringOverview(response.data);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setMonitoringOverview(null);
          setMonitoringOverviewError(formatPortalErrorMessage(err, t, t('error.failed_load')));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsMonitoringOverviewLoading(false);
        }
      });

    setIsDiagnosticAdvisorLoading(true);
    setDiagnosticAdvisorError('');
    void portalClient
      .getDiagnosticAdvisor(selectedSiteId, { windowHours: 24 })
      .then((response) => {
        if (!isCancelled) {
          setDiagnosticAdvisor(response.data);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setDiagnosticAdvisor(null);
          setDiagnosticAdvisorError(formatPortalErrorMessage(err, t, t('error.failed_load')));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsDiagnosticAdvisorLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [refreshNonce, selectedSiteId, t]);

  if (isLoading) {
    return <PortalLoadingState message={t('common.loading')} />;
  }

  if (!isAuthenticated || !session) {
    return (
      <PortalSignedOutState
        title={t('auth.not_signed_in')}
        description={t('auth.please_sign_in')}
        actionLabel={t('nav.sign_in')}
      />
    );
  }

  if (!selectedSite) {
    return (
      <PortalErrorState
        title={t('portal.no_sites', {}, 'No sites')}
        description={t(
          'portal.monitoring.no_site_desc',
          {},
	          'Connect a WordPress site before service status can be displayed.'
        )}
        retryLabel={t('common.retry')}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const latestActivityAt = monitoringOverview?.activity.last_seen_at || diagnosticAdvisor?.generated_at || '';
  const isOverviewLoading = isMonitoringOverviewLoading;
  const visibleIssueCount =
    monitoringOverview?.action_required.length ?? diagnosticAdvisor?.diagnostic_items.length ?? 0;
  const serviceStatusLabel = visibleIssueCount
    ? t('portal.home.filter_attention_only', {}, 'Needs attention')
    : t('portal.home.risk_level_normal', {}, 'Normal');

  return (
    <BackofficePageStack>
      <PortalWorkspaceHeader
        eyebrow={t('portal.monitoring.eyebrow', {}, 'Service detail')}
        title={t('portal.monitoring.page_title', {}, 'Service status')}
        description={t(
          'portal.monitoring.page_desc',
          {},
          'Check whether the selected site needs attention. This page is read only.'
        )}
        currentPage="monitoring"
        selectedSiteId={selectedSiteId}
        selectedSiteName={getPortalSiteDisplayName(selectedSite)}
        sites={sites}
        onSiteChange={(siteId) => {
          void selectSite(siteId);
        }}
        showSiteContextSummary
        metrics={[
          {
            label: t('portal.monitoring.site_health', {}, 'Site status'),
            value: monitoringOverview ? serviceStatusLabel : t('portal.home.package_pending_label', {}, 'To confirm'),
            detail: t('portal.monitoring.service_check_detail', {}, 'Only customer-readable items are shown here.'),
          },
          {
            label: t('portal.monitoring.actions_required', {}, 'Action required'),
            value: monitoringOverview ? formatNumber(visibleIssueCount) : t('portal.home.package_pending_label', {}, 'To confirm'),
            detail: t('portal.monitoring.diagnostic_total_detail', {}, 'Visible items'),
          },
          {
            label: t('portal.monitoring.quota_pressure', {}, 'Usage pressure'),
            value: serviceStatusLabel,
            detail: t('portal.monitoring.status_plain_detail', {}, 'Review the plan page if usage needs attention.'),
          },
          {
            label: t('portal.monitoring.last_activity', {}, 'Last activity'),
            value: latestActivityAt ? formatDate(latestActivityAt) : t('portal.home.package_pending_label', {}, 'To confirm'),
            detail: t('portal.monitoring.last_activity_detail', {}, 'Updated'),
          },
        ]}
      />

      <MonitoringOverview
        diagnosticAdvisor={diagnosticAdvisor}
        isLoading={isOverviewLoading}
        isDiagnosticAdvisorLoading={isDiagnosticAdvisorLoading}
        errors={[monitoringOverviewError].filter(Boolean)}
        diagnosticAdvisorError={diagnosticAdvisorError}
        onRefresh={() => setRefreshNonce((current) => current + 1)}
      />
    </BackofficePageStack>
  );
}

function MonitoringOverview({
  diagnosticAdvisor,
  isLoading,
  isDiagnosticAdvisorLoading,
  errors,
  diagnosticAdvisorError,
  onRefresh,
}: {
  diagnosticAdvisor: PortalDiagnosticAdvisorSummary | null;
  isLoading: boolean;
  isDiagnosticAdvisorLoading: boolean;
  errors: string[];
  diagnosticAdvisorError: string;
  onRefresh: () => void;
}) {
  const { t } = useLocale();
  return (
    <BackofficeSectionPanel className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            {t('portal.monitoring.overview_title', {}, 'Service overview')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              'portal.monitoring.overview_desc',
              {},
              'Only the items that need attention are shown here. Contact support if an item stays visible.'
            )}
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}>
          {t('common.refresh', {}, 'Refresh')}
        </button>
      </div>

      {isLoading ? (
        <BackofficeStackCard className="text-sm text-slate-600 dark:text-slate-300">
          {t('common.loading')}
        </BackofficeStackCard>
      ) : null}

      {errors.length ? (
        <BackofficeStackCard className="border-amber-200 bg-amber-50/70 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          {errors[0]}
        </BackofficeStackCard>
      ) : null}

      <DiagnosticAdvisorPanel
        advisor={diagnosticAdvisor}
        isLoading={isDiagnosticAdvisorLoading}
        error={diagnosticAdvisorError}
      />
    </BackofficeSectionPanel>
  );
}

function DiagnosticAdvisorPanel({
  advisor,
  isLoading,
  error,
}: {
  advisor: PortalDiagnosticAdvisorSummary | null;
  isLoading: boolean;
  error: string;
}) {
  const { t } = useLocale();
  const items = advisor?.diagnostic_items || [];
  const visibleItems = items.slice(0, 3);
  const hasUnsafeWritePosture =
    Boolean(advisor?.safety?.direct_wordpress_write) || Boolean(advisor?.safety?.automatic_repair_allowed);
  const status = advisor?.severity || advisor?.status || (items.length ? 'warning' : 'inactive');
  return (
    <BackofficeStackCard className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">
              {t('portal.monitoring.diagnostic_advisor', {}, 'Things to review')}
            </h3>
            <BackofficeStatusBadge
              status={status}
              label={
                isLoading
                  ? t('common.loading')
                  : items.length
                    ? t('portal.home.filter_attention_only', {}, 'Needs attention')
                    : t('portal.home.risk_level_normal', {}, 'Normal')
              }
            />
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t(
              'portal.monitoring.diagnostic_advisor_desc',
              {},
              'Current site status is summarized into simple next steps.'
            )}
          </p>
        </div>
        <BackofficeTag tone={hasUnsafeWritePosture ? 'danger' : 'info'}>
          {hasUnsafeWritePosture
            ? t('portal.monitoring.write_posture_invalid', {}, 'Changes blocked')
            : t('portal.monitoring.suggestion_only', {}, 'View only')}
        </BackofficeTag>
      </div>

      {advisor ? (
        <BackofficeMetricStrip
          columnsClassName="md:grid-cols-2 xl:grid-cols-4"
          items={[
            {
              label: t('portal.monitoring.diagnostic_new', {}, 'New'),
              value: formatNumber(items.length),
              detail: t('portal.monitoring.diagnostic_new_detail', {}, 'Needs review'),
              size: 'compact',
            },
            {
              label: t('portal.monitoring.service_check_label', {}, 'Service check'),
              value: items.length ? t('portal.home.filter_attention_only', {}, 'Needs attention') : t('portal.home.risk_level_normal', {}, 'Normal'),
              detail: t('portal.monitoring.service_check_detail', {}, 'Only customer-readable items are shown here.'),
              size: 'compact',
            },
            {
              label: t('portal.monitoring.generated_at', {}, 'Generated'),
              value: advisor.generated_at ? formatDate(advisor.generated_at) : t('portal.home.package_pending_label', {}, 'To confirm'),
              detail: t('portal.monitoring.last_activity_detail', {}, 'Updated'),
              size: 'compact',
            },
            {
              label: t('portal.monitoring.diagnostic_total', {}, 'Total'),
              value: formatNumber(items.length),
              detail: t('portal.monitoring.diagnostic_total_detail', {}, 'Visible items'),
              size: 'compact',
            },
          ]}
        />
      ) : null}

      {isLoading ? (
        <div className="rounded-[0.75rem] border border-dashed border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {t('portal.monitoring.loading_diagnostics', {}, 'Loading service suggestions.')}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[0.75rem] border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && items.length ? (
        <div className="divide-y divide-slate-200 overflow-hidden rounded-[0.75rem] border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {visibleItems.map((item) => {
            const rawTitle = String(item.title || '').toLowerCase();
            const customerTitle = rawTitle.includes('runtime')
              ? t('portal.monitoring.customer_issue_service_success', {}, 'Service success rate needs attention')
              : rawTitle.includes('plugin')
                ? t('portal.monitoring.customer_issue_connection_activity', {}, 'Site connection needs attention')
                : t('portal.monitoring.customer_issue_general', {}, 'Service item needs attention');
            return (
              <div
                key={`${item.code}-${item.recommended_action_id}`}
                className="p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">{customerTitle}</p>
                      <BackofficeStatusBadge
                        status={item.severity}
                        label={t('portal.home.filter_attention_only', {}, 'Needs attention')}
                      />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {t('portal.monitoring.customer_issue_detail', {}, 'If this keeps showing, contact support and include the site name.')}
                    </p>
                  </div>
                  {item.last_updated_at ? (
                    <span className="shrink-0 text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                      {formatDate(item.last_updated_at)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!isLoading && !error && !items.length ? (
        <div className="rounded-[0.75rem] border border-dashed border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {t('portal.monitoring.no_diagnostic_items', {}, 'No suggestions for this site.')}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
        <span>{t('portal.monitoring.advisor_safety', {}, 'Review before acting')}</span>
        <span aria-hidden="true">·</span>
        <span>{t('portal.monitoring.no_wordpress_write', {}, 'No site changes here')}</span>
        {advisor?.confidence ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{t('portal.monitoring.support_can_review', {}, 'Support can review details if needed')}</span>
          </>
        ) : null}
      </div>
    </BackofficeStackCard>
  );
}

export default function PortalMonitoringPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalMonitoringContent />
    </Suspense>
  );
}
