import { expect, test } from '@playwright/test';
import { installAdminMocks } from './helpers/admin-operator-fixture';

test.use({ viewport: { width: 1440, height: 1050 } });

async function installPausedAdvisorMocks(page: Parameters<typeof installAdminMocks>[0]) {
  const requests: string[] = [];
  await installAdminMocks(page);
  await page.route('**/api/admin/advisor/**', async route => {
    requests.push(route.request().url());
    await route.fulfill({ status: 409, json: { error_code: 'advisor.feature_paused' } });
  });
  return requests;
}

test('paused Operations Advisor keeps a quiet PC bookmark without diagnosis or AI requests', async ({ page }, testInfo) => {
  const requests = await installPausedAdvisorMocks(page);
  await page.goto('/admin/ai-advisor');
  const paused = page.locator('[data-ui="ai-advisor-paused"]');
  await expect(paused.getByRole('status')).toBeVisible();
  await expect(page.locator('h1:visible')).toHaveCount(1);
  await expect(page.locator('[data-ui="advisor-current-diagnosis"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /运行诊断|Run diagnosis/i })).toHaveCount(0);
  await expect(page.getByText(/AI evaluation details|AI 评估详情/i)).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-primary-nav"] a[href^="/admin/ai-advisor"]')).toHaveCount(0);
  await expect(paused.getByRole('link')).toHaveAttribute('href', '/admin/troubleshooting');
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await testInfo.attach('paused-advisor-pc', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('legacy Advisor scope bookmarks remain paused after reload and return to diagnostics', async ({ page }) => {
  const requests = await installPausedAdvisorMocks(page);
  for (const scope of ['operations', 'runtime', 'commercial', 'routing']) {
    await page.goto(`/admin/ai-advisor?scope=${scope}&site=site_mvp`);
    await expect(page.locator('[data-ui="ai-advisor-paused"]')).toBeVisible();
    await expect(page.locator('[data-ui="ai-advisor-scope-workbench"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-ui="ai-advisor-paused"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('[data-ui="ai-advisor-paused"]').getByRole('link').click();
  await expect.poll(() => new URL(page.url()).pathname).toBe('/admin/troubleshooting');
  expect(new URL(page.url()).searchParams.has('scope')).toBe(false);
  expect(new URL(page.url()).searchParams.has('site')).toBe(false);
  expect(requests).toEqual([]);
});
