import { expect, test } from '@playwright/test';

const limited = (value: number) => ({ state: 'limited', value });

test('marketing routes package intent through the canonical registration and support paths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/open/plan-catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        data: {
          tiers: [
            ['free', 'Free', 300, 1, 0, 'included'],
            ['plus', 'Plus', 3000, 3, 15, 'self_serve'],
            ['pro', 'Pro', 10000, 5, 29, 'self_serve'],
            ['agency', 'Agency', 150000, 25, null, 'quote'],
          ].map(([tierId, label, points, sites, amount, purchaseMode]) => ({
            tier_id: tierId,
            label,
            availability: 'available',
            comparison_rights: {
              monthly_points: limited(Number(points)),
              site_limit: limited(Number(sites)),
              knowledge_article_limit: limited(tierId === 'agency' ? 10000 : 2000),
              concurrency_limit: limited(tierId === 'agency' ? 10 : 3),
              batch_item_limit: limited(tierId === 'agency' ? 100 : 25),
            },
            amount,
            currency: 'CNY',
            billing_cycle: tierId === 'plus' || tierId === 'pro' ? 'monthly' : null,
            purchase_mode: purchaseMode,
            trial_enabled: tierId === 'plus' || tierId === 'pro',
            trial_days: tierId === 'plus' || tierId === 'pro' ? 14 : 0,
            trial_requires_approval: tierId === 'agency',
          })),
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

  await page.goto('/#pricing');
  const pricing = page.locator('[data-home-pricing]');
  await expect(pricing.getByRole('heading', {
    name: /Start with one site.*Scale as needed|从一个站点开始.*按需升级/i,
  })).toBeVisible();
  await expect(pricing.locator('[data-plan-tier="free"]').first()).toContainText(/300/);
  await expect(pricing.locator('[data-plan-tier="pro"]').first()).toContainText(/10,000/);
  await expect(pricing.getByRole('link', { name: /Start free|免费开始/i }).first()).toHaveAttribute(
    'href',
    '/portal/register'
  );
  await expect(pricing.getByRole('link', { name: /Choose Plus|选择 Plus/i }).first()).toHaveAttribute(
    'href',
    '/portal/register?plan=plus'
  );
  await expect(pricing.getByRole('link', { name: /Choose Pro|选择 Pro/i }).first()).toHaveAttribute(
    'href',
    '/portal/register?plan=pro'
  );
  await expect(pricing.getByRole('link', { name: /Request a plan|申请方案/i }).first()).toHaveAttribute(
    'href',
    '/portal/login?redirect=%2Fportal%2Fsupport'
  );
  await expect(pricing.getByText(
    /Current published offers and plan versions are authoritative|实际价格与权益以当前已发布方案为准/i
  )).toBeVisible();
  await expect(page.locator('a[href="/packages"], a[href="/top-up-packs"]')).toHaveCount(0);
  await expect(page.getByText(/Buy now|Checkout|Wallet|Storefront/i)).toHaveCount(0);
});
