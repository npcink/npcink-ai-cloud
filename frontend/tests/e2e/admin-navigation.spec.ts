import { test, expect, type Page } from '@playwright/test';
import { installRouteAcceptanceMocks } from './helpers/admin-route-fixtures';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

test.use({ viewport: { width: 1440, height: 1050 } });

async function navigationMocks(page: Page) {
  await installAdminMocks(page);
  await installRouteAcceptanceMocks(page, '/admin/media-observability');
  await installRouteAcceptanceMocks(page, '/admin/vector-observability');
  await page.route('**/api/admin/agent-feedback?*', route => route.fulfill({ json: buildAdminApiEnvelope({ generated_at: '2026-10-07T06:00:00Z', totals: { events_total: 0 }, timeline: [], sites: [], workflows: [], steps: [], recent_events: [] }) }));
  const branch = {
    scope: 'operations_analysis', headline: 'Operations diagnosis', operator_summary: 'Review failed runs', status: 'attention', severity: 'warning',
    source_context: { advisor: {
      scope: 'operations_analysis', confidence: 'high', summary: 'Review failed runs',
      recommended_actions: [{ action: 'inspect_failed_runs_by_site_and_ability', requires_operator: true }],
      evidence: [{ kind: 'runtime', label: 'runtime-evidence-' + 'x'.repeat(160), ref: 'request-' + 'a'.repeat(180) }],
      signals: [{ code: 'ops.runtime_quality', failed_runs: 3, total_runs: 100 }],
    } },
  };
  await page.route('**/api/admin/advisor/ops-summary-preview?*', route => route.fulfill({ json: buildAdminApiEnvelope({ baseline: branch, ai: branch, comparison: { ai_used: false, ai_called: false } }) }));
}

async function expectParent(page: Page, href: string) {
  const active = page.locator('[data-ui="admin-primary-nav"] a[aria-current="page"]');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('href', href);
  await expect(page.locator('[data-ui="admin-route-breadcrumb"]')).toContainText((await active.innerText()).trim());
}

test('all observation pages expose one shared family with the correct parent', async ({ page }, testInfo) => {
  await navigationMocks(page);
  const pluginRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/admin/plugin-observability?')) pluginRequests.push(request.url()); });
  const routes = ['/admin/usage-statistics', '/admin/plugin-observability', '/admin/media-observability', '/admin/vector-observability', '/admin/usage-statistics?view=quality'];
  for (const route of routes) {
    await page.goto(`${route}${route.includes('?') ? '&' : '?'}window=720&site=site_mvp`);
    await expectParent(page, '/admin/usage-statistics');
    const nav = page.locator('[data-ui="admin-observability-tabs"]');
    await expect(nav.getByRole('link')).toHaveCount(5);
    const active = nav.locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute('href', `${route}${route.includes('?') ? '&' : '?'}window=720&site=site_mvp`);
    await expect(nav.locator('a[href="/admin/plugin-observability?window=720&site=site_mvp"]')).toBeVisible();
    if (route === '/admin/plugin-observability') {
      await expect(page.getByRole('button', { name: /^近 30 天$|^Last 30 days$/i })).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => pluginRequests.some(url => url.includes('window_hours=720') && url.includes('site_id=site_mvp'))).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`${route.split('/').at(-1)!.replace('?', '-')}-1440.png`), fullPage: true });
  }
});

test('observation links and parent return preserve scope through browser history', async ({ page }) => {
  await navigationMocks(page);
  await page.goto('/admin/usage-statistics?window=720&site=site_mvp');
  await page.locator('[data-ui="admin-observability-tabs"] a[href^="/admin/plugin-observability"]').click();
  await expect(page).toHaveURL(/\/admin\/plugin-observability\?window=720&site=site_mvp$/);
  await expect(page.getByRole('heading', { name: /^插件观测$|^Plugin Observability$/i })).toBeVisible();
  await page.locator('[data-ui="admin-observability-tabs"] a[href^="/admin/media-observability"]').click();
  await expect(page).toHaveURL(/\/admin\/media-observability\?window=720&site=site_mvp$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/plugin-observability\?window=720&site=site_mvp$/);
  await page.reload();
  await expectParent(page, '/admin/usage-statistics');
  await page.locator('[data-ui="admin-route-breadcrumb"] a').click();
  await expect(page).toHaveURL(/\/admin\/usage-statistics\?window=720&site=site_mvp$/);
});

test('observation navigation wraps on mobile and remains keyboard reachable', async ({ page }, testInfo) => {
  await navigationMocks(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/admin/plugin-observability?')) requests.push(request.url()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/plugin-observability?window=336');
  await expect(page.getByRole('button', { name: /^近 14 天$|^Last 14 days$/i })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => requests.some(url => url.includes('window_hours=336'))).toBe(true);
  const nav = page.locator('[data-ui="admin-observability-tabs"]');
  await expect(nav.getByRole('link')).toHaveCount(5);
  for (const link of await nav.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(32);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  }
  await nav.getByRole('link').first().focus();
  await page.keyboard.press('Tab');
  await expect(nav.locator('a[href^="/admin/plugin-observability"]')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('plugin-navigation-mobile.png'), fullPage: true });
});

test('diagnostic pages share visible entrances and retain an owning parent', async ({ page }, testInfo) => {
  await navigationMocks(page);
  for (const route of ['/admin/audit', '/admin/agent-feedback', '/admin/ai-advisor']) {
    await page.goto(route);
    await expectParent(page, '/admin/troubleshooting');
    const nav = page.locator('[data-ui="admin-diagnostic-navigation"]');
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveAttribute('href', route === '/admin/agent-feedback' ? `${route}?window=24` : route);
    await page.screenshot({ path: testInfo.outputPath(`${route.split('/').at(-1)}-1440.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const nav = page.locator('[data-ui="admin-diagnostic-navigation"]');
  for (const link of await nav.getByRole('link').all()) {
    const box = (await link.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath('diagnostic-navigation-mobile.png'), fullPage: true });
});

test('audit navigation translates supported site scope and exposes a return entrance', async ({ page }) => {
  await navigationMocks(page);
  await page.goto('/admin/agent-feedback?window=168&site=site_mvp');
  const nav = page.locator('[data-ui="admin-diagnostic-navigation"]');
  await expect(nav.locator('a[href^="/admin/audit"]')).toHaveAttribute('href', '/admin/audit?site_id=site_mvp');
  await nav.locator('a[href^="/admin/audit"]').click();
  await expect(page).toHaveURL(/\/admin\/audit\?site_id=site_mvp$/);
  await expect(page.locator('input[name="site_id"]')).toHaveValue('site_mvp');
  await expect(nav.locator('a[href^="/admin/agent-feedback"]')).toHaveAttribute('href', '/admin/agent-feedback?window=24&site=site_mvp');
  await expect(nav.locator('a[href^="/admin/ai-advisor"]')).toHaveAttribute('href', '/admin/ai-advisor?site=site_mvp');
});

test('plugin navigation stays available on a load error and explains short-window transitions', async ({ page }) => {
  await navigationMocks(page);
  await page.route('**/api/admin/plugin-observability?*', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/admin/plugin-observability?window=24');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  const nav = page.locator('[data-ui="admin-observability-tabs"]');
  await expect(nav).toBeVisible();
  await expect(nav.locator('a[href^="/admin/media-observability"]')).toHaveAttribute('title', /近 14 天|last 14 days/);
  await expect(nav.locator('a[href^="/admin/media-observability"]')).toHaveAttribute('href', '/admin/media-observability?window=336');
  const change = nav.locator('[data-ui="admin-navigation-scope-change"]').first();
  await expect(change).toContainText(/近 14 天|Last 14 days/);
  await change.getByRole('button').focus();
  await expect(page.getByRole('tooltip')).toContainText(/不支持当前时间窗|does not support the current window/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect.poll(() => page.getByRole('tooltip').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth;
  })).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await change.getByRole('button').click();
  await expect(page.getByRole('tooltip')).toBeVisible();
});

async function expectWholePageFits(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    width: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    viewport: document.documentElement.clientWidth,
  }))).toMatchObject({ viewport: 390 });
  await expect.poll(() => page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test('every observation and diagnostic page fits the whole narrow viewport', async ({ page }, testInfo) => {
  await navigationMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/admin/ai-advisor', '/admin/usage-statistics', '/admin/plugin-observability', '/admin/media-observability', '/admin/vector-observability', '/admin/usage-statistics?view=quality', '/admin/audit', '/admin/agent-feedback', '/admin/troubleshooting']) {
    const endpoint = route === '/admin/ai-advisor' ? '/api/admin/advisor/ops-summary-preview'
      : route === '/admin/audit' ? '/api/admin/audit-events'
        : route.includes('view=quality') ? '/api/admin/editor-assist-quality'
          : route.includes('usage-statistics') || route === '/admin/troubleshooting' ? '/api/admin/runtime-telemetry'
            : `/api${route}`;
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === endpoint);
    await page.goto(route);
    await loaded;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expectParent(page, route.includes('observability') || route.includes('usage-statistics') ? '/admin/usage-statistics' : '/admin/troubleshooting');
    if (route === '/admin/ai-advisor') await expect(page.locator('[data-ui="advisor-current-diagnosis"]')).toBeVisible();
    await expectWholePageFits(page);
    await page.screenshot({ path: testInfo.outputPath(`${route.split('/').at(-1)!.replace('?', '-')}-390.png`), fullPage: true });
  }
});


test('summary windows match controls, URL and requests while runtime keeps 90 days', async ({ page }) => {
  await navigationMocks(page);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  for (const [route, endpoint] of [
    ['/admin/media-observability', '/api/admin/media-observability'],
    ['/admin/vector-observability', '/api/admin/vector-observability'],
    ['/admin/usage-statistics?view=quality', '/api/admin/editor-assist-quality'],
    ['/admin/plugin-observability', '/api/admin/plugin-observability'],
  ]) {
    requests.length = 0;
    await page.goto(`${route}${route.includes('?') ? '&' : '?'}window=2160`);
    await expect(page).toHaveURL(/window=720$/);
    const controls = route.includes('plugin-observability') ? page : page.locator('[data-ui="admin-observation-window"]');
    await expect(controls.getByRole('button', { name: /^(近 )?30 天$|^(Last )?30 days$/i })).toHaveAttribute('aria-pressed', 'true');
    await expect(controls.getByRole('button', { name: /90 天|90 days/i })).toHaveCount(0);
    await expect.poll(() => requests.some(url => url.includes(`${endpoint}?`) && url.includes('window_hours=720'))).toBe(true);
    expect(requests.some(url => url.includes(`${endpoint}?`) && url.includes('window_hours=2160'))).toBe(false);
  }
  await page.goto('/admin/usage-statistics?window=2160');
  await expect(page.locator('[data-ui="admin-observation-window"]').getByRole('button', { name: /90 天|90 days/i })).toHaveAttribute('aria-pressed', 'true');
  const nav = page.locator('[data-ui="admin-observability-tabs"]');
  await expect(nav.locator('a[href^="/admin/media-observability"]')).toHaveAttribute('href', '/admin/media-observability?window=720');
  await expect(nav.locator('a[href^="/admin/media-observability"]')).toHaveAttribute('title', /近 30 天|last 30 days/);
});

test('populated and failed advisor states stay readable on narrow screens without AI calls', async ({ page }) => {
  await navigationMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const aiRequests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/advisor/')) aiRequests.push(request.url()); });
  await page.goto('/admin/ai-advisor');
  const panel = page.locator('[data-ui="advisor-current-diagnosis"]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/高置信度|High confidence/);
  await expectWholePageFits(page);
  await page.route('**/api/admin/advisor/ops-summary-preview?*', route => route.fulfill({ status: 503, json: {} }));
  await page.reload();
  await expect(page.locator('[data-ui="admin-diagnostic-navigation"]')).toBeVisible();
  await expectWholePageFits(page);
  expect(aiRequests).toEqual([]);
});


test('diagnostic tool footer uses destination capabilities for every direct entrance', async ({ page }) => {
  await navigationMocks(page);
  await page.goto('/admin/troubleshooting?window=2160&site=site_mvp');
  const footer = page.locator('[data-ui="runtime-evidence-lane-list"]');
  for (const route of ['/admin/plugin-observability', '/admin/media-observability', '/admin/vector-observability']) {
    await expect(footer.locator(`a[href^="${route}"]`)).toHaveAttribute('href', `${route}?window=720&site=site_mvp`);
    await expect(footer.locator(`a[href^="${route}"]`)).toHaveAttribute('title', /近 30 天|last 30 days/);
  }
  await expect(footer.locator('a[href^="/admin/agent-feedback"]')).toHaveAttribute('href', '/admin/agent-feedback?window=168&site=site_mvp');
  await expect(page.locator('[data-ui="runtime-quality-link"]')).toHaveAttribute('href', '/admin/usage-statistics?view=quality&window=720&site=site_mvp');
});
