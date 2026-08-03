import { expect, test } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

const SUBSCRIPTIONS = [
  {
    subscription: {
      subscription_id: 'sub_past_due',
      account_id: 'acct_zeta',
      status: 'past_due',
      plan_id: 'pro',
      plan_version_id: 'pro_v1',
      current_period_start_at: '2026-06-01T00:00:00Z',
      current_period_end_at: '2026-06-30T00:00:00Z',
    },
    account: { account_id: 'acct_zeta', name: 'Zeta Customer' },
    covered_sites: [{ site_id: 'site_zeta', name: 'Zeta Site' }],
    coverage: { site_count: 1, package_alias: 'Pro' },
    latest_billing_snapshots: [{ snapshot_id: 'snap_zeta', totals: { cost: 42.5 } }],
    billing_snapshot_status: {
      status: 'fresh',
      summary: 'Current-period billing statistics are current.',
      fresh_site_count: 1,
      stale_site_count: 0,
      missing_site_count: 0,
    },
    operator_risk: { level: 'critical', reason_code: 'past_due' },
  },
  {
    subscription: {
      subscription_id: 'sub_stale',
      account_id: 'acct_beta',
      status: 'active',
      plan_id: 'plus',
      plan_version_id: 'plus_v1',
      current_period_start_at: '2026-07-01T00:00:00Z',
      current_period_end_at: '2026-08-01T00:00:00Z',
    },
    account: { account_id: 'acct_beta', name: 'Beta Customer' },
    covered_sites: [{ site_id: 'site_beta', name: 'Beta Site' }],
    coverage: { site_count: 1, package_alias: 'Plus' },
    latest_billing_snapshots: [{ snapshot_id: 'snap_beta', totals: { cost: 12.25 } }],
    billing_snapshot_status: {
      status: 'stale',
      summary: 'One billing snapshot needs refresh.',
      fresh_site_count: 0,
      stale_site_count: 1,
      missing_site_count: 0,
    },
    operator_risk: { level: 'warning', reason_code: 'snapshot_stale' },
  },
  {
    subscription: {
      subscription_id: 'sub_stable',
      account_id: 'acct_alpha',
      status: 'active',
      plan_id: 'free',
      plan_version_id: 'free_v1',
      current_period_start_at: '2026-07-01T00:00:00Z',
      current_period_end_at: '2026-09-01T00:00:00Z',
    },
    account: { account_id: 'acct_alpha', name: 'Alpha Customer' },
    covered_sites: [{ site_id: 'site_alpha', name: 'Alpha Site' }],
    coverage: { site_count: 1, package_alias: 'Free' },
    latest_billing_snapshots: [{ snapshot_id: 'snap_alpha', totals: { cost: 0 } }],
    billing_snapshot_status: {
      status: 'fresh',
      summary: 'Current-period billing statistics are current.',
      fresh_site_count: 1,
      stale_site_count: 0,
      missing_site_count: 0,
    },
    operator_risk: { level: 'stable', reason_code: 'stable' },
  },
];

test('subscription risk queue persists server filters and inspector focus while retaining data on refresh failure', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  let requestCount = 0;
  let failNextRefresh = false;
  const requestedSorts: string[] = [];
  await page.route('**/api/admin/subscriptions?*', async (route) => {
    requestCount += 1;
    if (failNextRefresh) {
      failNextRefresh = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiErrorEnvelope('temporary subscription refresh failure')),
      });
      return;
    }

    const url = new URL(route.request().url());
    const status = url.searchParams.get('status') || '';
    const accountId = url.searchParams.get('account_id') || '';
    const planId = url.searchParams.get('plan_id') || '';
    const sort = url.searchParams.get('sort') || '';
    requestedSorts.push(sort);
    const matchingItems = SUBSCRIPTIONS.filter((item) => {
      return (!status || item.subscription.status === status) &&
        (!accountId || item.subscription.account_id.includes(accountId)) &&
        (!planId || item.subscription.plan_id.includes(planId));
    });
    const riskRank: Record<string, number> = { critical: 0, warning: 1, monitor: 2, stable: 3 };
    const items = [...matchingItems].sort((left, right) => {
      if (sort === 'customer') {
        return left.account.name.localeCompare(right.account.name);
      }
      if (sort === 'expiry') {
        return left.subscription.current_period_end_at.localeCompare(right.subscription.current_period_end_at);
      }
      return riskRank[left.operator_risk.level] - riskRank[right.operator_risk.level];
    });
    const summary = matchingItems.reduce<Record<string, number>>(
      (current, item) => ({
        ...current,
        [item.operator_risk.level]: current[item.operator_risk.level] + 1,
      }),
      { critical: 0, warning: 0, monitor: 0, stable: 0 }
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ items, total: items.length, summary })),
    });
  });

  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { name: /^Subscription risk$|^订阅风险$/i })).toBeVisible();
  const primaryNav = page.locator('[data-ui="admin-primary-nav"]');
  await expect(primaryNav.locator('a[href="/admin/subscriptions"]')).toHaveAttribute('aria-current', 'page');
  await expect(primaryNav.locator('a[href="/admin/coverage"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Back to service status|返回服务状态/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(3);
  await expect(page.locator('table')).toHaveCount(0);
  expect(requestCount).toBe(1);
  expect(requestedSorts).toEqual(['priority']);
  const summaryStrip = page.locator('[data-density="standard"]').first();
  await expect(summaryStrip.getByText(/^Critical$|^严重风险$/i)).toBeVisible();
  await expect(summaryStrip.getByText(/^Warning$|^警告$/i)).toBeVisible();

  const queueItems = page.locator('[data-ui="subscription-queue-item"]');
  await expect(queueItems.nth(0)).toContainText('Zeta Customer');
  await expect(queueItems.nth(1)).toContainText('Beta Customer');
  await expect(page.locator('#subscription-inspector')).toContainText('Zeta Customer');

  await page.getByRole('button', { name: /^Active$|^活跃$|^活躍$/i }).click();
  await expect(page).toHaveURL(/status=active/);
  await expect(queueItems).toHaveCount(2);

  await page.getByPlaceholder(/Account ID|账户 ID|帳戶 ID/i).fill('acct_beta');
  await page.getByPlaceholder(/Plan ID|套餐 ID|方案 ID/i).fill('plus');
  await page.getByRole('button', { name: /^Apply$|^应用$|^套用$/i }).click();
  await expect(page).toHaveURL(/account_id=acct_beta/);
  await expect(page).toHaveURL(/plan_id=plus/);
  await expect(queueItems).toHaveCount(1);

  await page.getByRole('combobox', { name: /^Sort$|^排序$/i }).selectOption('customer');
  await expect(page).toHaveURL(/sort=customer/);
  await expect.poll(() => requestedSorts.at(-1)).toBe('customer');
  const inspectButton = page.getByRole('button', { name: /^Inspect$|^检查$|^檢查$/i });
  await inspectButton.focus();
  await inspectButton.press('Enter');
  await expect(page).toHaveURL(/focus=sub_stale/);
  await expect(page.locator('#subscription-inspector')).toContainText('Beta Customer');

  const detailLink = page.locator('#subscription-inspector a[href^="/admin/subscriptions/sub_stale?return_to="]');
  await expect(detailLink).toHaveCount(1);
  await expect(detailLink).toHaveAttribute('href', /return_to=%2Fadmin%2Fsubscriptions%3F/);

  await page.reload();
  await expect(page.getByPlaceholder(/Account ID|账户 ID|帳戶 ID/i)).toHaveValue('acct_beta');
  await expect(page.getByPlaceholder(/Plan ID|套餐 ID|方案 ID/i)).toHaveValue('plus');
  await expect(page.getByRole('combobox', { name: /^Sort$|^排序$/i })).toHaveValue('customer');
  await expect(page.locator('#subscription-inspector')).toContainText('Beta Customer');

  failNextRefresh = true;
  await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅|刷新訂閱/i }).click();
  await expect(page.getByRole('alert').first()).toContainText('temporary subscription refresh failure');
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expect(queueItems).toHaveCount(1);
  await expect(page.getByPlaceholder(/Account ID|账户 ID|帳戶 ID/i)).toHaveValue('acct_beta');

  failNextRefresh = true;
  await page.getByPlaceholder(/Account ID|账户 ID|帳戶 ID/i).fill('acct_missing');
  await page.getByRole('button', { name: /^Apply$|^应用$|^套用$/i }).click();
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expect(queueItems).toHaveCount(1);
  await expect(page.locator('#subscription-inspector')).toContainText('Beta Customer');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await expect(queueItems).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileLayout).toEqual({ viewportWidth: 390, scrollWidth: 390 });
});
