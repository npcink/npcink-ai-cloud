import { expect, test, type Page, type Route } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';

const pageErrors: string[] = [];
const unhandledAdminRequests: string[] = [];
test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  unhandledAdminRequests.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(unhandledAdminRequests).toEqual([]);
});

type AccountFixture = {
  account: { account_id: string; name: string; status: string; created_at?: string; metadata?: Record<string, unknown> };
  site_count: number;
  active_subscription_count: number;
  top_plan_id: string;
  package_alias: string;
  plan_kind: string;
  display_package_label: string;
  package_kind: string;
  coverage_state: string;
  coverage_follow_up_required: boolean;
  nearest_expiry_at: string;
  primary_identity: {
    principal_id: string;
    email: string;
    status: string;
    session_version: number;
    membership_id: string;
    membership_role: string;
    membership_status: string;
    qq_bound: boolean;
    qq_binding_count: number;
  } | null;
  identity_relationship_state: 'healthy' | 'missing' | 'conflict' | 'access_disabled';
};

function identityFixture(accountId: string, email: string) {
  return {
    primary_identity: {
      principal_id: `prn_${accountId}`,
      email,
      status: 'active',
      session_version: 1,
      membership_id: `aum_${accountId}`,
      membership_role: 'owner',
      membership_status: 'active',
      qq_bound: false,
      qq_binding_count: 0,
    },
    identity_relationship_state: 'healthy' as const,
  };
}

function initialAccounts(): AccountFixture[] {
  return [
    {
      account: { account_id: 'acct_zeta', name: 'Zeta Customer', status: 'suspended', metadata: { operator_note: 'Billing hold' } },
      site_count: 1,
      active_subscription_count: 1,
      top_plan_id: 'pro',
      package_alias: 'Pro',
      plan_kind: 'tier_paid',
      display_package_label: 'Pro',
      package_kind: 'tier_package',
      coverage_state: 'covered',
      coverage_follow_up_required: false,
      nearest_expiry_at: '2026-08-01T00:00:00Z',
      ...identityFixture('acct_zeta', 'owner@zeta.example'),
    },
    {
      account: { account_id: 'acct_beta', name: 'Beta Customer', status: 'active', metadata: { operator_note: 'Assign package before launch' } },
      site_count: 2,
      active_subscription_count: 0,
      top_plan_id: '',
      package_alias: '',
      plan_kind: '',
      display_package_label: 'Uncovered',
      package_kind: 'uncovered',
      coverage_state: 'uncovered',
      coverage_follow_up_required: true,
      nearest_expiry_at: '',
      ...identityFixture('acct_beta', 'owner@beta.example'),
    },
    {
      account: { account_id: 'acct_alpha', name: 'Alpha Customer', status: 'active', metadata: { operator_note: 'Stable customer' } },
      site_count: 1,
      active_subscription_count: 1,
      top_plan_id: 'free',
      package_alias: 'Free',
      plan_kind: 'default_free',
      display_package_label: 'Free',
      package_kind: 'formal_free',
      coverage_state: 'covered',
      coverage_follow_up_required: false,
      nearest_expiry_at: '2026-09-01T00:00:00Z',
      ...identityFixture('acct_alpha', 'owner@alpha.example'),
    },
  ];
}

function directoryAccounts(count: number): AccountFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    ...initialAccounts()[2],
    account: {
      account_id: `acct_directory_${index}`,
      name: `Directory customer ${String(index).padStart(2, '0')}`,
      status: index % 3 === 0 ? 'suspended' : index % 3 === 1 ? 'active' : 'inactive',
      created_at: new Date(Date.UTC(2026, 8, index + 1)).toISOString(),
    },
    ...identityFixture(`acct_directory_${index}`, `owner${index}@directory.example`),
  }));
}

function internalAccount(): AccountFixture {
  return {
    ...initialAccounts()[2],
    account: { account_id: 'acct_smoke_fixture', name: 'Internal smoke fixture', status: 'active' },
    ...identityFixture('acct_smoke_fixture', 'internal@example.test'),
  };
}

async function installAccountsQueueMocks(page: Page, initialItems = initialAccounts()) {
  await installAdminMocks(page, { unhandledAdminRequests });
  let accounts = [...initialItems, internalAccount()];
  let requestCount = 0;
  let createRequestCount = 0;
  let createPayload: Record<string, unknown> | null = null;
  let failWhen: ((params: URLSearchParams) => boolean) | null = null;
  const requests: URLSearchParams[] = [];
  let holdNext: (() => Promise<void>) | null = null;

  await page.route('**/api/admin/accounts?*', async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    const params = url.searchParams;
    requests.push(params);
    if (holdNext) {
      const wait = holdNext;
      holdNext = null;
      await wait();
    }
    const q = (params.get('q') || '').toLowerCase();
    if (failWhen?.(params)) {
      failWhen = null;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary customer queue failure')) });
      return;
    }
    const status = url.searchParams.get('status') || '';
    const sort = url.searchParams.get('sort') || 'display_name';
    let items = accounts.filter((item) => {
      const searchable = [item.account.account_id, item.account.name, item.primary_identity?.email, item.display_package_label, item.account.metadata?.operator_note].join(' ').toLowerCase();
      return (!q || q.split(/\s+/).every(term => searchable.includes(term))) && (!status || item.account.status === status);
    });
    const hiddenInternalTotal = items.filter(item => item.account.account_id === 'acct_smoke_fixture').length;
    if (params.get('exclude_internal') === 'true') items = items.filter(item => item.account.account_id !== 'acct_smoke_fixture');
    items = [...items].sort((left, right) => {
      if (sort === 'display_name') return left.account.name.localeCompare(right.account.name);
      return (right.account.created_at || '').localeCompare(left.account.created_at || '') || right.account.account_id.localeCompare(left.account.account_id);
    });
    const total = items.length;
    const limit = Number(params.get('limit'));
    const offset = Number(params.get('offset') || 0);
    expect(limit).toBe(10);
    items = items.slice(offset, offset + limit);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ items, total, hidden_internal_total: hiddenInternalTotal })),
    });
  });

  await page.route('**/api/admin/accounts', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    createRequestCount += 1;
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    createPayload = payload;
    const generatedAccountId = 'acct_generated_new_customer';
    const metadata = (payload.metadata || {}) as Record<string, unknown>;
    const bindDefaultFree = Boolean(payload.bind_default_free);
    accounts = [
      ...accounts,
      {
        account: {
          account_id: generatedAccountId,
          name: String(payload.name),
          status: 'active',
          metadata,
        },
        site_count: 0,
        active_subscription_count: bindDefaultFree ? 1 : 0,
        top_plan_id: bindDefaultFree ? 'free' : '',
        package_alias: bindDefaultFree ? 'Free' : '',
        plan_kind: bindDefaultFree ? 'default_free' : '',
        display_package_label: bindDefaultFree ? 'Free' : 'Uncovered',
        package_kind: bindDefaultFree ? 'formal_free' : 'uncovered',
        coverage_state: bindDefaultFree ? 'covered' : 'uncovered',
        coverage_follow_up_required: false,
        nearest_expiry_at: '',
        ...identityFixture(generatedAccountId, String(payload.primary_email)),
      },
    ];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ account_id: generatedAccountId })) });
  });

  await page.route(/\/api\/admin\/accounts\/[^/?]+$/, async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const accountId = new URL(route.request().url()).pathname.split('/').at(-1);
    const item = accounts.find(account => account.account.account_id === accountId);
    if (!item) return route.fallback();
    await route.fulfill({ json: buildAdminApiEnvelope({
      account: item.account, primary_identity: item.primary_identity,
      identity_relationship_state: item.identity_relationship_state,
      memberships: [], sites: [], subscriptions: [],
      trial_readiness: { status: 'ready', next_action: 'invite_trial_site', summary: { site_count: 0 } },
    }) });
  });

  return {
    getRequestCount: () => requestCount,
    getCreateRequestCount: () => createRequestCount,
    getCreatePayload: () => createPayload,
    getRequests: () => requests,
    failNextRequest: (predicate = (params: URLSearchParams) => params.get('q')?.toLowerCase() === 'missing') => { failWhen = predicate; },
    holdNextRequest: () => {
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      holdNext = () => held;
      return release;
    },
  };
}

test('customer directory persists customer filters and opens the specified customer detail', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mocks = await installAccountsQueueMocks(page);

  await page.goto('/admin/accounts');
  await expect(page.getByRole('main').getByRole('heading', { name: /^(Customers|客户)( · [\d,]+)?$/i }).first()).toBeVisible();
  await expect(page.locator('[data-ui="customer-directory-row"]')).toHaveCount(3);
  await expect(page.locator('table')).toHaveCount(1);
  expect(mocks.getRequestCount()).toBe(1);
  const toolbarBox = await page.locator('[data-ui="customer-directory-toolbar"]').boundingBox();
  const searchBox = await page.getByLabel(/^Search$|^搜索$/i).boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.width).toBeLessThan(toolbarBox!.width * 0.7);

  const directoryRows = page.locator('[data-ui="customer-directory-row"]');
  await expect(directoryRows.nth(0)).toContainText('Alpha Customer');
  await expect(directoryRows.nth(1)).toContainText('Beta Customer');
  await expect(directoryRows.nth(2)).toContainText('Zeta Customer');

  await page.getByRole('group', { name: /^Status$|^状态$/i }).getByRole('button', { name: /^Suspended$|^已暂停$|^暂停$/i }).click();
  await expect(page).toHaveURL(/status=suspended/);
  await expect(directoryRows).toHaveCount(1);
  await expect(directoryRows).toContainText('Zeta Customer');

  await page.getByLabel(/^Search$|^搜索$/i).fill('Zeta');
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expect(page).toHaveURL(/q=Zeta/);

  await page.reload();
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Zeta');
  await expect(page.getByRole('group', { name: /^Status$|^状态$/i }).getByRole('button', { name: /^Suspended$|^已暂停$|^暂停$/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(directoryRows).toContainText('Zeta Customer');

  const detailHref = await directoryRows
    .getByRole('link', { name: /^Details$|^详情$|^詳情$/i })
    .getAttribute('href');
  const detailUrl = new URL(detailHref || '', 'https://admin.example');
  expect(detailUrl.pathname).toBe('/admin/accounts/acct_zeta');
  expect(detailUrl.searchParams.get('return_to')).toBe(
    '/admin/accounts?status=suspended&q=Zeta'
  );

  mocks.failNextRequest();
  await page.getByLabel(/^Search$|^搜索$/i).fill('Missing');
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expect(page.getByText(/last successfully loaded page|最近一次成功加载的页面/i)).toBeVisible();
  await expect(directoryRows).toHaveCount(1);
  await expect(directoryRows).toContainText('Zeta Customer');
});

test('customer creation uses a dialog, receives a generated ID, and binds Free by default', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mocks = await installAccountsQueueMocks(page);
  await page.goto('/admin/accounts');

  const addCustomerButton = page.getByRole('button', { name: /Add customer|添加客户|新增客戶/i });
  await addCustomerButton.click();
  const createDialog = page.getByRole('dialog', { name: /Add customer|添加客户|新增客戶/i });
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByLabel(/Account ID|账户 ID|账号 ID|帳戶 ID/i)).toHaveCount(0);
  await createDialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(addCustomerButton).toBeFocused();

  await addCustomerButton.click();
  await page.getByLabel(/^Name$|^名称$|^名稱$/i).fill('   ');
  await page.getByLabel(/Login email|登录邮箱/i).fill('   ');
  await page.getByRole('button', { name: /Create customer|创建客户|建立客戶/i }).click();
  await expect(page.getByText(/Enter a customer name|请输入客户名称/i)).toBeVisible();
  await expect(page.getByText(/Enter the customer login email|请输入客户登录邮箱/i)).toBeVisible();
  expect(mocks.getCreateRequestCount()).toBe(0);

  await page.getByLabel(/^Name$|^名称$|^名稱$/i).fill('New Customer');
  await page.getByLabel(/Login email|登录邮箱/i).fill('owner@new.example');
  await page.getByLabel(/Operator name|运营显示名|營運顯示名/i).fill('New Customer Display');
  await page.getByLabel(/Operator note|运营备注|營運備註/i).fill('Internal launch note');
  await page.getByRole('button', { name: /Create customer|创建客户|建立客戶/i }).click();

  await expect(page).toHaveURL(/\/admin\/accounts\/acct_generated_new_customer\?return_to=%2Fadmin%2Faccounts$/);
  expect(mocks.getCreateRequestCount()).toBe(1);
  expect(mocks.getCreatePayload()).toMatchObject({
    name: 'New Customer',
    primary_email: 'owner@new.example',
    bind_default_free: true,
    metadata: {
      operator_display_name: 'New Customer Display',
      operator_note: 'Internal launch note',
    },
  });
  expect(mocks.getCreatePayload()).not.toHaveProperty('account_id');
});

test('customer identity audit and access disable live in the specified customer detail', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page, { unhandledAdminRequests });

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}#customer-access`);
  await expect(
    page.getByRole('heading', { name: /Login identity and access|登录身份与访问/i })
  ).toBeVisible();
  await expect(page.getByText('admin@example.com')).toBeVisible();

  await page.getByRole('button', { name: /Identity audit|身份审计/i }).click();
  const auditDialog = page.locator('[data-ui="admin-workbench-dialog"]').filter({
    has: page.getByRole('heading', { name: /Identity audit|身份审计/i }),
  });
  await expect(auditDialog).toBeVisible();
  const closeAuditButton = auditDialog.getByRole('button', { name: /^Close$|^关闭$/i }).last();
  await expect(closeAuditButton).toBeEnabled();
  await closeAuditButton.click();

  await page.locator('summary').filter({ hasText: /Access actions|访问操作/i }).click();
  await page.getByRole('button', { name: /Disable login access|禁用登录访问/i }).click();
  const disableDialog = page.locator('[data-ui="admin-workbench-dialog"]').filter({
    has: page.getByRole('heading', { name: /Disable customer login access|禁用客户登录访问/i }),
  });
  await expect(disableDialog).toBeVisible();
  await disableDialog.getByLabel(/Reason|原因/i).fill('Customer requested access hold');
  await disableDialog.getByRole('button', { name: /Confirm disable|确认禁用/i }).click();
  await expect(page.getByText(/access was disabled|访问已禁用/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Disable login access|禁用登录访问/i })).toHaveCount(0);
  await page.getByRole('button', { name: /Identity audit|身份审计/i }).click();
  await expect(auditDialog.getByText('portal_user.disable', { exact: true })).toBeVisible();
  await expect(auditDialog.locator('dl > div').filter({ hasText: /^Disables|^禁用/i }).locator('dd')).toHaveText('1');

  // Disabling the primary customer must not leak into a different fixture identity.
  const secondary = await page.evaluate(async () => {
    const response = await fetch('/api/admin/accounts/acct_free_primary');
    return (await response.json()).data;
  });
  expect(secondary.account.account_id).toBe('acct_free_primary');
  expect(secondary.primary_identity).toMatchObject({
    principal_id: 'prn_acct_free_primary', email: 'free-owner@example.com', status: 'active', session_version: 1,
  });
  expect(secondary.identity_relationship_state).toBe('healthy');
  expect(secondary.memberships[0].member_ref).toBe('user:free-owner@example.com');
  const directory = await page.evaluate(async () => {
    const response = await fetch('/api/admin/accounts');
    return (await response.json()).data;
  });
  expect(directory.items.find((item: { account: { account_id: string } }) => item.account.account_id === 'acct_free_primary').identity_relationship_state)
    .toBe(secondary.identity_relationship_state);
});

function statusGroup(page: Page) {
  return page.getByRole('group', { name: /^Status$|^状态$/i });
}

async function expectRange(page: Page, start: number, end: number, total: number) {
  const range = new RegExp(`^(?:第\\s*)?${start}\\s*[–-]\\s*${end}\\s*(?:of\\s*|条，共\\s*)${total}(?:\\s*条)?$`);
  await expect(page.getByText(range)).toBeVisible();
}

for (const count of [0, 1, 10, 11, 21]) {
  test(`customer directory uses a true ten-row page and honest range for ${count} customers`, async ({ page }) => {
    const mocks = await installAccountsQueueMocks(page, directoryAccounts(count));
    await page.goto('/admin/accounts');
    await expect(page.locator('[data-ui="customer-directory-row"]')).toHaveCount(Math.min(count, 10));
    await expectRange(page, count ? 1 : 0, Math.min(count, 10), count);
    expect(mocks.getRequests().at(-1)?.get('limit')).toBe('10');
    expect(mocks.getRequests().at(-1)?.get('exclude_internal')).toBe('true');
    await expect(statusGroup(page).getByRole('button', { pressed: true })).toHaveCount(1);
    if (count > 10) {
      await expect(page.getByRole('button', { name: /^Previous$|^上一页$/i })).toBeDisabled();
      await expect(page.getByRole('button', { name: /^Next page$|^下一页$/i })).toBeEnabled();
    } else {
      await expect(page.getByRole('button', { name: /^Next page$|^下一页$/i })).toHaveCount(0);
    }
  });
}

test('customer directory pages real results and keeps explicit search, status and sort URL backed', async ({ page }) => {
  const mocks = await installAccountsQueueMocks(page, directoryAccounts(21));
  await page.goto('/admin/accounts?q=Directory');
  const rows = page.locator('[data-ui="customer-directory-row"]');
  const next = page.getByRole('button', { name: /^Next page$|^下一页$/i });
  const previous = page.getByRole('button', { name: /^Previous$|^上一页$/i });
  await expect(rows.first()).toContainText('Directory customer 00');
  await next.click();
  await expect(page).toHaveURL(/q=Directory&offset=10$/);
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText('Directory customer 10');
  await expectRange(page, 11, 20, 21);
  expect(mocks.getRequests().at(-1)?.get('offset')).toBe('10');
  await next.click();
  await expect(page).toHaveURL(/offset=20$/);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Directory customer 20');
  await expectRange(page, 21, 21, 21);
  await expect(next).toBeDisabled();
  await previous.click();
  await expectRange(page, 11, 20, 21);
  await page.reload();
  await expect(rows.first()).toContainText('Directory customer 10');
  await expectRange(page, 11, 20, 21);
  await page.getByRole('combobox', { name: /^Sort$|^排序$/i }).selectOption('created_at');
  await expect(page).toHaveURL(/q=Directory&sort=created_at$/);
  await expect(rows.first()).toContainText('Directory customer 20');
  expect(mocks.getRequests().at(-1)?.get('offset')).toBeNull();
  await next.click();
  await expectRange(page, 11, 20, 21);
  await statusGroup(page).getByRole('button', { name: /^Active$|^活跃$/i }).click();
  await expect(page).toHaveURL(/q=Directory&sort=created_at&status=active$/);
  await expect(rows).toHaveCount(7);
  await expectRange(page, 1, 7, 7);
  await expect(statusGroup(page).getByRole('button', { pressed: true })).toHaveCount(1);
  const beforeTyping = mocks.getRequestCount();
  await page.getByLabel(/^Search$|^搜索$/i).fill('Directory customer 19');
  expect(mocks.getRequestCount()).toBe(beforeTyping);
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Directory customer 19');
  await expectRange(page, 1, 1, 1);
  expect(mocks.getRequests().at(-1)?.get('q')).toBe('Directory customer 19');
});

test('customer directory retains its successful page during pending and failed paging and retries the URL target', async ({ page }, testInfo) => {
  const mocks = await installAccountsQueueMocks(page, directoryAccounts(21));
  await page.goto('/admin/accounts?q=Directory&offset=10');
  const rows = page.locator('[data-ui="customer-directory-row"]');
  await expect(rows.first()).toContainText('Directory customer 10');
  await expectRange(page, 11, 20, 21);
  const rangeEvidence = await page.evaluateHandle(() => {
    const initialRange = document.querySelector('nav[aria-label="Pagination"], nav[aria-label="分页"]')?.querySelector('p')?.textContent;
    const ranges: string[] = initialRange ? [initialRange] : [];
    const observer = new MutationObserver(() => {
      const nav = document.querySelector('nav[aria-label="Pagination"], nav[aria-label="分页"]');
      const text = nav?.querySelector('p')?.textContent;
      if (text && ranges.at(-1) !== text) ranges.push(text);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { ranges, stop: () => observer.disconnect() };
  });
  mocks.failNextRequest(params => params.get('offset') === '20');
  const release = mocks.holdNextRequest();
  const before = mocks.getRequestCount();
  await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
  await expect(page).toHaveURL(/offset=20$/);
  await expect.poll(() => mocks.getRequestCount()).toBe(before + 1);
  await expect(rows.first()).toContainText('Directory customer 10');
  await expectRange(page, 11, 20, 21);
  release();
  await expect(page.getByText(/last successfully loaded page|最近一次成功加载的页面/i)).toBeVisible();
  await expectRange(page, 11, 20, 21);
  await expect(rows.first()).toContainText('Directory customer 10');
  const recordedRanges = await rangeEvidence.evaluate(state => state.ranges);
  expect(recordedRanges.length).toBeGreaterThan(0);
  expect(recordedRanges.every(text => /11\s*[–-]\s*20/.test(text))).toBe(true);
  await rangeEvidence.evaluate(state => state.stop());
  await testInfo.attach('retained-range-observation', { body: JSON.stringify(recordedRanges), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('accounts-retained-page-error.png'), fullPage: true, animations: 'disabled' });
  const beforeRetry = mocks.getRequestCount();
  await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
  await expect.poll(() => mocks.getRequestCount()).toBe(beforeRetry + 1);
  expect(mocks.getRequests().at(-1)?.get('offset')).toBe('20');
  await expect(page).toHaveURL(/offset=20$/);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Directory customer 20');
  await expectRange(page, 21, 21, 21);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('customer directory blocks retained paging across a failed new search and refreshes its current URL', async ({ page }, testInfo) => {
  const mocks = await installAccountsQueueMocks(page, directoryAccounts(81));
  const rows = page.locator('[data-ui="customer-directory-row"]');
  const next = page.getByRole('button', { name: /^Next page$|^下一页$/i });
  const previous = page.getByRole('button', { name: /^Previous$|^上一页$/i });
  const refresh = page.getByRole('button', { name: /^Refresh$|^刷新$/i });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/accounts?q=Directory&offset=50');
  await expectRange(page, 51, 60, 81);
  mocks.failNextRequest(params => params.get('q') === 'customer' && !params.has('offset'));
  const release = mocks.holdNextRequest();
  const failedSearch = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/accounts' && new URL(response.url()).searchParams.get('q') === 'customer' && response.status() === 503);
  await page.getByLabel(/^Search$|^搜索$/i).fill('customer');
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expect(page).toHaveURL('/admin/accounts?q=customer');
  await expect.poll(() => mocks.getRequests().at(-1)?.get('q')).toBe('customer');
  await expectRange(page, 51, 60, 81);
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  release();
  expect((await failedSearch).status()).toBe(503);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/last successfully loaded page|最近一次成功加载的页面/i);
  await expect(rows.first()).toContainText('Directory customer 50');
  await expectRange(page, 51, 60, 81);
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await expect(refresh).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('accounts-cross-query-disabled-zh-1440.png'), fullPage: true, animations: 'disabled' });
  const beforeRefresh = mocks.getRequestCount();
  await refresh.click();
  await expectRange(page, 1, 10, 81);
  await expect(rows.first()).toContainText('Directory customer 00');
  expect(mocks.getRequestCount()).toBe(beforeRefresh + 1);
  expect(mocks.getRequests().filter(params => params.get('q') === 'customer').every(params => !params.has('offset'))).toBe(true);
  await expect(page).toHaveURL('/admin/accounts?q=customer');
  await expect(next).toBeEnabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);

  await page.goto('/admin/accounts?q=Directory&offset=900');
  await expectRange(page, 0, 0, 81);
  await expect(previous).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 1050 });
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  mocks.failNextRequest(params => params.get('q') === 'customer 00' && !params.has('offset'));
  const releaseEmpty = mocks.holdNextRequest();
  const failedEmptySearch = page.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/accounts' && new URL(response.url()).searchParams.get('q') === 'customer 00' && response.status() === 503);
  await page.getByLabel('Search', { exact: true }).fill('customer 00');
  await page.getByLabel('Search', { exact: true }).press('Enter');
  await expect(page).toHaveURL('/admin/accounts?q=customer+00');
  await expect.poll(() => mocks.getRequests().at(-1)?.get('q')).toBe('customer 00');
  await expectRange(page, 0, 0, 81);
  await expect(previous).toBeDisabled();
  releaseEmpty();
  expect((await failedEmptySearch).status()).toBe(503);
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/last successfully loaded page|最近一次成功加载的页面/i);
  await expectRange(page, 0, 0, 81);
  await expect(previous).toBeDisabled();
  await expect(next).toHaveCount(0);
  await expect(refresh).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('accounts-cross-query-empty-disabled-en-1280.png'), fullPage: true, animations: 'disabled' });
  const beforeEmptyRefresh = mocks.getRequestCount();
  await refresh.click();
  await expectRange(page, 1, 1, 1);
  await expect(rows).toContainText('Directory customer 00');
  expect(mocks.getRequestCount()).toBe(beforeEmptyRefresh + 1);
  expect(mocks.getRequests().filter(params => params.get('q') === 'customer 00').every(params => !params.has('offset'))).toBe(true);
  await expect(page).toHaveURL('/admin/accounts?q=customer+00');
  await expect(previous).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('accounts-cross-query-refreshed-en-1280.png'), fullPage: true, animations: 'disabled' });
});

test('customer directory recovers a successful far empty page once without changing its filter context', async ({ page }, testInfo) => {
  const mocks = await installAccountsQueueMocks(page, directoryAccounts(21));
  const context = '/admin/accounts?q=Directory&internal=1&sort=created_at&offset=900';
  await page.goto(context);
  await expect(page.getByText(/^No data available$|^暂无数据$/i)).toBeVisible();
  await expect(page.getByText(/No customers match|没有符合.*客户/i)).toHaveCount(0);
  await expectRange(page, 0, 0, 21);
  await expect(page).toHaveURL(context);
  expect(mocks.getRequests().at(-1)?.get('offset')).toBe('900');
  await page.screenshot({ path: testInfo.outputPath('accounts-out-of-range.png'), fullPage: true, animations: 'disabled' });
  const before = mocks.getRequestCount();
  await page.getByRole('button', { name: /^Previous$|^上一页$/i }).click();
  await expect(page).toHaveURL('/admin/accounts?q=Directory&internal=1&sort=created_at&offset=20');
  await expect(page.locator('[data-ui="customer-directory-row"]')).toHaveCount(1);
  await expectRange(page, 21, 21, 21);
  expect(mocks.getRequestCount()).toBe(before + 1);
  expect(mocks.getRequests().at(-1)?.get('exclude_internal')).toBeNull();
});

test('customer directory internal visibility and both detail links retain the directory return context', async ({ page }, testInfo) => {
  const mocks = await installAccountsQueueMocks(page, directoryAccounts(11));
  await page.goto('/admin/accounts?sort=created_at');
  await expectRange(page, 1, 10, 11);
  await page.getByRole('button', { name: /Show test records|显示测试\/异常账号/i }).click();
  await expect(page).toHaveURL('/admin/accounts?sort=created_at&internal=1');
  await expectRange(page, 1, 10, 12);
  expect(mocks.getRequests().at(-1)?.get('exclude_internal')).toBeNull();
  await page.getByRole('button', { name: /^Next page$|^下一页$/i }).click();
  await expectRange(page, 11, 12, 12);
  await expect(page.locator('[data-ui="customer-directory-row"]')).toContainText(['Directory customer 00', 'Internal smoke fixture']);
  await page.getByRole('button', { name: /Hide test records|隐藏测试\/异常账号/i }).click();
  await expect(page).toHaveURL('/admin/accounts?sort=created_at');
  await expectRange(page, 1, 10, 11);
  await page.getByLabel(/^Search$|^搜索$/i).fill('Directory customer 10');
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expectRange(page, 1, 1, 1);
  const row = page.locator('[data-ui="customer-directory-row"]');
  const links = row.getByRole('link');
  await expect(links).toHaveCount(2);
  const href = await links.first().getAttribute('href');
  await expect(links.last()).toHaveAttribute('href', href!);
  const queueUrl = new URL(page.url());
  expect(new URL(href!, page.url()).searchParams.get('return_to')).toBe(`${queueUrl.pathname}${queueUrl.search}`);
  await links.last().click();
  await expect(page.getByRole('heading', { name: 'Directory customer 10' })).toBeVisible();
  await page.getByRole('link', { name: /Back to customers|返回客户列表/i }).click();
  await expect(page).toHaveURL(queueUrl.href);
  await expectRange(page, 1, 1, 1);
  await page.screenshot({ path: testInfo.outputPath('accounts-filtered-returned.png'), fullPage: true, animations: 'disabled' });
});

test('customer directory rejects a late response after a newer explicit search succeeds', async ({ page }) => {
  const mocks = await installAccountsQueueMocks(page, directoryAccounts(21));
  await page.goto('/admin/accounts');
  await expectRange(page, 1, 10, 21);
  const release = mocks.holdNextRequest();
  const firstResponse = page.waitForResponse(response => new URL(response.url()).searchParams.get('q') === 'Directory');
  await page.getByLabel(/^Search$|^搜索$/i).fill('Directory');
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expect.poll(() => mocks.getRequests().at(-1)?.get('q')).toBe('Directory');
  await page.getByLabel(/^Search$|^搜索$/i).fill('Directory customer 20');
  await page.getByLabel(/^Search$|^搜索$/i).press('Enter');
  await expectRange(page, 1, 1, 1);
  release();
  await firstResponse;
  await expectRange(page, 1, 1, 1);
  await expect(page.locator('[data-ui="customer-directory-row"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="customer-directory-row"]')).toContainText('Directory customer 20');
});

test('customer directory Quiet PC preview keeps real language and theme controls and reachable row actions', async ({ page }, testInfo) => {
  await installAccountsQueueMocks(page, directoryAccounts(11));
  await page.goto('/admin/accounts');
  await expectRange(page, 1, 10, 11);
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1050 });
    const tableBody = page.locator('[data-ui="customer-directory-table"] > div.overflow-x-auto');
    const action = page.locator('[data-ui="customer-directory-row"]').first().getByRole('link', { name: /^Details$|^详情$/i });
    await action.scrollIntoViewIfNeeded();
    const bodyBox = await tableBody.boundingBox();
    const actionBox = await action.boundingBox();
    expect(actionBox!.height).toBeLessThanOrEqual(40);
    expect(await tableBody.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(actionBox!.x).toBeGreaterThanOrEqual(bodyBox!.x);
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(bodyBox!.x + bodyBox!.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`accounts-zh-light-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const width of [1440, 1280]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.screenshot({ path: testInfo.outputPath(`accounts-zh-dark-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Customers · [\d,]+$/ }).first()).toBeVisible();
  const englishAction = page.locator('[data-ui="customer-directory-row"]').first().getByRole('link', { name: 'Details', exact: true });
  await englishAction.scrollIntoViewIfNeeded();
  const englishBox = await englishAction.boundingBox();
  const englishBody = await page.locator('[data-ui="customer-directory-table"] > div.overflow-x-auto').boundingBox();
  expect(englishBox!.height).toBeLessThanOrEqual(40);
  expect(englishBox!.x + englishBox!.width).toBeLessThanOrEqual(englishBody!.x + englishBody!.width + 1);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.screenshot({ path: testInfo.outputPath(`accounts-en-light-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  if (!await page.locator('html').evaluate(element => element.classList.contains('dark'))) {
    await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  }
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.screenshot({ path: testInfo.outputPath(`accounts-en-dark-${width}.png`), fullPage: true, animations: 'disabled' });
  }
  await page.getByLabel('Search', { exact: true }).fill('No such customer');
  await page.getByLabel('Search', { exact: true }).press('Enter');
  await expectRange(page, 0, 0, 0);
  await page.screenshot({ path: testInfo.outputPath('accounts-empty-en-dark.png'), fullPage: true, animations: 'disabled' });
});


test('customer directory separates account status from login issues and contains long content', async ({ page }, testInfo) => {
  const items = directoryAccounts(4);
  items[0].account.name = '0123456789abcdef0123456789abcdef';
  items[0].account.account_id = 'acct_0123456789abcdef0123456789abcdef';
  items[0].primary_identity = null;
  items[0].identity_relationship_state = 'missing';
  items[1].identity_relationship_state = 'conflict';
  items[2].identity_relationship_state = 'access_disabled';
  items[2].account.name = 'Long customer name '.repeat(12);
  items[2].primary_identity!.email = `${'longaddress'.repeat(12)}@example.test`;
  await installAccountsQueueMocks(page, items);
  await page.goto('/admin/accounts');
  await expectRange(page, 1, 4, 4);
  await expect(page.getByRole('button', { name: /^Clear filters$|^清除筛选$/i })).toHaveCount(0);
  const unnamed = page.locator('[data-ui="customer-directory-row"]').filter({ hasText: /Unnamed customer|未命名客户/ });
  await expect(unnamed).toHaveCount(1);
  await expect(unnamed.locator('td').nth(1)).toContainText(/Login identity missing|缺少登录身份/);
  await expect(unnamed.locator('td').nth(2)).not.toContainText(/Missing|缺失|身份/);
  await expect(page.getByText(/Conflicting login identities|登录身份冲突/)).toBeVisible();
  await expect(page.getByText(/Login access disabled|登录访问已禁用/)).toBeVisible();
  await expect(unnamed.locator('[title="acct_0123456789abcdef0123456789abcdef"]')).toHaveCount(1);
  for (const width of [1920, 1440, 1280, 1056, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width >= 1440) {
      const search = await page.getByLabel(/^Search$|^搜索$/i).boundingBox();
      const sort = await page.getByRole('combobox', { name: /Sort|排序/i }).boundingBox();
      expect(Math.abs(search!.y - sort!.y)).toBeLessThan(3);
    }
    if (width >= 1056) {
      const body = page.locator('[data-ui="customer-directory-table"] > div.overflow-x-auto');
      expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    const details = unnamed.getByRole('link', { name: /^Details$|^详情$/i });
    await details.scrollIntoViewIfNeeded();
    await expect(details).toBeVisible();
    await expect(details).not.toHaveClass(/btn-primary/);
    await page.screenshot({ path: testInfo.outputPath(`accounts-edge-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});
