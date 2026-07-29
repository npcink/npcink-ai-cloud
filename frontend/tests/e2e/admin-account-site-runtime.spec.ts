import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';

async function installAccountSiteRuntimeFailure(page: Page) {
  await installAdminMocks(page);
  let failSiteRead = true;
  let siteRequestCount = 0;

  await page.route('**/api/admin/sites/site_mvp', async (route) => {
    siteRequestCount += 1;
    if (failSiteRead) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify(
          buildAdminApiErrorEnvelope('runtime evidence unavailable')
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        buildAdminApiEnvelope({
          runtime_summary: {
            total_runs: 12,
            failed_runs: 0,
            last_run_at: '2026-07-29T09:00:00Z',
          },
          commercial_policy: {
            usage_totals: {
              cost_cny: 18.5,
              tokens_total: 2500,
              provider_calls: 8,
            },
            entitlement_snapshot: { site_limit: 3 },
          },
          coverage: {
            subscription_status: 'active',
            coverage_state: 'covered',
            display_package_label: 'Pro',
          },
          site_keys: [{ status: 'active' }],
        })
      ),
    });
  });

  return {
    getSiteRequestCount: () => siteRequestCount,
    recoverSiteRead: () => {
      failSiteRead = false;
    },
  };
}

test('account runtime diagnostics show unavailable evidence and recover through the bounded retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const runtime = await installAccountSiteRuntimeFailure(page);

  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Audit|审计|稽核/i }).click();

  const diagnostics = page.locator(
    '[data-ui="account-site-runtime-diagnostics"]'
  );
  await expect(diagnostics).toBeVisible();
  await diagnostics.locator('summary').click();
  await expect(
    diagnostics.locator('[data-ui="account-site-runtime-error"]')
  ).toContainText('runtime evidence unavailable');
  await expect(
    diagnostics.locator('[data-ui="account-site-runtime-card"]')
  ).toHaveCount(0);
  expect(runtime.getSiteRequestCount()).toBe(1);

  runtime.recoverSiteRead();
  await diagnostics.getByRole('button', { name: /Retry|重试|重試/i }).click();

  const siteCard = diagnostics.locator(
    '[data-ui="account-site-runtime-card"][data-site-id="site_mvp"]'
  );
  await expect(siteCard).toBeVisible();
  await expect(siteCard).toContainText(/Healthy|健康|正常/i);
  await expect(
    diagnostics.locator('[data-ui="account-site-runtime-error"]')
  ).toHaveCount(0);
  expect(runtime.getSiteRequestCount()).toBe(2);
});
