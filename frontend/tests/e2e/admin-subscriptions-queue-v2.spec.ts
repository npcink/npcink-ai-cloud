import { expect, test } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

const pageErrors: string[] = [];
const unhandledAdminRequests: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  unhandledAdminRequests.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterEach(async () => {
  expect(pageErrors).toEqual([]);
  expect(unhandledAdminRequests).toEqual([]);
});

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

test('subscription risk queue persists server filters and inspector focus while retaining data on refresh failure', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page, { unhandledAdminRequests });

  let requestCount = 0;
  let failNextRefresh = false;
  const requestedSorts: string[] = [];
  const requestedRisks: string[] = [];
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
    const customer = (url.searchParams.get('customer') || '').toLowerCase();
    const planId = url.searchParams.get('plan_id') || '';
    const risk = url.searchParams.get('risk') || 'all';
    const sort = url.searchParams.get('sort') || '';
    requestedSorts.push(sort);
    requestedRisks.push(risk);
    const matchingItems = SUBSCRIPTIONS.filter((item) => {
      return (!status || item.subscription.status === status) &&
        (!accountId || item.subscription.account_id.includes(accountId)) &&
        (!customer || `${item.account.name} ${item.subscription.account_id}`.toLowerCase().includes(customer)) &&
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
    }).filter((item) => {
      if (risk === 'needs_action') return item.operator_risk.level !== 'stable';
      if (risk === 'all') return true;
      return item.operator_risk.level === risk;
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
  await page.route('**/api/admin/subscriptions/sub_stale', async (route) => {
    const item = SUBSCRIPTIONS[1];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        subscription: item.subscription,
        account: item.account,
        covered_sites: item.covered_sites,
        plan: { plan_id: item.subscription.plan_id, display_name: item.coverage.package_alias },
        plan_version: { plan_version_id: item.subscription.plan_version_id },
        billing_snapshot_status: item.billing_snapshot_status,
        usage_totals: { runs: 0, tokens: 0, cost_cny: 12.25 },
      })),
    });
  });

  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { name: /^Subscription operations$|^订阅运营$/i })).toBeVisible();
  const pageHeader = page.locator('[data-ui="backoffice-page-header"]');
  await expect(pageHeader).toBeVisible();
  await expect(pageHeader.getByRole('button', { name: /Refresh subscriptions|刷新订阅/i })).toHaveClass(/btn-secondary/);
  const primaryNav = page.locator('[data-ui="admin-primary-nav"]');
  const workspaceTabs = page.locator('[data-ui="admin-workspace-navigation"]');
  await expect(primaryNav.locator('a[href="/admin/subscriptions"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/subscriptions"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/coverage"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Back to service status|返回服务状态/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(2);
  await expect(page.locator('table')).toHaveCount(0);
  expect(requestCount).toBe(1);
  expect(requestedSorts).toEqual(['priority']);
  expect(requestedRisks).toEqual(['needs_action']);
  const summaryStrip = pageHeader.locator('[data-density="compact"]');
  await expect(summaryStrip.getByText(/^Critical$|^严重风险$/i)).toBeVisible();
  await expect(summaryStrip.getByText(/^Warning$|^警告$/i)).toBeVisible();
  const headerScreenshotPath = testInfo.outputPath('admin-subscriptions-unified-header-pc.png');
  await pageHeader.screenshot({ path: headerScreenshotPath });
  await testInfo.attach('admin-subscriptions-unified-header-pc', {
    path: headerScreenshotPath,
    contentType: 'image/png',
  });

  const queueItems = page.locator('[data-ui="subscription-queue-item"]');
  await expect(queueItems.nth(0)).toContainText('Zeta Customer');
  await expect(queueItems.nth(1)).toContainText('Beta Customer');
  await expect(page.getByRole('combobox', { name: /Follow-up state|处理状态/i })).toHaveValue('needs_action');
  const filterToolbar = page.locator('[data-ui="subscription-filter-toolbar"]');
  const filterControls = filterToolbar.locator('input, select, button');
  await expect(filterControls).toHaveCount(8);
  const filterControlBoxes = await filterControls.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom };
    })
  );
  expect(Math.max(...filterControlBoxes.map((box) => box.bottom)) - Math.min(...filterControlBoxes.map((box) => box.bottom))).toBeLessThan(2);
  expect(filterControlBoxes.every((box) => box.bottom > box.top)).toBe(true);
  await expect(page.getByText(/Service coverage is currently stable|服务覆盖当前稳定/i)).toHaveCount(0);
  await expect(page.getByText(/acct_zeta|acct_beta|acct_alpha/i)).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toHaveCount(0);
  await expect(queueItems.nth(0).getByRole('button', { name: /^Inspect$|^检查$|^檢查$/i })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('combobox', { name: /Follow-up state|处理状态/i }).selectOption('all');
  await expect(queueItems).toHaveCount(3);
  const stableQueueItem = queueItems.filter({ hasText: 'Alpha Customer' });
  await expect(stableQueueItem).toHaveCount(1);
  await expect(
    stableQueueItem.getByText(/Service coverage is currently stable|服务覆盖当前稳定/i)
  ).toBeHidden();
  await page.getByRole('combobox', { name: /Follow-up state|处理状态/i }).selectOption('needs_action');
  await page.getByRole('combobox', { name: /Subscription status|订阅状态/i }).selectOption('active');
  await expect(page).toHaveURL(/status=active/);
  await expect(queueItems).toHaveCount(1);

  await page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i).fill('acct_beta');
  await page.getByPlaceholder(/Plan ID|套餐 ID|方案 ID/i).fill('plus');
  await page.getByRole('button', { name: /^Apply$|^应用$|^套用$/i }).click();
  await expect(page).toHaveURL(/customer=acct_beta/);
  await expect(page).toHaveURL(/plan_id=plus/);
  await expect(queueItems).toHaveCount(1);

  await page.getByRole('combobox', { name: /^Sort$|^排序$/i }).selectOption('customer');
  await expect(page).toHaveURL(/sort=customer/);
  await expect.poll(() => requestedSorts.at(-1)).toBe('customer');
  const inspectButton = page.getByRole('button', { name: /^Inspect$|^检查$|^檢查$/i });
  await inspectButton.focus();
  await inspectButton.press('Enter');
  await expect(page).toHaveURL(/focus=sub_stale/);
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await expect(drawer).toContainText('Beta Customer');

  const detailLink = drawer.locator('a[href^="/admin/subscriptions/sub_stale?return_to="]');
  await expect(detailLink).toHaveCount(1);
  await expect(detailLink).toHaveAttribute('href', /return_to=%2Fadmin%2Fsubscriptions%3F/);

  const queueUrl = new URL(page.url());
  const expectedReturnTo = `${queueUrl.pathname}${queueUrl.search}`;
  const expectedQueueUrl = `${queueUrl.origin}${expectedReturnTo}`;
  await detailLink.click();
  await expect(page.getByRole('heading', { name: /Subscription detail|订阅详情/i })).toBeVisible();
  const returnLink = page.getByRole('link', { name: /Back to subscription operations|返回订阅运营/i });
  await expect(returnLink).toHaveAttribute('href', expectedReturnTo);
  await page.reload();
  await expect(returnLink).toHaveAttribute('href', expectedReturnTo);
  await page.goBack();
  await expect(page).toHaveURL(expectedQueueUrl);
  await page.goForward();
  await expect(returnLink).toHaveAttribute('href', expectedReturnTo);
  await returnLink.click();
  await expect(page).toHaveURL(expectedQueueUrl);

  await page.reload();
  await expect(page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i)).toHaveValue('acct_beta');
  await expect(page.getByPlaceholder(/Plan ID|套餐 ID|方案 ID/i)).toHaveValue('plus');
  await expect(page.getByRole('combobox', { name: /^Sort$|^排序$/i })).toHaveValue('customer');
  await expect(drawer).toContainText('Beta Customer');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(page).toHaveURL(/customer=acct_beta/);
  failNextRefresh = true;
  await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅|刷新訂閱/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: /加载数据失败|Failed to load/ }).first()).toBeVisible();
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expect(queueItems).toHaveCount(1);
  await expect(page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i)).toHaveValue('acct_beta');

  failNextRefresh = true;
  await page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i).fill('acct_missing');
  await page.getByRole('button', { name: /^Apply$|^应用$|^套用$/i }).click();
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expect(queueItems).toHaveCount(1);
  await expect(drawer).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await expect(queueItems).toBeVisible();
  await page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i).fill('');
  await page.getByRole('button', { name: /^Apply$|^应用$|^套用$/i }).click();
  await page.getByRole('button', { name: /^Inspect$|^检查$|^檢查$/i }).first().click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toBeVisible();
  const mobileDrawerBox = await page.locator('[data-ui="admin-inspector-drawer"] > div').boundingBox();
  expect(mobileDrawerBox?.width).toBe(390);
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileLayout).toEqual({ viewportWidth: 390, scrollWidth: 390 });
});

test('subscription queue keyboard flow moves focus and opens detail without a retired freeze note', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page, { unhandledAdminRequests });
  await page.route('**/api/admin/subscriptions?*', async (route) => {
    const url = new URL(route.request().url());
    const risk = url.searchParams.get('risk') || 'all';
    const items = SUBSCRIPTIONS.filter((item) => risk === 'needs_action' ? item.operator_risk.level !== 'stable' : true);
    const summary = SUBSCRIPTIONS.reduce<Record<string, number>>(
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
  await page.route('**/api/admin/subscriptions/sub_past_due', async (route) => {
    const item = SUBSCRIPTIONS[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        subscription: item.subscription,
        account: item.account,
        covered_sites: item.covered_sites,
        plan: { plan_id: item.subscription.plan_id, display_name: item.coverage.package_alias },
        plan_version: { plan_version_id: item.subscription.plan_version_id },
        billing_snapshot_status: item.billing_snapshot_status,
        usage_totals: { runs: 0, tokens: 0, cost_cny: 42.5 },
      })),
    });
  });
  await page.goto('/admin/subscriptions');
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(2);
  await expect(page.locator('[data-ui="admin-workspace-navigation-note"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="admin-queue-keyboard-hint"]')).toBeVisible();

  const customerInput = page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i);
  await customerInput.focus();
  await page.keyboard.press('j');
  await expect(page).not.toHaveURL(/focus=/);
  await customerInput.fill('');
  await customerInput.blur();

  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_past_due/);
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toHaveCount(0);
  const subscriptionKeyboardScreenshotPath = testInfo.outputPath('p3-subscription-queue-keyboard.png');
  await page.screenshot({ path: subscriptionKeyboardScreenshotPath, fullPage: true });
  await testInfo.attach('p3-subscription-queue-keyboard', {
    path: subscriptionKeyboardScreenshotPath,
    contentType: 'image/png',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const freezeNoteScreenshotPath = testInfo.outputPath('p3-subscription-freeze-note-mobile.png');
  await page.screenshot({ path: freezeNoteScreenshotPath, fullPage: true });
  await testInfo.attach('p3-subscription-freeze-note-mobile', {
    path: freezeNoteScreenshotPath,
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1440, height: 1200 });

  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_stale/);
  await page.keyboard.press('k');
  await expect(page).toHaveURL(/focus=sub_past_due/);

  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/focus=/);

  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_past_due/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/subscriptions\/sub_past_due\?return_to=/);
});


test('subscription mixed input pages and applies search without opening the keyboard selection', async ({ page }, testInfo) => {
  await installAdminMocks(page, { unhandledAdminRequests });
  const subscriptions = Array.from({ length: 21 }, (_, index) => ({
    ...SUBSCRIPTIONS[1],
    subscription: { ...SUBSCRIPTIONS[1].subscription, subscription_id: `sub_pointer_${index}` },
    account: { account_id: `acct_pointer_${index}`, name: `Queue customer ${index}` },
  }));
  const requests: URLSearchParams[] = [];
  await page.route('**/api/admin/subscriptions?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const customer = (params.get('customer') || '').toLowerCase();
    const matches = subscriptions.filter(item => item.account.name.toLowerCase().includes(customer));
    const offset = Number(params.get('offset') || 0);
    const limit = Number(params.get('limit'));
    expect(limit).toBe(20);
    await route.fulfill({ json: buildAdminApiEnvelope({
      items: matches.slice(offset, offset + limit), total: matches.length,
      summary: { critical: 0, warning: matches.length, monitor: 0, stable: 0 },
    }) });
  });
  await page.goto('/admin/subscriptions');
  const rows = page.locator('[data-ui="subscription-queue-item"]');
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await expect(rows).toHaveCount(20);
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_0/);
  const pagination = page.getByRole('navigation', { name: /Pagination|分页/i, exact: true });
  await pagination.getByRole('button', { name: /Next page|下一页/i }).click();
  await expect(page).toHaveURL(/offset=20/);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(rows).toHaveCount(1);
  await expect(drawer).toHaveCount(0);
  expect(requests.at(-1)?.get('offset')).toBe('20');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_20/);
  await pagination.getByRole('button', { name: /Previous|上一页/i }).click();
  await expect(page).not.toHaveURL(/offset=|focus=/);
  await expect(rows).toHaveCount(20);
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_0/);
  const search = page.getByPlaceholder(/Name, email, or Account ID|名称、邮箱或账户 ID/i);
  const beforeTyping = requests.length;
  await search.click();
  await expect(search).toBeFocused();
  await search.fill('Queue customer');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_0/);
  expect(requests).toHaveLength(beforeTyping);
  await search.fill('Queue customer');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/customer=Queue\+customer/);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(rows).toHaveCount(20);
  await expect(drawer).toHaveCount(0);
  expect(requests.at(-1)?.get('customer')).toBe('Queue customer');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_0/);
  const beforeRefresh = requests.length;
  await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅/i }).click();
  await expect.poll(() => requests.length).toBe(beforeRefresh + 1);
  await expect(drawer).toHaveCount(0);
  const observedCustomers = await page.evaluateHandle(() => {
    const customers: string[] = [];
    const observer = new MutationObserver(() => {
      const customer = document.querySelector('#subscription-inspector > div > p')?.textContent;
      if (customer && customers.at(-1) !== customer) customers.push(customer);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { customers, stop: () => observer.disconnect() };
  });
  await rows.nth(1).getByRole('button', { name: /^Inspect$|^检查$/i }).click();
  await expect(page).toHaveURL(/focus=sub_pointer_1(?:&|$)/);
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Queue customer 1');
  const inspectedCustomers = await observedCustomers.evaluate(state => state.customers);
  expect(inspectedCustomers).toEqual(['Queue customer 1']);
  await observedCustomers.evaluate(state => state.stop());
  await drawer.getByRole('button', { name: /Next item|下一条/i }).click();
  await expect(page).toHaveURL(/focus=sub_pointer_2(?:&|$)/);
  await expect(drawer).toContainText('Queue customer 2');
  await drawer.getByRole('button', { name: /Previous item|上一条/i }).click();
  await expect(page).toHaveURL(/focus=sub_pointer_1(?:&|$)/);
  await expect(drawer).toContainText('Queue customer 1');
  await testInfo.attach('inspected-records', { body: JSON.stringify({ customers: inspectedCustomers }), contentType: 'application/json' });
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/focus=/);
  await page.screenshot({ path: testInfo.outputPath('subscription-mixed-input-returned.png'), fullPage: true });
  await page.route('**/api/admin/subscriptions/sub_pointer_1', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const item = subscriptions[1];
    await route.fulfill({ json: buildAdminApiEnvelope({
      subscription: item.subscription, account: item.account, covered_sites: item.covered_sites,
      plan: { plan_id: item.subscription.plan_id, display_name: item.coverage.package_alias },
      plan_version: { plan_version_id: item.subscription.plan_version_id },
      billing_snapshot_status: item.billing_snapshot_status, usage_totals: { runs: 0, tokens: 0, cost_cny: 12.25 },
    }) });
  });
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_0/);
  const queueUrl = new URL(page.url());
  const expectedReturnTo = `${queueUrl.pathname}${queueUrl.search}`;
  const detail = rows.nth(1).getByRole('link', { name: /Inspect detail|查看详情/i });
  const detailUrl = new URL((await detail.getAttribute('href'))!, page.url());
  expect(detailUrl.searchParams.get('return_to')).toBe(expectedReturnTo);
  await detail.click();
  await expect(page.getByRole('heading', { name: /Subscription detail|订阅详情/i })).toBeVisible();
  await page.getByRole('link', { name: /Back to subscription operations|返回订阅运营/i }).click();
  await expect(page).toHaveURL(`${queueUrl.origin}${expectedReturnTo}`);
  // Returning to a URL-selected record retains the existing inspector behavior.
  await expect(drawer).toContainText('Queue customer 0');
  await page.keyboard.press('Escape');
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.screenshot({ path: testInfo.outputPath(`subscription-mixed-pc-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  if (!await page.locator('html').evaluate(element => element.classList.contains('dark'))) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  }
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('subscription-mixed-en-dark-1280.png'), fullPage: true });
});
