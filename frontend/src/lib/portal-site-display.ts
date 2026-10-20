import type { Site } from '@/lib/portal-client';

type SiteLike = Pick<Site, 'site_id' | 'name' | 'site_url'> & {
  status?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getPortalSiteUrl(site: SiteLike | null | undefined): string {
  if (!site) {
    return '';
  }

  return normalizeString(site.site_url);
}


export function getPortalSiteUrlDisplay(site: SiteLike | null | undefined, maxLen = 40): string {
  const siteUrl = getPortalSiteUrl(site);
  if (!siteUrl) {
    return '';
  }

  let display = siteUrl.trim();
  try {
    const normalized = display.includes('://') ? display : `https://${display}`;
    const url = new URL(normalized);
    const host = url.host;
    const path = url.pathname.replace(/\/+$/, '');
    display = path && path !== '/' ? `${host}${path}` : host;
    if (url.search) {
      display += url.search;
    }
  } catch {
    display = display.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }

  if (display.length <= maxLen) {
    return display;
  }
  const keep = Math.max(12, maxLen - 1);
  return `${display.slice(0, keep)}…`;
}

export function getPortalSiteDisplayName(site: SiteLike | null | undefined): string {
  if (!site) {
    return '';
  }

  const siteName = normalizeString(site.name);
  if (siteName) {
    return siteName;
  }

  const siteUrl = getPortalSiteUrl(site);
  if (siteUrl) {
    return siteUrl;
  }

  return normalizeString(site.site_id);
}

export function getPortalSiteSecondaryLabel(site: SiteLike | null | undefined): string {
  if (!site) {
    return '';
  }

  const siteUrl = getPortalSiteUrl(site);
  if (siteUrl) {
    return siteUrl;
  }

  return normalizeString(site.site_id);
}

export function getVisiblePortalSites<T extends SiteLike>(sites: readonly T[] | null | undefined): T[] {
  return (sites || []).filter((site) => normalizeString(site.status).toLowerCase() !== 'archived');
}

export function portalSiteNeedsAttention(site: SiteLike | null | undefined): boolean {
  if (!site) {
    return true;
  }

  return normalizeString(site.status).toLowerCase() !== 'active' || !getPortalSiteUrl(site);
}

export function getPortalWordPressAdminUrl(site: SiteLike | null | undefined): string {
  const siteUrl = getPortalSiteUrl(site);
  if (!siteUrl) {
    return '';
  }
  const trimmed = siteUrl.replace(/\/+$/, '');
  try {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    const basePath = url.pathname.replace(/\/+$/, '');
    url.pathname = `${basePath}/wp-admin` || '/wp-admin';
    return url.toString().replace(/\/$/, '');
  } catch {
    return `${trimmed}/wp-admin`;
  }
}
