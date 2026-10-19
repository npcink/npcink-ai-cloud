'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import { ApiError } from '@/lib/errors';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import {
  getPortalSiteUrl,
  getPortalSiteDisplayName,
  getVisiblePortalSites,
  portalSiteNeedsAttention,
} from '@/lib/portal-site-display';
import { formatNumber } from '@/lib/utils';
import {
  portalClient,
  type Entitlements,
} from '@/lib/portal-client';
import {
  PortalPageStack,
  PortalSection,
} from '@/components/portal/PortalScaffold';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalSitesWorkspace } from '@/components/portal/PortalSitesWorkspace';

type RestrictionItem = {
  id?: string;
  tone: 'warn' | 'info';
  label: string;
  detail: string;
  href?: string;
  action?: string;
};

type AccountEntitlementsState = 'idle' | 'loading' | 'loaded' | 'error';

type AccountEntitlementsError = {
  code: string;
  message: string;
};

export default function PortalPage() {
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated } = useSession();
  const [accountEntitlements, setAccountEntitlements] = useState<Entitlements | null>(null);
  const [accountEntitlementsState, setAccountEntitlementsState] =
    useState<AccountEntitlementsState>('idle');
  const [accountEntitlementsError, setAccountEntitlementsError] =
    useState<AccountEntitlementsError | null>(null);
  const [accountEntitlementsRetryVersion, setAccountEntitlementsRetryVersion] = useState(0);
  const contextSiteId = session?.selected_context?.site.site_id || '';
  const contextSiteIdRef = useRef(contextSiteId);
  const accountEntitlementsRequestVersionRef = useRef(0);

  useLayoutEffect(() => {
    contextSiteIdRef.current = contextSiteId;
    const requestVersion = ++accountEntitlementsRequestVersionRef.current;
    setAccountEntitlements(null);
    setAccountEntitlementsError(null);
    setAccountEntitlementsState('idle');
    if (!isAuthenticated) return;
    setAccountEntitlementsState('loading');

    void portalClient
      .getAccountEntitlements()
      .then((response) => {
        if (
          requestVersion === accountEntitlementsRequestVersionRef.current
          && contextSiteId === contextSiteIdRef.current
        ) {
          setAccountEntitlements(response.data);
          setAccountEntitlementsError(null);
          setAccountEntitlementsState('loaded');
        }
      })
      .catch((error) => {
        if (
          requestVersion === accountEntitlementsRequestVersionRef.current
          && contextSiteId === contextSiteIdRef.current
        ) {
          setAccountEntitlements(null);
          setAccountEntitlementsError({
            code: error instanceof ApiError ? error.errorCode : '',
            message: formatPortalErrorMessage(
              error,
              t,
              t(
                'portal.home.entitlements_failed_desc',
                {},
                'Package usage could not be loaded. Retry before relying on the service status.'
              )
            ),
          });
          setAccountEntitlementsState('error');
        }
      });

    return () => {
      if (requestVersion === accountEntitlementsRequestVersionRef.current) {
        accountEntitlementsRequestVersionRef.current += 1;
      }
    };
  }, [accountEntitlementsRetryVersion, contextSiteId, isAuthenticated, t]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-4xl">⏳</div>
          <p className="text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="mb-4 text-2xl font-bold">{t('auth.not_signed_in')}</h2>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{t('auth.please_sign_in')}</p>
          <Link href="/portal/login" className="btn btn-primary">
            {t('nav.sign_in')}
          </Link>
        </div>
      </div>
    );
  }

  const visibleSites = getVisiblePortalSites(session.sites);
  const hasVisibleSites = visibleSites.length > 0;
  const currentSubscription = accountEntitlements?.current_subscription
    || session.selected_context?.current_subscription
    || null;
  const isFreePackage = currentSubscription?.plan_kind === 'default_free'
    || currentSubscription?.plan_id === 'free';
  const currentPackageDisplay = resolveCustomerPackageDisplay(t, {
    planId: currentSubscription?.plan_id,
    planVersionId: currentSubscription?.plan_version_id,
    packageAlias: currentSubscription?.package_alias,
    planKind: currentSubscription?.plan_kind,
    coverageState: currentSubscription ? 'covered' : 'uncovered',
  });
  const restrictedCount = visibleSites.filter((site) => portalSiteNeedsAttention(site)).length;
  const hasPackageLabel = currentPackageDisplay.coverage_state === 'covered'
    && Boolean(currentPackageDisplay.display_package_label);
  const restrictionItems: RestrictionItem[] = visibleSites
    .filter((site) => portalSiteNeedsAttention(site))
    .map((site) => ({
      id: site.site_id,
      tone: 'warn',
      label: t('portal.home.site_issue_title', { site: getPortalSiteDisplayName(site) }),
      detail: site.status === 'active' && !getPortalSiteUrl(site)
        ? t('portal.home.site_address_issue')
        : site.status === 'suspended'
          ? t('portal.home.site_suspended_issue')
          : site.status === 'provisioning'
            ? t('portal.home.site_connecting_issue')
            : t('portal.home.site_inactive_issue'),
      href: `/portal/sites/${encodeURIComponent(site.site_id)}#service-status`,
      action: t('portal.site_record', {}, 'View site'),
    }));
  if (currentSubscription?.status && currentSubscription.status !== 'active') {
    restrictionItems.unshift({
      id: 'package',
      tone: 'warn',
      label: t('portal.home.restriction_plan_label'),
      detail: t('portal.home.restriction_plan_desc'),
      href: '/portal/billing',
      action: t('portal.home.billing_action'),
    });
  }
  const currentSubscriptionStatusLabel = currentSubscription?.status === 'active' || hasPackageLabel
      ? t('portal.home.package_available_label', {}, 'Available')
      : t('portal.home.package_pending_label', {}, 'To confirm');
  const remainingCredits = Number(accountEntitlements?.quota_summary?.ai_credits?.total_remaining ?? accountEntitlements?.quota_summary?.ai_credits?.remaining ?? 0);
  const accountEntitlementsUnavailable = accountEntitlementsState === 'error';
  const accountEntitlementsPending = (
    accountEntitlementsState === 'idle' || accountEntitlementsState === 'loading'
  );
  const creditUnavailable =
    String(accountEntitlements?.quota_summary?.ai_credits?.status || '') === 'limited';
  const overLimitResources = (accountEntitlements?.quota_summary?.resource_limits || []).filter((resource) => (
      !resource.unlimited
      && Number(resource.limit || 0) > 0
      && (Number(resource.used || 0) > Number(resource.limit || 0)
        || ((resource.key === 'vector_documents' || resource.key === 'media_images') && resource.status === 'limited'))
    ));
  const overLimitResource = overLimitResources[0];
  const resourceOverLimit = Boolean(overLimitResource);
  const currentServiceStatusToken = restrictedCount > 0 ||
    creditUnavailable ||
    resourceOverLimit ||
    accountEntitlementsState !== 'loaded' ||
    (currentSubscription?.status && currentSubscription.status !== 'active')
      ? 'warning'
      : 'active';
  let currentServiceStatusLabel = t('portal.home.service_status_attention', {}, 'Needs attention');
  if (currentServiceStatusToken === 'active') {
    currentServiceStatusLabel = t('portal.home.service_status_live', {}, 'Ready');
  } else if (creditUnavailable) {
    currentServiceStatusLabel = t('portal.home.credit_attention_label', {}, 'AI credits unavailable');
  } else if (resourceOverLimit) {
    const labels: Record<string, string> = {
      vector_documents: t('portal.home.knowledge_attention_label', {}, 'Text capacity needs attention'),
      media_images: t('portal.home.media_attention_label', {}, 'Image capacity needs attention'),
      active_sites: t('portal.home.site_capacity_attention_label', {}, 'Site capacity exceeded'),
      bound_sites: t('portal.home.site_capacity_attention_label', {}, 'Site capacity exceeded'),
    };
    currentServiceStatusLabel = overLimitResources.length > 1
      ? t('portal.billing.package_status_multiple_label', {}, 'Multiple capacities need attention')
      : labels[String(overLimitResource?.key || '')] || t('portal.home.capacity_attention_label', {}, 'Package limit exceeded');
  }
  const operationSummaryItems = [
    {
      label: t('portal.home.package_card_label', {}, 'Current package'),
      value: currentSubscription
        ? currentPackageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm')
        : t('portal.home.package_pending_label', {}, 'To confirm'),
      detail: currentSubscriptionStatusLabel,
      size: 'compact' as const,
    },
    {
      label: t('portal.usage.total_remaining_label', {}, 'Available AI credits'),
      value: accountEntitlementsUnavailable ? (
        <button
          type="button"
          className="text-left text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
          onClick={() => setAccountEntitlementsRetryVersion((current) => current + 1)}
        >
          {t('portal.home.entitlements_retry', {}, 'Unavailable · Retry')}
        </button>
      ) : accountEntitlementsPending ? (
        t('common.loading')
      ) : (
        formatNumber(remainingCredits)
      ),
      detail: accountEntitlementsUnavailable
        ? t(
            'portal.home.entitlements_failed_desc',
            {},
            'Package usage could not be loaded. Retry before relying on the service status.'
          )
        : t('portal.home.account_points_detail', {}, 'Available package and paid AI credits in this account.'),
      size: 'compact' as const,
    },
    {
      label: t('portal.home.site_connection_status_label', {}, 'Site connection status'),
      value: visibleSites.length
        ? restrictedCount > 0
          ? t('portal.home.site_connection_attention_value', { count: String(restrictedCount) }, `${restrictedCount} need attention`)
          : t('portal.home.site_connection_ready_value', { count: String(visibleSites.length) }, `${visibleSites.length} connected`)
        : t('portal.home.site_connection_none_value', {}, 'Not connected'),
      detail: visibleSites.length
        ? restrictedCount > 0
          ? t('portal.home.site_status_attention_detail', { count: String(restrictedCount) }, `${restrictedCount} sites need attention.`)
          : t('portal.home.site_status_ready_detail', {}, 'All connected sites look ready.')
        : t('portal.home.connect_summary'),
      size: 'compact' as const,
    },
  ];
  const operationFocusItems: RestrictionItem[] = [
    ...(accountEntitlementsUnavailable
      ? [{
          tone: 'warn' as const,
          label: accountEntitlementsError?.code === 'commercial.quota_exceeded'
            ? t('portal.home.credit_attention_title', {}, 'AI credits need attention')
            : t('portal.home.entitlements_failed_title', {}, 'Package usage is unavailable'),
          detail: accountEntitlementsError?.message || t(
              'portal.home.entitlements_failed_desc',
              {},
              'Package usage could not be loaded. Retry before relying on the service status.'
            ),
          href: accountEntitlementsError?.code === 'commercial.quota_exceeded'
            ? '/portal/usage'
            : accountEntitlementsError?.code === 'service.entitlements_temporarily_unavailable'
              ? '/portal/support?new=1&topic=account'
              : undefined,
          action: accountEntitlementsError?.code === 'commercial.quota_exceeded'
            ? t('error.portal_recovery_review_account_quota', {}, 'Review account usage')
            : accountEntitlementsError?.code === 'service.entitlements_temporarily_unavailable'
              ? t('error.portal_recovery_contact_support', {}, 'Contact support')
              : undefined,
        }]
      : []),
    ...(creditUnavailable
      ? [{
          tone: 'warn' as const,
          label: t('portal.home.credit_attention_title', {}, 'AI credits need attention'),
          detail: isFreePackage ? t(
            'portal.home.free_credit_attention_desc',
            {},
            'The Free credits for this period have been used. Review usage and the next period date.'
          ) : t(
            'portal.home.credit_attention_desc',
            {},
            'The current package has no AI credits available. Buy AI credits or change the package before continuing.'
          ),
          href: isFreePackage ? '/portal/usage' : '/portal/billing#package-options',
          action: isFreePackage
            ? t('portal.home.usage_action', {}, 'View usage')
            : t('portal.home.billing_action', {}, 'Review package'),
        }]
      : []),
    ...overLimitResources.map((resource) => {
      const labels: Record<string, string> = {
        vector_documents: t('portal.usage.resource_vector_documents', {}, 'Text knowledge capacity'),
        media_images: t('portal.usage.resource_media_images', {}, 'Image knowledge capacity'),
        active_sites: t('portal.home.active_site_capacity_label', {}, 'Active site capacity'),
        bound_sites: t('portal.usage.resource_bound_sites', {}, 'Bound sites'),
      };
      const resourceLabel = labels[String(resource.key || '')] || t('portal.home.package_capacity_label', {}, 'Package capacity');
      const params = {
        resource: resourceLabel,
        used: formatNumber(Number(resource.used || 0)),
        limit: formatNumber(Number(resource.limit || 0)),
        exceeded: formatNumber(Math.max(0, Number(resource.used || 0) - Number(resource.limit || 0))),
      };
      const label = t('portal.home.capacity_attention_title', { resource: resourceLabel }, `${resourceLabel} needs attention`);
      let detail = t('portal.home.capacity_attention_desc', params, `${resourceLabel} usage is ${params.used} of ${params.limit}.`);
      if (resource.key === 'vector_documents') {
        detail = t('portal.home.text_capacity_attention_desc', params, `Text knowledge usage is ${params.used} of ${params.limit}. New text indexing is paused; existing entries remain usable and updatable.`);
      } else if (resource.key === 'media_images') {
        detail = t('portal.home.media_capacity_attention_desc', params, `Image knowledge usage is ${params.used} of ${params.limit}. New image indexing is paused; existing images remain usable and refreshable.`);
      }
      return {
        id: resource.key,
        tone: 'warn' as const,
        label,
        detail,
        href: '/portal/billing#package-options',
        action: t('portal.home.billing_action', {}, 'Review package'),
      };
    }),
    ...restrictionItems,
  ];
  const showAccountSummary = true;
  const primaryOperationFocusItem = operationFocusItems[0] || null;
  const remainingOperationFocusItems = operationFocusItems.slice(1);
  const homeState = primaryOperationFocusItem ? 'attention' : hasVisibleSites ? 'daily' : 'setup';

  return (
    <PortalPageStack>
      <section className="space-y-5" data-portal-home="operation-overview" data-portal-home-state={homeState}>
        <PortalWorkspaceHeader
          title={t('portal.home.title', {}, 'My service')}
          description={homeState === 'setup' ? t('portal.home.setup_desc') : homeState === 'attention' ? t('portal.home.attention_desc') : t('portal.home.daily_desc')}
          currentPage="home"
          titleAccessory={!primaryOperationFocusItem ? (
            <PortalStatusBadge
              status={accountEntitlementsPending || !hasVisibleSites ? 'neutral' : currentServiceStatusToken}
              label={accountEntitlementsPending
                ? t('common.loading')
                : !hasVisibleSites
                  ? t('portal.home.site_connection_none_value')
                  : currentServiceStatusLabel}
            />
          ) : null}
          contextPanel={primaryOperationFocusItem ? (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50/75 p-4 dark:border-amber-900/70 dark:bg-amber-950/25"
              data-portal-home="current-focus"
            >
              <h2 className="text-base font-semibold text-gray-950 dark:text-white">
                {primaryOperationFocusItem.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                {primaryOperationFocusItem.detail}
              </p>
              {primaryOperationFocusItem.href && primaryOperationFocusItem.action ? (
                <Link href={primaryOperationFocusItem.href} className="btn btn-primary mt-3">
                  {primaryOperationFocusItem.action}
                </Link>
              ) : null}
            </div>
          ) : null}
          actions={homeState === 'setup' ? (
            <Link href="#connection-guide" className="btn btn-primary">
              {t('portal.home.connect_action')}
            </Link>
          ) : null}
          metrics={showAccountSummary ? operationSummaryItems : []}
          metricsColumnsClassName="md:grid-cols-3"
        />
        {remainingOperationFocusItems.length > 0 ? (
          <PortalSection variant="portal">
            <details data-portal-home="additional-focus">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t('portal.home.other_issues', { count: String(remainingOperationFocusItems.length) })}
              </summary>
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {remainingOperationFocusItems.map((item) => (
                  <div key={item.id || item.label} className="py-3 first:pt-0 last:pb-0">
                    <h3 className="font-semibold text-slate-950 dark:text-white">{item.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.detail}</p>
                    {item.href && item.action ? (
                      <Link href={item.href} className="mt-2 inline-flex text-sm font-semibold text-blue-700 underline underline-offset-4 dark:text-blue-300">
                        {item.action}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          </PortalSection>
        ) : null}
      </section>
      <PortalSitesWorkspace />
    </PortalPageStack>
  );
}
