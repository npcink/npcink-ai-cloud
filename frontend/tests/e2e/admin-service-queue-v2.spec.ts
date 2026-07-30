import { expect, test } from '@playwright/test';
import { buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

test('service status table keeps filters and customer focus in the URL on PC', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$/i })).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态/i })).toBeVisible();

  const initialRows = page.locator('[data-ui="coverage-queue-item"]');
  await expect(initialRows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await initialRows.nth(1).click();
  await expect(initialRows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#coverage-inspector')).toContainText('Uncovered Account');
  await expect(page).toHaveURL(/focus=acct_uncovered%3Amissing_package_coverage/);

  await initialRows.nth(0).focus();
  await initialRows.nth(0).press('Enter');
  await expect(initialRows.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#coverage-inspector')).toContainText('MVP Account');

  await page.getByRole('button', { name: /^(All|全部)\s*3$/i }).click();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(3);

  await page.getByLabel(/^Search$|^搜索$/i).fill('Uncovered');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByText('Uncovered Account').first()).toBeVisible();
  await expect(page).toHaveURL(/q=Uncovered/);

  await page.getByRole('combobox', { name: /Reason|原因/i }).selectOption('missing_package_coverage');
  await page.getByRole('combobox', { name: /Sort|排序/i }).selectOption('customer');
  const customerRow = page.locator('[data-ui="coverage-queue-item"]').first();
  await customerRow.focus();
  await customerRow.press(' ');

  await expect(page).toHaveURL(/status=all/);
  await expect(page).toHaveURL(/q=Uncovered/);
  await expect(page).toHaveURL(/reason=missing_package_coverage/);
  await expect(page).toHaveURL(/sort=customer/);
  await expect(page).toHaveURL(/focus=acct_uncovered%3Amissing_package_coverage/);
  await expect(page.locator('#coverage-inspector')).toContainText('Uncovered Account');

  await page.reload();
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');
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
