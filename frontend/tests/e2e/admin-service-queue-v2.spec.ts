import { expect, test } from '@playwright/test';
import {
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';

test('service status table keeps filters and customer focus in the URL on PC', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$/i })).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态/i })).toBeVisible();

  const initialRows = page.locator('[data-ui="coverage-queue-item"]');
  await expect(page.getByRole('columnheader', { name: /^Actions$|^操作$/i })).toHaveCount(0);
  await expect(initialRows.nth(0)).not.toContainText(/Account ID|账户 ID/i);
  await expect(initialRows.nth(0)).not.toContainText('acct_');
  await expect(initialRows.getByRole('link')).toHaveCount(0);
  await expect(initialRows.nth(0)).toContainText(/Next: Inspect subscription|下一步：查看订阅/i);
  await expect(initialRows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await initialRows.nth(1).focus();
  await initialRows.nth(1).press('Enter');
  await expect(initialRows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(initialRows.nth(1)).toContainText(/Next: Open package actions|下一步：打开套餐操作/i);
  const inspector = page.locator('#coverage-inspector');
  const customerDetails = inspector.getByRole('link', { name: /Customer details|客户详情/i });
  await expect(customerDetails).toBeFocused();
  await expect(inspector).toContainText('Uncovered Account');
  const technicalInfo = inspector.locator('[data-ui="coverage-technical-info"]');
  await expect(technicalInfo).not.toHaveAttribute('open', '');
  await expect(technicalInfo.getByText(/Account ID|账户 ID/i)).not.toBeVisible();
  await technicalInfo.getByText(/Technical information|技术信息/i).click();
  await expect(technicalInfo.getByText(/Account ID|账户 ID/i)).toBeVisible();
  await expect(technicalInfo).toContainText('acct_uncovered');
  await expect(inspector.getByRole('link')).toHaveCount(2);
  await expect(customerDetails).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered'
  );
  await expect(inspector.getByRole('link', { name: /Open package actions|打开套餐操作/i })).toBeVisible();
  await expect(page).toHaveURL(/focus=acct_uncovered%3Amissing_package_coverage/);

  await initialRows.nth(0).focus();
  await initialRows.nth(0).press('Enter');
  await expect(initialRows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(inspector).toContainText('MVP Account');
  await expect(customerDetails).toBeFocused();
  await expect(inspector.getByRole('link')).toHaveCount(2);
  await expect(inspector.getByRole('link', { name: /Customer details|客户详情/i })).toHaveAttribute(
    'href',
    `/admin/accounts/${encodeURIComponent(LONG_ACCOUNT_ID)}`
  );
  await expect(inspector.getByRole('link', { name: /Inspect subscription|查看订阅/i })).toBeVisible();

  await page.getByRole('combobox', { name: /Service status|服务状态/i }).selectOption('all');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(3);
  await page.locator('[data-ui="coverage-queue-item"]').nth(2).focus();
  await page.locator('[data-ui="coverage-queue-item"]').nth(2).press('Enter');
  await expect(inspector).toContainText('Free Account');
  await expect(customerDetails).toBeFocused();
  await expect(inspector.getByRole('link')).toHaveCount(1);
  await expect(inspector).not.toContainText(
    /Package, subscription, site, key, and billing evidence are aligned|套餐、订阅、站点、密钥和账单证据已对齐/i
  );
  await expect(page.locator('[data-ui="coverage-queue-item"]').nth(2).locator('td').nth(2)).toBeEmpty();

  await page.getByLabel(/^Search$|^搜索$/i).fill('Uncovered');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByText('Uncovered Account').first()).toBeVisible();
  await expect(page).toHaveURL(/q=Uncovered/);

  await page.getByRole('combobox', { name: /Reason|原因/i }).selectOption('missing_package_coverage');
  await page.getByRole('combobox', { name: /Sort|排序/i }).selectOption('customer');
  const customerRow = page.locator('[data-ui="coverage-queue-item"]').first();
  await customerRow.focus();
  await customerRow.press(' ');
  await expect(customerDetails).toBeFocused();

  await expect(page).toHaveURL(/status=all/);
  await expect(page).toHaveURL(/q=Uncovered/);
  await expect(page).toHaveURL(/reason=missing_package_coverage/);
  await expect(page).toHaveURL(/sort=customer/);
  await expect(page).toHaveURL(/focus=acct_uncovered%3Amissing_package_coverage/);
  await expect(page.locator('#coverage-inspector')).toContainText('Uncovered Account');

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

    await page.getByRole('combobox', { name: /Service status|服务状态/i }).selectOption('all');
    await expect(clearFilters).toBeEnabled();
  });
}
