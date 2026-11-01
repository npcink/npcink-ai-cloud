import { quotaFixture, ledgerFixture } from '../fixtures/admin-account-evidence';
import { expect, test } from '@playwright/test';
import {
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';

test('invalid associated-site evidence stays local and recovers through the bounded GET', async ({ page }) => {
  const sites = { value: null as unknown };
  await installAdminMocks(page, { accountSitesController: sites });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Sites|站点|網站/i }).click();

  await expect(page.getByRole('heading', { name: /MVP Account|Npcink AI Demo/i }).first()).toBeVisible();
  await expect(page.locator('[data-ui="account-site-evidence-error"]')).toContainText(/Site evidence is unavailable|站点证据暂不可用/i);
  await expect(page.getByText(/No sites on this customer|这个客户下暂无站点/i)).toHaveCount(0);

  sites.value = [{ site_id: 'site_mvp', account_id: LONG_ACCOUNT_ID, name: 'MVP Site', status: 'active' }];
  await page.locator('[data-ui="account-site-evidence-error"]').getByRole('button', { name: /Retry|重试|重試/i }).click();
  await expect(page.getByRole('link', { name: 'site_mvp' })).toBeVisible();
  await expect(page.locator('[data-ui="account-site-evidence-error"]')).toHaveCount(0);
});

test('malformed quota evidence blocks quota conclusions and recovers without changing the customer shell', async ({ page }) => {
  const quota = { value: { status: 'ok', ai_credits: null, resource_limits: [], internal_limits: [], breakdown: [] } as unknown };
  await installAdminMocks(page, { quotaPayloadController: quota });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i }).click();

  await expect(page.getByRole('heading', { name: /MVP Account|Npcink AI Demo/i }).first()).toBeVisible();
  await expect(page.locator('[data-ui="account-credit-summary"]')).toHaveCount(0);
  await expect(page.getByText(/Retry this bounded customer read|重新读取这份客户记录/i)).toBeVisible();

  quota.value = {
    ...quotaFixture(LONG_ACCOUNT_ID),
    status: 'ok',
    ai_credits: { key: 'ai_credits', used: 10, limit: 100, remaining: 90, usage_ratio: 0.1, unlimited: false, status: 'ok', unit: 'ai_credits' },
    resource_limits: [], internal_limits: [], breakdown: [],
  };
  await page.getByRole('button', { name: /Retry|重试|重試/i }).last().click();
  await expect(page.locator('[data-ui="account-credit-summary"]')).toBeVisible();
});

test('malformed ledger evidence affects only the ledger drawer and recovers through GET', async ({ page }) => {
  const ledger = { value: {
    account_id: LONG_ACCOUNT_ID,
    pagination: { limit: 12, offset: 0, total: 1, has_more: false },
    summary: { entry_count: 1 },
    items: [{ ledger_entry_id: '', source_type: 'runtime', ai_credit_delta: -1, consumed_ai_credits: 1, quantity: 1, unit: 'credit' }],
  } as unknown };
  await installAdminMocks(page, { ledgerPayloadController: ledger });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i }).click();

  await expect(page.locator('[data-ui="account-credit-summary"]')).toBeVisible();
  await page.getByRole('button', { name: /Read ledger result|读取流水结果/i }).click();
  const drawer = page.getByRole('dialog', { name: /Credit ledger detail|AI 积分账本明细|AI 積分帳本明細/i });
  await expect(drawer.locator('[data-ui="account-credit-ledger-error"]')).toBeVisible();

  ledger.value = {
    ...ledgerFixture(LONG_ACCOUNT_ID),
    account_id: LONG_ACCOUNT_ID,
    pagination: { limit: 12, offset: 0, total: 0, has_more: false },
    summary: { ...ledgerFixture(LONG_ACCOUNT_ID).summary, entry_count: 0 },
    items: [],
  };
  await drawer.getByRole('button', { name: /Retry|重试|重試/i }).click();
  await expect(drawer.locator('[data-ui="account-credit-ledger-error"]')).toHaveCount(0);
  await expect(drawer.getByText(/No ledger records this period|本周期暂无账本记录/i)).toBeVisible();
});

test('operator profile draft blocks navigation, cancellation preserves it, and confirmation leaves', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  const editor = page.locator('[data-ui="operator-profile-editor"]');
  await editor.locator('summary').click();
  const note = editor.getByLabel(/Operator note|运营备注/i);
  await note.fill('unsaved draft for navigation');

  await page.getByRole('link', { name: /Back to customers|Back to accounts|返回客户列表|返回客戶列表/i }).click();
  const leaveDialog = page.getByRole('dialog', { name: /Leave with unsaved customer changes|放弃未保存的客户更改/i });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: /Cancel|取消/i }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/accounts/${LONG_ACCOUNT_ID}`));
  await expect(note).toHaveValue('unsaved draft for navigation');

  await page.getByRole('link', { name: /Back to customers|Back to accounts|返回客户列表|返回客戶列表/i }).click();
  await page.getByRole('dialog', { name: /Leave with unsaved customer changes|放弃未保存的客户更改/i })
    .getByRole('button', { name: /Discard and leave|放弃并离开/i }).click();
  await expect(page).toHaveURL(/\/admin\/accounts$/);
});

test('site datetime draft uses the same navigation guard while pending operation state stays separate', async ({ page }) => {
  await installAdminMocks(page, {
    sitePayloadController: {
      value: {
        site: { site_id: 'site_mvp', account_id: LONG_ACCOUNT_ID, name: 'MVP Site', status: 'archived', created_at: '2026-02-01T00:00:00Z' },
        subscription: null,
        site_keys: [],
        site_relink_policy: {
          enabled: true,
          default_cooldown_days: 90,
          ownership_released_at: '2026-07-01T00:00:00Z',
          cooldown_until: '2026-12-01T00:00:00Z',
          cross_account_relink_ready: false,
        },
      },
    },
  });
  await page.goto('/admin/sites/site_mvp');
  const unlock = page.getByLabel(/Cross-account unlock time|跨账号解锁时间/i);
  await expect(unlock).toBeVisible();
  await unlock.fill('2026-12-15T10:30');
  await page.getByRole('link', { name: /^Back$|^返回$/i }).first().click();
  const leaveDialog = page.getByRole('dialog', { name: /Leave with an unsaved unlock time|放弃未保存的解锁时间/i });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: /Cancel|取消/i }).click();
  await expect(unlock).toHaveValue('2026-12-15T10:30');
  await page.getByRole('link', { name: /^Back$|^返回$/i }).first().click();
  await page.getByRole('dialog', { name: /Leave with an unsaved unlock time|放弃未保存的解锁时间/i })
    .getByRole('button', { name: /Discard and leave|放弃并离开/i }).click();
  await expect(page).toHaveURL(/\/admin\/accounts$/);
});
