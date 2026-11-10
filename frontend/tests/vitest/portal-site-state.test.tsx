import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PortalBillingSiteUsageList } from '@/components/portal/PortalBillingSiteUsageList';
import type { Site } from '@/lib/portal-client';
import { getVisiblePortalSites, portalSiteNeedsAttention } from '@/lib/portal-site-display';

const site = (status: string, id = status) => ({
  site_id: id, name: id, site_url: `https://${id}.example.test`, status,
} as Site);

describe('Portal site state and account scope', () => {
  it.each(['active', 'inactive'])('does not turn an intentional %s binding into an incident', status => {
    expect(portalSiteNeedsAttention(site(status))).toBe(false);
  });

  it.each(['suspended', 'provisioning', 'unknown', ''])('preserves attention for %s', status => {
    expect(portalSiteNeedsAttention(site(status))).toBe(true);
  });

  it('preserves a missing URL as an issue even for an inactive site', () => {
    expect(portalSiteNeedsAttention({ ...site('inactive'), site_url: '' })).toBe(true);
  });

  function render(bound?: number) {
    return renderToStaticMarkup(<PortalBillingSiteUsageList
      sites={[site('active', 'device'), site('inactive', 'npcink'), site('archived', 'removed')]}
      accountBoundSiteCount={bound}
      t={(_key, params, fallback) => fallback?.replace(/\{\{(\w+)\}\}/g, (_, key) => params?.[key] || '') || ''}
      onSelectSite={() => {}}
    />);
  }

  it('distinguishes account quota from accessible rows without revealing an inaccessible site', () => {
    const html = render(3);
    expect(html).toContain('Account-bound sites: 3; sites accessible to you in this list: 2.');
    expect(html).not.toContain('removed');
    expect(getVisiblePortalSites([site('active'), site('archived')])).toHaveLength(1);
    expect(html).toContain('Inactive');
    expect(html).not.toContain('bg-amber');
  });

  it.each([undefined, 2])('does not invent a scope discrepancy when the total is %s', bound => {
    expect(render(bound)).not.toContain('data-portal-billing="site-scope"');
  });
});
