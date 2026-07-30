import { expect, test } from '@playwright/test';
import {
  LONG_ACCOUNT_ID,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

test('customer detail v2 keeps governed commercial and audited credit operations in their task tabs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await expect(
    page.getByRole('heading', { name: /Npcink AI Demo|MVP Account|acct_mvp_enterprise_primary/i }).first()
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Overview|^概况|^概況/i })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: /Commercial|商业与套餐|商業與方案/i }).click();
  await page.getByRole('button', { name: /^Free/i }).first().click();
  const packageDialog = page.getByRole('dialog');
  await expect(packageDialog).toContainText(/Confirm package change|确认更换套餐|確認更換方案/i);
  await packageDialog.getByRole('button', { name: /Change package|更换套餐|更換方案/i }).click();
  await expect(page.getByRole('button', { name: /Free.*Current|Free.*当前|Free.*目前/i }).first()).toBeVisible();

  await page.getByRole('tab', { name: /Audit|审计|稽核/i }).click();
  await expect(page.getByText('account.subscription.change')).toBeVisible();

  await page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i }).click();
  await page.getByLabel(/Credit delta|积分变动|積分變動/i).fill('250');
  await page.getByLabel(/^Reason$|^原因$/i).fill('e2e governed adjustment');
  await page.getByRole('button', { name: /Apply adjustment|应用调整|套用調整/i }).click();
  await expect(page.getByLabel(/Credit delta|积分变动|積分變動/i)).toHaveValue('');

  await page.getByRole('tab', { name: /Audit|审计|稽核/i }).click();
  await expect(page.getByText('account.credit.adjustment')).toBeVisible();
});

test('customer detail failure preserves the PC shell and bounded retry', async ({ page }) => {
  await installAdminMocks(page);
  await page.unroute('**/api/admin/**');
  let attempts = 0;
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}`, async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('customer unavailable')),
    });
  });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);

  await expect(page.getByRole('heading', { name: /Customer detail is temporarily unavailable|客户详情暂时不可用/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'customer unavailable' })).toBeVisible();
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/admin/accounts/${LONG_ACCOUNT_ID}$`));
});

test('customer credit evidence fails closed and keeps bounded retry', async ({ page }) => {
  await installAdminMocks(page);
  let attempts = 0;
  await page.route(
    `**/api/admin/accounts/${LONG_ACCOUNT_ID}/quota-summary`,
    async (route) => {
      attempts += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify(
          buildAdminApiErrorEnvelope('credit evidence unavailable')
        ),
      });
    }
  );

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  const creditsTab = page.getByRole('tab', {
    name: /Credits and usage|积分与用量|積分與用量/i,
  });
  await creditsTab.click();

  await expect(
    page
      .getByRole('alert')
      .filter({
        hasText:
          /Retry this bounded customer read|可在不离开当前运营路径|可在不離開目前營運路徑/i,
      })
  ).toBeVisible();
  await expect(creditsTab).toContainText(/Error|错误|錯誤/i);
  await expect(
    page.getByRole('heading', {
      name: /AI credit usage|AI 积分用量|AI 積分用量/i,
    })
  ).toHaveCount(0);

  const attemptsBeforeRetry = attempts;
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect.poll(() => attempts).toBeGreaterThan(attemptsBeforeRetry);
});

test('customer detail operator profile keeps the draft when the bounded save fails', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/accounts', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiErrorEnvelope(
          'operator profile rejected',
          'admin.operator_profile_rejected'
        )
      ),
    });
  });

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page
    .getByText(/Edit customer info|编辑客户信息|編輯客戶資訊/i)
    .click();
  const operatorNote = page.getByLabel(
    /Operator note|运营备注|營運備註/i
  );
  await operatorNote.fill('Keep this unsaved note');
  await page
    .locator('[data-ui="operator-profile-editor"]')
    .getByRole('button', { name: /Save|保存|儲存/i })
    .click();

  await expect(page.getByText('operator profile rejected')).toBeVisible();
  await expect(operatorNote).toHaveValue('Keep this unsaved note');
});

test('customer detail operator profile preserves the save payload and success receipt', async ({ page }) => {
  await installAdminMocks(page);
  let savedPayload: Record<string, unknown> | null = null;
  await page.route('**/api/admin/accounts', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    savedPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fallback();
  });

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page
    .getByText(/Edit customer info|编辑客户信息|編輯客戶資訊/i)
    .click();
  const editor = page.locator('[data-ui="operator-profile-editor"]');
  await editor
    .getByLabel(/Operator name|运营显示名|營運顯示名稱/i)
    .fill('  Updated customer  ');
  await editor
    .getByLabel(/Operator note|运营备注|營運備註/i)
    .fill('  Updated detail note  ');
  await editor.getByRole('button', { name: /Save|保存|儲存/i }).click();

  await expect(
    page.getByText(
      /Operator note has been saved|运营备注已保存|營運備註已儲存/i
    )
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Updated customer' }).first()
  ).toBeVisible();
  expect(savedPayload).toMatchObject({
    account_id: LONG_ACCOUNT_ID,
    name: 'MVP Account',
    status: 'active',
    bind_default_free: false,
    metadata: {
      operator_display_name: 'Updated customer',
      operator_note: 'Updated detail note',
    },
  });
});
