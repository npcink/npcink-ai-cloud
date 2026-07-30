import { expect, test } from '@playwright/test';
import { installAdminMocks } from './helpers/admin-operator-fixture';

test('package management workbench contains PC keyboard focus and restores the invoking action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.goto('/admin/plans');

  const proRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Pro' });
  const manageButton = proRow.getByRole('button', { name: /^Manage Pro$|^管理 Pro$/i });
  await manageButton.click();
  const editor = page.getByRole('dialog', { name: /Manage Pro|管理 Pro/i });
  await expect(editor).toBeVisible();
  await expect(editor.getByText(/Current package parameters|当前套餐参数/i)).toBeVisible();

  const restoreButton = editor.getByRole('button', {
    name: /Restore saved values|还原当前已保存值/i,
  });
  const defaultButton = editor.getByRole('button', {
    name: /Apply .* defaults|套用 .* 套餐默认值/i,
  });
  const salesPrice = editor.getByRole('spinbutton', { name: /^Sales price|^销售价格/i });
  const initialSalesPrice = await salesPrice.inputValue();

  await expect(restoreButton).toHaveText(/^(Restore|还原)$/i);
  await expect(restoreButton).toBeDisabled();
  await expect(defaultButton).toHaveText(/^(Default|默认)$/i);

  await salesPrice.fill('88');
  await expect(restoreButton).toBeEnabled();
  await restoreButton.click();
  await expect(salesPrice).toHaveValue(initialSalesPrice);
  await expect(restoreButton).toBeDisabled();

  await defaultButton.click();
  await expect(editor).toContainText(/defaults applied|已填入 .* 默认值/i);

  const firstControl = editor.locator('[data-ui="plan-parameter-control"]').first();
  const firstInputBox = await firstControl.locator('input').boundingBox();
  const firstUnitBox = await firstControl.locator('[data-ui="plan-parameter-unit"]').boundingBox();
  expect(firstInputBox).not.toBeNull();
  expect(firstUnitBox).not.toBeNull();
  expect((firstInputBox?.x || 0) + (firstInputBox?.width || 0)).toBeLessThanOrEqual((firstUnitBox?.x || 0) + 1);
  expect(firstUnitBox?.height).toBe(firstInputBox?.height);

  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(manageButton).toBeFocused();
});
