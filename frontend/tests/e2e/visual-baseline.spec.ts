import { expect, test } from '@playwright/test';

test('protected Portal routes return anonymous visitors to the current login entry', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/portal/**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        error_code: 'auth.portal_session_required',
        message: 'auth.portal_session_required',
        data: {},
      }),
    });
  });

  for (const protectedPath of ['/portal', '/portal/billing']) {
    await page.goto(protectedPath);
    await expect(page).toHaveURL(/\/portal\/login\?redirect=/);
    expect(new URL(page.url()).searchParams.get('redirect')).toBe(protectedPath);
    await expect(
      page.getByRole('heading', { name: /Log in to user service center|登录用户服务中心/i })
    ).toBeVisible();
    await expect(page.locator('[data-ui="portal-primary-nav"]')).toHaveCount(0);
  }
});

test('admin login gate keeps the current visual contract', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/admin/**', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        error_code: 'auth.admin_session_required',
        message: 'auth.admin_session_required',
        data: {},
      }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem('locale', 'zh-CN');
    window.localStorage.setItem('theme', 'light');
  });

  await page.goto('/admin');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expect(
    page.getByRole('heading', { name: /Log in to Admin|登录管理后台/i })
  ).toBeVisible();
  await expect(page).toHaveScreenshot('admin-login-gate-current.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
});
