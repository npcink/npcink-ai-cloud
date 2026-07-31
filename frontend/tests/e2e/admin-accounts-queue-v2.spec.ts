import { expect, test, type Page, type Route } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';

type AccountFixture = {
  account: { account_id: string; name: string; status: string; metadata?: Record<string, unknown> };
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
  };
  identity_relationship_state: 'healthy';
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

async function installAccountsQueueMocks(page: Page) {
  await installAdminMocks(page);
  let accounts = initialAccounts();
  let requestCount = 0;
  let createRequestCount = 0;
  let createPayload: Record<string, unknown> | null = null;
  let failQuery = '';

  await page.route('**/api/admin/accounts?*', async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    if (failQuery && q === failQuery) {
      failQuery = '';
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary customer queue failure')) });
      return;
    }
    const status = url.searchParams.get('status') || '';
    const sort = url.searchParams.get('sort') || 'display_name';
    let items = accounts.filter((item) => {
      const searchable = [item.account.account_id, item.account.name, item.primary_identity.email, item.display_package_label, item.account.metadata?.operator_note].join(' ').toLowerCase();
      return (!q || searchable.includes(q)) && (!status || item.account.status === status);
    });
    items = [...items].sort((left, right) => {
      if (sort === 'display_name') return left.account.name.localeCompare(right.account.name);
      return right.account.account_id.localeCompare(left.account.account_id);
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({ items, total: items.length, hidden_internal_total: 1 })),
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

  return {
    getRequestCount: () => requestCount,
    getCreateRequestCount: () => createRequestCount,
    getCreatePayload: () => createPayload,
    failNextRequest: () => {
      failQuery = 'missing';
    },
  };
}

test('customer directory persists customer filters and opens the specified customer detail', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mocks = await installAccountsQueueMocks(page);

  await page.goto('/admin/accounts');
  await expect(page.getByRole('main').getByRole('heading', { name: /^Customers$|^客户$/i }).first()).toBeVisible();
  await expect(page.locator('[data-ui="customer-directory-row"]')).toHaveCount(3);
  await expect(page.locator('table')).toHaveCount(1);
  expect(mocks.getRequestCount()).toBe(1);
  const toolbarBox = await page.locator('[data-ui="customer-directory-toolbar"]').boundingBox();
  const searchBox = await page.locator('[data-ui="customer-directory-search"]').boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(searchBox).not.toBeNull();
  expect(searchBox!.width).toBeLessThan(toolbarBox!.width * 0.7);

  const directoryRows = page.locator('[data-ui="customer-directory-row"]');
  await expect(directoryRows.nth(0)).toContainText('Alpha Customer');
  await expect(directoryRows.nth(1)).toContainText('Beta Customer');
  await expect(directoryRows.nth(2)).toContainText('Zeta Customer');

  await page.getByRole('combobox').nth(0).selectOption('suspended');
  await expect(page).toHaveURL(/status=suspended/);
  await expect(directoryRows).toHaveCount(1);
  await expect(directoryRows).toContainText('Zeta Customer');

  await page.getByLabel(/^Search$|^搜索$/i).fill('Zeta');
  await page.getByRole('button', { name: /^Search$|^搜索$/i }).click();
  await expect(page).toHaveURL(/q=Zeta/);

  await page.reload();
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Zeta');
  await expect(page.getByRole('combobox').nth(0)).toHaveValue('suspended');
  await expect(directoryRows).toContainText('Zeta Customer');

  await expect(
    directoryRows.getByRole('link', { name: /^Details$|^详情$|^詳情$/i })
  ).toHaveAttribute('href', '/admin/accounts/acct_zeta');

  mocks.failNextRequest();
  await page.getByLabel(/^Search$|^搜索$/i).fill('Missing');
  await page.getByRole('button', { name: /^Search$|^搜索$/i }).click();
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

  await expect(page).toHaveURL(/\/admin\/accounts\/acct_generated_new_customer$/);
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
  await installAdminMocks(page);

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
});
