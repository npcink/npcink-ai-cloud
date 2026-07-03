'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import {
  BackofficeMetricStrip,
  BackofficePageStack,
  BackofficeSectionPanel,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { PortalSiteConnectPanel } from '@/components/portal/PortalSiteConnectPanel';
import {
  PortalEmptyState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { portalClient, type PortalSiteSummaryRecord } from '@/lib/portal-client';
import { resolveCustomerPackageDisplay } from '@/lib/customer-package-display';
import {
  getPortalSiteDisplayName,
  getPortalSiteWordPressUrl,
} from '@/lib/portal-site-display';
import { formatDate } from '@/lib/utils';

const EMPTY_SITES: Array<{
  site_id: string;
  site_name: string;
  account_id?: string;
  status: string;
  plan_name?: string;
  created_at: string;
}> = [];
type PortalSiteListItem = (typeof EMPTY_SITES)[number];

function PortalSitesContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated, selectSite } = useSession();
  const [searchQuery, setSearchQuery] = useState(() => searchParams?.get('q') || '');
  const [siteFilter, setSiteFilter] = useState<'all' | 'active' | 'missing_url'>(
    () => (searchParams?.get('filter') as 'all' | 'active' | 'missing_url') || 'all'
  );
  const [siteSort, setSiteSort] = useState<'current' | 'recent' | 'name'>(
    () => (searchParams?.get('sort') as 'current' | 'recent' | 'name') || 'current'
  );
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [siteSummaryCache, setSiteSummaryCache] = useState<Record<string, PortalSiteSummaryRecord>>({});
  const sites = session?.sites ?? EMPTY_SITES;
  const siteIdsKey = sites.map((site) => site.site_id).join('|');
  const activeSite = sites.find((site) => site.status === 'active') || null;
  const selectedSiteId = session?.site_id || activeSite?.site_id || '';
  const selectedSite = sites.find((site) => site.site_id === selectedSiteId) || activeSite || sites[0] || null;
  const selectedSiteWordPressUrl = getPortalSiteWordPressUrl(selectedSite);
  const addonConnectMode = searchParams?.get('connect') === 'wordpress-addon';
  const addonWordPressUrl = searchParams?.get('site_url') || '';
  const addonSiteName = searchParams?.get('site_name') || '';
  const addonReturnUrl = searchParams?.get('return_url') || '';
  const addonState = searchParams?.get('state') || '';
  const getSiteSummary = useCallback((siteId: string) => siteSummaryCache[siteId] || null, [siteSummaryCache]);
  const getSiteCoverage = useCallback((site: PortalSiteListItem) => getSiteSummary(site.site_id)?.coverage || null, [getSiteSummary]);
  const hasSiteCoverage = useCallback((site: PortalSiteListItem) => Boolean(getSiteCoverage(site) || site.plan_name), [getSiteCoverage]);
  const getSitePackageLabel = (site: PortalSiteListItem) => {
    const coverage = getSiteCoverage(site);
    return (
      resolveCustomerPackageDisplay(t, {
        planId: coverage?.plan_id,
        planVersionId: coverage?.plan_version_id,
        packageAlias: coverage?.package_alias,
        formalPlanName: site.plan_name,
        coverageState: coverage || site.plan_name ? 'covered' : 'uncovered',
      }).display_package_label || t('common.not_found')
    );
  };
  const filteredSites = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sites.filter((site) => {
      if (site.status === 'archived') {
        return false;
      }
      if (siteFilter === 'active' && site.status !== 'active') {
        return false;
      }
      if (siteFilter === 'missing_url' && getPortalSiteWordPressUrl(site)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const siteUrl = getPortalSiteWordPressUrl(site);
      return (
        getPortalSiteDisplayName(site).toLowerCase().includes(query) ||
        (siteUrl || '').toLowerCase().includes(query)
      );
    });
  }, [searchQuery, siteFilter, sites]);
  const sortedSites = useMemo(() => {
    const next = [...filteredSites];
    if (siteSort === 'name') {
      next.sort((left, right) => getPortalSiteDisplayName(left).localeCompare(getPortalSiteDisplayName(right)));
      return next;
    }
    if (siteSort === 'recent') {
      next.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
      return next;
    }
    next.sort((left, right) => {
      if (left.site_id === selectedSiteId) {
        return -1;
      }
      if (right.site_id === selectedSiteId) {
        return 1;
      }
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
    return next;
  }, [filteredSites, selectedSiteId, siteSort]);
  const missingUrlCount = sites.filter((site) => !getPortalSiteWordPressUrl(site)).length;

  useEffect(() => {
    if (!isAuthenticated || !siteIdsKey) {
      setSiteSummaryCache({});
      return;
    }

    let isCancelled = false;

    void Promise.allSettled(sites.map((site) => portalClient.getSiteSummary(site.site_id))).then((results) => {
      if (isCancelled) {
        return;
      }
      const next: Record<string, PortalSiteSummaryRecord> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          next[sites[index].site_id] = result.value.data as PortalSiteSummaryRecord;
        }
      });
      setSiteSummaryCache(next);
    });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, siteIdsKey, sites]);

  useEffect(() => {
    setSearchQuery(searchParams?.get('q') || '');
    setSiteFilter(
      (searchParams?.get('filter') as 'all' | 'active' | 'missing_url') || 'all'
    );
    setSiteSort((searchParams?.get('sort') as 'current' | 'recent' | 'name') || 'current');
  }, [searchParams]);

  useEffect(() => {
    if (addonConnectMode && isAuthenticated) {
      setShowConnectModal(true);
    }
  }, [addonConnectMode, isAuthenticated]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    } else {
      params.delete('q');
    }
    if (siteFilter !== 'all') {
      params.set('filter', siteFilter);
    } else {
      params.delete('filter');
    }
    if (siteSort !== 'current') {
      params.set('sort', siteSort);
    } else {
      params.delete('sort');
    }
    const nextQuery = params.toString();
    const currentQuery = searchParams?.toString() || '';
    if (nextQuery !== currentQuery) {
      router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ''}`, { scroll: false });
    }
  }, [pathname, router, searchParams, searchQuery, siteFilter, siteSort]);

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

  const handleSiteCreated = async (siteId: string) => {
    await selectSite(siteId);
    setShowConnectModal(false);
  };

  return (
    <BackofficePageStack>
      <PortalWorkspaceHeader
        eyebrow={t('portal.nav_sites', {}, 'Sites')}
        title={t('portal.nav_sites', {}, 'Sites')}
        eyebrowInfo={t(
          'portal.sites.desc',
          {},
          'Use this page to see which sites are bound to you, switch the current site, and open the record for a specific site.'
        )}
        currentPage="sites"
        selectedSiteId={selectedSiteId}
        selectedSiteName={selectedSite?.site_name}
        sites={session.sites}
        onSiteChange={(siteId) => void selectSite(siteId)}
        secondaryActions={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowConnectModal(true)}
            disabled={!selectedSite?.account_id}
          >
            {t('portal.connect_site_action', {}, 'Add site')}
          </button>
        )}
        metrics={[
          { label: t('common.sites', {}, 'Sites'), value: session.sites.length },
          {
            label: t('portal.home.filter_attention_only', {}, 'Needs attention'),
            value: session.sites.filter((site) => site.status !== 'active' || !hasSiteCoverage(site)).length,
          },
          {
            label: t('common.current', {}, 'Current'),
            value: getPortalSiteDisplayName(selectedSite) || t('portal.no_site_selected', {}, 'No site selected'),
            detail: selectedSiteWordPressUrl || t('portal.site_url_missing', {}, 'WordPress URL not configured'),
          },
        ]}
        metricsColumnsClassName="lg:grid-cols-3"
      />

      <BackofficeSectionPanel className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
              {t('portal.home.my_sites_title', {}, 'My sites')}
            </h2>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
            <button
              type="button"
              className="btn btn-primary btn-sm lg:hidden"
              onClick={() => setShowConnectModal(true)}
              disabled={!selectedSite?.account_id}
            >
              {t('portal.connect_site_action', {}, 'Add site')}
            </button>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('portal.home.search_sites_placeholder', {}, 'Search site, WordPress URL, or customer')}
              className="input w-full lg:max-w-sm"
            />
          </div>
        </div>

        <BackofficeStackCard className="bg-white/80 dark:bg-slate-950/55">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`btn btn-sm ${siteFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSiteFilter('all')}
                >
                  {t('portal.all_sites_filter', {}, 'All')}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${siteFilter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSiteFilter('active')}
                >
                  {t('portal.home.available_sites_label', {}, 'Available sites')}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${siteFilter === 'missing_url' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSiteFilter('missing_url')}
                >
                  {t('portal.home.needs_attention_sites_label', { count: String(missingUrlCount) }, 'Needs attention')}
                </button>
                <select
                  value={siteSort}
                  onChange={(event) => setSiteSort(event.target.value as 'current' | 'recent' | 'name')}
                  className="rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200"
                >
                  <option value="current">{t('portal.sites_sort_current', {}, 'Current first')}</option>
                  <option value="recent">{t('portal.sites_sort_recent', {}, 'Recently connected')}</option>
                  <option value="name">{t('portal.sites_sort_name', {}, 'Name A-Z')}</option>
                </select>
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('portal.home.search_sites_placeholder', {}, 'Search site name or URL')}
                className="input w-full lg:max-w-sm"
              />
            </div>
          </div>
        </BackofficeStackCard>

        <div className="grid gap-3">
          {filteredSites.length === 0 ? (
            <PortalEmptyState
              title={t('portal.sites.empty_title', {}, 'No sites match this search')}
              description={t(
                'portal.sites.empty_desc',
                {},
                'No connected site matches the current search term. Clear the search or return to the workspace.'
              )}
              actionLabel={t('portal.workspace_label', {}, 'Workspace')}
              actionHref="/portal"
            />
          ) : sortedSites.map((site) => (
            <BackofficeStackCard
              key={site.site_id}
              className={
                site.site_id === selectedSiteId
                  ? 'border-[color:var(--brand-primary)]/20 bg-[color:var(--brand-primary-soft)]/35 ring-1 ring-[color:var(--brand-primary)]/10 dark:bg-blue-500/10'
                  : 'bg-white/80 dark:bg-slate-950/55'
              }
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold text-gray-950 dark:text-white">
                      {getPortalSiteDisplayName(site)}
                    </p>
                    <BackofficeStatusBadge
                      status={site.status === 'active' && getPortalSiteWordPressUrl(site) ? 'active' : 'warning'}
                      label={
                        site.status === 'active' && getPortalSiteWordPressUrl(site)
                          ? t('portal.home.risk_level_normal', {}, 'Normal')
                          : t('portal.home.filter_attention_only', {}, 'Needs attention')
                      }
                      className="text-[0.68rem]"
                    />
                    {!getPortalSiteWordPressUrl(site) ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                        {t('portal.home.site_address_needs_setup', {}, 'Needs setup')}
                      </span>
                    ) : null}
                    {site.site_id === selectedSiteId ? (
                      <span className="rounded-full bg-[color:var(--brand-primary-soft)] px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-primary)]">
                        {t('common.current', {}, 'Current')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {getPortalSiteWordPressUrl(site) ||
                      t('portal.site_url_missing_short', {}, 'Site URL not configured')}
                  </p>
                  <BackofficeMetricStrip
                    items={[
                      {
                        label: t('portal.home.package_card_label', {}, 'Current package'),
                        value: getSitePackageLabel(site),
                      },
                      { label: t('site_details.connected', {}, 'Connected'), value: formatDate(site.created_at) },
                    ]}
                    columnsClassName="lg:grid-cols-2"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {site.status !== 'active' ? null : site.site_id !== selectedSiteId ? (
                    <button type="button" onClick={() => void selectSite(site.site_id)} className="btn btn-primary btn-sm">
                      {t('portal.home.select_site_action', {}, 'Select')}
                    </button>
                  ) : null}
                  <Link href={`/portal/sites/${site.site_id}`} className="btn btn-secondary btn-sm">
                    {t('portal.site_record', {}, 'Site record')}
                  </Link>
                </div>
              </div>
            </BackofficeStackCard>
          ))}
        </div>
      </BackofficeSectionPanel>

      <Modal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title={t('portal.connect_site_heading', undefined, 'Add another WordPress site')}
	        description={t(
	          'portal.connect_site_desc',
	          undefined,
	          'Add a WordPress site to this account, then follow the setup steps in WordPress.'
	        )}
        size="lg"
      >
        {selectedSite?.account_id ? (
          <PortalSiteConnectPanel
            accountId={selectedSite.account_id}
            currentSiteId={selectedSite.site_id}
            sites={session.sites}
            onSiteCreated={(siteId) => handleSiteCreated(siteId)}
            mode="modal"
            onClose={() => setShowConnectModal(false)}
            initialWordPressUrl={addonWordPressUrl}
            initialSiteName={addonSiteName}
            addonReturnUrl={addonReturnUrl}
            addonState={addonState}
          />
        ) : (
          <PortalEmptyState
            title={t('portal.connect_site_account_required_title', {}, 'Switch into a customer-backed site first')}
            description={t(
              'portal.connect_site_account_required_desc',
              {},
              'Select a current site that is already bound to a customer account before adding another site here.'
            )}
            actionLabel={t('portal.workspace_label', {}, 'Workspace')}
            actionHref="/portal"
          />
        )}
      </Modal>
    </BackofficePageStack>
  );
}

export default function PortalSitesPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalSitesContent />
    </Suspense>
  );
}
