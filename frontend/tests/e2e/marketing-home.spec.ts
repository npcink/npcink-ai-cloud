import { expect, test } from '@playwright/test';

test('marketing home visual smoke: hero and CTA render', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/open/plan-catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        data: {
          tiers: [
            {
              tier_id: 'free',
              label: 'Free',
              availability: 'available',
              monthly_points: 300,
              site_limit: 1,
              concurrency_limit: 1,
              batch_item_limit: 5,
              amount: 0,
              currency: 'CNY',
              billing_cycle: null,
              purchase_mode: 'included',
              trial_enabled: false,
              trial_days: 0,
              trial_requires_approval: false,
            },
            {
              tier_id: 'plus',
              label: 'Plus',
              availability: 'available',
              monthly_points: 3000,
              site_limit: 3,
              concurrency_limit: 2,
              batch_item_limit: 15,
              amount: 15,
              currency: 'CNY',
              billing_cycle: 'monthly',
              purchase_mode: 'self_serve',
              trial_enabled: true,
              trial_days: 14,
              trial_requires_approval: false,
            },
            {
              tier_id: 'pro',
              label: 'Pro',
              availability: 'available',
              monthly_points: 10000,
              site_limit: 5,
              concurrency_limit: 3,
              batch_item_limit: 25,
              amount: 29,
              currency: 'CNY',
              billing_cycle: 'monthly',
              purchase_mode: 'self_serve',
              trial_enabled: true,
              trial_days: 14,
              trial_requires_approval: false,
            },
            {
              tier_id: 'agency',
              label: 'Agency',
              availability: 'available',
              monthly_points: 150000,
              site_limit: 25,
              concurrency_limit: 10,
              batch_item_limit: 100,
              amount: null,
              currency: 'CNY',
              billing_cycle: null,
              purchase_mode: 'quote',
              trial_enabled: false,
              trial_days: 0,
              trial_requires_approval: true,
            },
          ],
          shared_paid_trial: {
            days: 14,
            one_per_customer: true,
            self_serve_tiers: ['plus', 'pro'],
            approval_required_tiers: ['agency'],
          },
        },
      }),
    });
  });
  await page.goto('/');

  await expect(
    page.getByRole('heading', {
      name: /Run AI.*cloud.*control.*site|让 AI.*云端.*控制权.*站点/i,
    })
  ).toBeVisible();

  await expect(
    page.getByRole('link', {
      name: /Start free|免费开始/i,
    }).first()
  ).toBeVisible();

  await expect(
    page.getByRole('link', {
      name: /Sign In|登录|登入/i,
    }).first()
  ).toBeVisible();

  await expect(
    page.getByRole('heading', {
      name: /Start with one site.*Scale with your runtime|从一站起步.*按运行规模升级/i,
    })
  ).toBeVisible();
  await expect(page.getByText('¥').first()).toBeVisible();
  await expect(page.getByText(/Custom quote|按需报价/i)).toBeVisible();
  await expect(page.getByText(/150,000/)).toBeVisible();

  await expect(page).toHaveScreenshot('marketing-home.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', {
      name: /Start with one site.*Scale with your runtime|从一站起步.*按运行规模升级/i,
    })
  ).toBeVisible();
  await expect(page).toHaveScreenshot('marketing-home-mobile.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
});
