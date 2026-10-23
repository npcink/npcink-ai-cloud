import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block', locale: 'en-US' });
const mainRoute = '/portal/support/locale_fixture';
const site = {
  site_id: 'site_locale_fixture', name: 'Locale fixture', site_url: 'https://locale.example.test',
  platform_kind: 'wordpress', status: 'active', allowed_actions: ['view_sites', 'view_usage', 'view_billing', 'view_audit'],
};
const subscription = {
  subscription_id: 'sub_locale_fixture', plan_id: 'plan_free', plan_version_id: 'free_v1',
  status: 'active', tier_id: 'free', plan_kind: 'free', package_kind: 'subscription',
  package_alias: 'Free', current_period_start_at: '2026-10-01T00:00:00Z', current_period_end_at: '2026-11-01T00:00:00Z',
};
const entitlements = {
  current_subscription: subscription, subscription, policy: {},
  period_start_at: subscription.current_period_start_at, period_end_at: subscription.current_period_end_at,
  quota_summary: {
    status: 'ok', ai_credits: { key: 'ai_credits', used: 10, limit: 100, remaining: 90, total_remaining: 90, package_limit: 100, package_remaining: 90, paid_remaining: 0, unlimited: false },
    resource_limits: [
      { key: 'active_sites', used: 1, limit: 1, remaining: 0, status: 'ok' },
      { key: 'bound_sites', used: 1, limit: 3, remaining: 2, status: 'ok' },
      { key: 'vector_documents', used: 0, limit: 100, remaining: 100, status: 'ok' },
      { key: 'media_images', used: 0, limit: 100, remaining: 100, status: 'ok' },
    ],
  },
};
const unexpected: string[] = [];
const pageErrors: string[] = [];
const reads: string[] = [];

async function ok(route: Route, data: unknown) {
  await route.fulfill({ json: { status: 'ok', error_code: '', message: 'ok', data, meta: { trace_id: 'locale-fixture', revision: 'm6' } } });
}

async function seed(context: BrowserContext, baseURL: string | undefined, storage: string | null, cookie: string | null, theme = 'light') {
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Isolated loopback preview required');
  await context.addCookies([
    { name: 'npcink_portal_session_token', value: 'locale-fixture', url: baseURL },
    ...(cookie ? [{ name: 'npcink_locale', value: cookie, url: baseURL }] : []),
  ]);
  await context.addInitScript(({ initialStorage, initialTheme, siteId }) => {
    // Seed only the first document; reload must consume what the UI persisted.
    if (!sessionStorage.getItem('locale-fixture-seeded')) {
      if (initialStorage === null) localStorage.removeItem('locale');
      else localStorage.setItem('locale', initialStorage);
      localStorage.setItem('theme', initialTheme);
      sessionStorage.setItem('locale-fixture-seeded', '1');
    }
    sessionStorage.setItem(`npcink.portal.journey.sent.v1:${siteId}:login:succeeded`, '1');
  }, { initialStorage: storage, initialTheme: theme, siteId: site.site_id });
}

test.beforeEach(async ({ page, context, baseURL }) => {
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Isolated loopback preview required');
  unexpected.length = 0; pageErrors.length = 0; reads.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === new URL(baseURL).origin && request.method() === 'GET') {
      if (url.pathname.startsWith('/api/')) reads.push(url.pathname);
      if (url.pathname === '/api/portal/session') return ok(route, {
        email: 'locale@example.test', sites: [site], selected_context: { site, allowed_actions: site.allowed_actions, current_subscription: subscription },
        auth_mode: 'jwt', session: { state: 'active', transport: 'cookie', revocable: true },
      });
      if (url.pathname === '/api/portal/notifications') return ok(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0 });
      if (url.pathname === '/api/portal/support-requests/locale_fixture') return ok(route, {
        request: { request_id: 'locale_fixture', title: 'Locale fixture ticket', description: 'Synthetic locale evidence.', topic: 'general', status: 'open' },
        messages: [], attachments: [], feedback: null,
      });
      if (url.pathname === '/api/portal/account/entitlements') return ok(route, entitlements);
      if (url.pathname === '/api/portal/site-relink-policy') return ok(route, { enabled: true, cooldown_days: 30, same_account_reconnect_allowed: true });
      if (url.pathname === '/api/portal/account/payment-orders') return ok(route, { items: [], total_count: 0, limit: 10, offset: 0 });
      if (url.pathname === '/api/portal/account/credit-packs' || url.pathname === '/api/portal/account/plan-offers') return ok(route, { items: [], offers: [] });
      if (request.headers()['next-router-prefetch'] === '1' && (url.pathname.startsWith('/portal') || url.pathname === '/')) return route.fulfill({ status: 204, body: '' });
      if (['/portal', mainRoute, '/portal/billing', '/admin/login', '/favicon.ico', '/icon.svg'].includes(url.pathname) || url.pathname.startsWith('/_next/')) return route.continue();
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    await route.abort('blockedbyclient');
  });
});

test.afterEach(async ({}, testInfo) => {
  await testInfo.attach('isolated-network-and-errors', { body: JSON.stringify({ unexpected, pageErrors, reads }), contentType: 'application/json' });
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});

async function expectLanguage(page: Page, locale: 'en' | 'zh-CN') {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('header').getByText(locale === 'en' ? 'Customer Center' : '用户服务中心', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: locale === 'en' ? 'Language' : '语言', exact: true })).toBeVisible();
  await expect(page.locator('textarea')).toBeVisible();
}

test('persisted English cold document and full reload hydrate without recovery', async ({ page, context, baseURL }, testInfo) => {
  await seed(context, baseURL, 'en', 'en');
  const response = await page.goto(mainRoute);
  // The translated SSR stays enabled. The client must hydrate this exact snapshot.
  expect(await response!.text()).toContain('用户服务中心');
  await expectLanguage(page, 'en');
  await page.reload();
  await expectLanguage(page, 'en');
  await page.screenshot({ path: testInfo.outputPath('english-cold-and-reload.png'), fullPage: true });
  for (const route of ['/portal', '/portal/billing']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: route === '/portal' ? 'Service' : 'Package', exact: true })).toBeVisible();
    await expect(page.locator('[data-portal-page-state="loading"]')).toHaveCount(0);
    await expect(page.locator('[data-portal-page-state="error"]')).toHaveCount(0);
    expect(await page.locator('.portal-content').evaluate(element => element.getBoundingClientRect().width)).toBe(896);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(route === '/portal' ? 'english-home.png' : 'english-package.png'), fullPage: true });
  }
});

test('empty storage and cookie retain Chinese default despite English browser preference', async ({ page, context, baseURL }) => {
  await seed(context, baseURL, null, null);
  await page.goto(mainRoute);
  await expectLanguage(page, 'zh-CN');
});

for (const [storage, cookie, expected] of [['zh-CN', 'en', 'zh-CN'], ['en', 'zh-CN', 'en']] as const) {
  test(`stored ${storage} retains precedence over ${cookie} cookie`, async ({ page, context, baseURL }) => {
    await seed(context, baseURL, storage, cookie);
    await page.goto(mainRoute);
    await expectLanguage(page, expected);
    expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe(storage);
  });
}

test('English cookie without storage retains the existing Chinese fallback', async ({ page, context, baseURL }) => {
  await seed(context, baseURL, null, 'en');
  await page.goto(mainRoute);
  await expectLanguage(page, 'zh-CN');
  expect(await page.evaluate(() => localStorage.getItem('locale'))).toBeNull();
});

test('stored English waits for a held Navbar chunk to hydrate its Chinese SSR', async ({ page, context, baseURL }, testInfo) => {
  await seed(context, baseURL, 'en', 'en', 'dark');
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  let markHeld!: () => void;
  const held = new Promise<void>(resolve => { markHeld = resolve; });
  const heldChunks: string[] = [];
  await page.route('**/_next/static/chunks/*.js', async route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin || route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const source = await response.text();
    // Find the actual compiled module, without binding the test to a chunk hash.
    if (source.includes('portal-primary-nav') && source.includes('portal.nav_title')) {
      heldChunks.push(new URL(route.request().url()).pathname);
      markHeld();
      await released;
    }
    await route.fulfill({ response });
  });
  try {
    await page.goto(mainRoute, { waitUntil: 'commit' });
    await held;
    const brand = page.locator('header').getByText('用户服务中心', { exact: true });
    await expect(brand).toBeVisible();
    const serverNode = await brand.elementHandle();
    expect(serverNode).not.toBeNull();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe('en');
    expect(pageErrors).toEqual([]);
    release();
    await expectLanguage(page, 'en');
    // Hydration must reuse the original translated SSR node, rather than
    // recovering by replacing the Navbar subtree after a text mismatch.
    expect(await serverNode!.evaluate(node => node.isConnected && node.textContent === 'Customer Center')).toBe(true);
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(heldChunks).toHaveLength(1);
    await testInfo.attach('held-navbar-chunk', { body: JSON.stringify(heldChunks), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('english-delayed-navbar-dark.png'), fullPage: true });
  } finally {
    release();
  }
});

test('hydrated language selection persists separately from cold-start coverage', async ({ page, context, baseURL }) => {
  await seed(context, baseURL, 'zh-CN', 'zh-CN');
  await page.goto(mainRoute);
  await expectLanguage(page, 'zh-CN');
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expectLanguage(page, 'en');
  expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe('en');
  expect((await context.cookies()).find(cookie => cookie.name === 'npcink_locale')?.value).toBe('en');
  await page.reload();
  await expectLanguage(page, 'en');
});

test('Admin login consumes persisted English and its existing locale control', async ({ page, context, baseURL }) => {
  await seed(context, baseURL, 'en', 'en');
  await page.route('**/admin/session', async route => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin || route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ status: 401, json: { status: 'error', error_code: 'auth.admin_session_required', message: 'Fixture signed out', data: {}, meta: { trace_id: 'locale-admin-fixture', revision: 'm6' } } });
  });
  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: 'Sign in to admin', exact: true })).toBeVisible();
  await expect(page.getByLabel('Admin key', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('option', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录管理后台', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '语言', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe('zh-CN');
});
