'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import {
  getPortalSiteUrl,
  getVisiblePortalSites,
  portalSiteNeedsAttention,
} from '@/lib/portal-site-display';
import { cn, formatNumber } from '@/lib/utils';
import {
  portalClient,
  type Entitlements,
} from '@/lib/portal-client';
import {
  PortalPageStack,
  PortalSection,
  PortalCard,
} from '@/components/portal/PortalScaffold';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalTag } from '@/components/portal/PortalTag';
import { PortalSitesWorkspace } from '@/components/portal/PortalSitesWorkspace';

type RestrictionItem = {
  tone: 'warn' | 'info';
  label: string;
  detail: string;
  href?: string;
  action?: string;
};

type AccountEntitlementsState = 'idle' | 'loading' | 'loaded' | 'error';

function buildRestrictionItems({
  t,
  siteStatus,
  subscriptionStatus,
}: {
  t: (key: string, params?: Record<string, string>, fallback?: string) => string;
  siteStatus: string;
  subscriptionStatus: string;
}): RestrictionItem[] {
  return [
    siteStatus !== 'active'
      ? {
          tone: 'warn',
          label: t('portal.home.restriction_setup_label', {}, 'Site setup still needs attention'),
          detail: t(
            'portal.home.restriction_setup_desc',
            {},
            'This site is not active yet. Connect or reactivate the WordPress site to enable hosted service access.'
          ),
        }
      : null,
    subscriptionStatus && subscriptionStatus !== 'active'
      ? {
          tone: 'warn',
          label: t('portal.home.restriction_plan_label', {}, 'Current plan is not fully active'),
          detail: t(
            'portal.home.restriction_plan_desc',
            {},
            'Open Package to review the current account package state.'
          ),
        }
      : null,
  ].filter(Boolean) as RestrictionItem[];
}

export default function PortalPage() {
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated } = useSession();
  const [accountEntitlements, setAccountEntitlements] = useState<Entitlements | null>(null);
  const [accountEntitlementsState, setAccountEntitlementsState] =
    useState<AccountEntitlementsState>('idle');
  const [accountEntitlementsRetryVersion, setAccountEntitlementsRetryVersion] = useState(0);
  const contextSiteId = session?.selected_context?.site.site_id || '';
  const contextSiteIdRef = useRef(contextSiteId);
  const accountEntitlementsRequestVersionRef = useRef(0);

  useLayoutEffect(() => {
    contextSiteIdRef.current = contextSiteId;
    const requestVersion = ++accountEntitlementsRequestVersionRef.current;
    setAccountEntitlements(null);
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
          setAccountEntitlementsState('loaded');
        }
      })
      .catch(() => {
        if (
          requestVersion === accountEntitlementsRequestVersionRef.current
          && contextSiteId === contextSiteIdRef.current
        ) {
          setAccountEntitlements(null);
          setAccountEntitlementsState('error');
        }
      });

    return () => {
      if (requestVersion === accountEntitlementsRequestVersionRef.current) {
        accountEntitlementsRequestVersionRef.current += 1;
      }
    };
  }, [accountEntitlementsRetryVersion, contextSiteId, isAuthenticated]);

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
  const selectedSite = session.selected_context?.site || null;
  const hasVisibleSites = visibleSites.length > 0;
  const hasSelectedSite = Boolean(selectedSite);
  const currentSubscription = accountEntitlements?.current_subscription
    || session.selected_context?.current_subscription
    || null;
  const selectedSiteUrl = selectedSite ? getPortalSiteUrl(selectedSite) : '';
  const currentPackageDisplay = resolveCustomerPackageDisplay(t, {
    planId: currentSubscription?.plan_id,
    planVersionId: currentSubscription?.plan_version_id,
    packageAlias: currentSubscription?.package_alias,
    planKind: currentSubscription?.plan_kind,
    coverageState: currentSubscription ? 'covered' : 'uncovered',
  });
  const restrictionItems = selectedSite
    ? buildRestrictionItems({
        t,
        siteStatus: selectedSite.status,
        subscriptionStatus: currentSubscription?.status || '',
      })
    : hasVisibleSites
      ? []
    : [
        {
          tone: 'warn' as const,
          label: t('portal.home.restriction_setup_label', {}, 'Site setup still needs attention'),
          detail: t(
            'portal.home.no_sites_empty_desc',
            {},
            'Open npcink-cloud-addon in WordPress and start the connection there. After binding, this page will show your package, usage, and site status.'
          ),
        },
      ];
  const restrictedCount = visibleSites.filter((site) => portalSiteNeedsAttention(site)).length;
  const hasPackageLabel = currentPackageDisplay.coverage_state === 'covered'
    && Boolean(currentPackageDisplay.display_package_label);
  const selectedSiteRecordHref = selectedSite
    ? `/portal/sites/${encodeURIComponent(selectedSite.site_id)}#service-status`
    : '/portal#sites';
  const isSelectedSiteConnected =
    Boolean(selectedSite) &&
    selectedSite?.status === 'active' &&
    Boolean(selectedSiteUrl);
  const setupChecklistItems = [
    {
      key: 'site',
      done: isSelectedSiteConnected,
      title: !selectedSite && hasVisibleSites
        ? t('portal.home.choose_site_record_title', {}, 'Choose a site record')
        : t('portal.home.onboarding_site_title', {}, 'Confirm site connection'),
      detail: !selectedSite && hasVisibleSites
        ? t(
            'portal.home.choose_site_record_desc',
            {},
            'Choose a site only when you want to inspect its connection status. Account service details remain available without a site selection.'
          )
        : isSelectedSiteConnected
        ? t('portal.home.onboarding_site_ready', {}, 'The WordPress site is connected and can use the service.')
        : t('portal.home.onboarding_site_needed', {}, 'Open the WordPress plugin to reconnect the site if the address or service connection is not ready.'),
      href: selectedSiteRecordHref,
      action: t('portal.home.onboarding_site_action', {}, 'View site'),
    },
    ...(isSelectedSiteConnected
      ? [{
          key: 'package',
          done: Boolean(currentSubscription?.status === 'active' || hasPackageLabel),
          title: t('portal.home.onboarding_package_title', {}, 'Review Free package'),
          detail:
            currentSubscription?.status === 'active'
              ? t('portal.home.onboarding_package_ready', {}, 'The current package is available.')
              : t('portal.home.onboarding_package_needed', {}, 'Review the current package and what remains this period.'),
          href: '/portal/billing',
          action: t('portal.home.onboarding_package_action', {}, 'View package'),
        }]
      : []),
  ];
  const requiredAttentionItems = setupChecklistItems.filter((item) => !item.done);
  const shouldShowOnboardingChecklist = requiredAttentionItems.length > 0
    && (hasSelectedSite || !hasVisibleSites);
  const currentSubscriptionStatusLabel = currentSubscription?.status === 'active' || hasPackageLabel
      ? t('portal.home.package_available_label', {}, 'Available')
      : t('portal.home.package_pending_label', {}, 'To confirm');
  const remainingCredits = Number(accountEntitlements?.quota_summary?.ai_credits?.remaining ?? 0);
  const accountEntitlementsUnavailable = accountEntitlementsState === 'error';
  const accountEntitlementsPending = (
    accountEntitlementsState === 'idle' || accountEntitlementsState === 'loading'
  );
  const creditUnavailable =
    String(accountEntitlements?.quota_summary?.ai_credits?.status || '') === 'limited';
  const overLimitResource = accountEntitlements?.quota_summary?.resource_limits?.find((resource) => (
      !resource.unlimited
      && Number(resource.limit || 0) > 0
      && Number(resource.used || 0) > Number(resource.limit || 0)
    ));
  const resourceOverLimit = Boolean(overLimitResource);
  const overLimitResourceLabel = overLimitResource?.key === 'vector_documents'
    ? t('portal.usage.resource_vector_documents', {}, 'Knowledge articles')
    : overLimitResource?.key === 'active_sites'
      ? t('portal.home.active_site_capacity_label', {}, 'Active site capacity')
    : overLimitResource?.key === 'bound_sites'
      ? t('portal.usage.resource_bound_sites', {}, 'Bound sites')
      : t('portal.home.package_capacity_label', {}, 'Package capacity');
  const overLimitResourceAmount = overLimitResource
    ? Math.max(0, Number(overLimitResource.used || 0) - Number(overLimitResource.limit || 0))
    : 0;
  const currentServiceStatusToken = restrictedCount > 0 ||
    creditUnavailable ||
    resourceOverLimit ||
    accountEntitlementsState !== 'loaded' ||
    (currentSubscription?.status && currentSubscription.status !== 'active')
      ? 'warning'
      : 'active';
  const currentServiceStatusLabel =
    currentServiceStatusToken === 'active'
      ? t('portal.home.service_status_live', {}, 'Ready')
      : creditUnavailable
        ? t('portal.home.credit_attention_label', {}, 'AI credits unavailable')
        : resourceOverLimit
          ? overLimitResource?.key === 'vector_documents'
            ? t('portal.home.knowledge_attention_label', {}, 'Knowledge limit exceeded')
            : overLimitResource?.key === 'active_sites' || overLimitResource?.key === 'bound_sites'
              ? t('portal.home.site_capacity_attention_label', {}, 'Site capacity exceeded')
              : t('portal.home.capacity_attention_label', {}, 'Package limit exceeded')
      : t('portal.home.service_status_attention', {}, 'Needs attention');
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
      label: t('portal.usage.remaining_ai_credits', {}, 'Remaining'),
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
        : t('portal.home.account_points_detail', {}, 'Account package AI credits remaining this period.'),
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
        : t('portal.home.no_sites_empty_desc', {}, 'Open npcink-cloud-addon in WordPress and start the connection there.'),
      size: 'compact' as const,
    },
  ];
  const operationFocusItems = [
    ...restrictionItems,
    ...(creditUnavailable
      ? [{
          tone: 'warn' as const,
          label: t('portal.home.credit_attention_title', {}, 'AI credits need attention'),
          detail: t(
            'portal.home.credit_attention_desc',
            {},
            'The current package has no AI credits available. Buy AI credits or change the package before continuing.'
          ),
          href: '/portal/billing#package-options',
          action: t('portal.home.billing_action', {}, 'Review package'),
        }]
      : []),
    ...(overLimitResource
      ? [{
          tone: 'warn' as const,
          label: t(
            'portal.home.capacity_attention_title',
            { resource: overLimitResourceLabel },
            `${overLimitResourceLabel} exceeds the package limit`
          ),
          detail: t(
            'portal.home.capacity_attention_desc',
            {
              resource: overLimitResourceLabel,
              used: formatNumber(Number(overLimitResource.used || 0)),
              limit: formatNumber(Number(overLimitResource.limit || 0)),
              exceeded: formatNumber(overLimitResourceAmount),
            },
            `${overLimitResourceLabel} usage is ${formatNumber(Number(overLimitResource.used || 0))} of ${formatNumber(Number(overLimitResource.limit || 0))}, exceeding the package by ${formatNumber(overLimitResourceAmount)}.`
          ),
          href: '/portal/billing#package-options',
          action: t('portal.home.billing_action', {}, 'Review package'),
        }]
      : []),
    ...(accountEntitlementsUnavailable
      ? [{
          tone: 'warn' as const,
          label: t('portal.home.entitlements_failed_title', {}, 'Package usage is unavailable'),
          detail: t(
            'portal.home.entitlements_failed_desc',
            {},
            'Package usage could not be loaded. Retry before relying on the service status.'
          ),
        }]
      : []),
  ];
  const showAccountSummary = true;
  const primaryOperationFocusItem = operationFocusItems[0] || null;
  const remainingOperationFocusItems = operationFocusItems.slice(1);
  const shouldShowFollowUpSection =
    remainingOperationFocusItems.length > 0 || shouldShowOnboardingChecklist;
  const showBothFollowUpPanels =
    remainingOperationFocusItems.length > 0 && shouldShowOnboardingChecklist;

  return (
    <PortalPageStack>
      <section className="space-y-5" data-portal-home="operation-overview">
        <PortalWorkspaceHeader
          title={t('portal.home.title', {}, 'My service')}
          description={currentServiceStatusToken === 'active'
            ? t('portal.home.account_status_ok_desc', {}, 'This account can use the hosted service normally.')
            : t('portal.home.account_status_issue_desc', {}, 'This account has setup, package, site, or support items that need attention.')}
          currentPage="home"
          titleAccessory={!primaryOperationFocusItem ? (
            <PortalStatusBadge
              status={currentServiceStatusToken}
              label={currentServiceStatusLabel}
              className="shrink-0 text-[0.68rem]"
            />
          ) : null}
          contextPanel={primaryOperationFocusItem ? (
            <div
              className={cn(
                'rounded-xl border px-4 py-3.5',
                primaryOperationFocusItem.tone === 'warn'
                  ? 'border-amber-200 bg-amber-50/75 dark:border-amber-900/70 dark:bg-amber-950/25'
                  : 'border-slate-200/80 bg-white/75 dark:border-slate-800 dark:bg-slate-950/55'
              )}
              data-portal-home="current-focus"
            >
              <p className="text-sm font-semibold text-gray-950 dark:text-white">
                {primaryOperationFocusItem.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                {primaryOperationFocusItem.detail}
              </p>
              {primaryOperationFocusItem.href && primaryOperationFocusItem.action ? (
                <Link
                  href={primaryOperationFocusItem.href}
                  className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  {primaryOperationFocusItem.action}
                </Link>
              ) : null}
            </div>
          ) : null}
          metrics={showAccountSummary ? operationSummaryItems : []}
          metricsColumnsClassName="md:grid-cols-3"
        />

        {shouldShowFollowUpSection ? (
          <PortalSection
            variant="portal"
            className={cn(!showBothFollowUpPanels && 'xl:max-w-3xl')}
          >
            <div
              className={cn(
                'grid items-start gap-4',
                showBothFollowUpPanels && 'xl:grid-cols-[1.1fr_0.9fr]'
              )}
            >
              {remainingOperationFocusItems.length > 0 ? (
                <PortalCard className="bg-white/70 dark:bg-slate-950/35" variant="portal" data-portal-home="additional-focus">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                        {t('common.status')}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
                        {t('portal.home.current_status_title', {}, 'Service status')}
                      </h2>
                    </div>
                    <PortalTag tone={currentServiceStatusToken === 'active' ? 'success' : 'warning'}>
                      {currentServiceStatusLabel}
                    </PortalTag>
                  </div>
                  <div className="mt-4 space-y-3">
                    {remainingOperationFocusItems.slice(0, 3).map((item) => (
                      <div
                        key={item.label}
                        className={cn(
                          'rounded-xl border px-3 py-3',
                          item.tone === 'warn'
                            ? 'border-amber-200 bg-amber-50/75 dark:border-amber-900/70 dark:bg-amber-950/25'
                            : 'border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/35'
                        )}
                      >
                        <p className="text-sm font-semibold text-gray-950 dark:text-white">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{item.detail}</p>
                        {item.href && item.action ? (
                          <Link
                            href={item.href}
                            className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                          >
                            {item.action}
                          </Link>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </PortalCard>
              ) : null}

              {shouldShowOnboardingChecklist ? (
                <PortalCard className="bg-white/70 dark:bg-slate-950/35" variant="portal" data-portal-home="setup-checklist">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                        {t('portal.home.onboarding_label', {}, 'Needs attention')}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
                        {t('portal.home.onboarding_title', {}, 'Before you continue')}
                      </h2>
                    </div>
                    <PortalTag tone="warning">
                      {requiredAttentionItems.length} {t('portal.home.filter_attention_only', {}, 'Needs attention')}
                    </PortalTag>
                  </div>
                  <div className="mt-4 divide-y divide-slate-200/80 dark:divide-slate-800">
                    {requiredAttentionItems.map((item, index) => (
                      <Link
                        key={item.key}
                        href={item.href}
                        className="group flex gap-3 py-3 text-sm transition first:pt-0 last:pb-0 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[0.68rem] font-semibold',
                            'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-200'
                          )}
                        >
                          {String(index + 1)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-950 dark:text-white">{item.title}</span>
                          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {item.detail}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </PortalCard>
              ) : null}
            </div>
          </PortalSection>
        ) : null}
      </section>

      <PortalSitesWorkspace />
    </PortalPageStack>
  );
}
