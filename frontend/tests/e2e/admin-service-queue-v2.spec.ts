import { expect, test } from '@playwright/test';
import {
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';

test('service status table keeps filters and direct customer actions on PC', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage?focus=legacy-inspector-selection');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$/i })).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(3);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态/i })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Service status|服务状态/i })).toHaveValue('all');
  await expect(page).not.toHaveURL(/status=/);

  const initialRows = page.locator('[data-ui="coverage-queue-item"]');
  await expect(page.getByRole('columnheader', { name: /^Actions$|^操作$/i })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /Package.*Subscription|套餐.*订阅/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Sites$|^站点$/i })).toBeVisible();
  await expect(page.locator('#coverage-inspector')).toHaveCount(0);
  await expect(initialRows.nth(0)).not.toContainText(/Account ID|账户 ID/i);
  await expect(initialRows.nth(0)).not.toContainText('acct_');
  await expect(initialRows.nth(0).locator('td')).toHaveCount(6);
  await expect(initialRows.nth(0).locator('td').nth(2)).toContainText('Pro');
  await expect(initialRows.nth(0).locator('td').nth(3)).toHaveText('1');
  await expect(initialRows.nth(0).getByRole('link', { name: /Inspect subscription|查看订阅/i })).toHaveAttribute(
    'href',
    '/admin/subscriptions/sub_mvp'
  );
  await expect(initialRows.nth(0).getByRole('link', { name: 'MVP Account' })).toHaveAttribute(
    'href',
    `/admin/accounts/${encodeURIComponent(LONG_ACCOUNT_ID)}`
  );
  const uncoveredCustomerLink = initialRows.nth(1).getByRole('link', { name: 'Uncovered Account' });
  await expect(uncoveredCustomerLink).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered'
  );
  await expect(initialRows.nth(1).locator('td').nth(2)).toContainText('Uncovered');
  await expect(initialRows.nth(1).locator('td').nth(3)).toHaveText('1');
  await expect(initialRows.nth(1).getByRole('link', { name: /Open package actions|打开套餐操作/i })).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered#coverage-actions'
  );
  await expect(initialRows.nth(2).locator('td').nth(2)).toContainText('Free');
  await expect(initialRows.nth(2).locator('td').nth(3)).toHaveText('1');
  await expect(initialRows.nth(2).locator('td').nth(4)).toBeEmpty();
  await expect(page.getByText(/Active API keys|活跃 API 密钥/i)).toHaveCount(0);
  await expect(page.getByText(/Technical information|技术信息/i)).toHaveCount(0);
  await expect(page.getByText(/Snapshot|账单统计|待刷新账单统计/i)).toHaveCount(0);

  await page.getByLabel(/^Search$|^搜索$/i).fill('Uncovered');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByText('Uncovered Account').first()).toBeVisible();
  await expect(page).toHaveURL(/q=Uncovered/);

  await page.getByRole('combobox', { name: /Reason|原因/i }).selectOption('missing_package_coverage');
  await page.getByRole('combobox', { name: /Sort|排序/i }).selectOption('customer');
  await expect(page).not.toHaveURL(/status=/);
  await expect(page).toHaveURL(/q=Uncovered/);
  await expect(page).toHaveURL(/reason=missing_package_coverage/);
  await expect(page).toHaveURL(/sort=customer/);
  await expect(page).not.toHaveURL(/focus=/);

  await page.reload();
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');
  await expect(page.getByRole('combobox', { name: /Service status|服务状态/i })).toHaveValue('all');
  await expect(page.getByRole('combobox', { name: /Reason|原因/i })).toHaveValue('missing_package_coverage');
  await expect(page.getByRole('combobox', { name: /Sort|排序/i })).toHaveValue('customer');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);

  await page.route('**/api/admin/coverage-work-queue', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('temporary queue refresh failure')),
    });
  });
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /temporary queue refresh failure/i })
  ).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');

  await page.getByRole('link', { name: 'Uncovered Account' }).click();
  await expect(page).toHaveURL('/admin/accounts/acct_uncovered');
  await expect(page.getByRole('heading', { name: /^Uncovered$/i })).toBeVisible();
});

for (const viewport of [
  { width: 900, height: 900 },
  { width: 1280, height: 900 },
  { width: 1600, height: 1000 },
]) {
  test(`service status filter toolbar stays readable at ${viewport.width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await installAdminMocks(page);
    await page.goto('/admin/coverage');

    const toolbar = page.locator('[data-ui="coverage-filter-toolbar"]');
    const controls = toolbar.locator('input, select, button');
    await expect(toolbar).toBeVisible();
    await expect(controls).toHaveCount(5);
    await expect(page.getByRole('combobox', { name: /Service status|服务状态/i }).locator('option')).toHaveCount(6);
    const clearFilters = page.getByRole('button', { name: /Clear filters|清除筛选/i });
    const clearFiltersTooltip = page.locator('[data-ui="coverage-clear-filters-tooltip"]');
    await expect(clearFiltersTooltip).toHaveAttribute('title', /Clear filters|清除筛选/i);
    await expect(clearFiltersTooltip).toHaveCSS('pointer-events', 'auto');
    await expect(clearFilters).toBeDisabled();

    const toolbarBox = await toolbar.boundingBox();
    const controlBoxes = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      })
    );
    expect(toolbarBox).not.toBeNull();
    expect(
      controlBoxes.every(
        (box) =>
          toolbarBox != null &&
          box.left >= toolbarBox.x &&
          box.right <= toolbarBox.x + toolbarBox.width
      )
    ).toBe(true);
    expect(controlBoxes.every((box) => box.bottom > box.top)).toBe(true);

    if (viewport.width >= 1280) {
      expect(Math.max(...controlBoxes.map((box) => box.top)) - Math.min(...controlBoxes.map((box) => box.top))).toBeLessThan(2);
    }

    await page.getByRole('combobox', { name: /Service status|服务状态/i }).selectOption('needs_action');
    await expect(clearFilters).toBeEnabled();
  });
}
