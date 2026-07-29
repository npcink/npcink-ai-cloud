import { expect, test } from '@playwright/test';

test('public navigation is deduplicated and help FAQs disclose on demand', async ({ page }) => {
  await page.goto('/help');

  const header = page.locator('header').first();
  const footer = page.locator('footer');

  await expect(header.getByRole('link', { name: /^Help$|^帮助$/i })).toBeVisible();
  await expect(header.getByRole('link', { name: /Service status|服务状态/i })).toHaveCount(0);
  await expect(footer.getByRole('link', { name: /Service status|Status|服务状态/i })).toBeVisible();
  await expect(footer.getByRole('link', { name: /Help|帮助中心/i })).toHaveCount(0);

  const questions = page.locator('details');
  await expect(questions).toHaveCount(4);

  const firstQuestion = questions.first();
  const firstAnswer = firstQuestion.locator('p');
  await expect(firstQuestion).not.toHaveAttribute('open', '');
  await expect(firstAnswer).toBeHidden();

  await firstQuestion.locator('summary').click();
  await expect(firstQuestion).toHaveAttribute('open', '');
  await expect(firstAnswer).toBeVisible();
  await expect(firstAnswer).not.toContainText(/development environment|开发环境/i);
  await expect(firstAnswer).toContainText(
    /published public support channel|已发布的公开支持渠道/i
  );
});

test('unknown public routes provide localized recovery destinations', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist');

  expect(response?.status()).toBe(404);
  const recoveryMain = page.locator('#main-content');
  await expect(
    recoveryMain.getByRole('heading', { name: /This page could not be found|没有找到这个页面/i })
  ).toBeVisible();
  await expect(recoveryMain.getByRole('link', { name: /Return home|返回首页/i })).toBeVisible();
  await expect(recoveryMain.getByRole('link', { name: /Open Help|打开帮助中心/i })).toBeVisible();
  await expect(
    recoveryMain.getByRole('link', { name: /Sign in to the Portal|登录服务中心/i })
  ).toBeVisible();
});
