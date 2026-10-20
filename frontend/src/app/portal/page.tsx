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
import { PortalPageStack } from '@/components/portal/PortalScaffold';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalSitesWorkspace } from '@/components/portal/PortalSitesWorkspace';
import { PortalLoadingState } from '@/components/portal/PortalPageState';

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
    return <PortalLoadingState message={t('common.loading')} />;
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
  const isFreePackage = currentSubscription?.plan_kind === 'default_free'
    || currentSubscription?.plan_id === 'free';
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
            'Open npcink-cloud-addon in WordPress and start the connection there. Account package and credits are shown separately; binding adds site status and service access.'
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
      title: !hasVisibleSites
        ? t('portal.home.onboarding_first_site_title', {}, 'Connect your first WordPress site')
        : !selectedSite && hasVisibleSites
        ? t('portal.home.choose_site_record_title', {}, 'Choose a site record')
        : t('portal.home.onboarding_site_title', {}, 'Confirm site connection'),
      detail: !hasVisibleSites
        ? t(
            'portal.home.onboarding_first_site_desc',
            {},
            '1. Open npcink-cloud-addon in WordPress. 2. Start the connection from the addon. 3. Return here to confirm the connected site. Account entitlement is shown separately.'
          )
        : !selectedSite && hasVisibleSites
        ? t(
            'portal.home.choose_site_record_desc',
            {},
            'Choose a site only when you want to inspect its connection status. Account service details remain available without a site selection.'
          )
        : isSelectedSiteConnected
        ? t('portal.home.onboarding_site_ready', {}, 'The WordPress site is connected and can use the service.')
        : t('portal.home.onboarding_site_needed', {}, 'Open the WordPress plugin to reconnect the site if the address or service connection is not ready.'),
      href: !hasVisibleSites ? '#sites' : selectedSiteRecordHref,
      action: !hasVisibleSites
        ? t('portal.home.onboarding_first_site_action', {}, 'Open connection guide')
        : t('portal.home.onboarding_site_action', {}, 'View site'),
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
  // Avoid a second "connect site" panel when the header focus banner already
  // carries the same setup restriction (no sites / site not ready).
  const checklistDuplicatesHeaderFocus =
    restrictionItems.length > 0
    && requiredAttentionItems.length > 0
    && requiredAttentionItems.every((item) => item.key === 'site');
  const shouldShowOnboardingChecklist = requiredAttentionItems.length > 0
    && (hasSelectedSite || !hasVisibleSites)
    && !checklistDuplicatesHeaderFocus;
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

  const metricIconClass = 'h-4 w-4';
  const packageMetricIcon = (
    <svg className={metricIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M3 8.5 12 14l9-5.5" />
      <path d="M12 14v7" />
    </svg>
  );
  const creditsMetricIcon = (
    <svg className={metricIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8" />
      <path d="M9.5 10.5c.5-.8 1.4-1.2 2.5-1.2 1.4 0 2.5.8 2.5 2s-1.1 2-2.5 2c-1.1 0-2 .4-2.5 1.2" />
    </svg>
  );
  const sitesMetricIcon = (
    <svg className={metricIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
  const operationSummaryItems = [
    {
      label: t('portal.home.package_card_label', {}, 'Current package'),
      icon: packageMetricIcon,
      value: currentSubscription
        ? currentPackageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm')
        : t('portal.home.package_pending_label', {}, 'To confirm'),
      detail: currentSubscriptionStatusLabel,
      size: 'compact' as const,
    },
    {
      label: t('portal.usage.total_remaining_label', {}, 'Available AI credits'),
      icon: creditsMetricIcon,
      value: accountEntitlementsUnavailable ? (
        <button
          type="button"
          className="text-left text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-800 disabled:cursor-wait disabled:opacity-70 dark:text-blue-300 dark:hover:text-blue-200"
          disabled={accountEntitlementsPending}
          onClick={() => setAccountEntitlementsRetryVersion((current) => current + 1)}
        >
          {accountEntitlementsPending
            ? t('portal.retry.refetching_entitlements', {}, 'Fetching usage…')
            : t('portal.home.entitlements_retry', {}, 'Unavailable · Refetch usage')}
        </button>
      ) : accountEntitlementsPending ? (
        accountEntitlementsRetryVersion > 0
          ? t('portal.retry.refetching_entitlements', {}, 'Fetching usage…')
          : t('common.loading')
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
      icon: sitesMetricIcon,
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
  const operationFocusItems: RestrictionItem[] = [
    ...restrictionItems,
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
          href: isFreePackage ? '/portal/usage' : '/portal/account#package-options',
          action: isFreePackage
            ? t('portal.home.usage_action', {}, 'View usage')
            : t('portal.home.billing_action', {}, 'Review package'),
        }]
      : []),
    ...(overLimitResources.length > 0
      ? (() => {
          const labels: Record<string, string> = {
            vector_documents: t('portal.usage.resource_vector_documents', {}, 'Text knowledge capacity'),
            media_images: t('portal.usage.resource_media_images', {}, 'Image knowledge capacity'),
            active_sites: t('portal.home.active_site_capacity_label', {}, 'Active site capacity'),
            bound_sites: t('portal.usage.resource_bound_sites', {}, 'Bound sites'),
          };
          const buildResourceDetail = (resource: (typeof overLimitResources)[number]) => {
            const resourceLabel = labels[String(resource.key || '')] || t('portal.home.package_capacity_label', {}, 'Package capacity');
            const params = {
              resource: resourceLabel,
              used: formatNumber(Number(resource.used || 0)),
              limit: formatNumber(Number(resource.limit || 0)),
              exceeded: formatNumber(Math.max(0, Number(resource.used || 0) - Number(resource.limit || 0))),
            };
            if (resource.key === 'vector_documents') {
              return t('portal.home.text_capacity_attention_desc', params, `Text knowledge usage is ${params.used} of ${params.limit}. New text indexing is paused; existing entries remain usable and updatable.`);
            }
            if (resource.key === 'media_images') {
              return t('portal.home.media_capacity_attention_desc', params, `Image knowledge usage is ${params.used} of ${params.limit}. New image indexing is paused; existing images remain usable and refreshable.`);
            }
            return t('portal.home.capacity_attention_desc', params, `${resourceLabel} usage is ${params.used} of ${params.limit}.`);
          };
          if (overLimitResources.length === 1) {
            const resource = overLimitResources[0];
            const resourceLabel = labels[String(resource.key || '')] || t('portal.home.package_capacity_label', {}, 'Package capacity');
            return [{
              id: resource.key,
              tone: 'warn' as const,
              label: t('portal.home.capacity_attention_title', { resource: resourceLabel }, `${resourceLabel} needs attention`),
              detail: buildResourceDetail(resource),
              href: '/portal/account#package-options',
              action: t('portal.home.billing_action', {}, 'Review package'),
            }];
          }
          return [{
            id: 'capacity-summary',
            tone: 'warn' as const,
            label: t('portal.billing.package_status_multiple_label', {}, 'Multiple capacities need attention'),
            detail: overLimitResources.map(buildResourceDetail).join(' '),
            href: '/portal/account#package-options',
            action: t('portal.home.billing_action', {}, 'Review package'),
          }];
        })()
      : []),
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
  ];
  const showAccountSummary = true;
  // Capacity alerts live inside My Sites (not floating between header and sites).
  const capacityAttentionIds = new Set(['capacity-summary', 'vector_documents', 'media_images', 'active_sites', 'bound_sites']);
  const capacityAttentionItems = operationFocusItems.filter((item) => capacityAttentionIds.has(String(item.id || '')));
  const attentionFocusItems = operationFocusItems.filter((item) => !capacityAttentionIds.has(String(item.id || '')));
  const shouldShowFollowUpSection =
    attentionFocusItems.length > 0 || shouldShowOnboardingChecklist;

  return (
    <PortalPageStack className="space-y-3" data-portal-home="page">
      <section className="space-y-3" data-portal-home="operation-overview">
        <PortalWorkspaceHeader
          title={t('portal.home.title', {}, 'My service')}
          currentPage="home"
          titleAccessory={attentionFocusItems.length === 0 && capacityAttentionItems.length === 0 ? (
            <PortalStatusBadge
              status={currentServiceStatusToken}
              label={currentServiceStatusLabel}
              className="shrink-0 text-[0.68rem]"
            />
          ) : null}
          metrics={showAccountSummary ? operationSummaryItems : []}
          metricsLayout="rail"
          metricsPlacement="title-end"
        />

        {shouldShowFollowUpSection ? (
          <div className="flex w-full flex-col items-start gap-2" data-portal-home="follow-up">
              {attentionFocusItems.length > 0 ? (
                <div
                  className="w-fit max-w-full overflow-hidden rounded-xl border border-amber-200/90 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
                  data-portal-home="attention-focus"
                >
                  <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/50" data-portal-home="attention-list">
                    {attentionFocusItems.slice(0, 4).map((item) => (
                      <li
                        key={item.id || item.label}
                        className="flex flex-nowrap items-center gap-2 px-3 py-1.5"
                      >
                        <p className="min-w-0 text-sm font-semibold text-gray-950 dark:text-white">{item.label}</p>
                        {item.detail ? (
                          <span
                            className="group relative inline-flex shrink-0"
                            tabIndex={0}
                            aria-label={item.detail}
                          >
                            <span
                              className="cursor-help text-xs leading-none text-amber-700/80 dark:text-amber-200/80"
                              aria-hidden="true"
                              title={item.detail}
                            >
                              ⓘ
                            </span>
                            <span
                              role="tooltip"
                              className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 max-w-[min(18rem,70vw)] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal leading-5 text-slate-600 shadow-md group-hover:block group-focus-within:block dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            >
                              {item.detail}
                            </span>
                          </span>
                        ) : null}
                        {item.href && item.action ? (
                          <Link
                            href={item.href}
                            className="btn btn-secondary btn-sm shrink-0"
                          >
                            {item.action}
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {shouldShowOnboardingChecklist ? (
                <div
                  className="w-fit max-w-full overflow-hidden rounded-xl border border-amber-200/90 bg-amber-50/60 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/20"
                  data-portal-home="setup-checklist"
                >
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {t('portal.home.onboarding_label', {}, 'Needs attention')}
                  </p>
                  <h2 className="mt-0.5 text-base font-semibold text-gray-950 dark:text-white">
                    {t('portal.home.onboarding_title', {}, 'Before you continue')}
                  </h2>
                  <ul className="mt-2 divide-y divide-amber-200/70 dark:divide-amber-900/50">
                    {requiredAttentionItems.map((item) => (
                      <li
                        key={item.key}
                        className="flex flex-wrap items-center gap-2 py-2 first:pt-1 last:pb-0"
                      >
                        <p className="min-w-0 text-sm font-semibold text-gray-950 dark:text-white">{item.title}</p>
                        <Link href={item.href} className="btn btn-secondary btn-sm shrink-0">
                          {item.action}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
          </div>
        ) : null}
      </section>

      <PortalSitesWorkspace capacityAlerts={capacityAttentionItems} />
    </PortalPageStack>
  );
}
