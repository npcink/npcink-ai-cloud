import { expect, test } from '@playwright/test';
import {
  LONG_ACCOUNT_ID,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

test('customer detail v2 keeps governed commercial and audited credit operations in their task tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await expect(
    page.getByRole('heading', { name: /Npcink AI Demo|MVP Account|acct_mvp_enterprise_primary/i }).first()
  ).toBeVisible();
  const detailTabs = page.getByRole('tab');
  await expect(detailTabs).toHaveCount(6);
  await expect(page.getByRole('tab', { name: /^Overview|^概况|^概況/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /Suspend account|暂停账户|暫停帳戶/i })).toBeVisible();
  await expect(page.getByText(/More account actions|更多账户操作|更多帳戶操作/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Manage package|管理套餐|管理方案/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Back to customers|Back to accounts|返回客户列表|返回客戶列表/i })).toHaveAttribute('href', '/admin/accounts');

  const tabPositions = await detailTabs.evaluateAll((tabs) =>
    tabs.map((tab) => ({
      left: Math.round(tab.getBoundingClientRect().left),
      top: Math.round(tab.getBoundingClientRect().top),
    }))
  );
  expect(new Set(tabPositions.map((position) => position.left)).size).toBe(1);
  expect(new Set(tabPositions.map((position) => position.top)).size).toBe(6);

  await page.getByRole('tab', { name: /Commercial|商业与套餐|商業與方案/i }).click();
  await expect(page.locator('[data-ui="operator-profile-editor"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Suspend account|暂停账户|暫停帳戶/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="account-package-comparison"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Open package options|打开套餐选项/i }).click();
  const packageDrawer = page.getByRole('dialog', { name: /Change customer package|更换客户套餐/i });
  await packageDrawer.getByRole('button', { name: /^Free/i }).click();
  const packageDialog = page.getByRole('dialog');
  await expect(packageDialog).toContainText(/Confirm package change|确认更换套餐|確認更換方案/i);
  await packageDialog.getByRole('button', { name: /Change package|更换套餐|更換方案/i }).click();
  await expect(page.locator('[data-ui="account-package-collapsed"]')).toContainText(/Free/i);

  await page.getByRole('tab', { name: /Audit|审计|稽核/i }).click();
  await expect(page.getByText('account.subscription.change')).toBeVisible();

  await page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i }).click();
  await expect(page.locator('[data-ui="account-credit-usage-summary"]')).toBeVisible();
  await expect(page.getByText(/Commercial operation completed|商业操作已完成|商業操作已完成/i)).toHaveCount(0, {
    timeout: 10_000,
  });
  const nextDevToolsButton = page.getByRole('button', { name: 'Open Next.js Dev Tools' });
  if (await nextDevToolsButton.count()) {
    await nextDevToolsButton.evaluate((element) => {
      const rootNode = element.getRootNode();
      if (rootNode instanceof ShadowRoot) {
        (rootNode.host as HTMLElement).style.display = 'none';
        return;
      }
      element.style.display = 'none';
    });
  }
  await expect(page).toHaveScreenshot(
    'admin-customer-detail-credits-pc.png',
    { animations: 'disabled' }
  );
  await expect(page.getByText(/Vector articles|向量文章/i)).toHaveCount(0);
  await expect(page.getByText(/Concurrent runs|并发任务|並發任務/i)).toHaveCount(0);
  await expect(page.locator('[data-ui="account-credit-operations"]')).toBeVisible();
  const criticalSummaryBottom = await page.locator('[data-ui="account-credit-summary"]').evaluate(
    (element) => Math.ceil(element.getBoundingClientRect().bottom)
  );
  expect(criticalSummaryBottom).toBeLessThanOrEqual(900);
  await expect(page.locator('[data-ui="account-topup-comparison"]')).toHaveCount(0);
  const adjustmentButton = page.getByRole('button', { name: /Adjust AI credits|调整 AI 积分|調整 AI 積分/i });
  await adjustmentButton.click();
  const adjustmentDialog = page.getByRole('dialog', { name: /AI credit adjustment|AI 积分调整|AI 積分調整/i });
  await adjustmentDialog.getByLabel(/Credit delta|积分变动|積分變動/i).fill('250');
  await adjustmentDialog.getByLabel(/^Reason$|^原因$/i).fill('e2e governed adjustment');
  await adjustmentDialog.getByRole('button', { name: /Apply adjustment|应用调整|套用調整/i }).click();
  await expect(adjustmentDialog).toHaveCount(0);

  const ledgerButton = page.getByRole('button', { name: /View ledger|查看.*流水|查看.*明細/i });
  await ledgerButton.click();
  const ledgerDrawer = page.getByRole('dialog', { name: /Credit ledger detail|AI 积分账本明细|AI 積分帳本明細/i });
  await expect(ledgerDrawer).toBeVisible();
  await ledgerDrawer.locator('[data-ui="admin-inspector-drawer-close"]').click();
  await expect(ledgerButton).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('tab', { name: /Audit|审计|稽核/i }).click();
  await expect(page.getByText('account.credit.adjustment')).toBeVisible();
});

test('customer and Site details preserve one filtered Accounts return context across refresh and browser history', async ({ page }) => {
  await installAdminMocks(page);
  const queuePath = '/admin/accounts?q=MVP&status=active&tag=one&tag=two';
  const accountPath = `/admin/accounts/${LONG_ACCOUNT_ID}?return_to=${encodeURIComponent(queuePath)}`;

  await page.goto(accountPath);
  const accountReturn = page.getByRole('link', {
    name: /Back to customers|Back to accounts|返回客户列表|返回客戶列表/i,
  });
  await expect(accountReturn).toHaveAttribute('href', queuePath);

  await page.getByRole('tab', { name: /^Sites|^站点|^網站/i }).click();
  const siteLink = page.getByRole('link', { name: 'site_mvp' }).first();
  const siteHref = await siteLink.getAttribute('href');
  const siteUrl = new URL(siteHref || '', 'https://admin.example');
  expect(siteUrl.pathname).toBe('/admin/sites/site_mvp');
  expect(siteUrl.searchParams.get('return_to')).toBe(accountPath);

  await siteLink.click();
  await expect(page.getByRole('heading', { name: 'MVP Site' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${LONG_ACCOUNT_ID}\\?return_to=`));
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'MVP Site' })).toBeVisible();
  await page.reload();

  const siteReturn = page.getByRole('link', { name: /^Back$|^返回$/i }).first();
  await expect(siteReturn).toHaveAttribute('href', accountPath);
  await siteReturn.click();
  await expect(accountReturn).toHaveAttribute('href', queuePath);
  await accountReturn.click();
  await expect(page).toHaveURL(new RegExp('/admin/accounts\\?q=MVP&status=active&tag=one&tag=two$'));
});

test('customer credit warning stays compact and exposes top-up plus resource evidence on demand', async ({ page }) => {
  await installAdminMocks(page, { quotaNeedsAttention: true });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i }).click();

  await expect(page.locator('[data-ui="account-credit-operations"]')).toBeVisible();
  await expect(page.locator('[data-ui="account-credit-operations"]')).toContainText(/warning|需关注|需要关注|警告/i);
  await expect(page.locator('[data-ui="account-topup-comparison"]')).toHaveCount(0);
  await page.getByRole('button', { name: /Open top-up options|打开加量包选项/i }).click();
  const topUpDialog = page.getByRole('dialog', { name: /Top-up packs|加量包/i });
  await expect(topUpDialog.locator('[data-ui="account-topup-options"]')).toBeVisible();
  await expect(topUpDialog.locator('[data-width="wide"]')).toHaveScreenshot(
    'admin-customer-detail-topup-dialog-pc.png',
    { animations: 'disabled' }
  );
  await topUpDialog.locator('[data-ui="admin-workbench-close"]').click();
  await page.getByRole('button', { name: /View quota details|查看额度详情/i }).click();
  const quotaDialog = page.getByRole('dialog', { name: /Quota details|额度详情/i });
  await expect(quotaDialog.locator('[data-ui="account-resource-limits"]')).toBeVisible();
  await quotaDialog.getByRole('tab', { name: /Credit components|AI 积分构成/i }).click();
  await expect(quotaDialog.locator('[data-ui="account-credit-components"]')).toBeVisible();
  await quotaDialog.getByRole('tab', { name: /Advanced quota information|高级额度信息/i }).click();
  await expect(quotaDialog.locator('[data-ui="account-advanced-quota"]')).toBeVisible();
  await expect(quotaDialog.locator('details')).toHaveCount(0);
  await expect(quotaDialog.locator('[data-width="wide"]')).toHaveScreenshot(
    'admin-customer-detail-quota-dialog-pc.png',
    { animations: 'disabled' }
  );
});

test('customer section rail falls back to one horizontally scrollable mobile tab row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAdminMocks(page);
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);

  const detailTabs = page.getByRole('tab');
  await expect(detailTabs).toHaveCount(6);
  const positions = await detailTabs.evaluateAll((tabs) =>
    tabs.map((tab) => Math.round(tab.getBoundingClientRect().top))
  );
  expect(new Set(positions).size).toBe(1);
  const navOverflow = await page.locator('[data-ui="account-detail-section-nav"]').evaluate((nav) => ({
    clientWidth: nav.clientWidth,
    scrollWidth: nav.scrollWidth,
  }));
  expect(navOverflow.scrollWidth).toBeGreaterThan(navOverflow.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('[data-ui="account-detail-section-nav"]')).toHaveScreenshot(
    'admin-customer-detail-mobile-nav.png',
    { animations: 'disabled' }
  );
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
