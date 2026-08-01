import { expect, test } from '@playwright/test';
import {
  LONG_ACCOUNT_ID,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

test('subscription detail keeps one PC conclusion and uses dense evidence tables', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const returnTo = '/admin/subscriptions?status=active&focus=sub_mvp';
  await page.goto(`/admin/subscriptions/sub_mvp?return_to=${encodeURIComponent(returnTo)}`);

  await expect(page.getByRole('heading', { name: /Subscription detail|订阅详情/i })).toBeVisible();
  const pageHeader = page.locator('[data-ui="backoffice-page-header"]');
  await expect(pageHeader).toBeVisible();
  await expect(pageHeader).toContainText(/Status|状态/i);
  await expect(pageHeader).toContainText(/Billing statistics|账单统计/i);
  const headerScreenshotPath = testInfo.outputPath('admin-subscription-detail-unified-header-pc.png');
  await pageHeader.screenshot({ path: headerScreenshotPath });
  await testInfo.attach('admin-subscription-detail-unified-header-pc', {
    path: headerScreenshotPath,
    contentType: 'image/png',
  });
  await expect(page.getByRole('heading', { name: /Customer coverage needs follow-up|客户覆盖需要跟进/i })).toHaveCount(1);

  const primaryAction = page.getByRole('link', { name: /Open customer coverage|打开客户覆盖/i });
  await expect(primaryAction).toBeVisible();
  await expect(primaryAction).toHaveAttribute('href', `/admin/accounts/${LONG_ACCOUNT_ID}#coverage-actions`);
  const returnLink = page.getByRole('link', { name: /Back to subscription operations|返回订阅运营/i });
  await expect(returnLink).toBeVisible();
  await expect(returnLink).toHaveAttribute('href', returnTo);

  await expect(page.getByText(/^Read current status and grace posture first\.$/)).toHaveCount(0);
  await expect(page.getByText(/^Open site detail for runtime and entitlement impact\.$/)).toHaveCount(0);
  await expect(page.locator('a[href^="/api/admin/audit-events"]')).toHaveCount(0);

  await expect(page.getByRole('heading', { name: /Subscription facts|订阅基本信息/i })).toBeVisible();
  await expect(page.locator('[data-ui="subscription-summary-card"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Budget and usage|预算与用量/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Covered sites|关联站点/i })).toBeVisible();
  await expect(page.locator('[data-ui="subscription-operational-grid"]')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(4);

  const auditButton = page.getByRole('button', { name: /View 4 audit records|查看 4 条审计记录/i });
  await expect(auditButton).toBeVisible();
  await auditButton.click();
  const auditDrawer = page.getByRole('dialog', { name: /Recent audit records|近期审计记录/i });
  await expect(auditDrawer).toBeVisible();
  await expect(auditDrawer.getByText('Subscription Bind')).toBeVisible();
  await expect(auditDrawer.getByText('Subscription Billing Snapshot Rebuild')).toBeVisible();
  await expect(auditDrawer.getByText(/trace-audit-101/)).toBeHidden();
  await auditDrawer.getByRole('button', { name: /^Close$|^关闭$/i }).click();
  await expect(auditDrawer).toBeHidden();

  const advancedEvidence = page.locator('details').filter({
    hasText: /Support and advanced evidence|支持信息与高级证据|Advanced subscription evidence|高级订阅运营证据/i,
  });
  await expect(advancedEvidence).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: /^Boundary$|^边界$/i })).toBeHidden();

  await advancedEvidence.locator(':scope > summary').click();
  await expect(page.getByRole('heading', { name: /^Boundary$|^边界$/i })).toBeVisible();
  const costCompleteness = page.locator('[data-ui="cost-snapshot-completeness"]');
  await expect(costCompleteness).toContainText(/≥\s*¥18\.42/);
  await expect(costCompleteness).toContainText(
    /Known CNY minimum.*missing call-time snapshots: 2|已知人民币成本下限.*缺少调用时快照：2/i
  );
});

test('subscription detail failure preserves the PC route shell and bounded retry', async ({ page }) => {
  await installAdminMocks(page);
  await page.unroute('**/api/admin/**');
  let attempts = 0;
  await page.route('**/api/admin/subscriptions/sub_mvp', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('subscription unavailable')),
    });
  });
  await page.goto('/admin/subscriptions/sub_mvp');

  await expect(page.getByRole('heading', { name: /Subscription detail is temporarily unavailable|订阅详情暂时不可用/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'subscription unavailable' })).toBeVisible();
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page).toHaveURL(/\/admin\/subscriptions\/sub_mvp$/);
});

test('subscription detail hides the audit action when the current scope has no events', async ({ page }) => {
  await installAdminMocks(page, { auditEvents: 0 });

  await page.goto('/admin/subscriptions/sub_mvp');
  await expect(page.getByText(/No recent audit groups|暂无最近审计分组/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /audit records|审计记录/i })).toHaveCount(0);
  await expect(page.locator('a[href^="/api/admin/audit-events"]')).toHaveCount(0);
});
