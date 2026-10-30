import { expect, test, type Page } from '@playwright/test';
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
      body: JSON.stringify(buildAdminApiEnvelope({ items: items.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit'))), total: items.length, summary })),
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
  await expect(riskGroup(page).getByRole('button', { pressed: true })).toHaveText(/Needs follow-up|需要处理/i);
  const filterToolbar = page.locator('[data-ui="subscription-filter-toolbar"]');
  const filterControls = filterToolbar.locator('input, select, button');
  await expect(filterControls).toHaveCount(6);
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

  await riskGroup(page).getByRole('button', { name: /^All follow-up states$|^全部处理状态$/i }).click();
  await expect(queueItems).toHaveCount(3);
  const stableQueueItem = queueItems.filter({ hasText: 'Alpha Customer' });
  await expect(stableQueueItem).toHaveCount(1);
  await expect(
    stableQueueItem.getByText(/Service coverage is currently stable|服务覆盖当前稳定/i)
  ).toBeHidden();
  await riskGroup(page).getByRole('button', { name: /Needs follow-up|需要处理/i }).click();
  await statusGroup(page).getByRole('button', { name: /^Active$|^活跃$/i }).click();
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
      body: JSON.stringify(buildAdminApiEnvelope({ items: items.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit'))), total: items.length, summary })),
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
  const keyboardHelp = page.getByRole('button', { name: /^Keyboard shortcuts$|^键盘快捷键$/i });
  await keyboardHelp.focus();
  await expect(page.locator('[data-ui="admin-queue-keyboard-hint"]')).toBeVisible();
  await keyboardHelp.press('Escape');

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
  await page.screenshot({ path: subscriptionKeyboardScreenshotPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach('p3-subscription-queue-keyboard', {
    path: subscriptionKeyboardScreenshotPath,
    contentType: 'image/png',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const freezeNoteScreenshotPath = testInfo.outputPath('p3-subscription-freeze-note-mobile.png');
  await page.screenshot({ path: freezeNoteScreenshotPath, fullPage: true, animations: 'disabled' });
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
    expect(limit).toBe(10);
    await route.fulfill({ json: buildAdminApiEnvelope({
      items: matches.slice(offset, offset + limit), total: matches.length,
      summary: { critical: 0, warning: matches.length, monitor: 0, stable: 0 },
    }) });
  });
  await page.goto('/admin/subscriptions');
  const rows = page.locator('[data-ui="subscription-queue-item"]');
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await expect(rows).toHaveCount(10);
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_0/);
  const pagination = page.getByRole('navigation', { name: /Pagination|分页/i, exact: true });
  await pagination.getByRole('button', { name: /Next page|下一页/i }).click();
  await expect(page).toHaveURL(/offset=10/);
  await expect(rows).toHaveCount(10);
  await expectRange(page, 11, 20, 21);
  await expect(drawer).toHaveCount(0);
  await pagination.getByRole('button', { name: /Next page|下一页/i }).click();
  await expect(page).toHaveURL(/offset=20/);
  await expect(page).not.toHaveURL(/focus=/);
  await expect(rows).toHaveCount(1);
  await expect(drawer).toHaveCount(0);
  expect(requests.at(-1)?.get('offset')).toBe('20');
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_pointer_20/);
  await pagination.getByRole('button', { name: /Previous|上一页/i }).click();
  await expect(page).toHaveURL(/offset=10/);
  await expect(rows).toHaveCount(10);
  await expect(drawer).toHaveCount(0);
  await pagination.getByRole('button', { name: /Previous|上一页/i }).click();
  await expect(page).not.toHaveURL(/offset=|focus=/);
  await expect(rows).toHaveCount(10);
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
  await expect(rows).toHaveCount(10);
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
  await page.screenshot({ path: testInfo.outputPath('subscription-mixed-input-returned.png'), fullPage: true, animations: 'disabled' });
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
    await page.screenshot({ path: testInfo.outputPath(`subscription-mixed-pc-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  if (!await page.locator('html').evaluate(element => element.classList.contains('dark'))) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  }
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: testInfo.outputPath('subscription-mixed-en-dark-1280.png'), fullPage: true, animations: 'disabled' });
});

function riskGroup(page: Page) {
  return page.getByRole('group', { name: /^Follow-up state$|^处理状态$/i });
}
function statusGroup(page: Page) {
  return page.getByRole('group', { name: /^Subscription status$|^订阅状态$/i });
}
async function expectRange(page: Page, start: number, end: number, total: number) {
  await expect(page.getByText(new RegExp(`^(?:第\\s*)?${start}\\s*[–-]\\s*${end}\\s*(?:of\\s*|条，共\\s*)${total}(?:\\s*条)?$`))).toBeVisible();
}
function directorySubscriptions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...SUBSCRIPTIONS[1],
    subscription: { ...SUBSCRIPTIONS[1].subscription, subscription_id: `sub_directory_${index}`, current_period_end_at: new Date(Date.UTC(2026, 10, index + 1)).toISOString() },
    account: { account_id: `acct_directory_${index}`, name: `Directory customer ${String(index).padStart(2, '0')}` },
  }));
}
async function installDirectoryMocks(page: Page, subscriptions = directorySubscriptions(21)) {
  await installAdminMocks(page, { unhandledAdminRequests });
  const requests: URLSearchParams[] = [];
  let failWhen: ((params: URLSearchParams) => boolean) | null = null;
  let holdNext: (() => Promise<void>) | null = null;
  await page.route('**/api/admin/subscriptions?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    if (holdNext) { const wait = holdNext; holdNext = null; await wait(); }
    if (failWhen?.(params)) {
      failWhen = null;
      await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('temporary subscription failure') });
      return;
    }
    const customer = (params.get('customer') || '').toLowerCase();
    const matches = subscriptions.filter(item =>
      (!params.get('status_group') || ['trialing', 'active', 'past_due', 'suspended'].includes(item.subscription.status)) &&
      (!params.get('status') || item.subscription.status === params.get('status')) &&
      (!params.get('account_id') || item.subscription.account_id === params.get('account_id')) &&
      (!customer || `${item.account.name} ${item.subscription.account_id}`.toLowerCase().includes(customer)) &&
      (!params.get('plan_id') || item.subscription.plan_id === params.get('plan_id')) &&
      (!params.get('expires_before') || item.subscription.current_period_end_at.slice(0, 10) <= params.get('expires_before')!)
    );
    const summary = matches.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.operator_risk.level]: acc[item.operator_risk.level] + 1 }), { critical: 0, warning: 0, monitor: 0, stable: 0 });
    const risk = params.get('risk');
    const rank: Record<string, number> = { critical: 0, warning: 1, monitor: 2, stable: 3 };
    const filtered = matches.filter(item => risk === 'all' || (risk === 'needs_action' ? item.operator_risk.level !== 'stable' : item.operator_risk.level === risk)).sort((a, b) => {
      if (params.get('sort') === 'customer') return a.account.name.localeCompare(b.account.name);
      if (params.get('sort') === 'expiry') return a.subscription.current_period_end_at.localeCompare(b.subscription.current_period_end_at);
      return rank[a.operator_risk.level] - rank[b.operator_risk.level];
    });
    expect(params.get('limit')).toBe('10');
    const offset = Number(params.get('offset') || 0);
    await route.fulfill({ json: buildAdminApiEnvelope({ items: filtered.slice(offset, offset + 10), total: filtered.length, summary }) });
  });
  return {
    requests,
    failNext: (predicate = (_params: URLSearchParams) => true) => { failWhen = predicate; },
    holdNext: () => {
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      holdNext = () => pending;
      return release;
    },
  };
}

for (const count of [0, 1, 10, 11, 21]) {
  test(`subscription Quiet pagination has honest range for ${count} rows`, async ({ page }) => {
    await installDirectoryMocks(page, directorySubscriptions(count));
    await page.goto('/admin/subscriptions');
    const rows = page.locator('[data-ui="subscription-queue-item"]');
    await expect(rows).toHaveCount(Math.min(count, 10));
    await expectRange(page, count ? 1 : 0, Math.min(count, 10), count);
    if (count > 10) {
      await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
      await expectRange(page, 11, Math.min(20, count), count);
      await page.reload();
      await expectRange(page, 11, Math.min(20, count), count);
      if (count === 21) {
        await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
        await expectRange(page, 21, 21, 21);
        await expect(rows).toHaveCount(1);
        await expect(page.getByRole('button', { name: /^Next page$|^下一页$/i })).toBeDisabled();
      }
    } else await expect(page.getByRole('navigation', { name: /^Pagination$|^分页$/i })).toHaveCount(0);
  });
}

test('subscription Quiet groups intersect and drafts apply explicitly while sort resets paging', async ({ page }) => {
  const mocks = await installDirectoryMocks(page, SUBSCRIPTIONS);
  await page.goto('/admin/subscriptions?risk=all');
  await expectRange(page, 1, 3, 3);
  await statusGroup(page).getByRole('button', { name: /^Active$|^活跃$/i }).click();
  await expectRange(page, 1, 2, 2);
  await riskGroup(page).getByRole('button', { name: /^Warning$|^警告$/i }).click();
  await expectRange(page, 1, 1, 1);
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toContainText('Beta Customer');
  await expect(riskGroup(page).getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(statusGroup(page).getByRole('button', { pressed: true })).toHaveCount(1);
  const before = mocks.requests.length;
  await page.getByRole('searchbox', { name: /^Customer$|^客户$/i }).fill('Beta');
  await page.getByPlaceholder(/^Plan ID$|^套餐 ID$/i).fill('plus');
  await page.locator('input[type=date]').fill('2026-08-02');
  expect(mocks.requests.length).toBe(before);
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect.poll(() => mocks.requests.at(-1)?.get('customer')).toBe('Beta');
  expect(mocks.requests.at(-1)?.get('plan_id')).toBe('plus');
  expect(mocks.requests.at(-1)?.get('expires_before')).toBe('2026-08-02');
  await expectRange(page, 1, 1, 1);
  await page.goto('/admin/subscriptions?risk=all&offset=20&focus=sub_stable');
  await expectRange(page, 0, 0, 3);
  await page.getByRole('combobox', { name: /^Sort$|^排序$/i }).selectOption('customer');
  await expect(page).toHaveURL('/admin/subscriptions?risk=all&sort=customer');
  await expectRange(page, 1, 3, 3);
  await expect(page.locator('[data-ui="subscription-queue-item"]').first()).toContainText('Alpha Customer');
  await page.goto('/admin/subscriptions?status=canceled&risk=all');
  await expectRange(page, 0, 0, 0);
  expect(mocks.requests.at(-1)?.get('status')).toBe('canceled');
  await expect(statusGroup(page).getByText(/^Canceled$|^已取消$/i)).toBeVisible();
});

test('subscription first failure retries without losing URL scope', async ({ page }) => {
  const mocks = await installDirectoryMocks(page);
  mocks.failNext();
  await page.goto('/admin/subscriptions?risk=warning&sort=expiry');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(0);
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expectRange(page, 1, 10, 21);
  await expect(page).toHaveURL('/admin/subscriptions?risk=warning&sort=expiry');
  expect(mocks.requests.length).toBe(2);
});

test('subscription retained range and freshness survive pending failure and same-URL retry', async ({ page }, testInfo) => {
  const mocks = await installDirectoryMocks(page);
  await page.goto('/admin/subscriptions?offset=10');
  await expectRange(page, 11, 20, 21);
  const header = page.locator('[data-ui="backoffice-page-header"]');
  const summary = await header.innerText();
  const observer = await page.evaluateHandle(() => {
    const ranges: string[] = [];
    const watch = new MutationObserver(() => {
      const text = document.querySelector('nav[aria-label="Pagination"] p, nav[aria-label="分页"] p')?.textContent;
      if (text && ranges.at(-1) !== text) ranges.push(text);
    });
    watch.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { ranges, stop: () => watch.disconnect() };
  });
  mocks.failNext(params => params.get('offset') === '20');
  const release = mocks.holdNext();
  const before = mocks.requests.length;
  await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
  await expect(page).toHaveURL('/admin/subscriptions?offset=20');
  await expect.poll(() => mocks.requests.length).toBe(before + 1);
  await expectRange(page, 11, 20, 21);
  release();
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expectRange(page, 11, 20, 21);
  expect(await header.innerText()).toBe(summary);
  const ranges = await observer.evaluate(state => state.ranges);
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges.every(text => /11\s*[–-]\s*20/.test(text))).toBe(true);
  await observer.evaluate(state => state.stop());
  await testInfo.attach('retained-range', { body: JSON.stringify(ranges), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('subscriptions-retained.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/focus=sub_directory_10/);
  await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
  await expect(page).not.toHaveURL(/focus=/);
  await expect.poll(() => mocks.requests.length).toBe(before + 2);
  await expectRange(page, 21, 21, 21);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('subscription changed-query failures disable retained paging and refresh the current URL', async ({ page }, testInfo) => {
  const mocks = await installDirectoryMocks(page, directorySubscriptions(81));
  const rows = page.locator('[data-ui="subscription-queue-item"]');
  const previous = page.getByRole('button', { name: /^Previous$|^上一页$/i });
  const next = page.getByRole('button', { name: /^Next page$|^下一页$/i });
  const refresh = page.getByRole('button', { name: /Refresh subscriptions|刷新订阅/i });
  const customer = page.getByRole('searchbox', { name: /^Customer$|^客户$/i });
  const apply = page.getByRole('button', { name: /^Apply$|^应用$/i });
  const header = page.locator('[data-ui="backoffice-page-header"]');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/subscriptions?customer=Directory&offset=50');
  await expectRange(page, 51, 60, 81);
  const successfulHeader = await header.innerText();
  mocks.failNext(params => params.get('customer') === 'customer' && !params.has('offset'));
  const release = mocks.holdNext();
  const failedSearch = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/subscriptions' && new URL(response.url()).searchParams.get('customer') === 'customer' && response.status() === 503);
  await customer.fill('customer');
  await apply.click();
  await expect(page).toHaveURL('/admin/subscriptions?customer=customer');
  await expect.poll(() => mocks.requests.at(-1)?.get('customer')).toBe('customer');
  await expectRange(page, 51, 60, 81);
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  release();
  expect((await failedSearch).status()).toBe(503);
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expectRange(page, 51, 60, 81);
  await expect(rows.first()).toContainText('Directory customer 50');
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  expect(await header.innerText()).toBe(successfulHeader);
  await expect(refresh).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('subscriptions-cross-query-disabled-zh-1440.png'), fullPage: true, animations: 'disabled' });
  const beforeRefresh = mocks.requests.length;
  await refresh.click();
  await expectRange(page, 1, 10, 81);
  await expect(rows.first()).toContainText('Directory customer 00');
  expect(mocks.requests.length).toBe(beforeRefresh + 1);
  expect(mocks.requests.filter(params => params.get('customer') === 'customer').every(params => !params.has('offset'))).toBe(true);
  await expect(page).toHaveURL('/admin/subscriptions?customer=customer');
  await expect(next).toBeEnabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);

  await page.goto('/admin/subscriptions?customer=Directory&offset=900');
  await expectRange(page, 0, 0, 81);
  await expect(previous).toBeEnabled();
  mocks.failNext(params => params.get('customer') === 'customer 00' && !params.has('offset'));
  const releaseEmpty = mocks.holdNext();
  const failedEmptySearch = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/subscriptions' && new URL(response.url()).searchParams.get('customer') === 'customer 00' && response.status() === 503);
  await customer.fill('customer 00');
  await apply.click();
  await expect(page).toHaveURL('/admin/subscriptions?customer=customer+00');
  await expect.poll(() => mocks.requests.at(-1)?.get('customer')).toBe('customer 00');
  await expectRange(page, 0, 0, 81);
  await expect(previous).toBeDisabled();
  releaseEmpty();
  expect((await failedEmptySearch).status()).toBe(503);
  await expect(page.getByText(/last successfully loaded results|最近一次成功加载的结果/i)).toBeVisible();
  await expectRange(page, 0, 0, 81);
  await expect(previous).toBeDisabled();
  await expect(next).toHaveCount(0);
  await expect(refresh).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('subscriptions-cross-query-empty-disabled-zh-1440.png'), fullPage: true, animations: 'disabled' });
  const beforeEmptyRefresh = mocks.requests.length;
  await refresh.click();
  await expectRange(page, 1, 1, 1);
  await expect(rows).toContainText('Directory customer 00');
  expect(mocks.requests.length).toBe(beforeEmptyRefresh + 1);
  expect(mocks.requests.filter(params => params.get('customer') === 'customer 00').every(params => !params.has('offset'))).toBe(true);
  await expect(page).toHaveURL('/admin/subscriptions?customer=customer+00');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('subscription far empty page keeps filters and recovers once only on explicit Previous', async ({ page }, testInfo) => {
  const mocks = await installDirectoryMocks(page);
  const context = '/admin/subscriptions?risk=warning&status=active&customer=Directory&plan_id=plus&sort=expiry&offset=900';
  await page.goto(context);
  await expectRange(page, 0, 0, 21);
  await expect(page.getByText(/^No data available$|^暂无数据$/i)).toBeVisible();
  await expect(page).toHaveURL(context);
  const before = mocks.requests.length;
  await page.screenshot({ path: testInfo.outputPath('subscriptions-out-of-range.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /^Previous$|^上一页$/i }).click();
  await expect(page).toHaveURL(context.replace('offset=900', 'offset=20'));
  await expectRange(page, 21, 21, 21);
  expect(mocks.requests.length).toBe(before + 1);
});

test('subscription newer explicit Apply wins over a late response', async ({ page }) => {
  const mocks = await installDirectoryMocks(page);
  await page.goto('/admin/subscriptions');
  await expectRange(page, 1, 10, 21);
  const release = mocks.holdNext();
  const response = page.waitForResponse(r => new URL(r.url()).searchParams.get('customer') === 'Directory');
  const input = page.getByRole('searchbox', { name: /^Customer$|^客户$/i });
  await input.fill('Directory');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect.poll(() => mocks.requests.at(-1)?.get('customer')).toBe('Directory');
  await input.fill('Directory customer 20');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expectRange(page, 1, 1, 1);
  release(); await response;
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toContainText('Directory customer 20');
});

test('subscription Quiet PC preview keeps header list footer controls and inspector usable', async ({ page }, testInfo) => {
  await installDirectoryMocks(page);
  await page.goto('/admin/subscriptions');
  await expectRange(page, 1, 10, 21);
  for (const locale of ['zh', 'en']) {
    if (locale === 'en') {
      await page.getByRole('button', { name: '语言', exact: true }).click();
      await page.getByRole('option', { name: 'English', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Subscription operations', exact: true })).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').evaluate(el => el.classList.contains('dark'))) !== (theme === 'dark')) {
        await page.getByRole('button', { name: locale === 'zh' ? '切换主题' : 'Toggle theme', exact: true }).click();
      }
      for (const width of [1440, 1280]) {
        await page.setViewportSize({ width, height: 1050 });
        const toolbar = page.locator('[data-ui="subscription-filter-toolbar"]');
        const boxes = await toolbar.locator('input,select,button').evaluateAll(elements => elements.map(el => { const b = el.getBoundingClientRect(); return { bottom: b.bottom, height: b.height }; }));
        expect(boxes.every(box => box.height >= 30 && box.height <= 48)).toBe(true);
        expect(Math.max(...boxes.map(box => box.bottom)) - Math.min(...boxes.map(box => box.bottom))).toBeLessThan(2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`subscriptions-${locale}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
    }
  }
  await page.locator('[data-ui="subscription-queue-item"]').nth(1).getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('Directory customer 01');
  await page.screenshot({ path: testInfo.outputPath('subscriptions-inspector-en-dark-1280.png'), fullPage: true, animations: 'disabled' });
});


test('subscription active set survives refresh and pagination and clears on exact status selection', async ({ page }, testInfo) => {
  const items = directorySubscriptions(24).map((item, index) => ({
    ...item,
    subscription: { ...item.subscription, status: ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'][index % 6] },
  }));
  const mocks = await installDirectoryMocks(page, items);
  await page.goto('/admin/subscriptions?plan_id=plus&risk=all&status_group=active');
  await expectRange(page, 1, 10, 16);
  const activeSet = statusGroup(page).getByRole('button', { name: /^Active set$|^活跃集合$/ });
  await expect(activeSet).toHaveAttribute('aria-pressed', 'true');
  await expect(statusGroup(page).getByRole('button', { pressed: true })).toHaveCount(1);
  await expect(page.locator('[data-ui="subscription-status-group-scope"]')).toBeVisible();
  await page.getByRole('button', { name: /^Next page$|^下一页$/ }).click();
  await expectRange(page, 11, 16, 16);
  expect(mocks.requests.at(-1)?.get('status_group')).toBe('active');
  await page.reload();
  await expectRange(page, 11, 16, 16);
  await page.getByRole('combobox', { name: /^Sort$|^排序$/ }).selectOption('customer');
  await expectRange(page, 1, 10, 16);
  expect(mocks.requests.at(-1)?.get('status_group')).toBe('active');
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(activeSet).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const screenshotPath = testInfo.outputPath(`active-set-pc-${width}.png`);
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach(`active-set-pc-${width}`, { path: screenshotPath, contentType: 'image/png' });
  }
  await statusGroup(page).getByRole('button', { name: /^Active$|^活跃$/ }).click();
  await expectRange(page, 1, 4, 4);
  expect(mocks.requests.at(-1)?.get('status')).toBe('active');
  expect(mocks.requests.at(-1)?.has('status_group')).toBe(false);
  await activeSet.click();
  await expectRange(page, 1, 10, 16);
  await statusGroup(page).getByRole('button', { name: /^All subscription states$|^全部订阅状态$/ }).click();
  await expectRange(page, 1, 10, 24);
  expect(mocks.requests.at(-1)?.has('status_group')).toBe(false);
  expect(mocks.requests.at(-1)?.has('status')).toBe(false);
});
