'use client';

import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PortalPageStack,
  PortalCard,
} from '@/components/portal/PortalScaffold';
import { PortalBreadcrumb } from '@/components/portal/PortalBreadcrumb';
import { PortalEntitlementUsage } from '@/components/portal/PortalEntitlementUsage';
import { PortalPaymentReturnNotice } from '@/components/portal/PortalPaymentReturnNotice';
import {
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import { usePortalCommercialCatalog } from '@/hooks/usePortalCommercialCatalog';
import { usePortalPaymentOrders } from '@/hooks/usePortalPaymentOrders';
import { useSession } from '@/hooks/useSession';
import { type Entitlements } from '@/lib/portal-client';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import {
  billingPackageNeedsAttention,
  findLimitedBillingResources,
  resolveBillingPackageStatusLabel,
  resolveBillingPressureCta,
} from '@/lib/portal-billing-status';
import { formatDate, formatNumber } from '@/lib/utils';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;
type QuotaSummary = NonNullable<Entitlements['quota_summary']>;
type QuotaResource = NonNullable<QuotaSummary['resource_limits']>[number];

function formatBillingPeriodRange(startValue: string, endValue: string, locale: string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const currentYear = new Date().getFullYear();
  const includeYear = start.getFullYear() !== end.getFullYear()
    || start.getFullYear() !== currentYear
    || end.getFullYear() !== currentYear;
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    ...(includeYear ? { year: 'numeric' as const } : {}),
    month: locale === 'en' ? 'short' : 'numeric',
    day: 'numeric',
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}


function formatLimitedResourceDetail(resource: QuotaResource, packageLabel: string, t: TranslateFn): string {
  const used = formatNumber(Number(resource.used || 0));
  const limit = formatNumber(Number(resource.limit || 0));
  if (resource.key === 'active_sites' || resource.key === 'bound_sites') {
    return t(
      resource.key === 'active_sites'
        ? 'portal.billing.package_status_active_site_limited'
        : 'portal.billing.package_status_site_limited',
      { used, limit, package: packageLabel },
      `${used} sites are connected; ${packageLabel} includes ${limit}.`
    );
  }
  if (resource.key === 'vector_documents') {
    return t(
      'portal.billing.package_status_knowledge_limited',
      { used, limit },
      `Text knowledge usage is ${used} of ${limit}. New text indexing is paused; existing text remains usable and updatable.`
    );
  }
  if (resource.key === 'media_images') {
    return t(
      'portal.billing.package_status_media_limited',
      { used, limit },
      `Image knowledge usage is ${used} of ${limit}. New image indexing is paused; existing images remain usable and refreshable.`
    );
  }
  return t('portal.billing.package_status_detail', {}, 'Use this page to handle package or AI credit needs.');
}

function resolvePackageStatusDetail(quotaSummary: QuotaSummary | null, packageLabel: string, t: TranslateFn): string {
  const credit = quotaSummary?.ai_credits;
  if (credit?.status === 'limited') {
    return t(
      'portal.billing.package_status_credit_limited',
      {},
      'The package has no AI credits remaining. Buy AI credits or change the package to continue.'
    );
  }
  const limitedResources = findLimitedBillingResources(quotaSummary);
  if (limitedResources.length > 1) {
    return limitedResources.map((resource) => formatLimitedResourceDetail(resource, packageLabel, t)).join(' ');
  }
  const limitedResource = limitedResources[0];
  return limitedResource
    ? formatLimitedResourceDetail(limitedResource, packageLabel, t)
    : t('portal.billing.package_status_detail', {}, 'Use this page to handle package or AI credit needs.');
}


function PortalBillingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale, t } = useLocale();
  const { session, isLoading: sessionLoading, isAuthenticated, refresh } = useSession();
  const {
    entitlements,
    isLoading,
    error,
    load: loadBilling,
  } = usePortalCommercialCatalog({
    isAuthenticated,
    t,
  });
  // Payment return deep-links still land on /portal/billing; keep orders refresh for the notice.
  const {
    statusGroup: paymentOrderStatusGroup,
    offset: paymentOrderOffset,
    load: loadPaymentOrders,
  } = usePortalPaymentOrders({
    isAuthenticated,
    t,
  });

  // Upgrade / manage intents now live on Account.
  useEffect(() => {
    const requestedAction = searchParams.get('action');
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (requestedAction === 'upgrade' || hash === '#package-options' || hash === '#payment-orders') {
      const params = new URLSearchParams(searchParams.toString());
      const targetHash = hash === '#payment-orders' ? '#payment-orders' : '#package-options';
      const qs = params.toString();
      router.replace(`/portal/account${qs ? `?${qs}` : ''}${targetHash}`);
    }
  }, [router, searchParams]);

  const paymentReturnProvider = String(searchParams.get('payment_return') || '').toLowerCase();
  const paymentReturnOrderId = String(searchParams.get('out_trade_no') || '').trim();

  if (sessionLoading && !session) {
    return <PortalLoadingState message={t('portal.loading_session', {}, 'Loading session...')} />;
  }

  if (!isAuthenticated || !session) {
    return (
      <PortalSignedOutState
        title={t('auth.sign_in_required', {}, 'Sign in required')}
        description={t('portal.signed_out_desc', {}, 'Sign in to view Cloud service details.')}
        actionLabel={t('nav.sign_in', {}, 'Sign in')}
      />
    );
  }

  if (isLoading && !entitlements) {
    return <PortalLoadingState message={t('portal.billing.loading', {}, 'Loading package details...')} />;
  }

  const currentSubscription = entitlements?.current_subscription || null;
  const snapshotPlanVersionId = currentSubscription?.plan_version_id || '';
  const packageDisplay = resolveCustomerPackageDisplay(t, {
    planId: currentSubscription?.plan_id,
    planVersionId: snapshotPlanVersionId,
    packageAlias: currentSubscription?.package_alias,
    planKind: currentSubscription?.plan_kind,
    coverageState: currentSubscription ? 'covered' : 'uncovered',
  });
  const packageLabel = packageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm');
  const quotaSummary = entitlements?.quota_summary || null;
  const currentPeriodStart =
    entitlements?.period_start_at ||
    currentSubscription?.current_period_start_at ||
    '';
  const currentPeriodEnd =
    entitlements?.period_end_at ||
    currentSubscription?.current_period_end_at ||
    '';
  const currentPeriodLabel =
    currentPeriodStart && currentPeriodEnd
      ? formatBillingPeriodRange(currentPeriodStart, currentPeriodEnd, locale)
      : t('portal.home.package_pending_label', {}, 'To confirm');
  const currentPeriodEndDetail = currentPeriodEnd
    ? t(
        'portal.billing.period_end_detail',
        { time: formatDate(currentPeriodEnd) },
        `Ends ${formatDate(currentPeriodEnd)}`
      )
    : '';
  const packageStatus = billingPackageNeedsAttention(quotaSummary, error)
    ? 'warning'
    : (!quotaSummary || error ? 'unknown' : 'ok');
  const packageStatusLabel =
    packageStatus === 'warning'
      ? resolveBillingPackageStatusLabel(quotaSummary, t)
      : t('common.ok', {}, 'OK');
  const pressureCta = resolveBillingPressureCta({ quotaSummary, t });
  const manageHref = pressureCta.href;
  const packageSummaryMetrics = [
    {
      label: t('portal.current_subscription_label', {}, 'Current package'),
      value: packageLabel,
      size: 'compact' as const,
    },
    {
      label: t('portal.usage.period_label', {}, 'Period'),
      value: currentPeriodLabel,
      detail: currentPeriodEndDetail || undefined,
      size: 'compact' as const,
    },
  ];

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        title={t('portal.billing.customer_title', {}, 'Package')}
        currentPage="billing"
        breadcrumb={(
          <PortalBreadcrumb
            aria-label={t('portal.billing.breadcrumb', {}, 'Package location')}
            items={[
              {
                label: t('portal.nav_service', {}, 'Service'),
                href: '/portal',
              },
              {
                label: t('portal.billing.customer_title', {}, 'Package'),
              },
            ]}
          />
        )}
        primaryAction={
          packageStatus !== 'warning' ? (
            <Link href="/portal/account#package-options" className="btn btn-secondary btn-sm">
              {t('portal.billing.manage_title', {}, 'Manage package')}
            </Link>
          ) : null
        }
        metrics={packageSummaryMetrics}
        metricsLayout="rail"
        metricsPlacement="title-end"
      />

      <PortalPaymentReturnNotice
        t={t}
        locale={locale}
        provider={paymentReturnProvider}
        orderId={paymentReturnOrderId}
        isAuthenticated={isAuthenticated}
        entitlements={entitlements}
        refreshSession={refresh}
        refreshBilling={loadBilling}
        refreshPaymentOrders={() => loadPaymentOrders(paymentOrderStatusGroup, paymentOrderOffset)}
      />

      {error ? (
        <PortalErrorState
          title={t('error.failed_load', {}, 'Failed to load')}
          description={error}
          retryLabel={t('common.retry', {}, 'Retry')}
          onRetry={() => void loadBilling()}
        />
      ) : null}

      {!error && quotaSummary ? (
        <PortalCard variant="portal" className="bg-white px-3.5 py-3 dark:bg-slate-950" data-portal-billing="entitlements">
          {packageStatus === 'warning' ? (
            <div
              className="mb-3 w-fit max-w-full overflow-hidden rounded-xl border border-amber-200/90 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
              data-portal-billing="attention"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                <div className="min-w-0 max-w-prose">
                  <p className="text-sm font-semibold text-gray-950 dark:text-white">{packageStatusLabel}</p>
                  <p className="mt-0.5 text-xs leading-5 text-amber-900/90 dark:text-amber-100/90">
                    {resolvePackageStatusDetail(quotaSummary, packageLabel, t)}
                  </p>
                </div>
                <Link href={manageHref} className="btn btn-secondary btn-sm shrink-0">
                  {pressureCta.label}
                </Link>
              </div>
            </div>
          ) : null}
          <PortalEntitlementUsage
            quotaSummary={quotaSummary}
            t={t}
            locale={locale}
            attentionSurfaceActive={packageStatus === 'warning'}
          />
        </PortalCard>
      ) : null}
    </PortalPageStack>
  );
}

export default function PortalBillingPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalBillingContent />
    </Suspense>
  );
}
