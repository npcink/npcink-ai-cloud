'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PortalPageStack,
  PortalCard,
} from '@/components/portal/PortalScaffold';
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

function findLimitedResources(quotaSummary: QuotaSummary | null): QuotaResource[] {
  return (quotaSummary?.resource_limits || []).filter((resource) => (
    !resource.unlimited
    && Number(resource.limit || 0) > 0
    && (resource.status === 'limited' || Number(resource.used || 0) > Number(resource.limit || 0))
  ));
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
  const limitedResources = findLimitedResources(quotaSummary);
  if (limitedResources.length > 1) {
    return limitedResources.map((resource) => formatLimitedResourceDetail(resource, packageLabel, t)).join(' ');
  }
  const limitedResource = limitedResources[0];
  return limitedResource
    ? formatLimitedResourceDetail(limitedResource, packageLabel, t)
    : t('portal.billing.package_status_detail', {}, 'Use this page to handle package or AI credit needs.');
}

function resolvePackageStatusLabel(quotaSummary: QuotaSummary | null, t: TranslateFn): string {
  if (quotaSummary?.ai_credits?.status === 'limited') {
    return t('portal.billing.package_status_credit_label', {}, 'AI credits unavailable');
  }
  const limitedResources = findLimitedResources(quotaSummary);
  if (limitedResources.length > 1) {
    return t('portal.billing.package_status_multiple_label', {}, 'Multiple capacities need attention');
  }
  const limitedResource = limitedResources[0];
  if (limitedResource?.key === 'vector_documents') {
    return t('portal.billing.package_status_knowledge_label', {}, 'Text capacity needs attention');
  }
  if (limitedResource?.key === 'media_images') {
    return t('portal.billing.package_status_media_label', {}, 'Image capacity needs attention');
  }
  if (limitedResource?.key === 'active_sites' || limitedResource?.key === 'bound_sites') {
    return t('portal.billing.package_status_site_label', {}, 'Site limit exceeded');
  }
  if (limitedResource) {
    return t('portal.billing.package_status_capacity_label', {}, 'Package limit exceeded');
  }
  return t('common.ok', {}, 'OK');
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
  const packageStatus =
    !quotaSummary || error
      ? 'unknown'
      : String(quotaSummary.status) === 'limited'
      ? 'warning'
      : 'ok';
  const packageStatusLabel =
    packageStatus === 'warning'
      ? resolvePackageStatusLabel(quotaSummary, t)
      : t('common.ok', {}, 'OK');
  const creditNeedsAttention = quotaSummary?.ai_credits?.status === 'limited';
  const manageHref = creditNeedsAttention
    ? '/portal/account#package-options'
    : '/portal/account#package-options';

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        title={t('portal.billing.customer_title', {}, 'Package')}
        description={t('portal.billing.subtitle', {}, 'Review the account package, AI credits, and available account actions.')}
        currentPage="billing"
        primaryAction={
          packageStatus !== 'warning' ? (
            <Link href="/portal/account#package-options" className="btn btn-secondary btn-sm">
              {t('portal.billing.manage_title', {}, 'Manage package')}
            </Link>
          ) : null
        }
        metadata={(
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {t('portal.current_subscription_label', {}, 'Current package')}:
              </span>{' '}
              {packageLabel}
            </span>
            <span>
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {t('portal.usage.period_label', {}, 'Period')}:
              </span>{' '}
              {currentPeriodLabel}
            </span>
            {currentPeriodEndDetail ? <span>{currentPeriodEndDetail}</span> : null}
          </div>
        )}
        contextPanel={packageStatus === 'warning' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/75 px-4 py-3.5 dark:border-amber-900/70 dark:bg-amber-950/25">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-950 dark:text-white">{packageStatusLabel}</p>
                <details className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                  <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-200">
                    {t('portal.home.attention_details', {}, 'Details')}
                  </summary>
                  <p className="mt-1 leading-5">{resolvePackageStatusDetail(quotaSummary, packageLabel, t)}</p>
                </details>
              </div>
              <Link href={manageHref} className="btn btn-secondary btn-sm shrink-0">
                {creditNeedsAttention
                  ? t('portal.usage.credit_pack_buy_action', {}, 'Buy credits')
                  : t('portal.billing.upgrade_action', {}, 'Upgrade package')}
              </Link>
            </div>
          </div>
        ) : undefined}
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
        <PortalCard variant="portal" className="bg-white dark:bg-slate-950">
          <PortalEntitlementUsage
            quotaSummary={quotaSummary}
            t={t}
            locale={locale}
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
