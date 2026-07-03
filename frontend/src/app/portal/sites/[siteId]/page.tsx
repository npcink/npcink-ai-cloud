'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { BackofficeMetricStrip, BackofficePageStack, BackofficeSectionPanel, BackofficeStackCard } from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalErrorState, PortalLoadingState, PortalSignedOutState } from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { portalClient, type PortalSiteSummaryRecord, type Site } from '@/lib/portal-client';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import {
  getPortalSiteDisplayName,
  getPortalSiteWordPressUrl,
} from '@/lib/portal-site-display';
import { formatDate } from '@/lib/utils';

function PortalSiteRecordContent() {
  const params = useParams<{ siteId?: string }>();
  const siteId = String(params?.siteId || '');
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated } = useSession();
  const [summary, setSummary] = useState<PortalSiteSummaryRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !siteId) return;
    let alive = true;
    setError('');
    portalClient
      .getSiteSummary(siteId)
      .then((response) => {
        if (alive) {
          setSummary(response.data);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(formatPortalErrorMessage(err, t, t('error.failed_load')));
        }
      });

    return () => {
      alive = false;
    };
  }, [isAuthenticated, siteId, t]);

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

  if (error) {
    return (
      <PortalErrorState
        title={t('common.error')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!summary) {
    return <PortalLoadingState message={t('common.loading')} />;
  }

  const sessionSite = session.sites.find((item) => item.site_id === siteId) || null;
  const site: Site = {
    ...(summary.site || {}),
    ...(sessionSite || {}),
    site_id: siteId,
    site_name: summary.site?.site_name || sessionSite?.site_name || siteId,
    account_id: summary.site?.account_id || sessionSite?.account_id || summary.account_id || session.account_id || '',
    status: (summary.site?.status || sessionSite?.status || 'inactive') as Site['status'],
    created_at: summary.site?.created_at || sessionSite?.created_at || '',
  };
  const coverage = summary.coverage || null;
  const packageDisplay = resolveCustomerPackageDisplay(t, {
    planId: coverage?.plan_id || session.current_subscription?.plan_id,
    planVersionId: coverage?.plan_version_id || session.current_subscription?.plan_version_id,
    packageAlias: summary.package_alias || coverage?.package_alias || session.current_subscription?.package_alias,
    formalPlanName: sessionSite?.plan_name || summary.site?.plan_name,
    planKind: session.current_subscription?.plan_kind,
    coverageState: coverage || sessionSite?.plan_name ? 'covered' : 'uncovered',
  });
  const packageLabel = packageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm');
  const siteUrl = getPortalSiteWordPressUrl(site);
  const siteNeedsAttention = site.status !== 'active' || !siteUrl;
  const siteStatusLabel = siteNeedsAttention
    ? t('portal.home.filter_attention_only', {}, 'Needs attention')
    : t('portal.home.risk_level_normal', {}, 'Normal');

  return (
    <BackofficePageStack>
      <PortalWorkspaceHeader
        eyebrow={t('portal.site_record_label', {}, 'Site summary')}
        title={getPortalSiteDisplayName(site)}
        currentPage="record"
        selectedSiteId={siteId}
        selectedSiteName={getPortalSiteDisplayName(site)}
        sites={session.sites}
        showSiteContextSummary
        metrics={[
          {
            label: t('common.package', {}, 'Package'),
            value: packageLabel,
            detail: t('portal.home.package_card_label', {}, 'Current package'),
          },
          {
            label: t('common.status', {}, 'Status'),
            value: siteStatusLabel,
            detail: siteUrl || t('portal.site_url_missing_short', {}, 'Site URL not configured'),
          },
          {
            label: t('portal.site_address_label', {}, 'Site address'),
            value: siteUrl ? t('portal.site_address_configured', {}, 'Configured') : t('portal.site_url_missing_short', {}, 'Site URL not configured'),
            detail: siteUrl || t('portal.site_record_address_missing_detail', {}, 'Add a site address so support can identify this site faster.'),
          },
          {
            label: t('common.created_at', {}, 'Created'),
            value: site.created_at ? formatDate(site.created_at) : t('portal.home.package_pending_label', {}, 'To confirm'),
          },
        ]}
        primaryAction={
            <Link href={`/portal/usage?site=${siteId}`} className="btn btn-primary">
              {t('portal.nav_usage', {}, 'Plan and usage')}
            </Link>
        }
        secondaryActions={
          <Link href="/portal/sites" className="btn btn-secondary">
            {t('portal.nav_sites', {}, 'Sites')}
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <BackofficeSectionPanel className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.site_record_package_label', {}, 'Package')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{packageLabel}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {t(
                'portal.site_record_package_access_desc',
                {},
                'This is the clearest place to confirm the current package, service status, and connected site address.'
              )}
            </p>
          </div>
          <BackofficeStackCard>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {t('portal.home.package_card_label', {}, 'Current package')}
                </p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {packageLabel}
                </p>
              </div>
              <BackofficeStatusBadge
                status={siteNeedsAttention ? 'warning' : 'active'}
                label={siteStatusLabel}
              />
            </div>
          </BackofficeStackCard>
          <BackofficeMetricStrip
            columnsClassName="md:grid-cols-2"
            items={[
              {
                label: t('portal.home.service_state_label', {}, 'Service status'),
                value: siteStatusLabel,
              },
              {
                label: t('common.created_at', {}, 'Created'),
                value: site.created_at ? formatDate(site.created_at) : t('portal.home.package_pending_label', {}, 'To confirm'),
              },
            ]}
          />
        </BackofficeSectionPanel>

        <BackofficeSectionPanel className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              {t('portal.site_record_service_label', {}, 'Service pages')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
              {t('portal.site_record_service_title', {}, 'What can I view here?')}
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Link href={`/portal/usage?site=${siteId}`} className="rounded-[1rem] border border-slate-200/80 px-4 py-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/60">
              {t('portal.nav_usage', {}, 'Usage')}
            </Link>
            <Link href="/portal/sites" className="rounded-[1rem] border border-slate-200/80 px-4 py-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/60">
              {t('portal.nav_sites', {}, 'Sites')}
            </Link>
            <Link href="/portal/account" className="rounded-[1rem] border border-slate-200/80 px-4 py-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-100 dark:hover:bg-slate-900/60">
              {t('portal.nav_account', {}, 'Contact')}
            </Link>
          </div>
          <BackofficeStackCard className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {siteUrl || t('portal.site_url_missing', {}, 'WordPress URL not configured')}
          </BackofficeStackCard>
        </BackofficeSectionPanel>
      </div>
    </BackofficePageStack>
  );
}

export default function PortalSiteRecordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalSiteRecordContent />
    </Suspense>
  );
}
