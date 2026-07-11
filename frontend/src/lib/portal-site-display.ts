import type { Site } from '@/lib/portal-client';

type SiteLike = Pick<Site, 'site_id' | 'site_name' | 'wordpress_url' | 'metadata'> & {
  status?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getPortalSiteWordPressUrl(site: SiteLike | null | undefined): string {
  if (!site) {
    return '';
  }

  const directUrl = normalizeString(site.wordpress_url);
  if (directUrl) {
    return directUrl;
  }

  return normalizeString(site.metadata?.wordpress_url);
}

export function getPortalSiteDisplayName(site: SiteLike | null | undefined): string {
  if (!site) {
    return '';
  }

  const siteName = normalizeString(site.site_name);
  if (siteName) {
    return siteName;
  }

  const wordpressUrl = getPortalSiteWordPressUrl(site);
  if (wordpressUrl) {
    return wordpressUrl;
  }

  return normalizeString(site.site_id);
}

export function getPortalSiteSecondaryLabel(site: SiteLike | null | undefined): string {
  if (!site) {
    return '';
  }

  const wordpressUrl = getPortalSiteWordPressUrl(site);
  if (wordpressUrl) {
    return wordpressUrl;
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

  return normalizeString(site.status).toLowerCase() !== 'active' || !getPortalSiteWordPressUrl(site);
}
