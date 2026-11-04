import { expect, test } from '@playwright/test';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

test('a stalled admin login releases the submit button and keeps a safe retry', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  let authenticated = false;
  let loginRequests = 0;
  await page.route('**/admin/session', route => authenticated ? route.fallback() : route.fulfill({
    status: 401, json: buildAdminApiErrorEnvelope('session expired', 'auth.admin_session_invalid'),
  }));
  // Intentionally leave the request unanswered. The client must end the wait.
  await page.route('**/admin/auth/login', () => { loginRequests += 1; });
  await page.goto('/admin/login?redirect=%2Fadmin%2Ftroubleshooting%3Fwindow%3D720');
  await page.getByLabel(/Admin key|管理员密钥/, { exact: true }).fill('test-only-key');
  const submit = page.getByRole('button', { name: /Enter admin|进入后台/ });
  await submit.click({ noWaitAfter: true });
  await expect(submit).toBeEnabled({ timeout: 18_000 });
  await expect(page.locator('#admin-login-error')).toContainText(/timed out|超时/);
  expect(loginRequests).toBe(1);
  await expect(page.locator('#admin_key')).toHaveValue('test-only-key');
  await page.screenshot({ path: testInfo.outputPath('admin-login-timeout-recovered.png'), fullPage: true });

  await page.unroute('**/admin/auth/login');
  await page.route('**/admin/auth/login', async route => {
    authenticated = true;
    await route.fulfill({ json: buildAdminApiEnvelope({}) });
  });
  await submit.click();
  await expect(page).toHaveURL(/\/admin\/troubleshooting\?window=720$/);
  await expect(page.getByRole('heading', { name: /Runtime diagnostics|运行诊断/, exact: true })).toBeVisible();
});

test('a rejected admin login shows guidance and allows another attempt', async ({ page }) => {
  await page.route('**/admin/session', route => route.fulfill({
    status: 401, json: buildAdminApiErrorEnvelope('session expired', 'auth.admin_session_invalid'),
  }));
  await page.route('**/admin/auth/login', route => route.fulfill({
    status: 401, json: buildAdminApiErrorEnvelope('invalid', 'auth.admin_key_invalid'),
  }));
  await page.goto('/admin/login');
  await page.locator('#admin_key').fill('test-only-invalid');
  await page.getByRole('button', { name: /Enter admin|进入后台/ }).click({ noWaitAfter: true });
  await expect(page.locator('#admin-login-error')).toContainText(/not valid|密钥无效/);
  await expect(page.getByRole('button', { name: /Enter admin|进入后台/ })).toBeEnabled();
});

test('an authenticated admin keeps a document link when client navigation stalls', async ({ page }) => {
  await installAdminMocks(page);
  await page.route(url => url.pathname === '/admin/plans' && url.searchParams.has('_rsc'), () => {});
  await page.goto('/admin/login?redirect=/admin/plans');
  const continueLink = page.getByRole('link', { name: /Enter admin|进入后台/ });
  await expect(continueLink).toHaveAttribute('href', '/admin/plans');
  await expect(page.locator('#admin_key')).toHaveCount(0);
  await continueLink.click();
  await expect(page).toHaveURL(/\/admin\/plans$/);
  await expect(page.locator('[data-ui="admin-primary-nav"]')).toBeVisible();
});
