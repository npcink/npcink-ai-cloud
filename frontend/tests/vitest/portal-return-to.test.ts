import { describe, expect, it } from 'vitest';
import { resolvePortalReturnTo } from '@/lib/portal-return-to';

describe('Portal authentication return targets', () => {
  it('preserves the full WordPress binding request', () => {
    const target = '/portal?connect=wordpress-addon&site_url=https%3A%2F%2Fsite.example&state=one-time&return_url=https%3A%2F%2Fsite.example%2Fwp-admin%2Fadmin-post.php';
    expect(resolvePortalReturnTo(target)).toBe(target);
  });
  it.each(['https://evil.example/portal', '//evil.example/portal', '/portal/../../outside', '/portal-other', 'javascript:alert(1)', '/\\evil.example/portal'])(
    'rejects destinations outside the Portal: %s', value => {
      expect(resolvePortalReturnTo(value, '/portal#sites')).toBe('/portal#sites');
    },
  );
  it('retains ordinary account and package landings', () => {
    expect(resolvePortalReturnTo(null, '/portal#sites')).toBe('/portal#sites');
    expect(resolvePortalReturnTo('/portal/billing?plan=plus')).toBe('/portal/billing?plan=plus');
  });
});
