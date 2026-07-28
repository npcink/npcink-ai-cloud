import { expect, test } from '@playwright/test';

test('public navigation is deduplicated and help FAQs disclose on demand', async ({ page }) => {
  await page.goto('/help');

  const header = page.locator('header').first();
  const footer = page.locator('footer');

  await expect(header.getByRole('link', { name: /Service status|服务状态/i })).toBeVisible();
  await expect(header.getByRole('link', { name: /^Help$|^帮助$/i })).toHaveCount(0);
  await expect(footer.getByRole('link', { name: /Help|帮助中心/i })).toBeVisible();
  await expect(footer.getByRole('link', { name: /Service status|Status|服务状态/i })).toHaveCount(0);

  const questions = page.locator('details');
  await expect(questions).toHaveCount(4);

  const firstQuestion = questions.first();
  const firstAnswer = firstQuestion.locator('p');
  await expect(firstQuestion).not.toHaveAttribute('open', '');
  await expect(firstAnswer).toBeHidden();

  await firstQuestion.locator('summary').click();
  await expect(firstQuestion).toHaveAttribute('open', '');
  await expect(firstAnswer).toBeVisible();
});
