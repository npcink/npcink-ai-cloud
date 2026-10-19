'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PortalSection, PortalCard } from '@/components/portal/PortalScaffold';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalEmptyState } from '@/components/portal/PortalPageState';
import { PortalSiteConnectPanel } from '@/components/portal/PortalSiteConnectPanel';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrl,
  getPortalWordPressAdminUrl,
  getVisiblePortalSites,
  portalSiteNeedsAttention,
} from '@/lib/portal-site-display';
import {
  portalClient,
  type PortalAddonConnectionAccount,
  type PortalSiteRelinkPolicy,
  type Site,
} from '@/lib/portal-client';
import { ApiError } from '@/lib/errors';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { formatDate } from '@/lib/utils';

type PortalTranslator = (
  key: string,
  params?: Record<string, string>,
  fallback?: string
) => string;

const EMPTY_SITES: Site[] = [];

function siteRemovalNotice(t: PortalTranslator, relinkAvailableAt: string): string {
  const formattedDate = formatDate(relinkAvailableAt);
  if (!formattedDate) {
    return t(
      'portal.site_remove_success_no_date',
      {},
      'Site removed. Active keys were revoked. The same account may reconnect at any time; another account must wait for the Cloud cooldown to end. Free service and credits remain with this account.'
    );
  }
  return t(
    'portal.site_remove_success_with_date',
    { date: formattedDate },
    `Site removed. Active keys were revoked. The same account may reconnect at any time; another account may try after ${formattedDate} if cross-account relinking is available. Free service and credits remain with this account.`
  );
}

function PortalSitesWorkspaceContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { session, isAuthenticated, refresh } = useSession();
  const routeSearchQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(() => routeSearchQuery);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectionStep, setConnectionStep] = useState(1);
  const [isConnecting, setIsConnecting] = useState(false);
  const [addonAccounts, setAddonAccounts] = useState<PortalAddonConnectionAccount[]>([]);
  const [addonAccountsError, setAddonAccountsError] = useState('');
  const [isLoadingAddonAccounts, setIsLoadingAddonAccounts] = useState(false);
  const [addonAccountsRetryVersion, setAddonAccountsRetryVersion] = useState(0);
  const [pendingRemoveSite, setPendingRemoveSite] = useState<Site | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [removeNotice, setRemoveNotice] = useState('');
  const [isRemovingSite, setIsRemovingSite] = useState(false);
  const [pendingLifecycleSite, setPendingLifecycleSite] = useState<Site | null>(null);
  const [pendingLifecycleStatus, setPendingLifecycleStatus] = useState<'active' | 'inactive'>('active');
  const [replacementSiteIds, setReplacementSiteIds] = useState<string[]>([]);
  const [lifecycleError, setLifecycleError] = useState('');
  const [lifecycleNotice, setLifecycleNotice] = useState('');
  const [isUpdatingLifecycle, setIsUpdatingLifecycle] = useState(false);
  const [siteRefreshFailed, setSiteRefreshFailed] = useState(() => searchParams.get('site_refresh') === 'failed');
  const [isRefreshingSites, setIsRefreshingSites] = useState(false);
  const [siteRelinkPolicy, setSiteRelinkPolicy] = useState<PortalSiteRelinkPolicy | null>(null);
  const [expectedRelinkAvailableAt, setExpectedRelinkAvailableAt] = useState('');
  const sites = session?.sites || EMPTY_SITES;
  const visibleSites = getVisiblePortalSites(sites);
  const showSiteSearch = visibleSites.length > 20 || searchQuery.trim().length > 0;
  const addonConnectMode = searchParams.get('connect') === 'wordpress-addon';
  const addonSiteUrl = searchParams.get('site_url') || '';
  const addonSiteName = searchParams.get('site_name') || '';
  const addonReturnUrl = searchParams.get('return_url') || '';
  const addonState = searchParams.get('state') || '';

  const filteredSites = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return visibleSites.filter((site) => {
      if (!query) return true;
      const siteUrl = getPortalSiteUrl(site);
      return getPortalSiteDisplayName(site).toLowerCase().includes(query)
        || siteUrl.toLowerCase().includes(query);
    });
  }, [searchQuery, visibleSites]);
  const sortedSites = useMemo(() => {
    return [...filteredSites].sort((left, right) => {
      const attentionDelta = Number(portalSiteNeedsAttention(right))
        - Number(portalSiteNeedsAttention(left));
      if (attentionDelta !== 0) return attentionDelta;
      return getPortalSiteDisplayName(left).localeCompare(getPortalSiteDisplayName(right));
    });
  }, [filteredSites]);
  const pendingCapacity = pendingLifecycleSite?.capacity;
  const requiredReleaseCount = pendingLifecycleStatus === 'active'
    && pendingCapacity
    && pendingCapacity.active_limit > 0
    ? Math.max(0, pendingCapacity.active_count + 1 - pendingCapacity.active_limit)
    : 0;
  const activationNeedsSwap = requiredReleaseCount > 0;
  const replacementCandidates = pendingLifecycleSite
    ? sites.filter((site) => (
        site.capacity_scope === pendingLifecycleSite.capacity_scope
        && site.site_id !== pendingLifecycleSite.site_id
        && site.status === 'active'
      ))
    : [];

  useEffect(() => {
    setSearchQuery(routeSearchQuery);
  }, [routeSearchQuery]);

  useEffect(() => {
    if (searchParams.get('site_refresh') !== 'failed') return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('site_refresh');
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}#sites`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setPendingLifecycleSite((pendingSite) => {
      if (!pendingSite) return null;
      return sites.find((site) => site.site_id === pendingSite.site_id) || pendingSite;
    });
  }, [sites]);

  useEffect(() => {
    if (addonConnectMode && isAuthenticated) {
      setShowConnectModal(true);
    }
  }, [addonConnectMode, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSiteRelinkPolicy(null);
      setExpectedRelinkAvailableAt('');
      return;
    }
    let cancelled = false;
    void portalClient.getSiteRelinkPolicy()
      .then((response) => {
        if (!cancelled) {
          setSiteRelinkPolicy(response.data);
          setExpectedRelinkAvailableAt(
            formatDate(new Date(Date.now() + response.data.cooldown_days * 86400000))
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSiteRelinkPolicy(null);
          setExpectedRelinkAvailableAt('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const removedSiteId = searchParams.get('removed_site');
    if (!removedSiteId || !session) return;
    const removedSite = session.sites.find(
      (site) => site.site_id === removedSiteId && site.status === 'archived'
    );
    if (!removedSite) return;
    setRemoveNotice(siteRemovalNotice(t, removedSite.relink_cooldown_until || ''));
    const params = new URLSearchParams(searchParams.toString());
    params.delete('removed_site');
    const nextQuery = params.toString();
    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ''}#sites`, { scroll: false });
  }, [pathname, router, searchParams, session, t]);

  useEffect(() => {
    if (!addonConnectMode || !isAuthenticated) {
      setAddonAccounts([]);
      setAddonAccountsError('');
      setIsLoadingAddonAccounts(false);
      return;
    }

    let cancelled = false;
    setIsLoadingAddonAccounts(true);
    setAddonAccountsError('');
    void portalClient.listAddonConnectionAccounts()
      .then((response) => {
        if (!cancelled) {
          setAddonAccounts(response.data.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAddonAccounts([]);
          setAddonAccountsError(
            formatPortalErrorMessage(
              error,
              t,
              t(
                'portal.connect_site_accounts_failed',
                {},
                'Failed to load available customer accounts.'
              )
            )
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingAddonAccounts(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [addonAccountsRetryVersion, addonConnectMode, isAuthenticated, t]);

  const updateSearchQuery = (value: string) => {
    setSearchQuery(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) {
      params.set('q', value.trim());
    } else {
      params.delete('q');
    }
    const nextQuery = params.toString();
    if (nextQuery !== searchParams.toString()) {
      window.history.replaceState(null, '', `${pathname}${nextQuery ? `?${nextQuery}` : ''}#sites`);
    }
  };

  const closeRemoveSiteModal = () => {
    if (isRemovingSite) return;
    setPendingRemoveSite(null);
    setRemoveError('');
  };

  const refreshAfterSiteChange = async () => {
    setIsRefreshingSites(true);
    try {
      await refresh();
      setSiteRefreshFailed(false);
    } catch {
      setSiteRefreshFailed(true);
    } finally {
      setIsRefreshingSites(false);
    }
  };

  const handleRemoveSite = async () => {
    if (!pendingRemoveSite || siteRefreshFailed || isRefreshingSites) return;
    setIsRemovingSite(true);
    setRemoveError('');
    setRemoveNotice('');
    try {
      const response = await portalClient.removeSite(pendingRemoveSite.site_id);
      setRemoveNotice(siteRemovalNotice(t, response.data.relink_policy.relink_available_at));
      setPendingRemoveSite(null);
      await refreshAfterSiteChange();
    } catch (error) {
      setRemoveError(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.site_remove_failed', {}, 'Failed to remove this site.')
        )
      );
    } finally {
      setIsRemovingSite(false);
    }
  };

  const openLifecycleModal = (site: Site, status: 'active' | 'inactive') => {
    if (siteRefreshFailed || isRefreshingSites) return;
    setPendingLifecycleSite(site);
    setPendingLifecycleStatus(status);
    setReplacementSiteIds([]);
    setLifecycleError('');
  };

  const closeLifecycleModal = () => {
    if (isUpdatingLifecycle) return;
    setPendingLifecycleSite(null);
    setReplacementSiteIds([]);
    setLifecycleError('');
  };

  const handleLifecycleUpdate = async () => {
    if (!pendingLifecycleSite || siteRefreshFailed || isRefreshingSites) return;
    if (activationNeedsSwap && replacementSiteIds.length !== requiredReleaseCount) {
      setLifecycleError(
        t(
          'portal.site_swap_required',
          {},
          'Choose an active site to deactivate before activating this site.'
        )
      );
      return;
    }
    setIsUpdatingLifecycle(true);
    setLifecycleError('');
    setLifecycleNotice('');
    try {
      const response = await portalClient.updateSiteLifecycle(
        pendingLifecycleSite.site_id,
        pendingLifecycleStatus,
        activationNeedsSwap ? replacementSiteIds : []
      );
      setLifecycleNotice(
        response.data.site.status === 'active'
          ? t('portal.site_activate_success', {}, 'Site activated.')
          : t('portal.site_deactivate_success', {}, 'Site deactivated. Its binding and credential remain available.')
      );
      setPendingLifecycleSite(null);
      setReplacementSiteIds([]);
      await refreshAfterSiteChange();
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        await refresh().catch(() => undefined);
        setReplacementSiteIds([]);
      }
      setLifecycleError(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.site_lifecycle_failed', {}, 'Failed to update this site.')
        )
      );
    } finally {
      setIsUpdatingLifecycle(false);
    }
  };

  const removeSiteConfirmation = expectedRelinkAvailableAt
    ? siteRelinkPolicy?.enabled
      ? t(
          'portal.remove_site_confirm_with_date',
          { date: expectedRelinkAvailableAt },
          `Remove this site? Cloud service will stop and active keys will be revoked. The same account may reconnect immediately; another account may try after approximately ${expectedRelinkAvailableAt}. Free service and credits stay with this account.`
        )
      : t(
          'portal.remove_site_confirm_disabled_with_date',
          { date: expectedRelinkAvailableAt },
          `Remove this site? Cloud service will stop and active keys will be revoked. The same account may reconnect immediately. The cooldown is expected to end around ${expectedRelinkAvailableAt}, but cross-account relinking is currently disabled. Free service and credits stay with this account.`
        )
    : t(
        'portal.remove_site_confirm',
        {},
        'Remove this site? Cloud service will stop and active keys will be revoked. The same account may reconnect immediately; another account must wait for the Cloud cooldown to end. Free service and credits stay with this account.'
      );

  const connectionSteps = [
    {
      title: t('portal.home.connection_step_open_title', {}, 'Open WordPress'),
      description: t('portal.home.connection_step_open'),
    },
    {
      title: t('portal.home.connection_step_plugin_title', {}, 'Open the plugin'),
      description: t('portal.home.connection_step_plugin'),
    },
    {
      title: t('portal.home.connection_step_confirm_title', {}, 'Confirm the connection'),
      description: t('portal.home.connection_step_confirm'),
    },
  ];
  const activeConnectionStep = connectionSteps[connectionStep - 1];
  const connectionGuideDesktop = (
    <div className="mt-4" data-portal-connection-flow data-current-step={connectionStep}>
      <div className="grid gap-2 md:grid-cols-3" aria-label={t('portal.home.connection_progress', {}, 'Connection steps')}>
        {connectionSteps.map((step, index) => {
          const stepNumber = index + 1;
          const isCurrent = connectionStep === stepNumber;
          const isComplete = stepNumber < connectionStep;
          return (
            <button
              key={step.title}
              type="button"
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${isCurrent
                ? 'border-blue-300 bg-blue-50 font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100'
                : 'border-slate-200 text-slate-600 hover:border-blue-200 dark:border-slate-700 dark:text-slate-300'}`}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => setConnectionStep(stepNumber)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold dark:bg-slate-800">
                {isComplete ? '✓' : stepNumber}
              </span>
              <span>{step.title}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          {t('portal.home.connection_step_count', { current: String(connectionStep), total: String(connectionSteps.length) }, `Step ${connectionStep} of ${connectionSteps.length}`)}
        </p>
        <h4 className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{activeConnectionStep.title}</h4>
        <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">{activeConnectionStep.description}</p>
        <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">{t('portal.home.connection_guide_help')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {connectionStep > 1 ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConnectionStep((step) => step - 1)}>
              {t('portal.home.connection_previous', {}, 'Previous step')}
            </button>
          ) : null}
          {connectionStep < connectionSteps.length ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setConnectionStep((step) => step + 1)}>
              {t('portal.home.connection_next', {}, 'Next step')}
            </button>
          ) : (
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {t('portal.home.connection_finish_hint', {}, 'After confirming, return to WordPress to use AI.')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
  const connectionGuide = (
    <>
      <div className="hidden md:block">{connectionGuideDesktop}</div>
      <div className="md:hidden">
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-base leading-7 text-slate-700 dark:text-slate-300">
          <li>{t('portal.home.connection_step_open')}</li>
          <li>{t('portal.home.connection_step_plugin')}</li>
          <li>{t('portal.home.connection_step_confirm')}</li>
        </ol>
        <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">{t('portal.home.connection_guide_help')}</p>
      </div>
    </>
  );

  return (
    <section id="sites" className="scroll-mt-24" data-portal-home="sites-workspace">
      <PortalSection className="space-y-4" variant="portal">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t('portal.site_register', {}, 'Sites')}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
              {t('portal.home.my_sites_title', {}, 'My sites')}
            </h2>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {visibleSites.length} {t('common.site')}
              {visibleSites.filter((site) => site.status !== 'active').length > 0 ? (
                <> · {t(
                  'portal.home.site_connection_attention_value',
                  { count: String(visibleSites.filter((site) => site.status !== 'active').length) },
                  `${visibleSites.filter((site) => site.status !== 'active').length} need attention`
                )}</>
              ) : null}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:items-end lg:max-w-3xl">
            {showSiteSearch ? <div className="w-full sm:max-w-sm">
              <label htmlFor="portal-service-site-search" className="sr-only">
                {t('portal.home.search_sites_placeholder', {}, 'Search site name or URL')}
              </label>
              <input
                id="portal-service-site-search"
                type="search"
                value={searchQuery}
                onChange={(event) => updateSearchQuery(event.target.value)}
                placeholder={t('portal.home.search_sites_placeholder', {}, 'Search site name or URL')}
                className="input"
              />
            </div> : null}
          </div>
        </div>

        <div id="connection-guide" className="scroll-mt-28" data-portal-sites="connect-guide">
          {visibleSites.length ? (
            <details className="border-b border-slate-200 pb-3 text-sm dark:border-slate-800">
              <summary className="cursor-pointer font-medium text-blue-700 dark:text-blue-300">{t('portal.sites.connect_hint_title')}</summary>
              {connectionGuide}
            </details>
          ) : (
            <div>
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{t('portal.home.connection_guide_title')}</h3>
              {connectionGuide}
            </div>
          )}
        </div>

        {removeNotice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            {removeNotice}
          </div>
        ) : null}

        {lifecycleNotice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
            {lifecycleNotice}
          </div>
        ) : null}

        {siteRefreshFailed ? (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p>{t('portal.site_change_refresh_failed')}</p>
            <button type="button" className="btn btn-secondary btn-sm" disabled={isRefreshingSites} onClick={() => void refreshAfterSiteChange()}>
              {isRefreshingSites ? t('common.loading') : t('portal.site_refresh_action')}
            </button>
          </div>
        ) : null}

        <div className="hidden overflow-x-auto lg:block" data-portal-sites="desktop-table">
          {sortedSites.length === 0 ? (
            visibleSites.length ? <PortalEmptyState
              title={t('portal.sites.empty_title', {}, 'No sites match this search')}
              description={t('portal.sites.empty_desc', {}, 'No connected site matches the current search term. Clear the search to see every site.')}
            /> : null
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">
                {t('portal.site_register_desc', {}, 'Every connected site appears here with its current service status.')}
              </caption>
              <thead className="border-b border-slate-200/80 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">{t('portal.sites.table_site', {}, 'Site')}</th>
                  <th scope="col" className="px-3 py-3 font-medium">{t('portal.sites.table_status', {}, 'Connection')}</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">{t('portal.sites.table_actions', {}, 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {sortedSites.map((site) => (
                  <tr key={site.site_id} className="align-middle">
                    <th scope="row" className="max-w-[22rem] px-3 py-4 font-normal">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-slate-950 dark:text-white">
                          {getPortalSiteDisplayName(site)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {getPortalSiteUrl(site) || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
                      </p>
                    </th>
                    <td className="whitespace-nowrap px-3 py-4">
                      <PortalStatusBadge
                        status={site.status === 'active' ? 'active' : 'warning'}
                        label={site.status === 'active'
                          ? t('portal.sites.table_ready', {}, 'Connected')
                          : site.status === 'inactive'
                            ? t('portal.site_status_inactive', {}, 'Inactive')
                            : site.status === 'provisioning'
                              ? t('portal.site_status_provisioning', {}, 'Provisioning')
                              : t('portal.site_status_suspended', {}, 'Suspended')}
                        className="normal-case tracking-normal"
                      />
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap justify-end gap-2">
                        {site.allowed_actions?.includes('provision_sites')
                          && site.status === 'inactive' ? (
                          <button
                            type="button"
                            onClick={() => openLifecycleModal(site, 'active')}
                            disabled={siteRefreshFailed || isRefreshingSites}
                            className="btn btn-primary btn-sm"
                          >
                            {t('portal.continue_site_connection_action', {}, 'Continue connection')}
                          </button>
                        ) : null}
                        <Link
                          href={`/portal/sites/${encodeURIComponent(site.site_id)}#service-status`}
                          className={`btn btn-sm ${site.status === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                          {t('portal.site_record', {}, 'Open site')}
                        </Link>
                        {getPortalWordPressAdminUrl(site) ? (
                          <a
                            href={getPortalWordPressAdminUrl(site)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                          >
                            {t('portal.home.open_wordpress')}
                            <span className="sr-only">{t('portal.home.opens_new_tab')}</span>
                          </a>
                        ) : null}
                        {(site.allowed_actions?.includes('remove_sites') || (site.status === 'active' && site.allowed_actions?.includes('provision_sites')))
                          && site.status !== 'suspended' ? (
                          <details className="relative inline-block text-right" data-portal-sites="desktop-actions">
                            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
                              {t('portal.site_other_actions', {}, 'Other actions')}
                            </summary>
                            <div className="mt-2 flex min-w-max flex-col items-stretch gap-1 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-lg dark:border-slate-700 dark:bg-slate-900">
                              {site.status === 'active' && site.allowed_actions?.includes('provision_sites') ? (
                                <button type="button" className="btn btn-secondary btn-sm" disabled={siteRefreshFailed || isRefreshingSites} onClick={() => openLifecycleModal(site, 'inactive')}>{t('portal.deactivate_site_action')}</button>
                              ) : null}
                              {site.allowed_actions?.includes('remove_sites') ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRemoveError('');
                                  setPendingRemoveSite(site);
                                }}
                                disabled={siteRefreshFailed || isRefreshingSites}
                                className="btn btn-secondary btn-sm text-red-700 hover:border-red-300 hover:bg-red-50 dark:text-red-300 dark:hover:border-red-900 dark:hover:bg-red-950/30"
                              >
                                {t('portal.remove_site_action', {}, 'Remove site')}
                              </button>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid gap-3 lg:hidden">
          {sortedSites.length === 0 ? (
            visibleSites.length ? <PortalEmptyState
              title={t('portal.sites.empty_title', {}, 'No sites match this search')}
              description={t('portal.sites.empty_desc', {}, 'No connected site matches the current search term. Clear the search to see every site.')}
            /> : null
          ) : sortedSites.map((site) => (
            <PortalCard key={site.site_id} variant="portal">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold text-slate-950 dark:text-white">
                      {getPortalSiteDisplayName(site)}
                    </p>
                    <PortalStatusBadge
                      status={site.status === 'active' ? 'active' : 'warning'}
                      label={site.status === 'active'
                        ? t('portal.sites.table_ready', {}, 'Connected')
                        : site.status === 'inactive'
                          ? t('portal.site_status_inactive', {}, 'Inactive')
                          : site.status === 'provisioning'
                            ? t('portal.site_status_provisioning', {}, 'Provisioning')
                            : t('portal.site_status_suspended', {}, 'Suspended')}
                      className="normal-case tracking-normal"
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {getPortalSiteUrl(site)
                      || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  {getPortalWordPressAdminUrl(site) ? (
                    <a
                      href={getPortalWordPressAdminUrl(site)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      {t('portal.home.open_wordpress')}
                      <span className="sr-only">{t('portal.home.opens_new_tab')}</span>
                    </a>
                  ) : null}
                  <Link href={`/portal/sites/${encodeURIComponent(site.site_id)}#service-status`} className="text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
                    {t('portal.site_record', {}, 'Site record')}
                  </Link>
                  {site.allowed_actions?.includes('provision_sites')
                    && site.status === 'inactive' ? (
                    <button
                      type="button"
                      onClick={() => openLifecycleModal(site, 'active')}
                      disabled={siteRefreshFailed || isRefreshingSites}
                      className="text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                    >
                      {t('portal.activate_site_action', {}, 'Activate')}
                    </button>
                  ) : null}
                  {(site.allowed_actions?.includes('remove_sites') || (site.status === 'active' && site.allowed_actions?.includes('provision_sites')))
                    && site.status !== 'suspended' ? (
                    <details className="relative" data-portal-sites="mobile-actions">
                      <summary className="cursor-pointer list-none text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">
                        {t('portal.site_other_actions', {}, 'Other actions')}
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 flex min-w-max flex-col items-stretch gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        {site.status === 'active' && site.allowed_actions?.includes('provision_sites') ? (
                          <button type="button" className="btn btn-secondary btn-sm" disabled={siteRefreshFailed || isRefreshingSites} onClick={() => openLifecycleModal(site, 'inactive')}>{t('portal.deactivate_site_action')}</button>
                        ) : null}
                        {site.allowed_actions?.includes('remove_sites') ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRemoveError('');
                            setPendingRemoveSite(site);
                          }}
                          disabled={siteRefreshFailed || isRefreshingSites}
                          className="btn btn-secondary btn-sm text-red-700 hover:border-red-300 hover:bg-red-50 dark:text-red-300 dark:hover:border-red-900 dark:hover:bg-red-950/30"
                        >
                          {t('portal.remove_site_action', {}, 'Remove site')}
                        </button>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            </PortalCard>
          ))}
        </div>

      </PortalSection>

      <Modal
        isOpen={addonConnectMode && showConnectModal}
        onClose={() => { if (!isConnecting) setShowConnectModal(false); }}
        closeLabel={t('common.close', {}, 'Close')}
        title={t('portal.connect_site_addon_title', undefined, 'Finish WordPress connection')}
        description={t('portal.connect_site_addon_desc', undefined, 'Confirm this site connection, then return to WordPress to finish setup.')}
        size="lg"
        className="portal-commercial-dialog rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
      >
        <PortalSiteConnectPanel
          onSubmittingChange={setIsConnecting}
          accounts={addonAccounts}
          accountsError={addonAccountsError}
          isLoadingAccounts={isLoadingAddonAccounts}
          onRetryAccounts={() => setAddonAccountsRetryVersion((current) => current + 1)}
          onClose={() => { if (!isConnecting) setShowConnectModal(false); }}
          initialSiteUrl={addonSiteUrl}
          initialSiteName={addonSiteName}
          addonReturnUrl={addonReturnUrl}
          addonState={addonState}
        />
      </Modal>

      <Modal
        isOpen={Boolean(pendingLifecycleSite)}
        onClose={closeLifecycleModal}
        closeLabel={t('common.close', {}, 'Close')}
        closeOnOverlay={!isUpdatingLifecycle}
        title={pendingLifecycleStatus === 'active'
          ? t('portal.activate_site_action', {}, 'Activate site')
          : t('portal.deactivate_site_action', {}, 'Deactivate site')}
        description={pendingLifecycleStatus === 'active'
          ? activationNeedsSwap
            ? t(
              'portal.activate_site_swap_desc',
                { count: String(requiredReleaseCount) },
                `Your active-site quota is full. Choose exactly ${requiredReleaseCount} active site(s) to deactivate; no site is replaced automatically.`
              )
            : t('portal.activate_site_confirm', {}, 'Activate this site for Cloud runtime service?')
          : t(
              'portal.deactivate_site_confirm',
              {},
              'Deactivate this site? Its binding, credential, usage, and audit history will be preserved.'
            )}
        className="portal-commercial-dialog rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeLifecycleModal} disabled={isUpdatingLifecycle}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleLifecycleUpdate()} disabled={isUpdatingLifecycle}>
              {isUpdatingLifecycle
                ? t('common.saving')
                : pendingLifecycleStatus === 'active'
                  ? t('portal.activate_site_action', {}, 'Activate')
                  : t('portal.deactivate_site_action', {}, 'Deactivate')}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p className="font-semibold text-slate-950 dark:text-white">
            {getPortalSiteDisplayName(pendingLifecycleSite)}
          </p>
          {activationNeedsSwap ? (
            <fieldset className="space-y-2">
              <legend className="font-medium text-slate-950 dark:text-white">
                {t(
                  'portal.site_swap_select_label',
                  { count: String(requiredReleaseCount) },
                  `Choose ${requiredReleaseCount} active site(s) to deactivate`
                )}
              </legend>
              {replacementCandidates.map((site) => (
                <label key={site.site_id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <input
                    type="checkbox"
                    name="replacement-site"
                    value={site.site_id}
                    checked={replacementSiteIds.includes(site.site_id)}
                    onChange={(event) => {
                      setReplacementSiteIds((current) => event.target.checked
                        ? [...current, site.site_id]
                        : current.filter((siteId) => siteId !== site.site_id));
                    }}
                    disabled={
                      !replacementSiteIds.includes(site.site_id)
                      && replacementSiteIds.length >= requiredReleaseCount
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium text-slate-950 dark:text-white">{getPortalSiteDisplayName(site)}</span>
                    <span className="block break-all text-xs">{getPortalSiteUrl(site)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {lifecycleError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {lifecycleError}
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(pendingRemoveSite)}
        onClose={closeRemoveSiteModal}
        closeLabel={t('common.close', {}, 'Close')}
        closeOnOverlay={!isRemovingSite}
        title={t('portal.remove_site_action', {}, 'Remove site')}
        description={removeSiteConfirmation}
        className="portal-commercial-dialog rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeRemoveSiteModal} disabled={isRemovingSite}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void handleRemoveSite()} disabled={isRemovingSite}>
              {isRemovingSite ? t('common.saving') : t('portal.remove_site_action', {}, 'Remove site')}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p className="font-semibold text-slate-950 dark:text-white">
            {getPortalSiteDisplayName(pendingRemoveSite)}
          </p>
          {pendingRemoveSite ? (
            <p className="break-words">
              {getPortalSiteUrl(pendingRemoveSite)
                || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
            </p>
          ) : null}
          {removeError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {removeError}
            </p>
          ) : null}
        </div>
      </Modal>
    </section>
  );
}

export function PortalSitesWorkspace() {
  return (
    <Suspense fallback={<div className="h-48 rounded-[18px] bg-slate-100 dark:bg-slate-900" aria-hidden="true" />}>
      <PortalSitesWorkspaceContent />
    </Suspense>
  );
}
