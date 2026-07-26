import { expect, test } from '@playwright/test';

test('marketing home visual smoke: hero and CTA render', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        checked_at: '2026-07-25T08:00:00Z',
      }),
    });
  });
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
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  await expect(
    page.getByRole('heading', {
      name: /Run AI.*cloud.*control.*WordPress|让 AI.*云端.*控制权.*WordPress/i,
    })
  ).toBeVisible();
  await expect(page.getByText(/Public entry is operational|公开入口运行正常/i)).toBeVisible();

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
      name: /Start with one site.*Scale as usage grows|从一个站点开始.*按使用规模升级/i,
    })
  ).toBeVisible();
  await expect(page.getByText('¥').first()).toBeVisible();
  const desktopPlans = page.locator('[data-plan-comparison="desktop"]');
  await expect(desktopPlans.getByText(/Custom quote|按需报价/i)).toBeVisible();
  await expect(desktopPlans.getByText(/150,000/)).toBeVisible();

  await expect(page.locator('[data-home-hero]')).toHaveScreenshot('marketing-home-hero.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
  await expect(page.locator('[data-home-pricing]')).toHaveScreenshot('marketing-home-pricing.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
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
      name: /Start with one site.*Scale as usage grows|从一个站点开始.*按使用规模升级/i,
    })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Pro plan details|Pro 套餐详情/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.locator('[data-home-hero]')).toHaveScreenshot('marketing-home-hero-mobile.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
  await page.getByRole('button', { name: /Free plan details|Free 套餐详情/i }).click();
  await expect(page.getByRole('button', { name: /Free plan details|Free 套餐详情/i })).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.getByRole('button', { name: /Pro plan details|Pro 套餐详情/i })).toHaveAttribute(
    'aria-expanded',
    'false'
  );
  await page.getByRole('button', { name: /Free plan details|Free 套餐详情/i }).click();
  await page.getByRole('button', { name: /Pro plan details|Pro 套餐详情/i }).click();
  await page.getByRole('button', { name: /Open menu|打开菜单/i }).click();
  await expect(page.getByRole('link', { name: /Service status|服务状态/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Sign in|登录服务中心/i }).last()).toBeVisible();
  await page.getByRole('button', { name: /Close menu|关闭菜单/i }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot('marketing-home-mobile.png', {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
});

test('public status explains impact and offers a fresh check', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        checked_at: '2026-07-25T08:00:00Z',
      }),
    });
  });

  await page.goto('/status');
  await expect(page.getByRole('heading', { name: /Public entry is operational|公开入口运行正常/i })).toBeVisible();
  await expect(page.getByText(/no public-entry outage detected|未发现公开入口故障/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Check again|重新检查/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sign in to view|登录后查看/i }).first()).toBeVisible();
});

test('public plan catalog failure disables stale package actions', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        checked_at: '2026-07-25T08:00:00Z',
      }),
    });
  });
  await page.route('**/open/plan-catalog', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        error_code: 'public.plan_catalog_unavailable',
        message: 'public.plan_catalog_unavailable',
        data: {},
      }),
    });
  });

  await page.goto('/');

  const desktopPlans = page.locator('[data-plan-comparison="desktop"]');
  for (const tierId of ['free', 'plus', 'pro']) {
    const tier = desktopPlans.locator(`[data-plan-tier="${tierId}"]`);
    await expect(tier.getByText(/Not available|暂未开放/i)).toHaveCount(2);
    await expect(tier.getByRole('link')).toHaveCount(0);
    await expect(tier.locator('[aria-disabled="true"]')).toBeVisible();
  }
  await expect(desktopPlans).not.toContainText('¥15');
  await expect(desktopPlans).not.toContainText('¥29');
  await expect(
    desktopPlans.locator('[data-plan-tier="agency"]').getByRole('link', {
      name: /Request a plan|申请方案/i,
    })
  ).toBeVisible();
  await expect(page.locator('[data-home-pricing]')).toHaveScreenshot(
    'marketing-home-pricing-unavailable.png',
    {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixelRatio: 0.02,
    }
  );
});

test('public plan catalog keeps available tiers while disabling missing offers', async ({ page }) => {
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
              availability: 'unavailable',
              monthly_points: null,
              site_limit: null,
              concurrency_limit: null,
              batch_item_limit: null,
              amount: null,
              currency: 'CNY',
              billing_cycle: null,
              purchase_mode: 'self_serve',
              trial_enabled: false,
              trial_days: 0,
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

  const desktopPlans = page.locator('[data-plan-comparison="desktop"]');
  await expect(
    desktopPlans.locator('[data-plan-tier="free"]').getByRole('link', {
      name: /Start free|免费开始/i,
    })
  ).toBeVisible();
  for (const tierId of ['plus', 'pro']) {
    const tier = desktopPlans.locator(`[data-plan-tier="${tierId}"]`);
    await expect(tier.locator('[aria-disabled="true"]')).toBeVisible();
    await expect(tier.getByRole('link')).toHaveCount(0);
  }
  await expect(
    desktopPlans.locator('[data-plan-tier="agency"]').getByRole('link', {
      name: /Request a plan|申请方案/i,
    })
  ).toBeVisible();
});

test('public header keeps readable contrast in dark mode', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.addInitScript(() => {
    window.localStorage.setItem('theme', 'dark');
  });
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'unavailable' }),
    });
  });
  await page.route('**/open/plan-catalog', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        error_code: 'public.plan_catalog_unavailable',
        data: {},
      }),
    });
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);

  const header = page.locator('[data-public-header]');
  await expect(header).toHaveCSS('background-color', 'rgb(9, 16, 28)');
  await expect(page.getByRole('link', { name: 'Npcink AI Cloud' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sign in|登录服务中心/i }).first()).toBeVisible();
  await expect(header).toHaveScreenshot('marketing-home-header-dark.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    maxDiffPixelRatio: 0.02,
  });
});
