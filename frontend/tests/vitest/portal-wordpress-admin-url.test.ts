import { describe, expect, it } from 'vitest';
import { getPortalWordPressAdminUrl } from '@/lib/portal-site-display';

const site = (site_url: string, platform_kind = 'wordpress') => ({
  site_id: 'owned-site', name: 'My website', site_url, platform_kind,
});

describe('WordPress dashboard navigation', () => {
  it.each([
    ['https://example.test', 'https://example.test/wp-admin/'],
    ['https://example.test/blog/', 'https://example.test/blog/wp-admin/'],
    ['http://localhost:8080/blog', 'http://localhost:8080/blog/wp-admin/'],
    ['https://example.test/blog/?preview=1#article', 'https://example.test/blog/wp-admin/'],
  ])('preserves the site origin and subdirectory: %s', (input, expected) => {
    expect(getPortalWordPressAdminUrl(site(input))).toBe(expected);
  });

  it.each([
    '', 'invalid', '//example.test', 'javascript:alert(1)',
    'data:text/html,hello', 'file:///tmp/site',
    'https://user:password@example.test',
  ])('does not create unsafe or ambiguous links: %s', (input) => {
    expect(getPortalWordPressAdminUrl(site(input))).toBe('');
  });

  it('does not infer a WordPress dashboard for another platform or absent site', () => {
    expect(getPortalWordPressAdminUrl(site('https://example.test', 'other'))).toBe('');
    expect(getPortalWordPressAdminUrl(null)).toBe('');
  });
});
