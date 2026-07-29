import { expect, test, type Page } from '@playwright/test';
import { buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

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

test('package directory keeps filters and modal focus while retaining the catalog on refresh failure', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installPlanDirectoryHarness(page);
  await page.goto('/admin/plans');

  await expect(page.getByRole('heading', { name: /Standard package catalog|标准套餐目录/i })).toBeVisible();
  await expect(page.locator('[data-ui="plan-catalog-table"] table')).toBeVisible();
  await expect(page.locator('[data-ui="plan-catalog-table"] thead')).toContainText(/Package AI credits|套餐 AI 积分/i);
  await expect(page.locator('[data-ui="plan-catalog-item"]')).toHaveCount(4);
  await expect(page.locator('[data-ui="plan-catalog-table"] tbody .btn-primary')).toHaveCount(0);
  expect(harness.getRequestCount()).toBe(1);

  const rows = page.locator('[data-ui="plan-catalog-item"]');
  await expect(rows.nth(0)).toContainText('Plus');
  await expect(rows.nth(1)).toContainText('Agency');
  await expect(rows.nth(2)).toContainText('Free');
  await expect(rows.nth(2).getByText(/package has a published version|套餐已有发布版本/i)).toHaveCount(0);
  await expect(rows.nth(2).getByText(/3 core limits|3 项核心限制/i)).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-workbench-dialog"]')).toHaveCount(0);

  await page.getByRole('button', { name: /^Ready$|^已就绪$/i }).click();
  await expect(page).toHaveURL(/state=ready/);
  await expect(rows).toHaveCount(2);

  await page.getByLabel(/Search packages|搜索套餐/i).fill('Free');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/q=Free/);
  await expect(rows).toHaveCount(1);

  const manage = page.getByRole('button', { name: /^Manage Free$|^管理 Free$/i });
  await manage.focus();
  await manage.press('Enter');
  await expect(page).toHaveURL(/focus=free/);
  await page.reload();
  await expect(page.getByLabel(/Search packages|搜索套餐/i)).toHaveValue('Free');
  const workbench = page.locator('[data-ui="admin-workbench-dialog"]');
  await expect(workbench).toContainText('Free');
  await expect(workbench.getByRole('tab', { name: /^Package parameters$|^套餐参数$/i })).toHaveAttribute('aria-selected', 'true');
  await expect(workbench.locator('input[type="number"]')).toHaveCount(8);
  await expect(workbench.getByText(/shared by all sites|所有站点共享/i)).toBeVisible();
  await workbench.locator('[data-ui="admin-workbench-close"]').click();
  await expect(page.locator('[data-ui="admin-workbench-dialog"]')).toHaveCount(0);

  harness.failNextRequest();
  await page.getByRole('button', { name: /Refresh catalog|刷新目录/i }).click();
  await expect(page.getByText(/last successfully loaded catalog|最近一次成功加载的套餐目录/i)).toBeVisible();
  await expect(rows).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('package management combines readable limits, descriptions, and editing while creation stays in advanced maintenance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installPlanDirectoryHarness(page);
  await page.goto('/admin/plans');

  await expect(page.getByRole('heading', { name: /Create package record|创建套餐记录/i })).toHaveCount(0);
  const freeRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Free' });
  await expect(freeRow.getByText('Free', { exact: true })).toBeVisible();
  await expect(freeRow.getByText('free', { exact: true })).toHaveCount(0);
  const freeSubscriptions = freeRow.getByRole('link', { name: /Open subscriptions.*Free|打开订阅.*Free/i });
  await expect(freeSubscriptions).toHaveAttribute('href', '/admin/subscriptions?plan_id=free');
  await expect(freeSubscriptions).toContainText('›');
  await freeRow.getByRole('button', { name: /^Manage Free$|^管理 Free$/i }).click();
  const inspector = page.locator('[data-ui="admin-workbench-dialog"]');
  await expect(page).toHaveURL(/focus=free/);
  await expect(inspector.getByRole('heading', { name: /Manage Free|管理 Free/i })).toBeVisible();
  await expect(inspector.getByText(/Current package parameters|当前套餐参数/i)).toBeVisible();
  await expect(inspector.locator('input[type="number"]')).toHaveCount(8);
  await expect(inspector.getByText(/Knowledge articles|知识库文章上限/i).first()).toBeVisible();
  await expect(inspector.getByText(/Customer-facing 30-day price|用户端展示并用于新支付宝订单/i)).toBeVisible();
  await expect(inspector.getByText(/Internal provider-cost monitoring threshold|Provider 成本监控阈值/i)).toBeVisible();
  await expect(inspector.getByRole('button', { name: /Save package changes|保存套餐修改/i })).toBeVisible();
  await expect(inspector.getByRole('link', { name: /Open subscriptions|打开订阅/i })).toHaveAttribute('href', '/admin/subscriptions?plan_id=free');
  await inspector.locator('[data-ui="admin-workbench-close"]').click();

  await page.getByText(/Package initialization|套餐初始化/i).click();
  await expect(page.getByRole('heading', { name: /Create package record|创建套餐记录/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Create missing packages|创建缺失套餐|补齐缺失套餐/i })).toBeVisible();
});
