import { test, expect } from '@playwright/test';
import { installAdminMocks } from './helpers/admin-operator-fixture';

test.use({ viewport: { width: 1440, height: 1050 } });

test('advisor bookmark shows pause without executing or advertising the feature', async ({ page }) => {
  await installAdminMocks(page);
  const calls: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/admin/advisor/')) calls.push(request.url());
  });
  await page.goto('/admin/ai-advisor');
  await expect(page.locator('[data-ui="ai-advisor-paused"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-primary-nav"] a[href^="/admin/ai-advisor"]')).toHaveCount(0);
  await expect(page.locator('button').filter({ hasText: /Generate|生成摘要/ })).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
