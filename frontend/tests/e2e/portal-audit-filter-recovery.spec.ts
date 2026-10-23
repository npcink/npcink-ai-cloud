import { expect, test, type Page, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const site = {
  site_id: 'site_available', name: '示例站点', site_url: 'https://audit.example.test',
  platform_kind: 'wordpress', status: 'active', allowed_actions: ['view_sites', 'view_audit'],
};
const filter = (page: Page) => page.getByRole('combobox', { name: '站点筛选', exact: true });
const rows = (page: Page) => page.locator('[data-portal-audit="records-table"] tbody tr');
const metrics = (page: Page) => page.locator('[data-portal-header-metrics="title-end"]');
async function ok(route: Route, data: unknown) {
  await route.fulfill({ json: { status: 'ok', error_code: '', message: 'ok', data, meta: { trace_id: 'audit-fixture', revision: 'm6' } } });
}
async function fail(route: Route) {
  await route.fulfill({ status: 504, headers: { 'X-Request-ID': 'audit-read-fixture' }, json: {
    status: 'error', error_code: 'proxy.portal_backend_timeout', message: 'private upstream detail',
    data: {}, meta: { trace_id: 'upstream-fixture', revision: 'm6' },
  } });
}
function auditData(endpoint: string, obsolete = false) {
  const count = obsolete ? 1 : 12;
  return endpoint === 'audit-summary'
    ? { generated_at: '2026-10-23T08:00:00Z', totals: { events: count, succeeded: count, error: 0 }, groups: [] }
    : { items: Array.from({ length: count }, (_, i) => ({
      event_id: `${obsolete ? 'obsolete' : 'current'}-${i}`, event_kind: obsolete ? 'api_key.revoked' : 'site.connected',
      outcome: 'success', created_at: '2026-10-23T08:00:00Z', trace_id: '',
    })) };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const unexpected: string[] = [];
const pageErrors: string[] = [];
test.beforeEach(async ({ page, context, baseURL }) => {
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Loopback preview required');
  unexpected.length = 0; pageErrors.length = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.addCookies([
    { name: 'npcink_portal_session_token', value: 'audit-fixture', url: baseURL },
    { name: 'npcink_locale', value: 'zh-CN', url: baseURL },
  ]);
  await context.addInitScript((siteId) => {
    localStorage.setItem('locale', 'zh-CN');
    sessionStorage.setItem(`npcink.portal.journey.sent.v1:${siteId}:login:succeeded`, '1');
  }, site.site_id);
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(baseURL).origin && request.method() === 'GET') {
      if (url.pathname === '/api/portal/session') return ok(route, {
        email: 'audit@example.test', sites: [site], selected_context: { site, allowed_actions: site.allowed_actions, current_subscription: null }, auth_mode: 'jwt',
        session: { state: 'active', transport: 'cookie', issued_at: '2026-10-23T00:00:00Z', expires_at: '2099-10-23T00:00:00Z', revocable: true },
      });
      if (url.pathname === '/api/portal/notifications') return ok(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0 });
      const endpoint = url.pathname.split('/').at(-1) || '';
      if (url.pathname.startsWith('/api/portal/account/') && ['audit-summary', 'audit-events'].includes(endpoint)) return ok(route, auditData(endpoint));
      if (request.headers()['next-router-prefetch'] === '1' && url.pathname.startsWith('/portal')) return route.fulfill({ status: 204, body: '' });
      if (url.pathname === '/portal/audit' || url.pathname.startsWith('/_next/') || ['/favicon.ico', '/icon.svg'].includes(url.pathname)) return route.continue();
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });
});
test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('isolated-network', { body: JSON.stringify({ unexpected, pageErrors }), contentType: 'application/json' });
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});

for (const endpoint of ['audit-summary', 'audit-events'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`audit filter recovery: ${endpoint} failure clears unavailable site in ${theme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      await page.route(`**/api/portal/account/${endpoint}**`, (route) => {
        if (new URL(route.request().url()).searchParams.get('site_id') === 'unavailable_site') return fail(route);
        return route.fallback();
      });
      await page.goto('/portal/audit?site=unavailable_site&context=keep');
      await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
      await expect(filter(page)).toBeVisible();
      await expect(filter(page)).toHaveValue('unavailable_site');
      await expect(filter(page)).toHaveCount(1);
      await expect(metrics(page)).toHaveCount(0);
      await expect(page.locator('[data-portal-audit="records-table"]')).not.toBeVisible();
      await expect(page.getByText('当前视图里还没有活动', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/private upstream detail|proxy.portal_backend_timeout/)).toHaveCount(0);
      const reference = page.locator('[data-portal-error="support-reference"]');
      await reference.locator('summary').click();
      await expect(reference).toContainText('audit-read-fixture');
      await page.screenshot({ path: testInfo.outputPath('error-filter.png'), fullPage: true });
      await filter(page).selectOption('');
      await expect(page).toHaveURL(/\/portal\/audit\?context=keep$/);
      await expect(filter(page)).toHaveValue('');
      await expect(rows(page)).toHaveCount(10);
      await expect(metrics(page)).toBeVisible();
      await expect(page.locator('[data-portal-page-state="error"]')).toHaveCount(0);
      await expect(page.locator('#portal-audit-site-filter-recovery')).toHaveCount(0);
      await expect(page.locator('thead').getByRole('combobox', { name: '站点筛选' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('recovered-table.png'), fullPage: true });
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, content: document.querySelector('.portal-content')?.getBoundingClientRect().width }));
      expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.content).toBe(896);
    });
  }

  for (const outcome of ['success', 'failure'] as const) {
    test(`audit filter recovery: late ${endpoint} ${outcome} cannot replace the new site`, async ({ page }) => {
      const requested = gate();
      const pending = gate();
      await page.route(`**/api/portal/account/${endpoint}**`, async (route) => {
        if (new URL(route.request().url()).searchParams.get('site_id') !== 'unavailable_site') return route.fallback();
        requested.release();
        await pending.promise;
        if (outcome === 'failure') return fail(route);
        return ok(route, auditData(endpoint, true));
      });
      await page.goto('/portal/audit?site=unavailable_site');
      await requested.promise;
      await expect(filter(page)).toBeVisible();
      await expect(metrics(page)).toHaveCount(0);
      await filter(page).selectOption(site.site_id);
      await expect(rows(page)).toHaveCount(10);
      const lateResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname.endsWith(endpoint) && url.searchParams.get('site_id') === 'unavailable_site';
      });
      pending.release();
      const response = await lateResponse;
      await response.finished();
      // Drain the old fetch/React work before checking that it did not repaint.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(filter(page)).toHaveValue(site.site_id);
      await expect(rows(page)).toHaveCount(10);
      await expect(page.locator('[data-portal-page-state="error"]')).toHaveCount(0);
      await expect(metrics(page)).toBeVisible();
    });
  }
}

test('audit filter recovery: retry keeps the selected unavailable site', async ({ page }) => {
  let failed = true;
  await page.route('**/api/portal/account/audit-events**', (route) => failed ? fail(route) : route.fallback());
  await page.goto('/portal/audit?site=unavailable_site');
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(rows(page)).toHaveCount(10);
  await expect(filter(page)).toHaveValue('unavailable_site');
  await expect(page).toHaveURL(/site=unavailable_site$/);
});
