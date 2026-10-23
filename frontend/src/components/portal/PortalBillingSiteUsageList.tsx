'use client';

import type { Site } from '@/lib/portal-client';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrlDisplay,
  getVisiblePortalSites,
} from '@/lib/portal-site-display';
import { PortalStatusBadge, PortalStatusInline } from '@/components/portal/PortalStatusBadge';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

function siteConnectionLabel(site: Site, t: TranslateFn): string {
  if (site.status === 'active') {
    return t('portal.sites.table_ready', {}, 'Connected');
  }
  if (site.status === 'inactive') {
    return t('portal.site_status_inactive', {}, 'Inactive');
  }
  if (site.status === 'provisioning') {
    return t('portal.site_status_provisioning', {}, 'Provisioning');
  }
  return t('portal.site_status_unknown', {}, 'Unknown');
}

export type PortalBillingSiteUsageListProps = {
  sites: readonly Site[] | null | undefined;
  t: TranslateFn;
  onSelectSite: (site: Site) => void;
  /** Temporary focus flash after「查看本期用量」scroll; quiet ring/bg only. */
  highlight?: boolean;
};

export function PortalBillingSiteUsageList({
  sites,
  t,
  onSelectSite,
  highlight = false,
}: PortalBillingSiteUsageListProps) {
  const visibleSites = getVisiblePortalSites(sites);
  const isSingleSite = visibleSites.length === 1;
  const listDescription = isSingleSite
    ? t(
        'portal.billing.site_usage_list_desc_single',
        {},
        'Review usage trends and AI credit records.',
      )
    : t(
        'portal.billing.site_usage_list_desc',
        {},
        'Choose a site to review its trend and AI credit records.',
      );

  return (
    <section
      id="site-usage"
      className={[
        'scroll-mt-24 space-y-3 rounded-xl p-1 -m-1 transition-[box-shadow,background-color] duration-500',
        highlight
          ? 'bg-blue-50/80 shadow-[0_0_0_2px_rgba(96,165,250,0.75)] dark:bg-blue-950/40 dark:shadow-[0_0_0_2px_rgba(59,130,246,0.55)]'
          : 'bg-transparent shadow-none',
      ].join(' ')}
      data-portal-billing="site-usage-list"
      data-portal-billing-highlight={highlight ? 'true' : undefined}
      data-portal-billing-site-count={String(visibleSites.length)}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            {t('portal.billing.site_usage_list_title', {}, 'Site usage')}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {listDescription}
          </p>
        </div>
      </div>

      {visibleSites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t('portal.no_sites', {}, 'No Connected Sites')}
        </div>
      ) : (
        <div
          role="list"
          className={isSingleSite ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2'}
          aria-label={t('portal.billing.site_usage_list_title', {}, 'Site usage')}
          data-portal-billing-site-layout={isSingleSite ? 'single' : 'multi'}
        >
          {visibleSites.map((site) => {
            const label = siteConnectionLabel(site, t);
            const urlDisplay = getPortalSiteUrlDisplay(site);
            return (
              <button
                key={site.site_id}
                type="button"
                role="listitem"
                className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-3 text-left transition hover:border-blue-300/80 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-blue-700/60 dark:hover:bg-blue-950/20"
                onClick={() => onSelectSite(site)}
                data-portal-billing="site-usage-item"
                data-site-id={site.site_id}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">
                    {getPortalSiteDisplayName(site)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                    {urlDisplay || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
                  </span>
                </span>
                <span className="shrink-0">
                  {site.status === 'active' ? (
                    <PortalStatusInline label={label} />
                  ) : (
                    <PortalStatusBadge
                      status={site.status === 'inactive' || site.status === 'provisioning' ? 'warning' : 'error'}
                      label={label}
                      className="normal-case tracking-normal"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
