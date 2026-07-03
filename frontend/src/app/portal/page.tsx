'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import {
  getPortalSiteDisplayName,
  getPortalSiteWordPressUrl,
} from '@/lib/portal-site-display';
import { cn, formatDate } from '@/lib/utils';
import {
  portalClient,
  type PortalIdentityProviderStatus,
  type PortalSiteDiagnostics,
  type PortalSiteSummaryRecord,
  type Site,
} from '@/lib/portal-client';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { BackofficeTag } from '@/components/backoffice/BackofficeTag';
import { PortalSiteConnectPanel } from '@/components/portal/PortalSiteConnectPanel';
import { PortalEmptyState } from '@/components/portal/PortalPageState';
import { PortalSiteInspectorDrawer } from '@/components/portal/PortalSiteInspectorDrawer';

type RestrictionItem = {
  tone: 'warn' | 'info';
  label: string;
  detail: string;
};

function buildRestrictionItems({
  t,
  siteStatus,
  subscriptionStatus,
  requestLimit,
  tokenLimit,
}: {
  t: (key: string, params?: Record<string, string>, fallback?: string) => string;
  siteStatus: string;
  subscriptionStatus: string;
  requestLimit: number;
  tokenLimit: number;
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
            'Open Package to review the current coverage state for this site.'
          ),
        }
      : null,
	    requestLimit > 0 || tokenLimit > 0
	      ? {
	          tone: 'info',
	          label: t('portal.home.restriction_limit_label', {}, 'Package usage is limited'),
	          detail: t(
	            'portal.home.restriction_limit_desc',
	            {},
	            'Open Plan and usage to see what is left in the current package period.'
	          ),
	        }
	      : null,
  ].filter(Boolean) as RestrictionItem[];
}

export default function PortalPage() {
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated, selectSite } = useSession();
  const [inspectedSiteId, setInspectedSiteId] = useState('');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [siteSummaryCache, setSiteSummaryCache] = useState<Record<string, PortalSiteSummaryRecord>>({});
  const [isInspectorLoading, setIsInspectorLoading] = useState(false);
  const [inspectorError, setInspectorError] = useState('');
  const [currentSiteSummary, setCurrentSiteSummary] = useState<PortalSiteSummaryRecord | null>(null);
  const [currentSiteDiagnostics, setCurrentSiteDiagnostics] = useState<PortalSiteDiagnostics | null>(null);
  const [identityProviders, setIdentityProviders] = useState<PortalIdentityProviderStatus[]>([]);
  const sessionSiteIdsKey = session?.sites?.map((site) => site.site_id).join('|') || '';

  const handleSiteSelect = async (siteId: string) => {
    try {
      await selectSite(siteId);
    } catch (error) {
      console.error('Failed to select site:', error);
    }
  };

  useEffect(() => {
    if (!isInspectorOpen || !inspectedSiteId || siteSummaryCache[inspectedSiteId]) {
      return;
    }

    let isCancelled = false;
    setIsInspectorLoading(true);
    setInspectorError('');

    void portalClient
      .getSiteSummary(inspectedSiteId)
      .then((response) => {
        if (isCancelled) {
          return;
        }
        setSiteSummaryCache((current) => ({
          ...current,
          [inspectedSiteId]: response.data as PortalSiteSummaryRecord,
        }));
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        console.error('Failed to load site summary:', error);
        setInspectorError(
          t(
            'portal.home.drawer_load_failed',
            {},
            'Failed to load the site summary. Open the full page if you need more detail.'
          )
        );
      })
      .finally(() => {
        if (!isCancelled) {
          setIsInspectorLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [inspectedSiteId, isInspectorOpen, siteSummaryCache, t]);

  const selectedSiteForContext =
    session?.sites?.find((site) => site.site_id === session.site_id) || session?.sites?.[0] || null;
  const selectedSiteForMonitoringId = selectedSiteForContext?.site_id || '';

  useEffect(() => {
    if (!selectedSiteForContext?.site_id) {
      setCurrentSiteSummary(null);
      return;
    }

    let isCancelled = false;
    setCurrentSiteSummary(null);

    void portalClient
      .getSiteSummary(selectedSiteForContext.site_id)
      .then((response) => {
        if (!isCancelled) {
          setCurrentSiteSummary(response.data as PortalSiteSummaryRecord);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Failed to load current site summary:', error);
          setCurrentSiteSummary(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedSiteForContext?.site_id]);

  useEffect(() => {
    if (!selectedSiteForMonitoringId) {
      setCurrentSiteDiagnostics(null);
      return;
    }

    let isCancelled = false;
    setCurrentSiteDiagnostics(null);

    void portalClient
      .getSiteDiagnostics(selectedSiteForMonitoringId)
      .then((response) => {
        if (!isCancelled) {
          setCurrentSiteDiagnostics(response.data);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Failed to load current site diagnostics:', error);
          setCurrentSiteDiagnostics(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedSiteForMonitoringId]);

  useEffect(() => {
    if (!isAuthenticated || !sessionSiteIdsKey || !session?.sites?.length) {
      return;
    }

    let isCancelled = false;
    const siteIds = session.sites
      .filter((site) => site.status !== 'archived')
      .slice(0, 12)
      .map((site) => site.site_id);

    void Promise.allSettled(siteIds.map((siteId) => portalClient.getSiteSummary(siteId))).then((results) => {
      if (isCancelled) {
        return;
      }
      setSiteSummaryCache((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            next[siteIds[index]] = result.value.data as PortalSiteSummaryRecord;
          }
        });
        return next;
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, session?.sites, sessionSiteIdsKey]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIdentityProviders([]);
      return;
    }

    let isCancelled = false;

    void portalClient
      .getIdentityProviders()
      .then((response) => {
        if (!isCancelled) {
          setIdentityProviders(response.data?.providers || []);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Failed to load identity provider status:', error);
          setIdentityProviders([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated]);

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

  if (!session.sites || session.sites.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="surface-panel max-w-2xl p-8">
          <PortalEmptyState
            title={t('portal.no_sites')}
            description={t(
              'portal.home.no_sites_empty_desc',
              {},
              'You do not have a connected site yet, so the workspace cannot show package, usage, or connection status. Connect a site first.'
            )}
          />
          <div className="mt-6">
            <PortalSiteConnectPanel accountId={session.account_id || ''} currentSiteId="" sites={[]} />
          </div>
        </div>
      </div>
    );
  }

  const visibleSites = session.sites.filter((site) => site.status !== 'archived');
  if (visibleSites.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="surface-panel max-w-2xl p-8">
	          <PortalEmptyState
	            title={t('portal.no_active_sites_title', {}, 'No available sites')}
	            description={t(
	              'portal.no_active_sites_desc',
	              {},
	              'No site is currently available for this account. Add a site or contact support.'
	            )}
            actionLabel={t('portal.nav_sites', {}, 'Sites')}
            actionHref="/portal/sites"
          />
        </div>
      </div>
    );
  }

  const selectedSite =
    visibleSites.find((s) => s.site_id === session.site_id) || visibleSites[0];
  const currentSubscription = session.current_subscription;
  const selectedSiteWordPressUrl = getPortalSiteWordPressUrl(selectedSite);
  const currentPackageDisplay = resolveCustomerPackageDisplay(t, {
    planId: currentSiteSummary?.coverage?.plan_id || currentSubscription?.plan_id,
    planVersionId: currentSiteSummary?.coverage?.plan_version_id || currentSubscription?.plan_version_id,
    packageAlias: currentSiteSummary?.coverage?.package_alias || currentSubscription?.package_alias,
    formalPlanName: selectedSite.plan_name,
    planKind: currentSubscription?.plan_kind,
    coverageState: currentSiteSummary?.coverage || currentSubscription ? 'covered' : 'uncovered',
  });
  const getCachedSiteSummary = (site: Site) =>
    site.site_id === selectedSite.site_id ? currentSiteSummary || siteSummaryCache[site.site_id] || null : siteSummaryCache[site.site_id] || null;
  const getCachedSiteCoverage = (site: Site) => getCachedSiteSummary(site)?.coverage || null;
  const hasCachedSiteCoverage = (site: Site) => Boolean(getCachedSiteCoverage(site) || site.plan_name);
  const resolveSitePackageDisplay = (site: Site) => {
    const summary = getCachedSiteSummary(site);
    const coverage = summary?.coverage || null;
    const isCurrent = selectedSite.site_id === site.site_id;
    return resolveCustomerPackageDisplay(t, {
      planId: coverage?.plan_id || (isCurrent ? currentSubscription?.plan_id : undefined),
      planVersionId: coverage?.plan_version_id || (isCurrent ? currentSubscription?.plan_version_id : undefined),
      packageAlias: coverage?.package_alias || summary?.package_alias || (isCurrent ? currentSubscription?.package_alias : undefined),
      formalPlanName: summary?.site?.plan_name || site.plan_name,
      planKind: isCurrent ? currentSubscription?.plan_kind : undefined,
      coverageState: coverage || site.plan_name || isCurrent ? 'covered' : 'uncovered',
    });
  };
  const entitlementFeatureCount = Array.isArray(session.entitlements?.features)
    ? session.entitlements.features.length
    : 0;
  const requestLimit = Number(session.entitlements?.requests_limit || 0);
  const tokenLimit = Number(session.entitlements?.tokens_limit || 0);
  const currentSiteActiveKeyCount =
    typeof currentSiteDiagnostics?.active_key_count === 'number'
      ? currentSiteDiagnostics.active_key_count
      : null;
  const restrictionItems = buildRestrictionItems({
    t,
    siteStatus: selectedSite.status,
    subscriptionStatus: currentSubscription?.status || '',
    requestLimit,
    tokenLimit,
  });
  const inspectedSite = session.sites.find((site) => site.site_id === inspectedSiteId) || null;
  const inspectedSummary = inspectedSiteId ? siteSummaryCache[inspectedSiteId] || null : null;
  const inspectorRestrictions = inspectedSite
    ? buildRestrictionItems({
        t,
        siteStatus: inspectedSummary?.site.status || inspectedSite.status,
        subscriptionStatus: inspectedSummary?.subscription_status || inspectedSummary?.coverage?.status || '',
        requestLimit: Number(inspectedSummary?.entitlement_snapshot?.requests_limit || 0),
        tokenLimit: Number(inspectedSummary?.entitlement_snapshot?.tokens_limit || 0),
      })
    : [];

  const openInspector = (siteId: string) => {
    setInspectedSiteId(siteId);
    setIsInspectorOpen(true);
  };

  const allSites = session.sites;
  const inspectedIndex = allSites.findIndex((site) => site.site_id === inspectedSiteId);
  const previousSiteId = inspectedIndex > 0 ? allSites[inspectedIndex - 1]?.site_id || '' : '';
  const nextSiteId =
    inspectedIndex >= 0 && inspectedIndex < allSites.length - 1
      ? allSites[inspectedIndex + 1]?.site_id || ''
      : '';

  const closeInspector = () => {
    setIsInspectorOpen(false);
    setInspectorError('');
  };

  const restrictedCount = visibleSites.filter((site) => site.status !== 'active' || !hasCachedSiteCoverage(site)).length;
  const clearCount = visibleSites.length - restrictedCount;
  const missingUrlCount = visibleSites.filter((site) => !getPortalSiteWordPressUrl(site)).length;
  const sitePreviewLimit = 3;
  const previewSites = [...visibleSites]
    .sort((left, right) => {
      const leftPriority =
        left.site_id === selectedSite.site_id ? 0 : left.status !== 'active' || !hasCachedSiteCoverage(left) || !getPortalSiteWordPressUrl(left) ? 1 : 2;
      const rightPriority =
        right.site_id === selectedSite.site_id ? 0 : right.status !== 'active' || !hasCachedSiteCoverage(right) || !getPortalSiteWordPressUrl(right) ? 1 : 2;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    })
    .slice(0, sitePreviewLimit);
  const hasHiddenSites = visibleSites.length > previewSites.length;
  const qqProvider = identityProviders.find((provider) => provider.provider === 'qq') || null;
  const hasPackageLabel = Boolean(currentPackageDisplay.display_package_label);
  const setupChecklistItems = [
    {
      key: 'site',
      done: selectedSite.status === 'active' && Boolean(selectedSiteWordPressUrl),
      title: t('portal.home.onboarding_site_title', {}, 'Confirm site'),
      detail: selectedSiteWordPressUrl
        ? t('portal.home.onboarding_site_ready', {}, 'The site URL is recorded and this site can be used in the Portal workspace.')
        : t('portal.home.onboarding_site_needed', {}, 'Add the WordPress site URL so keys and usage are easier to verify later.'),
      href: `/portal/sites/${selectedSite.site_id}`,
      action: t('portal.home.onboarding_site_action', {}, 'View site'),
    },
    {
      key: 'api-key',
      done: currentSiteActiveKeyCount !== null && currentSiteActiveKeyCount > 0,
      title: t('portal.home.onboarding_key_title', {}, 'Check site connection'),
      detail:
        currentSiteActiveKeyCount !== null && currentSiteActiveKeyCount > 0
          ? t('portal.home.onboarding_key_ready', {}, 'The WordPress site is connected and can use the service.')
          : t('portal.home.onboarding_key_needed', {}, 'Reconnect the WordPress site before using the service.'),
      href: `/portal/sites/${selectedSite.site_id}`,
      action: t('portal.home.onboarding_key_action', {}, 'View site'),
    },
    {
      key: 'package',
      done: Boolean(currentSubscription?.status === 'active' || hasPackageLabel),
      title: t('portal.home.onboarding_package_title', {}, 'Review Free package'),
      detail:
        currentSubscription?.status === 'active'
          ? t('portal.home.onboarding_package_ready', {}, 'The current package is available.')
	          : t('portal.home.onboarding_package_needed', {}, 'Review the current package and what remains this period.'),
      href: `/portal/billing?site=${selectedSite.site_id}`,
      action: t('portal.home.onboarding_package_action', {}, 'View package'),
    },
    {
      key: 'qq',
      done: Boolean(qqProvider?.bound),
      title: t('portal.home.onboarding_qq_title', {}, 'Bind QQ quick login'),
      detail: qqProvider?.bound
        ? t('portal.home.onboarding_qq_ready', {}, 'QQ quick login is bound, so future sign-ins can use QQ directly.')
        : t('portal.home.onboarding_qq_needed', {}, 'Email remains the primary identity. Bind QQ for easier login.'),
      href: '/portal/account',
      action: t('portal.home.onboarding_qq_action', {}, 'Account center'),
    },
  ];
  const requiredSetupItems = setupChecklistItems.filter((item) => item.key !== 'qq');
  const requiredAttentionItems = requiredSetupItems.filter((item) => !item.done);
  const shouldShowOnboardingChecklist = requiredAttentionItems.length > 0;
  const currentSubscriptionStatusLabel = currentSubscription?.status === 'active' || hasPackageLabel
      ? t('portal.home.package_available_label', {}, 'Available')
      : t('portal.home.package_pending_label', {}, 'To confirm');
  const currentServiceStatusToken =
    selectedSite.status !== 'active' ||
    (currentSubscription?.status && currentSubscription.status !== 'active') ||
    currentSiteActiveKeyCount === 0
      ? 'warning'
      : 'active';
  const currentServiceStatusLabel =
    currentServiceStatusToken === 'active'
      ? t('portal.home.service_status_live', {}, 'Ready')
      : t('portal.home.service_status_attention', {}, 'Needs attention');
  const activeKeySummaryLabel =
    currentSiteActiveKeyCount === null
      ? t('common.loading')
      : currentSiteActiveKeyCount > 0
        ? t('portal.home.connection_ready_label', {}, 'Connected')
        : t('portal.home.connection_needed_label', {}, 'Needs setup');
  const activeKeySummaryDetail =
    currentSiteActiveKeyCount !== null && currentSiteActiveKeyCount > 0
      ? t('portal.home.onboarding_key_ready', {}, 'The WordPress site is connected and can use the service.')
      : t('portal.home.onboarding_key_needed', {}, 'Reconnect the WordPress site before using the service.');
  const operationSummaryItems = [
    {
      label: t('portal.home.current_site_title', {}, 'Current site'),
      value: getPortalSiteDisplayName(selectedSite),
      detail: selectedSiteWordPressUrl || t('portal.site_url_missing', {}, 'WordPress URL not configured'),
      size: 'compact' as const,
    },
    {
      label: t('portal.home.package_card_label', {}, 'Current package'),
      value: currentPackageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm'),
      detail: currentSubscriptionStatusLabel,
      size: 'compact' as const,
    },
    {
      label: t('portal.home.connection_card_label', {}, 'Site connection'),
      value: activeKeySummaryLabel,
      detail: activeKeySummaryDetail,
      size: 'compact' as const,
    },
  ];
  const operationFocusItems =
    restrictionItems.length > 0
      ? restrictionItems
      : [
          {
            tone: 'info' as const,
            label: t('portal.home.recent_issues_empty_title', {}, 'No action needed'),
            detail: t(
              'portal.home.recent_issues_empty_desc',
              {},
              'The current site can use the service normally.'
            ),
          },
        ];

  return (
    <BackofficePageStack>
      <PortalSiteInspectorDrawer
        isOpen={isInspectorOpen}
        onClose={closeInspector}
        site={inspectedSite}
        summary={inspectedSummary}
        isLoading={isInspectorLoading}
        error={inspectorError}
        restrictions={inspectorRestrictions}
        isCurrentSite={inspectedSiteId === selectedSite.site_id}
        onSelectCurrentSite={handleSiteSelect}
        previousSiteId={previousSiteId}
        nextSiteId={nextSiteId}
        onNavigateSite={openInspector}
        t={t}
      />
      <section className="space-y-5" data-portal-home="operation-overview">
        <BackofficeSectionPanel className="space-y-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('portal.workspace_label', {}, 'Overview')}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">
                  {t('portal.home.title', {}, 'My service')}
                </h1>
                <BackofficeStatusBadge
                  status={currentServiceStatusToken}
                  label={currentServiceStatusLabel}
                  className="shrink-0 text-[0.68rem]"
                />
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                {currentServiceStatusToken === 'active'
                  ? t('portal.home.service_status_ok_desc', {}, 'This site can use the service normally.')
                  : t('portal.home.service_status_issue_desc', {}, 'This site needs attention before normal use can continue.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <div className="w-full text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 xl:text-right">
                {t('portal.home.next_action_label', {}, 'Next action')}
              </div>
              <Link href={`/portal/sites/${selectedSite.site_id}`} className="btn btn-primary btn-sm">
                {t('portal.home.site_action', {}, 'Open Site')}
              </Link>
              <Link href={`/portal/usage?site=${selectedSite.site_id}`} className="btn btn-secondary btn-sm">
                {t('portal.home.usage_action', {}, 'View Usage')}
              </Link>
            </div>
          </div>

          <BackofficeMetricStrip items={operationSummaryItems} columnsClassName="md:grid-cols-2 xl:grid-cols-4" />

          <div className="grid items-start gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45" data-portal-home="current-focus">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {t('common.status')}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
                    {t('portal.home.current_status_title', {}, 'Service status')}
                  </h2>
                </div>
                <BackofficeTag tone={currentServiceStatusToken === 'active' ? 'success' : 'warning'}>
                  {currentServiceStatusLabel}
                </BackofficeTag>
              </div>
              <div className="mt-4 space-y-3">
                {operationFocusItems.slice(0, 3).map((item) => (
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
                  </div>
                ))}
              </div>
            </BackofficeStackCard>

            {shouldShowOnboardingChecklist ? (
              <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45" data-portal-home="setup-checklist">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      {t('portal.home.onboarding_label', {}, 'Needs attention')}
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
                      {t('portal.home.onboarding_title', {}, 'Before you continue')}
                    </h2>
                  </div>
                  <BackofficeTag tone="warning">
                    {requiredAttentionItems.length} {t('portal.home.filter_attention_only', {}, 'Needs attention')}
                  </BackofficeTag>
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
              </BackofficeStackCard>
            ) : (
              <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/45" data-portal-home="quick-links">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  {t('portal.home.next_action_label', {}, 'Next action')}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-gray-950 dark:text-white">
                  {t('portal.home.recent_issues_empty_title', {}, 'No active restrictions')}
                </h2>
                <div className="mt-4 grid gap-2">
                  <Link href={`/portal/sites/${selectedSite.site_id}`} className="btn btn-secondary btn-sm justify-center">
                    {t('portal.home.site_action', {}, 'Open Site')}
                  </Link>
                  <Link href={`/portal/usage?site=${selectedSite.site_id}`} className="btn btn-secondary btn-sm justify-center">
                    {t('portal.home.usage_action', {}, 'View Usage')}
                  </Link>
                </div>
              </BackofficeStackCard>
            )}
          </div>
        </BackofficeSectionPanel>
      </section>

      <div className="space-y-5">
        <BackofficeSectionPanel className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <Link href="/portal/sites?filter=active" className="rounded-[1.25rem] border border-slate-200/80 bg-white/85 px-4 py-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('portal.home.available_sites_label', {}, 'Available sites')}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{visibleSites.length}</p>
            </Link>
            <Link href="/portal/sites?filter=attention" className="rounded-[1.25rem] border border-slate-200/80 bg-white/85 px-4 py-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('portal.home.needs_attention_sites_label', {}, 'Needs attention')}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{restrictedCount}</p>
            </Link>
            <Link href="/portal/usage" className="rounded-[1.25rem] border border-slate-200/80 bg-white/85 px-4 py-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('portal.home.package_card_label', {}, 'Current package')}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{currentPackageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm')}</p>
            </Link>
            <Link href="/portal/sites" className="rounded-[1.25rem] border border-slate-200/80 bg-white/85 px-4 py-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-900/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{t('portal.home.configured_sites_label', {}, 'Site address')}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{missingUrlCount > 0 ? t('portal.home.site_address_needs_setup', {}, 'Needs setup') : t('portal.site_address_configured', {}, 'Configured')}</p>
            </Link>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                {t('portal.site_register', {}, 'Sites')}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-gray-950 dark:text-white">
                {t('portal.home.my_sites_title', {}, 'My sites')}
              </h2>
            </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <BackofficeTag>
                {previewSites.length} / {visibleSites.length} {t('common.site')}
                </BackofficeTag>
                <BackofficeTag tone="warning">
                  {restrictedCount} {t('portal.home.filter_attention_only', {}, 'Needs attention')}
                </BackofficeTag>
                <BackofficeTag tone="success">
                  {clearCount} {t('portal.home.filter_clear', {}, 'Clear')}
                </BackofficeTag>
              </div>
            </div>

          <div className={cn(
            'overflow-hidden rounded-[1.4rem] border border-slate-200/80 transition-shadow dark:border-slate-800'
          )}>
            <div className="hidden grid-cols-[minmax(0,1.8fr)_120px_140px_240px] gap-4 border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:border-slate-800 dark:bg-slate-950/45 dark:text-gray-400 lg:grid">
              <span>{t('common.site')}</span>
              <span>{t('portal.home.service_state_label', {}, 'Service status')}</span>
              <span>{t('portal.home.package_card_label', {}, 'Current package')}</span>
              <span>{t('portal.home.view_label', {}, 'View')}</span>
            </div>

            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {previewSites.map((site) => {
                const isCurrent = session.site_id === site.site_id;
                const hasAttention = site.status !== 'active' || !hasCachedSiteCoverage(site);
                const sitePackageDisplay = resolveSitePackageDisplay(site);
                return (
                  <div
                    key={site.site_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${getPortalSiteDisplayName(site)} ${t('common.view', {}, 'View')}`}
                    onClick={() => openInspector(site.site_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openInspector(site.site_id);
                      }
                    }}
                    className={cn(
                      'group grid cursor-pointer gap-3 px-4 py-4 transition-all active:translate-y-px lg:grid-cols-[minmax(0,1.8fr)_120px_140px_240px] lg:items-center',
                      isCurrent
                        ? 'border-l-4 border-[color:var(--brand-primary)] bg-[color:var(--surface-raised)] ring-1 ring-[color:var(--brand-primary-soft)]'
                        : hasAttention
                          ? 'border-l-4 border-amber-300 bg-amber-50/40 hover:bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/10 dark:hover:bg-amber-950/20'
                          : 'border-l-4 border-transparent bg-white/80 hover:bg-slate-50/90 dark:bg-slate-950/35 dark:hover:bg-slate-900/60'
                    )}
                  >
                    <div className="min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-gray-950 dark:text-white">
                          {getPortalSiteDisplayName(site)}
                        </p>
                        {isCurrent ? (
                          <BackofficeTag tone="info" className="uppercase tracking-[0.16em]">
                            {t('common.current', {}, 'Current')}
                          </BackofficeTag>
                        ) : hasAttention ? (
                          <BackofficeTag tone="warning" className="uppercase tracking-[0.16em]">
                            {t('portal.home.filter_attention_only', {}, 'Needs attention')}
                          </BackofficeTag>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {getPortalSiteWordPressUrl(site) ||
                          t('portal.site_url_missing', {}, 'WordPress URL not configured')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 lg:hidden">
                        <span>{t('portal.home.service_state_label', {}, 'Service status')}: {hasAttention ? t('portal.home.service_status_attention', {}, 'Needs attention') : t('portal.home.risk_level_normal', {}, 'Normal')}</span>
                        <span>{t('portal.home.package_card_label', {}, 'Current package')}: {sitePackageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm')}</span>
                        <span>{t('common.connected_on', { date: formatDate(site.created_at) })}</span>
                      </div>
                      <p className="mt-2 hidden text-xs text-gray-500 dark:text-gray-400 lg:block">
                        {t('common.connected_on', { date: formatDate(site.created_at) })}
                      </p>
                    </div>

                    <div className="hidden lg:block">
                      <BackofficeStatusBadge
                        status={site.status}
                        label={hasAttention ? t('portal.home.service_status_attention', {}, 'Needs attention') : t('portal.home.risk_level_normal', {}, 'Normal')}
                        className="text-[0.68rem]"
                      />
                    </div>

                    <div className="hidden text-sm text-gray-700 dark:text-gray-300 lg:block">
                      {sitePackageDisplay.display_package_label || t('portal.home.package_pending_label', {}, 'To confirm')}
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Link
                        href={`/portal/sites/${site.site_id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="btn btn-secondary btn-sm"
                      >
                        {t('portal.home.view_site_record_action', {}, 'View site')}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
            {hasHiddenSites ? (
              <div className="border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/35">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t(
                      'portal.home.view_all_sites_desc',
                      { count: String(visibleSites.length - previewSites.length) },
                      `There are ${visibleSites.length - previewSites.length} more sites in the full register.`
                    )}
                  </p>
                  <Link href="/portal/sites" className="btn btn-secondary btn-sm">
                    {t('portal.home.view_all_sites', {}, 'View all sites')}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </BackofficeSectionPanel>
      </div>
    </BackofficePageStack>
  );
}
