'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PortalSection, PortalCard } from '@/components/portal/PortalScaffold';
import { PortalActionIcon, PortalRowActions, type PortalRowActionItem } from '@/components/portal/PortalRowActions';
import { PortalStatusBadge, PortalStatusInline } from '@/components/portal/PortalStatusBadge';
import { PortalEmptyState, PortalLoadingState } from '@/components/portal/PortalPageState';
import { PortalSiteConnectPanel } from '@/components/portal/PortalSiteConnectPanel';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrl,
  getPortalSiteUrlDisplay,
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


function siteConnectionLabel(site: Site, t: PortalTranslator): string {
  if (site.status === 'active') {
    return t('portal.sites.table_ready', {}, 'Connected');
  }
  if (site.status === 'inactive') {
    return t('portal.site_status_inactive', {}, 'Inactive');
  }
  if (site.status === 'provisioning') {
    return t('portal.site_status_provisioning', {}, 'Provisioning');
  }
  return t('portal.site_status_suspended', {}, 'Suspended');
}

function SiteConnectionStatus({ site, t }: { site: Site; t: PortalTranslator }) {
  const label = siteConnectionLabel(site, t);
  if (site.status === 'active') {
    return <PortalStatusInline label={label} />;
  }
  return (
    <PortalStatusBadge
      status={site.status === 'inactive' || site.status === 'provisioning' ? 'warning' : 'error'}
      label={label}
      className="normal-case tracking-normal"
    />
  );
}


export type PortalSitesCapacityAlert = {
  id?: string;
  label: string;
  detail?: string;
  href?: string;
  action?: string;
};

function buildSiteRowActions(args: {
  site: Site;
  t: PortalTranslator;
  disabled: boolean;
  openLifecycleModal: (site: Site, status: 'active' | 'inactive') => void;
  onRemove: (site: Site) => void;
}): {
  primary: PortalRowActionItem;
  secondary: PortalRowActionItem | null;
  inline: PortalRowActionItem[];
  overflow: PortalRowActionItem[];
} {
  const { site, t, disabled, openLifecycleModal, onRemove } = args;
  const siteHref = `/portal/sites/${encodeURIComponent(site.site_id)}#service-status`;
  const wpAdminUrl = getPortalWordPressAdminUrl(site);
  const canProvision = Boolean(site.allowed_actions?.includes('provision_sites'));
  const canRemove = Boolean(site.allowed_actions?.includes('remove_sites'));
  const viewSite: PortalRowActionItem = {
    id: 'view-site',
    label: t('portal.site_record', {}, 'Open site'),
    href: siteHref,
    iconOnly: true,
  };
  const wpAdmin: PortalRowActionItem | null = wpAdminUrl
    ? {
        id: 'wp-admin',
        label: t('portal.sites.open_wordpress_admin', {}, 'Open WordPress admin'),
        href: wpAdminUrl,
        external: true,
        disabled: disabled || site.status === 'suspended',
      }
    : null;

  // Desktop density: only the primary open-site (or Activate) control is visible;
  // WP admin + deactivate/remove live in the overflow menu.
  let primary: PortalRowActionItem = viewSite;
  const secondary: PortalRowActionItem | null = null;
  const inline: PortalRowActionItem[] = [];
  const overflow: PortalRowActionItem[] = [];

  if (canProvision && site.status === 'inactive') {
    primary = {
      id: 'activate',
      label: t('portal.activate_site_action', {}, 'Activate'),
      disabled,
      onClick: () => openLifecycleModal(site, 'active'),
    };
    overflow.push({ ...viewSite, iconOnly: false });
  }

  if (wpAdmin) {
    overflow.push(wpAdmin);
  }

  // Danger ops stay in ⋯; parent modals own confirm (confirm: false).
  if (site.status === 'active' && canProvision) {
    overflow.push({
      id: 'deactivate',
      label: t('portal.deactivate_site_action', {}, 'Deactivate'),
      disabled,
      danger: true,
      confirm: false,
      onClick: () => openLifecycleModal(site, 'inactive'),
    });
  }
  if (canRemove && site.status !== 'suspended') {
    overflow.push({
      id: 'remove',
      label: t('portal.remove_site_action', {}, 'Remove site'),
      disabled,
      danger: true,
      confirm: false,
      onClick: () => onRemove(site),
    });
  }

  return { primary, secondary, inline, overflow };
}

function PortalSitesWorkspaceContent({ capacityAlerts = [] }: { capacityAlerts?: PortalSitesCapacityAlert[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { session, isAuthenticated, refresh } = useSession();
  const routeSearchQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(() => routeSearchQuery);
  const [showConnectModal, setShowConnectModal] = useState(false);
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
  const [connectGuideOpen, setConnectGuideOpen] = useState(false);
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

  if (addonConnectMode && showConnectModal) {
    // Minimal bind page for ordinary site owners: no workspace, no dashboard chrome.
    return (
      <section className="mx-auto w-full max-w-md py-10" data-portal-bind="page">
        <PortalSiteConnectPanel
          onSubmittingChange={setIsConnecting}
          accounts={addonAccounts}
          accountsError={addonAccountsError}
          isLoadingAccounts={isLoadingAddonAccounts}
          onRetryAccounts={() => setAddonAccountsRetryVersion((current) => current + 1)}
          initialSiteUrl={addonSiteUrl}
          initialSiteName={addonSiteName}
          addonReturnUrl={addonReturnUrl}
          addonState={addonState}
        />
      </section>
    );
  }

  return (
    <section id="sites" className="scroll-mt-24" data-portal-home="sites-workspace">
      <PortalSection className="space-y-2 p-3 md:px-4 md:py-3" variant="portal" data-portal-sites="section">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              {t('portal.home.my_sites_title', {}, 'My sites')}
            </h2>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            {showSiteSearch ? (
              <div className="w-full sm:max-w-sm sm:shrink-0">
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
              </div>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800 sm:self-auto dark:bg-blue-500 dark:text-slate-950 dark:hover:bg-blue-400"
              data-portal-sites="connect-new"
              aria-label={
                connectGuideOpen
                  ? t('common.close', {}, 'Close')
                  : t('portal.sites.connect_new_action', {}, 'Connect new site')
              }
              title={
                connectGuideOpen
                  ? t('common.close', {}, 'Close')
                  : t('portal.sites.connect_new_action', {}, 'Connect new site')
              }
              aria-expanded={visibleSites.length > 0 ? connectGuideOpen : undefined}
              data-portal-sites-connect={connectGuideOpen ? 'open' : 'closed'}
              onClick={() => {
                const nextOpen = !connectGuideOpen;
                setConnectGuideOpen(nextOpen);
                if (nextOpen && typeof document !== 'undefined') {
                  window.requestAnimationFrame(() => {
                    document.getElementById('portal-sites-connect-guide')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  });
                }
              }}
            >
              <PortalActionIcon id={connectGuideOpen ? 'connect-collapse' : 'connect-new'} />
            </button>
          </div>
        </div>
        {visibleSites.length > 0 && connectGuideOpen ? (
          <div
            id="portal-sites-connect-guide"
            className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100"
            data-portal-sites="connect-guide"
            data-portal-sites-guide="under-connect"
            role="region"
            aria-label={t('portal.sites.connect_hint_title', {}, 'Need to connect another site?')}
          >
            <div className="min-w-0">
              <p className="font-semibold">
                {t('portal.sites.connect_hint_title', {}, 'Need to connect another site?')}
              </p>
              <p className="mt-1 leading-6 text-blue-900/80 dark:text-blue-100/80">
                {t(
                  'portal.sites.connect_hint_desc',
                  {},
                  'Open npcink-cloud-addon in WordPress and start the connection there. After binding, the site will appear here.'
                )}
              </p>
            </div>
          </div>
        ) : null}
        {capacityAlerts.length > 0 ? (
          <div
            className="w-full overflow-hidden rounded-xl border border-amber-200/90 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
            data-portal-sites="capacity-alerts"
          >
            <ul className="divide-y divide-amber-200/70 dark:divide-amber-900/50">
              {capacityAlerts.map((item) => (
                <li
                  key={item.id || item.label}
                  className="px-3 py-2"
                  data-portal-sites="capacity-alert-row"
                >
                  <div className="flex flex-nowrap items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm font-semibold text-gray-950 dark:text-white">{item.label}</p>
                    {item.href && item.action ? (
                      <Link
                        href={item.href}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
                        aria-label={item.action}
                        title={item.action}
                        data-portal-sites="view-plan"
                      >
                        <PortalActionIcon id="view-plan" />
                      </Link>
                    ) : null}
                  </div>
                  {item.detail ? (
                    <p
                      className="mt-1 text-xs leading-5 text-amber-900/85 dark:text-amber-100/85"
                      data-portal-sites="capacity-alert-detail"
                    >
                      {item.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
            <PortalEmptyState
              title={visibleSites.length
                ? t('portal.sites.empty_title', {}, 'No sites match this search')
                : t('portal.no_sites', {}, 'No sites')}
              description={visibleSites.length
                ? t('portal.sites.empty_desc', {}, 'No connected site matches the current search term. Clear the search to see every site.')
                : t('portal.sites.empty_list_hint', {}, 'Use Connect new site above for the WordPress binding steps.')}
            />
          ) : (
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">
                {t('portal.site_register_desc', {}, 'Every connected site appears here with its current service status.')}
              </caption>
              <thead className="border-b border-slate-200/80 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th scope="col" className="min-w-0 px-2 py-1.5 font-medium">{t('portal.sites.table_site', {}, 'Site')}</th>
                  <th scope="col" className="w-0 whitespace-nowrap px-2 py-1.5 font-medium">{t('portal.sites.table_status', {}, 'Connection')}</th>
                  <th scope="col" className="w-0 whitespace-nowrap px-2 py-1.5 text-right font-medium">{t('portal.sites.table_actions', {}, 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {sortedSites.map((site) => {
                  const rowActions = buildSiteRowActions({
                    site,
                    t,
                    disabled: siteRefreshFailed || isRefreshingSites,
                    openLifecycleModal,
                    onRemove: (nextSite) => {
                      setRemoveError('');
                      setPendingRemoveSite(nextSite);
                    },
                  });
                  return (
                  <tr key={site.site_id} className="portal-list-row align-middle">
                    <th scope="row" className="min-w-0 px-2 py-1.5 font-normal">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <Link
                          href={`/portal/sites/${encodeURIComponent(site.site_id)}#service-status`}
                          className="max-w-[12rem] shrink-0 truncate font-semibold text-slate-950 hover:text-blue-700 dark:text-white dark:hover:text-blue-300 sm:max-w-[16rem]"
                          title={getPortalSiteUrl(site) || undefined}
                          data-portal-sites="site-name"
                        >
                          {getPortalSiteDisplayName(site)}
                        </Link>
                        <span
                          className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400"
                          title={getPortalSiteUrl(site) || undefined}
                          data-portal-sites="site-url"
                        >
                          {getPortalSiteUrlDisplay(site)
                            || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
                        </span>
                      </div>
                    </th>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5">
                      <SiteConnectionStatus site={site} t={t} />
                    </td>
                    <td className="w-0 whitespace-nowrap px-2 py-1.5 text-right">
                      <PortalRowActions
                        primary={rowActions.primary}
                        secondary={rowActions.secondary}
                        inline={rowActions.inline}
                        overflow={rowActions.overflow}
                        moreLabel={t('portal.sites.more_actions', {}, 'More actions')}
                        overflowTestId="desktop-actions"
                        className="flex-nowrap justify-end gap-1.5"
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid gap-3 lg:hidden">
          {sortedSites.length === 0 ? (
            <PortalEmptyState
              title={visibleSites.length
                ? t('portal.sites.empty_title', {}, 'No sites match this search')
                : t('portal.no_sites', {}, 'No sites')}
              description={visibleSites.length
                ? t('portal.sites.empty_desc', {}, 'No connected site matches the current search term. Clear the search to see every site.')
                : t('portal.sites.empty_list_hint', {}, 'Use Connect new site above for the WordPress binding steps.')}
            />
          ) : sortedSites.map((site) => {
              const rowActions = buildSiteRowActions({
                site,
                t,
                disabled: siteRefreshFailed || isRefreshingSites,
                openLifecycleModal,
                onRemove: (nextSite) => {
                  setRemoveError('');
                  setPendingRemoveSite(nextSite);
                },
              });
              return (
            <PortalCard key={site.site_id} variant="portal" className="portal-list-row !px-3 !py-2.5">
              <div className="flex flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <Link
                    href={`/portal/sites/${encodeURIComponent(site.site_id)}#service-status`}
                    className="max-w-[14rem] truncate text-sm font-semibold text-slate-950 hover:text-blue-700 dark:text-white dark:hover:text-blue-300"
                    title={getPortalSiteUrl(site) || undefined}
                    data-portal-sites="site-name"
                  >
                    {getPortalSiteDisplayName(site)}
                  </Link>
                  <span
                    className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400"
                    title={getPortalSiteUrl(site) || undefined}
                    data-portal-sites="site-url"
                  >
                    {getPortalSiteUrlDisplay(site)
                      || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
                  </span>
                  <SiteConnectionStatus site={site} t={t} />
                </div>
                <PortalRowActions
                  primary={rowActions.primary}
                  secondary={rowActions.secondary}
                  inline={rowActions.inline}
                  overflow={rowActions.overflow}
                  moreLabel={t('portal.sites.more_actions', {}, 'More actions')}
                  overflowTestId="mobile-actions"
                  className="w-full flex-nowrap justify-start gap-1.5"
                />
              </div>
            </PortalCard>
              );
            })}
        </div>
        {visibleSites.length === 0 && !searchQuery.trim() ? (
          <div
            className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100"
            data-portal-sites="connect-guide"
            data-portal-sites-guide="empty"
            id="portal-sites-connect-guide"
          >
            <p className="font-semibold">
              {t('portal.sites.connect_first_hint_title', {}, 'Connect your first WordPress site')}
            </p>
            <p className="mt-1 leading-6 text-blue-900/80 dark:text-blue-100/80">
              {t(
                'portal.sites.connect_hint_desc',
                {},
                'Open npcink-cloud-addon in WordPress and start the connection there. After binding, the site will appear here.'
              )}
            </p>
          </div>
        ) : null}
      </PortalSection>


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

export function PortalSitesWorkspace({
  capacityAlerts = [],
}: {
  capacityAlerts?: PortalSitesCapacityAlert[];
}) {
  return (
    <Suspense fallback={<PortalLoadingState message="Loading" compact />}>
      <PortalSitesWorkspaceContent capacityAlerts={capacityAlerts} />
    </Suspense>
  );
}
