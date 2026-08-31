import { expect, test, type Locator } from '@playwright/test';
import {
  buildAdminApiErrorEnvelope,
  FREE_PLAN_ID,
  LONG_ACCOUNT_ID,
  LONG_PLAN_ID,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

test('admin login validates the session before redirecting or showing the token form', async ({ page }) => {
  await installAdminMocks(page);

  await page.goto('/admin/login?redirect=/admin/plans');
  await expect(page).toHaveURL(/\/admin\/plans$/);
  await expect(page.locator('[data-ui="admin-primary-nav"]')).toBeVisible();
});

test('an invalid admin cookie does not expose navigation or trap the login page', async ({ page }) => {
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiErrorEnvelope(
          'admin session is invalid',
          'auth.admin_session_invalid'
        )
      ),
    });
  });
  await page.goto('/admin/login');
  await page.context().addCookies([
    {
      name: 'npcink_admin_session_token',
      value: 'stale-admin-session',
      url: new URL(page.url()).origin,
    },
  ]);
  await page.reload();

  await expect(page.locator('#admin_key')).toBeVisible();
  await expect(page.locator('[data-ui="admin-primary-nav"]')).toHaveCount(0);
});

test('admin session bootstrap preserves context on transport failure and redirects on auth failure', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('temporary session transport failure')),
    });
  });

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/troubleshooting?window=72');
  await expect(page).toHaveURL(/\/admin\/troubleshooting\?window=72$/);
  await expect(page.getByRole('heading', { name: /Runtime diagnostics|运行诊断|運行診斷/i })).toBeVisible();

  await page.unroute('**/admin/session');
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('admin session expired', 'auth.admin_session_invalid')),
    });
  });
  await page.goto('/admin/plugin-observability?window=72');
  await expect(page).toHaveURL(/\/admin\/login\?redirect=%2Fadmin%2Fplugin-observability%3Fwindow%3D72$/);
});

async function setScopedInputValue(scope: Locator, index: number, value: string) {
  await scope.locator('input.input').nth(index).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    input.focus();
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }, value);
}

async function replaceScopedTextInput(scope: Locator, index: number, value: string) {
  const input = scope.locator('input.input').nth(index);
  await input.click({ force: true });
  await input.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await input.pressSequentially(value);
}

test('admin coverage page keeps service queue primary and package catalog separate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$|^服務狀態$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Service status|Follow-up queue|服务状态|跟进队列|服務狀態|跟進隊列/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Packages|^Package overview|^套餐|^方案/i })).toHaveCount(0);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态|客戶服務狀態/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Inspect subscription|查看订阅|檢查訂閱/i }).first()).toBeVisible();

  await expect(page.locator('a[href="/admin/plans"]').first()).toHaveCount(1);
});

test('admin subscription detail keeps localized operator layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/subscriptions/sub_mvp');
  await expect(page.getByRole('heading', { name: /Subscription detail · Pro|订阅详情 · Pro|訂閱詳情 · Pro|Service status detail: Pro/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Customer coverage needs follow-up|客户覆盖需要跟进/i })).toBeVisible();
  const advancedEvidence = page.locator('details').filter({ hasText: /Advanced subscription evidence|高级订阅运营证据/i });
  await expect(advancedEvidence).not.toHaveAttribute('open', '');
  await advancedEvidence.locator(':scope > summary').click();
  await expect(advancedEvidence).toHaveAttribute('open', '');
  await expect(page.getByText(/Coverage checks/i)).toHaveCount(0);
});

test('admin operator path smoke: queue and inspector routes stay connected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin');
  await expect(page.getByText(/加载中\.\.\./)).not.toBeVisible();
  await expect(page.getByRole('heading', { name: /Platform state comes first|先看平台概况/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Inspect readiness failures|检查就绪失败项/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open service status|打开服务状态|打開服務狀態/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open customer service status|打开客户服务状态|打開客戶服務狀態/i })).toHaveCount(0);
  await page.getByText(/Platform usage and extended evidence|平台用量与扩展证据|平台用量與擴展證據/i).click();
  await expect(page.getByRole('heading', { name: /Which runtime signals need follow-up\?|哪些运行时状态需要继续跟进|哪些執行時狀態需要繼續跟進/i })).toBeVisible();
  await expect(
    page
      .getByText(/Provider call coverage gap|供应商调用遥测缺口|供應商呼叫遙測缺口/i)
      .first()
  ).toBeVisible();
  await expect(
    page.getByText(/Some runtime runs do not have matching provider-call telemetry|部分运行任务缺少对应的供应商调用遥测记录/i).first()
  ).toBeVisible();
  await expect(page.locator('a[href="/admin/troubleshooting"]').first()).toBeVisible();

  await page.goto('/admin/coverage');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$|^服務狀態$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Service status|Follow-up queue|服务状态|跟进队列|服務狀態|跟進隊列/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Packages|^Package overview|^套餐|^方案/i })).toHaveCount(0);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态|客戶服務狀態/i })).toBeVisible();
  const coverageQueueItems = page.locator('[data-ui="coverage-queue-item"]');
  await expect(coverageQueueItems.nth(0).getByRole('link', { name: /MVP Account/i })).toHaveAttribute(
    'href',
    `/admin/accounts/${LONG_ACCOUNT_ID}`
  );
  await expect(coverageQueueItems.nth(1).getByRole('link', { name: /Uncovered Account/i })).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered'
  );
  await expect(coverageQueueItems.nth(0).getByRole('link', { name: /Inspect subscription|查看订阅|檢查訂閱/i })).toHaveAttribute(
    'href',
    '/admin/subscriptions/sub_mvp'
  );
  await expect(coverageQueueItems.nth(1).getByRole('link', { name: /Open package actions|打开套餐操作|打開方案操作/i })).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered#coverage-actions'
  );
  await expect(page.locator('#coverage-inspector')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /Package.*Subscription|套餐.*订阅|方案.*訂閱/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Sites$|^站点$|^站點$/i })).toBeVisible();
  await expect(page.getByText(/Active API keys|活跃 API 密钥|有效 API 金鑰/i)).toHaveCount(0);
  await expect(page.getByText(/Technical information|技术信息|技術資訊/i)).toHaveCount(0);
  await expect(page.locator('a[href="/admin/plans"]').first()).toHaveCount(1);

  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { name: /^Subscription operations$|^订阅运营$/i })).toBeVisible();
  await expect(page.locator('[data-ui="subscription-queue-item"] a[href^="/admin/subscriptions/sub_mvp?"]')).toBeVisible();
  await expect(
    page.locator('[data-ui="backoffice-page-header"]').getByText(/^Critical$|^严重风险$|^嚴重風險$/i)
  ).toBeVisible();
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toContainText(/Current|当前有效|目前有效/i);

  await page.goto('/admin/subscriptions/sub_mvp');
  await expect(page.getByRole('heading', { name: /Subscription detail · Pro|订阅详情 · Pro|訂閱詳情 · Pro|Service status detail: Pro/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open customer subscription|打开客户订阅/i })).toHaveCount(0);
  await expect(page.locator(`a[href="/admin/accounts/${LONG_ACCOUNT_ID}#coverage-actions"]`)).toBeVisible();
  const subscriptionAdvancedEvidence = page.locator('details').filter({ hasText: /Advanced subscription evidence|高级订阅运营证据/i });
  await subscriptionAdvancedEvidence.locator(':scope > summary').click();
  await expect(page.locator(`a[href="/admin/accounts/${LONG_ACCOUNT_ID}"]`).first()).toBeVisible();
  await expect(page.locator('a[href="/admin/sites/site_mvp"]').first()).toBeVisible();
  await expect(page.getByText(/Base budget|基础预算/i).first()).toBeVisible();
  await expect(page.getByText(/Effective budget|有效预算/i).first()).toBeVisible();
  await expect(page.getByText(/Billing statistics|账单统计|帳單統計/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Rebuild current-period billing snapshots|重建当前周期账单快照/i })).toHaveCount(0);
  await expect(page.getByText(/checkout|buy points|storefront/i)).toHaveCount(0);

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await expect(page.getByRole('heading', { name: /Npcink AI Demo|MVP Account|acct_mvp_enterprise_primary/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Open customer subscription|打开客户订阅/i })).toHaveCount(0);
  await expect(page.getByText(/Package and top-up|套餐和加量|方案和加量/i)).toHaveCount(0);
  await page.getByRole('tab', { name: /Commercial|商业与套餐|商業與方案/i }).click();
  await expect(page.getByText(/Package and Agency operations|套餐与 Agency 操作|方案與 Agency 操作/i)).toBeVisible();
  await expect(page.getByText(/^(Agency quote and trial|Agency 报价与试用)$/i)).toBeVisible();
  await page.getByRole('button', { name: /Open Agency operations|打开 Agency 操作/i }).click();
  const agencyDrawer = page.getByRole('dialog', { name: /Agency quote and trial|Agency 报价与试用/i });
  await expect(agencyDrawer.getByRole('button', { name: /Create Agency quote|创建 Agency 报价/i })).toBeVisible();
  await expect(agencyDrawer.getByRole('button', { name: /Approve 14-day trial|批准 14 天试用/i })).toBeVisible();
  await agencyDrawer.locator('[data-ui="admin-inspector-drawer-close"]').click();
  await page.getByRole('tab', { name: /^Sites$|^站点$|^站點$/i }).click();
  await expect(page.locator('#site-footprint')).toBeVisible();

  await page.goto('/admin/accounts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Customers$|^客户$|^客戶$/i }).first()).toBeVisible();

  await page.goto('/admin/sites/site_mvp');
  await expect(page.getByRole('heading', { name: /MVP Site|site_mvp/i }).first()).toBeVisible();

  await page.goto('/admin/troubleshooting');
  await expect(page.getByRole('heading', { name: /Runtime diagnostics|运行诊断|運行診斷/i })).toBeVisible();
  const runtimeEvidenceSection = page.locator('#runtime-evidence');
  await expect(runtimeEvidenceSection).not.toHaveAttribute('open', '');
  await runtimeEvidenceSection.locator('summary').click();
  await expect(runtimeEvidenceSection.getByText(/Runtime resolution|运行时解析/i).first()).toBeVisible();
  const evidenceLanesSection = page.locator('#evidence-lanes');
  await expect(evidenceLanesSection).not.toHaveAttribute('open', '');
  await evidenceLanesSection.locator('summary').click();
  await expect(page.locator('a[href="/admin/plugin-observability"]').first()).toBeVisible();
  await expect(page.locator('a[href="/admin/hosted-models"]')).toHaveCount(0);

  await page.goto('/admin/plans', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 2, name: /Package catalog|Standard package catalog|Package overview|套餐目录|标准套餐目录|套餐概览|方案目錄|方案概覽/i }).first()).toBeVisible();
  await expect(page.getByText(/Package initialization|套餐初始化|方案初始化/i).first()).toBeVisible();
  await expect(page.getByText(/Historical Free|历史 Free/i)).toHaveCount(0);
  await expect(page.getByText(/Pro/i).first()).toBeVisible();
  await expect(page.getByText(/Plus/i).first()).toBeVisible();
  await expect(page.getByText(/Agency/i).first()).toBeVisible();
  await expect(page.getByText(/Site limit|站点上限/i).first()).toBeVisible();
  const freePackageRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Free' });
  await expect(freePackageRow).toContainText(/Sites 3|站点上限 3/i);
  await expect(page.getByRole('link', { name: /Back to coverage|返回服务状态/i })).toHaveCount(0);
  await expect(page.locator('a[href="/admin/plans/free"]')).toHaveCount(0);
  await expect(page.locator('a[href="/admin/plans/pro"]')).toHaveCount(0);
  await expect(page.getByText(/checkout|buy points|storefront/i)).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /Sort|排序/i })).toHaveCount(0);

  const freeActiveSubscriptionCount =
    (await freePackageRow.locator('td').nth(2).innerText()).match(/\d+/)?.[0] || '0';
  const freeManageButton = freePackageRow.getByRole('button', { name: /^Manage Free$|^管理 Free$/i });
  await freeManageButton.click();
  const packageEditor = page.getByRole('dialog', { name: /Manage Free|管理 Free/i });
  await expect(packageEditor).toBeVisible();
  const subscriptionImpactText = new RegExp(
    `(?:affect ${freeActiveSubscriptionCount} active subscriptions|影响 ${freeActiveSubscriptionCount} 个活跃订阅)`,
    'i'
  );
  await expect(packageEditor.getByText(subscriptionImpactText)).toHaveCount(0);
  await expect(packageEditor.getByText(/Current package parameters|当前套餐参数/i)).toBeVisible();
  await expect(packageEditor.getByText(/^Customer package$|^客户套餐$/i)).toBeVisible();
  await expect(packageEditor.getByText(/^Runtime limits$|^运行限制$/i)).toBeVisible();
  await expect(packageEditor.getByText(/^Package ID$|^套餐 ID$/i)).toHaveCount(0);
  await expect(packageEditor.getByText(/^Latest version$|^最新版本$/i)).toHaveCount(0);
  await expect(packageEditor.getByText(/shared by all sites|所有站点共享/i)).toBeVisible();
  await expect(packageEditor.locator('[data-ui="plan-parameter-grid"]')).toHaveCount(2);
  await expect(packageEditor.getByText(/^CNY \/ 30d$|^元 \/ 30天$/i)).toBeVisible();
  await expect(packageEditor.getByText(/^credits$|^积分$/i)).toBeVisible();
  await expect(packageEditor.getByText(/^days$|^天$/i)).toBeVisible();
  await expect(packageEditor.locator('input[type="number"]')).toHaveCount(9);
  await packageEditor.getByRole('spinbutton', { name: /^(Sales price|销售价格)/i }).fill('1');
  await expect(packageEditor.getByText(subscriptionImpactText)).toBeVisible();
  const parameterGrid = packageEditor.locator('[data-ui="plan-parameter-grid"]').first();
  const gridColumnCount = () => parameterGrid.evaluate((element) =>
    window.getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length
  );
  await page.setViewportSize({ width: 900, height: 900 });
  await expect.poll(gridColumnCount).toBe(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(gridColumnCount).toBe(3);
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect.poll(gridColumnCount).toBe(3);
  await expect(packageEditor.getByText(/Advanced JSON overrides|高级 JSON 覆盖项/i)).toHaveCount(0);
  await expect(packageEditor.getByRole('tab', { name: /Release history|发布历史/i })).toHaveCount(0);
  await expect(packageEditor.getByRole('link', { name: /^(Open subscriptions|打开订阅|查看订阅|查看訂閱)$/i })).toHaveCount(0);
  await expect(packageEditor.getByRole('button', { name: /^Save$|^保存$|^儲存$/i })).toBeVisible();
  await packageEditor.getByRole('tab', { name: /Diagnostics|诊断|診斷/i }).click();
  await expect(packageEditor.getByText(/^Package ID$|^套餐 ID$/i)).toBeVisible();
  await expect(packageEditor.getByText(/^Latest version$|^最新版本$/i)).toBeVisible();
  await packageEditor.locator('[data-ui="admin-workbench-close"]').click();
  await expect(page.getByRole('link', { name: /Inspect detail|查看详情|查看詳情/i })).toHaveCount(0);
});

test('admin queue pages keep one primary header action and shared identifier treatment', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/subscriptions');
  await expect(page.getByRole('heading', { name: /MVP Account/i }).first()).toBeVisible();
  await expect(page.locator('[data-ui="subscription-queue-item"] a[href^="/admin/subscriptions/sub_mvp?"]')).toBeVisible();

  await page.goto('/admin/accounts');
  await expect(page.locator(`a[href="/admin/accounts/${LONG_ACCOUNT_ID}"]`).first()).toBeVisible();

  await page.goto('/admin/accounts');
  await expect(page.locator(`a[href="/admin/accounts/${LONG_ACCOUNT_ID}"]`).first()).toBeVisible();
  await expect(page.getByText(/Npcink AI Demo/i).first()).toBeVisible();
  await expect(page.getByText(/Pilot customer\. Confirm package before public release\./i).first()).toBeVisible();
  await expect(page.getByText(/Free Account|免费客户|免費客戶/i)).toBeVisible();
  await expect(page.getByText(/Uncovered Account|未覆盖客户|未覆蓋客戶/i)).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Customers$|^客户$|^客戶$/i }).first()).toBeVisible();
  await expect(page.locator('table')).toHaveCount(1);
  await expect(page.locator('[data-ui="customer-directory-row"]')).toHaveCount(3);
  await expect(page.locator('#account-inspector')).toHaveCount(0);
  await expect(page.locator(`a[href="/admin/subscriptions/sub_mvp"]`)).toHaveCount(0);
  await expect(page.locator(`a[href="/admin/accounts/${LONG_ACCOUNT_ID}#site-footprint"]`)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open customer service status|打开客户服务状态|打開客戶服務狀態/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Details|详情|詳情/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Suspend account|暂停账户|暫停帳戶/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Restore account|恢复账户|恢復帳戶/i })).toHaveCount(0);
  await page.getByText(/Add user|Add customer|添加用户|添加客户|新增使用者/i).click();
  await page.getByLabel(/^Name$|^名称$|^名稱$/i).fill('New Customer');
  await page.getByLabel(/Login email|登录邮箱|登入電子郵件/i).fill('new-customer@example.com');
  await page.getByLabel(/Operator name|运营显示名|營運顯示名/i).fill('New Customer Display');
  await page.getByLabel(/Operator note|运营备注|營運備註/i).fill('Internal launch note');
  await page.getByRole('button', { name: /Create customer|创建客户|建立客戶/i }).click();
  await expect(page).toHaveURL(/\/admin\/accounts\/acct_new_customer_free$/);
  await expect(page.getByRole('heading', { name: /New Customer Free/i })).toBeVisible();

  await page.goto('/admin/plans', { waitUntil: 'domcontentloaded' });
  const proPackageRow = page.locator('[data-ui="plan-catalog-item"]').filter({ hasText: 'Pro' });
  await proPackageRow.getByRole('button', { name: /^Manage Pro$|^管理 Pro$/i }).click();
  const packageEditor = page.getByRole('dialog', { name: /Manage Pro|管理 Pro/i });
  await expect(packageEditor.getByRole('button', { name: /Apply .* defaults|套用 .* 套餐默认值/i })).toBeVisible();
  await expect(packageEditor.getByRole('button', { name: /Restore saved values|还原当前已保存值|還原目前已儲存值/i })).toBeVisible();
  await expect(packageEditor.getByRole('tab', { name: /Release history|发布历史/i })).toHaveCount(0);
  await expect(packageEditor.getByText(/Advanced JSON overrides|高级 JSON 覆盖项/i)).toHaveCount(0);
  await expect(packageEditor.getByRole('link', { name: /^(Open subscriptions|打开订阅|查看订阅|查看訂閱)$/i })).toHaveCount(0);
  await expect(packageEditor.getByRole('button', { name: /^Save$|^保存$|^儲存$/i })).toBeVisible();
  await packageEditor.locator('[data-ui="admin-workbench-close"]').click();

  await page.goto('/admin/ai-resources', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Model suppliers$|^模型供应商$|^模型供應商$/i }).first()).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /All suppliers|全部供应商|全部供應商/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Diagnostics|诊断|診斷/i })).toHaveCount(0);
  await expect(page.getByText(/run_records/i).first()).toHaveCount(0);
  await expect(page.getByRole('link', { name: /View diagnostics|查看诊断|查看診斷/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add model supplier|添加模型供应商|新增模型供應商/i })).toBeVisible();
});

test('admin support and detail pages keep bounded operator hierarchy', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await expect(page.getByText('acct_mvp_ent...rimary').first()).toHaveCount(0);
  await page.getByText(/Customer identifiers|客户标识|客戶標識/i).click();
  await expect(page.getByText('acct_mvp_ent...rimary').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Open customer subscription|打开客户订阅/i })).toHaveCount(0);
  await expect(page.getByText(/Package and top-up|套餐和加量|方案和加量/i)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Overview|^概况|^概況/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Commercial|商业与套餐|商業與方案/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i })).toBeVisible();
  await page.getByText(/Edit customer info|编辑客户信息|編輯客戶資訊/i).click();
  const operatorProfileForm = page.locator('form').filter({ hasText: /Operator note|运营备注|營運備註/i }).first();
  await operatorProfileForm.getByLabel(/Operator note|运营备注|營運備註/i).fill('Updated detail note');
  await operatorProfileForm.getByRole('button', { name: /Save|保存|儲存/i }).click();
  await expect(page.getByText(/Operator note has been saved|运营备注已保存|營運備註已儲存/i)).toBeVisible();
  await page.goto('/admin/accounts');
  await expect(page.getByText(/Updated detail note/i).first()).toBeVisible();
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await expect(page.locator('[data-ui="trial-readiness-summary"]')).toHaveCount(0);
  await page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i }).click();
  await expect(page.locator('[data-ui="account-credit-operations"]')).toBeVisible();
  await page.getByRole('button', { name: /Open top-up options|打开加量包选项/i }).click();
  let topUpDialog = page.getByRole('dialog', { name: /Top-up packs|加量包/i });
  await expect(topUpDialog.getByRole('radio', { name: /Small top-up|小加量包/i })).toBeVisible();
  await topUpDialog.getByRole('button', { name: /Cancel|取消/i }).click();
  await expect(page.getByText(/Small top-up has been applied|小加量包 已应用|小加量包 已套用/i)).toHaveCount(0);
  await page.getByRole('button', { name: /Open top-up options|打开加量包选项/i }).click();
  topUpDialog = page.getByRole('dialog', { name: /Top-up packs|加量包/i });
  await topUpDialog.getByRole('radio', { name: /Small top-up|小加量包/i }).check();
  await topUpDialog.getByRole('button', { name: /Apply top-up|应用加量包|套用加量包/i }).click();
  await expect(page.getByText(/Small top-up has been applied|小加量包 已应用|小加量包 已套用/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /View sites|查看站点|查看站點/i })).toHaveCount(0);
  await page.getByRole('tab', { name: /Commercial|商业与套餐|商業與方案/i }).click();
  await expect(page.getByLabel(/Plan Version|套餐版本|方案版本/i)).toBeHidden();
  await expect(page.getByLabel(/Email|邮箱|電子郵件/i)).toBeHidden();
  const advancedCoverageControls = page.locator('[data-ui="advanced-coverage-controls"]');
  await expect(advancedCoverageControls).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Commercial|商业与套餐|商業與方案/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Credits and usage|积分与用量|積分與用量/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Sites|站点|站點/i })).toBeVisible();
  const packageActionReveal = page.getByRole('button', { name: /Open subscription repair|打开订阅修复/i });
  await packageActionReveal.click();
  const repairDrawer = page.getByRole('dialog', { name: /Repair subscription record|维修订阅记录|維修訂閱記錄/i });
  await expect(advancedCoverageControls).toBeVisible();
  const coverageBoundary = page.locator('#coverage-actions');
  await expect(repairDrawer.getByRole('link', { name: /Inspect detail|查看详情|檢查詳情/i })).toBeVisible();
  await expect(repairDrawer.getByRole('button', { name: /Change package|调整套餐|調整方案/i })).toBeVisible();
  await expect(repairDrawer.getByRole('combobox', { name: /Coverage package option|覆盖套餐选项|覆蓋方案選項/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Coverage package version|覆盖套餐版本|覆蓋方案版本/i })).toHaveCount(0);
  await expect(page.getByText(/applied automatically|自动应用|自動套用/i).first()).toBeVisible();
  await repairDrawer.getByRole('button', { name: /Suspend coverage|暂停覆盖|暫停覆蓋/i }).click();
  let confirmDialog = page.getByRole('dialog', { name: /Confirm suspension|确认暂停覆盖|確認暫停覆蓋/i });
  await expect(confirmDialog.getByText(/Confirm suspension|确认暂停覆盖|確認暫停覆蓋/i)).toBeVisible();
  await confirmDialog.getByRole('button', { name: /Suspend coverage|暂停覆盖|暫停覆蓋/i }).click();
  await expect(coverageBoundary.getByText(/已暂停|suspended/i).first()).toBeVisible();
  await packageActionReveal.click();
  await repairDrawer.getByRole('button', { name: /Cancel coverage|取消覆盖|取消覆蓋/i }).click();
  confirmDialog = page.getByRole('dialog', { name: /Confirm cancellation|确认取消覆盖|確認取消覆蓋/i });
  await expect(confirmDialog.getByText(/Confirm cancellation|确认取消覆盖|確認取消覆蓋/i)).toBeVisible();
  await confirmDialog.getByRole('button', { name: /Cancel coverage|取消覆盖|取消覆蓋/i }).click();
  await expect(coverageBoundary.getByText(/已取消|canceled/i).first()).toBeVisible();
  await packageActionReveal.click();
  await repairDrawer.getByRole('combobox', { name: /Coverage package option|覆盖套餐选项|覆蓋方案選項/i }).selectOption(LONG_PLAN_ID);
  await repairDrawer.getByRole('button', { name: /Change package|调整套餐|調整方案/i }).click();
  confirmDialog = page.getByRole('dialog', { name: /Confirm subscription repair|确认维修订阅记录|確認維修訂閱記錄/i });
  await expect(confirmDialog.getByText(/Confirm subscription repair|确认维修订阅记录|確認維修訂閱記錄/i)).toBeVisible();
  await confirmDialog.getByRole('button', { name: /Change package|调整套餐|調整方案/i }).click();
  await expect(coverageBoundary.getByText(/Pro/i).first()).toBeVisible();
  await expect(page.getByText(/Covered by paid package|付费套餐已覆盖|付費方案已覆蓋/i).first()).toBeVisible();
  await page.getByRole('tab', { name: /Sites|站点|站點/i }).click();
  await expect(page.getByRole('tab', { name: /Sites|站点|站點/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('a[href="/admin/sites/site_mvp"]').first()).toBeVisible();

  await page.goto('/admin/sites/site_mvp');
  await expect(page.getByText('site_mvp').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Open service status|Open coverage|打开服务状态|打开覆盖|打開服務狀態|打開覆蓋/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Inspect subscription detail|查看订阅详情|檢查訂閱詳情/i }).first()).toBeVisible();
  const auditReveal = page.locator('details').filter({ hasText: /Inspect audit follow-up|查看审计跟进|查看稽核跟進/i }).locator(':scope > summary');
  await expect(auditReveal).toBeVisible();
  await auditReveal.click();
  await expect(page.getByText(/Recent audit summary for this site|此站点的近期审计摘要/i)).toBeVisible();
  await expect(page.getByText(/subscription\.bind|provider_connection\.sync/i).first()).toBeVisible();

  await page.goto('/admin/subscriptions/sub_mvp');
  await expect(page.getByRole('heading', { name: /Subscription detail · Pro|订阅详情 · Pro|訂閱詳情 · Pro|Service status detail: Pro/i })).toBeVisible();
  const subscriptionAdvancedEvidence = page.locator('details').filter({ hasText: /Advanced subscription evidence|高级订阅运营证据/i });
  await subscriptionAdvancedEvidence.locator(':scope > summary').click();
  await expect(page.getByRole('link', { name: /Customer|客户/i }).first()).toBeVisible();
  await expect(page.locator(`a[href="/admin/accounts/${LONG_ACCOUNT_ID}"]`).first()).toBeVisible();
  await expect(page.getByText(/Related sites|关联站点|關聯站點/i).first()).toBeVisible();
  await expect(page.getByText(/Billing statistics|账单统计|帳單統計/i).first()).toBeVisible();
  await expect(page.getByText(/Boundary|边界|邊界/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /View audit trail|查看.*审计记录|查看.*稽核記錄/i }).first()).toBeVisible();
  await expect(page.getByText(/Recent audit summary for this subscription|此订阅的近期审计摘要/i)).toBeVisible();
});

test('admin navigation stays customer-first', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin');

  const adminNav = page.getByRole('navigation', { name: /管理后台|admin/i });
  const adminPrimaryNav = page.locator('[data-ui="admin-primary-nav"]');
  const primaryLinks = adminPrimaryNav.locator('a.admin-nav-link');
  await expect(primaryLinks).toHaveCount(14);
  await expect(primaryLinks.nth(0)).toHaveAttribute('href', '/admin');
  await expect(primaryLinks.nth(1)).toHaveAttribute('href', '/admin/accounts');
  await expect(primaryLinks.nth(2)).toHaveAttribute('href', '/admin/support-requests');
  await expect(primaryLinks.nth(3)).toHaveAttribute('href', '/admin/coverage');
  await expect(primaryLinks.nth(4)).toHaveAttribute('href', '/admin/subscriptions');
  await expect(primaryLinks.nth(5)).toHaveAttribute('href', '/admin/plans');
  await expect(primaryLinks.nth(6)).toHaveAttribute('href', '/admin/credit-packs');
  await expect(primaryLinks.nth(7)).toHaveAttribute('href', '/admin/ai-resources');
  await expect(primaryLinks.nth(8)).toHaveAttribute('href', '/admin/external-services');
  await expect(primaryLinks.nth(9)).toHaveAttribute('href', '/admin/vector-settings');
  await expect(primaryLinks.nth(10)).toHaveAttribute('href', '/admin/runtime-profiles');
  await expect(primaryLinks.nth(11)).toHaveAttribute('href', '/admin/troubleshooting');
  await expect(primaryLinks.nth(12)).toHaveAttribute('href', '/admin/service-settings');
  await expect(primaryLinks.nth(13)).toHaveAttribute('href', '/admin/site-compliance');
  await expect(adminPrimaryNav.getByText(/^Workspace$|^工作台$/i)).toBeVisible();
  await expect(adminPrimaryNav.getByText(/^Customer Ops$|^客户运营$/i)).toBeVisible();
  await expect(adminPrimaryNav.getByText(/^Runtime Plane$|^运行面$/i)).toBeVisible();
  await expect(adminPrimaryNav.getByText(/^Diagnostics$|^诊断$/i)).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Overview$|^概览$|^概覽$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Customers$|^客户$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Sites$|^站点$|^站點$/i })).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Packages \/ Service Status$|^套餐\/服务状态$|^方案\/服務狀態$/i })).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Model suppliers$|^模型供应商$|^模型供應商$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Runtime Profiles$|^运行配置$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Model Binding$|^模型绑定$/i })).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Runtime Diagnostics$|^运行诊断$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Hosted Models$|^托管模型$|^託管模型$/i })).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Service Operations$|^服务运营$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Subscription Operations$|^订阅运营$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Portal Users$|^自助注册用户$|^自助註冊使用者$/i })).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Package Catalog$|^套餐目录$|^方案目錄$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^AI Credit Packs$|^AI 积分包$/i })).toBeVisible();
  await expect(adminNav.getByRole('link', { name: /^Members$|^成员$|^成員$/i })).toHaveCount(0);
  await expect(adminNav.getByRole('link', { name: /^Plugin Observability$|^插件观测$|^外掛觀測$/i })).toHaveCount(0);

  await page.goto('/admin/subscriptions');
  const main = page.locator('main');
  await expect(main.getByRole('link', { name: /^Customer register$|^客户目录$|^客戶目錄$/i })).toHaveCount(0);
  await expect(main.getByRole('link', { name: /^Registered users$|^注册用户$|^註冊使用者$/i })).toHaveCount(0);
  await expect(main.getByRole('link', { name: /^Service follow-up$|^服务跟进$|^服務跟進$/i })).toHaveCount(0);
  await expect(main.getByRole('link', { name: /^Subscription records$|^订阅记录$|^訂閱記錄$/i })).toHaveCount(0);
  await expect(main.getByLabel(/Subscription status|订阅状态|訂閱狀態/i)).toBeVisible();
});

test('admin operator path stays usable on mobile viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /Platform state comes first|先看平台概况/i })).toBeVisible();

  await page.goto('/admin/sites/site_mvp');
  await expect(page.getByRole('heading', { name: /MVP Site|site_mvp/i }).first()).toBeVisible();
});
