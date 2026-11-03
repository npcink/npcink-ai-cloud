import { expect, test } from '@playwright/test';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

test('site detail keeps the PC first screen focused on one conclusion and one next action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.goto('/admin/sites/site_mvp');

  await expect(page.getByRole('heading', { name: 'MVP Site' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Commercial coverage needs follow-up|商业覆盖需要跟进/i })).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Open coverage|打开覆盖/i })).toBeVisible();
  await expect(page.locator('a[href^="/api/admin/audit-events"]')).toBeHidden();
  // The persistent desktop sidebar keeps one unscoped subscriptions destination.
  await expect(
    page.locator('[data-ui="admin-primary-nav"] a[href="/admin/subscriptions"]')
  ).toHaveCount(1);

  await expect(page.getByText(/Queued or backlogged runs are accumulating\.|当前存在排队或积压运行/i)).toBeVisible();
  await expect(page.getByText(/Open the current customer subscription when commercial coverage is the blocker\./i)).toHaveCount(0);
  await expect(page.getByText(/^Queued$/)).toHaveCount(0);

  const advancedEvidence = page.locator('details').filter({
    hasText: /Advanced site operational evidence|高级站点运营证据/i,
  });
  await expect(advancedEvidence).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: /^(Commercial coverage|商业覆盖)$/i })).toBeHidden();
  await advancedEvidence.locator('summary').click();
  await expect(page.getByRole('heading', { name: /^(Commercial coverage|商业覆盖)$/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^(Runtime inspector|运行时检查页)$/i })).toBeVisible();
});

test('site detail failure preserves the PC shell and bounded retry', async ({ page }) => {
  await installAdminMocks(page);
  await page.unroute('**/api/admin/**');
  let attempts = 0;
  await page.route('**/api/admin/sites/site_mvp', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('site unavailable')),
    });
  });
  await page.goto('/admin/sites/site_mvp');

  await expect(page.getByRole('heading', { name: /Site detail is temporarily unavailable|站点详情暂时不可用/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /加载数据失败|Failed to load data\./ })).toBeVisible();
  await expect(page.getByText('site unavailable', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page).toHaveURL(/\/admin\/sites\/site_mvp$/);
});

test('direct and tampered Site detail return contexts fail closed to Accounts', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/sites/site_mvp');
  await expect(page.getByRole('link', { name: /^Back$|^返回$/i }).first()).toHaveAttribute(
    'href',
    '/admin/accounts'
  );

  await page.goto('/admin/sites/site_mvp?return_to=https%3A%2F%2Fevil.example');
  await expect(page.getByRole('link', { name: /^Back$|^返回$/i }).first()).toHaveAttribute(
    'href',
    '/admin/accounts'
  );
});


test('site details label independent states and keep released ownership controls visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  let archived = false;
  await page.route('**/api/admin/sites/site_mvp', route => route.fulfill({
    json: buildAdminApiEnvelope({
      site: { site_id: 'site_mvp', account_id: 'acct_fixture', name: 'MVP Site', status: archived ? 'archived' : 'active' },
      subscription: { subscription_id: 'sub_mvp', status: 'active', plan_id: 'pro' },
      commercial_policy: { subscription_grace: { active: true } },
      usage_meter: { totals: { cost_cny: 6.8, cost_usd: 1 }, accounting_fx: { usd_cny_rate: '6.8', rate_version: 'fixture-fx-v1' } },
      runtime_operator_explanations: [{ state: 'ok', explain_text: 'Current runtime summary does not show an immediate operator blocker.' }],
      site_relink_policy: { enabled: true, default_cooldown_days: 90, ownership_released_at: archived ? '2026-07-01T00:00:00Z' : null, cross_account_relink_ready: false },
    }),
  }));
  await page.goto('/admin/sites/site_mvp');
  const header = page.locator('[data-ui="backoffice-page-header"]');
  await expect(header).toContainText(/Overall: Needs follow-up|整体: 需跟进/);
  await expect(header).toContainText(/Site: Active|站点: 活跃/i);
  await expect(header).toContainText(/Subscription: Active|订阅: 活跃/i);
  const primary = page.locator('[data-ui="site-primary-workspace"]');
  await expect(primary).toContainText(/Grace period active|处于宽限期/);
  const subscription = primary.locator('dd').filter({ hasText: /^Active$|^活跃$/i });
  await expect(subscription).toHaveCount(1);
  await expect(subscription).not.toHaveClass(/text-red-/);
  await expect(primary).toContainText(/US\$1.00|\$1.00/);
  await expect(primary).not.toContainText('fixture-fx-v1');
  await expect(page.locator('[data-ui="site-relink-policy"]')).not.toHaveAttribute('open', '');
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/admin-hierarchy-site-${width}.png` });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(subscription).not.toHaveClass(/text-red-/);
  await page.screenshot({ path: '/tmp/admin-hierarchy-site-900-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  archived = true;
  await page.reload();
  const ownership = page.locator('[data-ui="site-relink-policy"]');
  await expect(ownership).toHaveAttribute('open', '');
  await expect(ownership.getByRole('button', { name: /Allow now|立即允许/ })).toBeVisible();
  await expect(ownership.getByRole('button', { name: /Save unlock time|保存解锁时间/ })).toBeVisible();
});
