import { expect, test, type Page } from '@playwright/test';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

async function installPlanDirectoryHarness(page: Page) {
  await installAdminMocks(page);
  let requestCount = 0;
  let failNext = false;
  await page.route('**/api/admin/plans', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    requestCount += 1;
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary package catalog failure')) });
      return;
    }
    await route.fallback();
  });
  return { getRequestCount: () => requestCount, failNextRequest: () => { failNext = true; } };
}

test('package directory keeps modal focus while retaining the catalog on refresh failure', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installPlanDirectoryHarness(page);
  await page.goto('/admin/plans');

  await expect(page.getByRole('heading', { name: /Standard package catalog|标准套餐目录/i })).toBeVisible();
  const primaryNav = page.locator('[data-ui="admin-primary-nav"]');
  const workspaceTabs = page.locator('[data-ui="admin-workspace-navigation"]');
  await expect(primaryNav.locator('a[href="/admin/subscriptions"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/plans"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/credit-packs"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Open AI credit packs|打开AI 积分包/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="plan-catalog-table"] table')).toBeVisible();
  await expect(page.locator('[data-ui="plan-catalog-table"] thead')).toContainText(/Package AI credits|套餐 AI 积分/i);
  await expect(page.locator('[data-ui="plan-catalog-item"]')).toHaveCount(4);
  await expect(page.locator('[data-ui="plan-catalog-table"] tbody .btn-primary')).toHaveCount(0);
  expect(harness.getRequestCount()).toBe(1);

  const rows = page.locator('[data-ui="plan-catalog-item"]');
  await expect(rows.nth(0)).toContainText('Free');
  await expect(rows.nth(1)).toContainText('Plus');
  await expect(rows.nth(2)).toContainText('Pro');
  await expect(rows.nth(3)).toContainText('Agency');
  await expect(rows.nth(0).getByText(/package has a published version|套餐已有发布版本/i)).toHaveCount(0);
  await expect(rows.nth(0).getByText(/3 core limits|3 项核心限制/i)).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-workbench-dialog"]')).toHaveCount(0);

  const manage = page.getByRole('button', { name: /^Manage Free$|^管理 Free$/i });
  await manage.focus();
  await manage.press('Enter');
  await expect(page).toHaveURL(/focus=free/);
  await page.reload();
  await page.waitForLoadState('networkidle');
  const workbench = page.locator('[data-ui="admin-workbench-dialog"]');
  await expect(workbench).toContainText('Free');
  await expect(workbench.getByRole('tab', { name: /^Package parameters$|^套餐参数$/i })).toHaveAttribute('aria-selected', 'true');
  await expect(workbench.locator('input[type="number"]')).toHaveCount(9);
  await expect(workbench.getByText(/shared by all sites|所有站点共享/i).first()).toBeVisible();
  await workbench.locator('[data-ui="admin-workbench-close"]').click();
  await expect(page).toHaveURL(/\/admin\/plans$/);
  await expect(page.locator('[data-ui="admin-workbench-dialog"]')).toHaveCount(0);

  harness.failNextRequest();
  await page.getByRole('button', { name: /Refresh catalog|刷新目录/i }).click();
  await expect(page.getByText(/last successfully loaded catalog|最近一次成功加载的套餐目录/i)).toBeVisible();
  await expect(rows).toHaveCount(4);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('package management combines readable limits, descriptions, and editing while creation stays in advanced maintenance', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installPlanDirectoryHarness(page);
  await page.goto('/admin/plans');

  await expect(page.getByRole('heading', { name: /Create package record|创建套餐记录/i })).toHaveCount(0);
  const freeRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Free' });
  await expect(freeRow.getByText('Free', { exact: true })).toBeVisible();
  await expect(freeRow.getByText('free', { exact: true })).toHaveCount(0);
  const freeSubscriptions = freeRow.getByRole('link', { name: /All subscriptions.*Free|全部订阅.*Free/i });
  await expect(freeSubscriptions).toHaveAttribute('href', '/admin/subscriptions?plan_id=free&risk=all');
  await expect(freeSubscriptions).toContainText('›');
  await freeRow.getByRole('button', { name: /^Manage Free$|^管理 Free$/i }).click();
  const inspector = page.locator('[data-ui="admin-workbench-dialog"]');
  await expect(page).toHaveURL(/focus=free/);
  await expect(inspector.getByRole('heading', { name: /Manage Free|管理 Free/i })).toBeVisible();
  await expect(inspector.getByText(/Current package parameters|当前套餐参数/i)).toBeVisible();
  await expect(inspector.locator('input[type="number"]')).toHaveCount(9);
  await expect(inspector.getByText(/Text knowledge capacity|文字知识库容量/i).first()).toBeVisible();
  await expect(inspector.getByText(/Image knowledge capacity|图片知识库容量/i).first()).toBeVisible();
  await expect(inspector.getByText(/Customer-facing 30-day price|用户端展示并用于新支付宝订单/i)).toBeVisible();
  const costMonitoring = inspector.locator('[data-ui="plan-cost-monitoring"]');
  await expect(costMonitoring).not.toHaveAttribute('open');
  await costMonitoring.locator('summary').click();
  await expect(inspector.getByText(/Internal provider-cost monitoring threshold|Provider 成本监控阈值/i)).toBeVisible();
  await expect(inspector.getByRole('button', { name: /^Save$|^保存$/i })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const screenshotPath = testInfo.outputPath('knowledge-capacity-admin.png');
  await inspector.screenshot({ path: screenshotPath });
  await testInfo.attach('knowledge-capacity-admin-workbench', { path: screenshotPath, contentType: 'image/png' });
  await inspector.locator('[data-ui="admin-workbench-close"]').click();

  await page.getByText(/Package initialization|套餐初始化/i).click();
  await expect(page.getByRole('heading', { name: /Create package record|创建套餐记录/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create missing packages|创建缺失套餐|补齐缺失套餐/i })).toBeVisible();
});

test('package subscription drilldown labels its total separately from the active count', async ({ page }) => {
  await installPlanDirectoryHarness(page);
  const initialCatalog = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/admin/plans');
  await page.goto('/admin/plans');
  const payload = await (await initialCatalog).json();
  const free = payload.data.items.find((item: { plan: { plan_id: string } }) => item.plan.plan_id === 'free');
  free.subscription_counts = { total: 5, active: 3 };
  await page.route('**/api/admin/plans', (route) => route.fulfill({ json: payload }));
  await page.reload();

  const row = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Free' });
  const countCell = row.locator('td').nth(2);
  await expect(countCell.locator('p')).toHaveText('3');
  const allSubscriptions = countCell.getByRole('link', { name: /All subscriptions.*5.*Free|全部订阅.*5.*Free/ });
  await expect(allSubscriptions).toBeVisible();
  await expect(allSubscriptions).toHaveAttribute('href', '/admin/subscriptions?plan_id=free&risk=all');
  await page.setViewportSize({ width: 900, height: 1050 });
  await expect(allSubscriptions).toBeVisible();
  const linkBox = (await allSubscriptions.boundingBox())!;
  const cellBox = (await countCell.boundingBox())!;
  expect(linkBox.x).toBeGreaterThanOrEqual(cellBox.x);
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const queueRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/admin/subscriptions');
  await allSubscriptions.click();
  const query = new URL((await queueRequest).url()).searchParams;
  expect(query.get('plan_id')).toBe('free');
  expect(query.get('risk')).toBe('all');
  expect(query.has('status')).toBe(false);
  await expect(page).toHaveURL('/admin/subscriptions?plan_id=free&risk=all');
});

test('package initialization reports mixed results and retries only failed tiers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installPlanDirectoryHarness(page);
  const planRequests: string[] = [];
  const versionRequests: string[] = [];
  let failPlusVersion = true;
  await page.route('**/api/admin/plans**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fallback();
      return;
    }
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/admin/plans') {
      planRequests.push(String(request.postDataJSON().plan_id));
    } else {
      const tierId = pathname.split('/').at(-2) || '';
      versionRequests.push(tierId);
      if (tierId === 'plus' && failPlusVersion) {
        failPlusVersion = false;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('plus version failed')) });
        return;
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({})) });
  });

  await page.goto('/admin/plans');
  await page.getByText(/Package initialization|套餐初始化/i).click();
  await page.getByRole('button', { name: /Create missing packages|创建缺失套餐|补齐缺失套餐/i }).click();
  const results = page.locator('[data-ui="package-bootstrap-results"]');
  await expect(results).toContainText(/Plus.*failed/is);
  await expect(results).toContainText(/Agency.*succeeded/is);
  expect(planRequests).toEqual(['plus', 'agency']);
  expect(versionRequests).toEqual(['plus', 'agency']);

  await results.getByRole('button', { name: /Retry failed packages|重试失败套餐/i }).click();
  await expect(results).toContainText(/Plus.*succeeded/is);
  expect(planRequests).toEqual(['plus', 'agency', 'plus']);
  expect(versionRequests).toEqual(['plus', 'agency', 'plus']);
});

test('package write followed by read failure allows read retry only', async ({ page }) => {
  await installPlanDirectoryHarness(page);
  let writes = 0;
  let failReads = false;
  await page.route('**/api/admin/plans/free', async (route) => {
    if (route.request().method() === 'PATCH') {
      writes += 1;
      failReads = true;
      await route.fulfill({ json: buildAdminApiEnvelope({}) }); return;
    }
    if (failReads) {
      await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read unavailable') }); return;
    }
    await route.fallback();
  });
  await page.goto('/admin/plans');
  const freeRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: /Free/ }).first();
  await freeRow.getByRole('button', { name: /Manage|管理/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('input').first()).toBeVisible();
  await dialog.locator('input').first().fill('77');
  await dialog.getByRole('button', { name: /^Save$|^保存$/ }).click();
  await expect(dialog.getByText(/Write succeeded|写入已成功/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Save$|^保存$/ })).toBeDisabled();
  await expect(dialog.locator('input').first()).toBeDisabled();
  expect(writes).toBe(1);
  failReads = false;
  await dialog.getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect(dialog.getByText(/Write succeeded|写入已成功/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Save$|^保存$/ })).toBeEnabled();
  expect(writes).toBe(1);
});
