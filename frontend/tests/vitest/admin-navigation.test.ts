import { describe, expect, it } from 'vitest';
import { normalizeObservationWindow, observationCapability, observationWindows } from '@/features/admin/observability/window';
import { adminNavigationWindowAdjusted, adminNavigationWindowHint, adminScopedNavigationHref, adminSecondaryParentHref } from '@/features/admin/navigation';

describe('Admin navigation scope contracts', () => {
  it.each([336, 720, 2160])('preserves the common %i-hour window and encoded site', hours => {
    const source = new URLSearchParams({ window: String(hours), site: 'site/a & b', focus: 'private-detail', sort: 'failures' });
    for (const route of ['/admin/usage-statistics', '/admin/media-observability', '/admin/vector-observability']) {
      const target = new URL(adminScopedNavigationHref(route, source), 'https://example.com');
      expect(target.searchParams.get('window')).toBe(String(route === '/admin/usage-statistics' ? hours : Math.min(hours, 720)));
      expect(target.searchParams.get('site')).toBe('site/a & b');
      expect(target.searchParams.has('focus')).toBe(false);
      expect(target.searchParams.has('sort')).toBe(false);
    }
  });

  it('respects plugin and feedback runtime limits and explains the changed scope', () => {
    const source = new URLSearchParams('window=2160&site=site-a');
    for (const route of ['/admin/media-observability', '/admin/vector-observability', '/admin/usage-statistics?view=quality']) {
      expect(new URL(adminScopedNavigationHref(route, source), 'https://example.com').searchParams.get('window')).toBe('720');
      expect(adminNavigationWindowHint(route, source, 'zh-CN')).toContain('近 30 天');
    }
    expect(adminScopedNavigationHref('/admin/plugin-observability', source)).toBe('/admin/plugin-observability?window=720&site=site-a');
    expect(adminNavigationWindowHint('/admin/plugin-observability', source, 'zh-CN')).toContain('近 30 天');
    expect(adminScopedNavigationHref('/admin/agent-feedback', source)).toBe('/admin/agent-feedback?window=168&site=site-a');
    expect(adminNavigationWindowHint('/admin/agent-feedback', source, 'en')).toContain('last 7 days');
    expect(adminScopedNavigationHref('/admin/agent-feedback', new URLSearchParams())).toBe('/admin/agent-feedback?window=24');
  });

  it('keeps quality as a view of usage statistics', () => {
    expect(adminScopedNavigationHref('/admin/usage-statistics?view=quality', new URLSearchParams('window=720&site=site-a')))
      .toBe('/admin/usage-statistics?view=quality&window=720&site=site-a');
  });

  it('maps audit site scope without inventing an unsupported hour filter', () => {
    const target = new URL(adminScopedNavigationHref('/admin/audit', new URLSearchParams('window=720&site=site-a&created_from=2026-10-01T00:00:00Z')), 'https://example.com');
    expect(target.searchParams.get('site_id')).toBe('site-a');
    expect(target.searchParams.get('created_from')).toBe('2026-10-01T00:00:00Z');
    expect(target.searchParams.has('window')).toBe(false);
    expect(target.searchParams.has('site')).toBe(false);
    expect(adminScopedNavigationHref('/admin/troubleshooting', target.searchParams)).toBe('/admin/troubleshooting?window=336&site=site-a');
  });

  it('transfers advisor site and supported scope without inventing a time filter', () => {
    expect(adminScopedNavigationHref('/admin/ai-advisor', new URLSearchParams('window=720&site=site-a&scope=provider'))).toBe('/admin/ai-advisor?site=site-a');
  });

  it('keeps supported legacy windows and identifies an adjusted destination', () => {
    const source = new URLSearchParams('window=24');
    expect(adminScopedNavigationHref('/admin/plugin-observability', source)).toBe('/admin/plugin-observability?window=24');
    expect(adminNavigationWindowAdjusted('/admin/plugin-observability', source)).toBe(false);
    expect(adminScopedNavigationHref('/admin/media-observability', source)).toBe('/admin/media-observability?window=336');
    expect(adminNavigationWindowAdjusted('/admin/media-observability', source)).toBe(true);
    expect(adminNavigationWindowAdjusted('/admin/audit', source)).toBe(false);
  });

  it('ignores invalid windows and unrelated external-looking parameters', () => {
    expect(adminScopedNavigationHref('/admin/plugin-observability', new URLSearchParams('window=999999&return_to=https://evil.example&focus=secret')))
      .toBe('/admin/plugin-observability?window=24');
  });

  it.each([null, '', 'invalid', '999999'])('uses the destination default for an absent or invalid window (%s)', raw => {
    const source = new URLSearchParams({ site: 'site-a' });
    if (raw !== null) source.set('window', raw);
    expect(adminScopedNavigationHref('/admin/plugin-observability', source)).toBe('/admin/plugin-observability?window=24&site=site-a');
    expect(adminScopedNavigationHref('/admin/agent-feedback', source)).toBe('/admin/agent-feedback?window=24&site=site-a');
    expect(adminScopedNavigationHref('/admin/troubleshooting', source)).toBe('/admin/troubleshooting?window=336&site=site-a');
  });

  it('preserves an explicitly chosen 14-day plugin window', () => {
    expect(adminScopedNavigationHref('/admin/plugin-observability', new URLSearchParams('window=336&site=site-a')))
      .toBe('/admin/plugin-observability?window=336&site=site-a');
  });

  it('assigns evidence pages to the correct parent without claiming unrelated routes', () => {
    expect(adminSecondaryParentHref('/admin/plugin-observability')).toBe('/admin/usage-statistics');
    for (const route of ['/admin/audit', '/admin/agent-feedback', '/admin/ai-advisor']) {
      expect(adminSecondaryParentHref(route)).toBe('/admin/troubleshooting');
    }
    expect(adminSecondaryParentHref('/admin/accounts')).toBeNull();
    expect(adminSecondaryParentHref('/admin/plugin-observability-unknown')).toBeNull();
  });
});


describe('Observation capability choices', () => {
  it.each(['media', 'vector', 'quality'] as const)('%s never requests a silently truncated 90-day window', capability => {
    expect(observationWindows(capability)).toEqual([336, 720]);
    expect(normalizeObservationWindow('2160', 336, capability)).toBe(720);
    expect(normalizeObservationWindow('bad', 336, capability)).toBe(336);
  });
  it('distinguishes quality summaries and plugin history within the same route', () => {
    expect(observationCapability('/admin/usage-statistics?view=quality&group=plugins')).toBe('quality');
    expect(observationCapability('/admin/usage-statistics?group=plugins')).toBe('pluginHistory');
    expect(observationCapability('/admin/usage-statistics')).toBe('runtime');
    expect(normalizeObservationWindow('2160')).toBe(2160);
    expect(normalizeObservationWindow('2160', 336, 'pluginHistory')).toBe(2160);
  });
  it('uses each consumer default and narrows known incompatible legacy windows', () => {
    expect(normalizeObservationWindow(null, undefined, 'plugin')).toBe(24);
    expect(normalizeObservationWindow('2160', 24, 'plugin')).toBe(720);
    expect(normalizeObservationWindow('336', 24, 'feedback')).toBe(168);
    expect(normalizeObservationWindow('24', 336, 'media')).toBe(336);
  });
});
