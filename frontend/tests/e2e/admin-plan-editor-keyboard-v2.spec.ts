import { expect, test } from '@playwright/test';
import { installAdminMocks } from './helpers/admin-operator-fixture';

test('package management workbench contains PC keyboard focus and restores the invoking action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.goto('/admin/plans');

  const proRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Pro' });
  const manageButton = proRow.getByRole('button', { name: /Manage package|管理套餐/i });
  await manageButton.click();
  const editor = page.getByRole('dialog', { name: /Manage Pro|管理 Pro/i });
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/Current package parameters|当前套餐参数/i)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(manageButton).toBeFocused();
});
