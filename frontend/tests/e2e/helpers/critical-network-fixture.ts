import { expect, test as base } from '@playwright/test';

export const test = base.extend<{ criticalNetworkGuard: void }>({
  criticalNetworkGuard: [async ({ context, baseURL }, runTest) => {
    if (process.env.NPCINK_CLOUD_CRITICAL_OFFLINE !== '1') {
      await runTest();
      return;
    }
    const origin = new URL(baseURL || '').origin;
    expect(origin).toBe('http://127.0.0.1:3307');
    const blocked: string[] = [];
    // Page mocks take precedence; unmatched APIs never reach the Next proxy.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || url.pathname.startsWith('/api/')
        || url.pathname.startsWith('/portal/v1/') || url.pathname.startsWith('/admin/auth/')) {
        blocked.push('unmocked_api_or_external_request');
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    try {
      await runTest();
    } finally {
      expect(blocked, 'critical fixture must mock every API/external request').toEqual([]);
    }
  }, { auto: true }],
});
