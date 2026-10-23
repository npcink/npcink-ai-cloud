import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.NPCINK_CLOUD_FRONTEND_BASE_URL || 'http://127.0.0.1:3325';
type Scenario = { empty?: boolean; failInbox?: boolean; failRead?: boolean; failRequest?: boolean; failConfirm?: boolean; pendingCode?: boolean };

async function installMocks(page: Page, scenario: Scenario = {}, locale = 'en') {
  const unexpected: string[] = [];
  const calls: string[] = [];
  const items = Array.from({ length: 21 }, (_, index) => ({
    notification_id: `pnotif_${index + 1}`, account_id: 'acct_fixture', event_type: 'support_request_replied',
    title: `Ticket reply ${index + 1}`, body: 'Your site connection question has an answer.',
    link_href: `/portal/support/sr_${index + 1}`, is_read: false, created_at: '2026-10-23T08:00:00Z', read_at: null,
  }));
  let signedIn = true;
  await page.context().addCookies([
    { name: 'npcink_portal_session_token', value: 'e2e-portal-session', url: BASE_URL },
    { name: 'npcink_locale', value: locale, url: BASE_URL },
  ]);
  await page.addInitScript((language) => { localStorage.setItem('locale', language); }, locale);
  const respond = (route: Route, data: unknown, status = 200, errorCode = '') => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify({ status: status === 200 ? 'ok' : 'error', error_code: errorCode, message: 'mock', data, meta: { trace_id: 'q1-offline', revision: 'q1-local' } }),
  });
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(BASE_URL).origin) { unexpected.push(`external:${url.hostname}`); await route.abort('blockedbyclient'); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const path = url.pathname.replace('/api/portal', '');
    const method = route.request().method();
    calls.push(`${method} ${path}`);
    if (path === '/session' && method === 'GET') {
      await respond(route, signedIn ? { email: 'member@example.test', sites: [], selected_context: null, auth_mode: 'jwt', session: { state: 'active', transport: 'cookie' } } : {}, signedIn ? 200 : 401, signedIn ? '' : 'auth.portal_session_expired');
    } else if (path === '/auth/login-options' && method === 'GET') {
      await respond(route, { qq_available: false });
    } else if (path === '/auth/identity-providers' && method === 'GET') {
      await respond(route, { providers: [] });
    } else if (path === '/account/payment-orders' && method === 'GET') {
      await respond(route, { items: [], total_count: 0, counts: { all: 0, pending: 0 }, limit: 10, offset: 0 });
    } else if (path === '/notifications' && method === 'GET') {
      if (scenario.failInbox) { await respond(route, {}, 503, 'service.unavailable'); return; }
      const offset = Number(url.searchParams.get('offset') || 0);
      const limit = Number(url.searchParams.get('limit') || 20);
      await respond(route, { items: scenario.empty ? [] : items.slice(offset, offset + limit), total_count: scenario.empty ? 0 : items.length, unread_count: scenario.empty ? 0 : items.filter((item) => !item.is_read).length, limit, offset, unread_only: false, fetched_at: '2026-10-23T08:00:00Z' });
    } else if (/^\/notifications\/(?:pnotif_\d+\/read|read-all)$/.test(path) && method === 'POST') {
      if (scenario.failRead) { await respond(route, {}, 503, 'service.unavailable'); return; }
      let marked = 0;
      for (const item of items) if (!item.is_read && (path.endsWith('read-all') || path.includes(`/${item.notification_id}/`))) { item.is_read = true; marked += 1; }
      await respond(route, { marked_read_count: marked, unread_count: items.filter((item) => !item.is_read).length });
    } else if (path === '/account/deletion/request' && method === 'POST') {
      if (scenario.pendingCode) { await respond(route, {}, 400, 'service.portal_account_deletion_code_pending'); return; }
      await respond(route, scenario.failRequest ? {} : { email: 'member@example.test', delivery: 'email', expires_in_seconds: 600 }, scenario.failRequest ? 403 : 200, scenario.failRequest ? 'service.portal_account_closure_unavailable' : '');
    } else if (path === '/account/deletion/confirm' && method === 'POST') {
      await respond(route, {}, scenario.failConfirm ? 401 : 200, scenario.failConfirm ? 'auth.account_deletion_code_invalid' : '');
    } else if (path === '/logout' && method === 'POST') {
      signedIn = false; await respond(route, {});
    } else { unexpected.push(`${method} ${url.pathname}`); await route.abort('blockedbyclient'); }
  });
  return { scenario, calls, unexpected };
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const directory = process.env.NPCINK_Q1_SCREENSHOTS;
  if (directory) mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: directory ? join(directory, `${name}.png`) : info.outputPath(`${name}.png`), fullPage: true });
}

for (const locale of ['en', 'zh-CN']) {
  test(`pagination and read actions synchronize badge (${locale})`, async ({ page }, info) => {
    const mock = await installMocks(page, {}, locale);
    await page.goto(`${BASE_URL}/portal/notifications`);
    await expect(page.locator('[data-notification-id]')).toHaveCount(20);
    await expect(page.locator('[data-portal-notification-badge]')).toHaveText('21');
    const nav = page.locator('[data-ui="portal-primary-nav"]');
    await expect(nav.locator('a')).toHaveCount(4);
    await expect(nav.locator('a[href="/portal/account"]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-portal-breadcrumb] a')).toHaveAttribute('href', '/portal/account');
    await screenshot(page, info, `notifications-${locale}`);
    await page.getByRole('button', { name: locale === 'en' ? 'Next' : '下一页', exact: true }).click();
    await expect(page.locator('[data-notification-id]')).toHaveCount(1);
    await expect(page.getByText('Ticket reply 21', { exact: true })).toBeVisible();
    await screenshot(page, info, `notifications-page-2-${locale}`);
    await page.getByRole('button', { name: locale === 'en' ? 'Mark read' : '标为已读', exact: true }).click();
    await expect(page.locator('[data-portal-notification-badge]')).toHaveText('20');
    await page.getByRole('button', { name: locale === 'en' ? 'Mark all read' : '全部标为已读', exact: true }).click();
    await expect(page.locator('[data-portal-notification-badge]')).toHaveCount(0);
    await screenshot(page, info, `notifications-all-read-${locale}`);
    await page.locator('[data-portal-nav="logout"]').click();
    await expect(page).toHaveURL(/\/portal\/login/);
    await expect(page.locator('[data-portal-notification-badge]')).toHaveCount(0);
    expect(mock.unexpected).toEqual([]);
  });
}

test('empty, load error, retry and write error remain local', async ({ page }, info) => {
  const mock = await installMocks(page, { failInbox: true });
  await page.goto(`${BASE_URL}/portal/notifications`);
  await expect(page.locator('[data-portal-page-state="error"]')).toBeVisible();
  await screenshot(page, info, 'notifications-load-error');
  mock.scenario.failInbox = false; mock.scenario.empty = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No notifications yet', { exact: true })).toBeVisible();
  await screenshot(page, info, 'notifications-empty');
  mock.scenario.empty = false; mock.scenario.failRead = true;
  await page.reload();
  await expect(page.locator('[data-notification-id]')).toHaveCount(20);
  await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-portal-notification-badge]')).toHaveText('21');
  await screenshot(page, info, 'notifications-read-error');
  expect(mock.calls).not.toContain('POST /logout'); expect(mock.unexpected).toEqual([]);
});

test('closure impact before sending, cancellation and request failure preserve orders and URL', async ({ page }, info) => {
  const mock = await installMocks(page, { failInbox: true, failRequest: true });
  await page.goto(`${BASE_URL}/portal/account?keep=unchanged#payment-orders`);
  const orders = page.locator('[data-portal-account="payment-orders-section"]');
  await expect(orders).toBeVisible();
  await expect(page.locator('[data-portal-notification-badge]')).toHaveCount(0);
  await expect(page.locator('[data-portal-breadcrumb]')).toHaveCount(0);
  const geometry = await page.locator('.portal-content').boundingBox();
  expect(geometry!.width).toBeLessThanOrEqual(896);
  await screenshot(page, info, 'account-quiet-geometry');
  await page.getByRole('button', { name: 'Review account closure', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('does not erase all data'); await expect(dialog).toContainText('Shared or multiple accounts');
  expect(mock.calls).not.toContain('POST /account/deletion/request');
  await screenshot(page, info, 'account-closure-review');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(orders).toBeVisible();
  await expect(page).toHaveURL(/keep=unchanged#payment-orders$/);
  await page.getByRole('button', { name: 'Review account closure', exact: true }).click();
  await dialog.getByRole('button', { name: 'Send closure verification code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('not eligible');
  await screenshot(page, info, 'account-closure-request-error');
  expect(mock.calls.some((call) => /catalog|entitlements|plan-offers/.test(call))).toBe(false);
  expect(mock.calls).not.toContain('POST /logout'); expect(mock.unexpected).toEqual([]);
});

test('closure code error, cancellation and successful sign-out', async ({ page }, info) => {
  const mock = await installMocks(page, { failConfirm: true });
  await page.goto(`${BASE_URL}/portal/account`);
  await page.getByRole('button', { name: 'Review account closure', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Send closure verification code', exact: true }).click();
  await expect(dialog.getByText('Step 2 of 2 · Confirm account closure')).toBeVisible();
  const confirm = dialog.getByRole('button', { name: 'Confirm and close account', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Account closure verification code', { exact: true }).fill('123456');
  await screenshot(page, info, 'account-closure-code'); await confirm.click();
  await expect(dialog.getByRole('alert')).toContainText('incorrect, expired or locked');
  await screenshot(page, info, 'account-closure-code-error');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('[data-portal-account="payment-orders-section"]')).toBeVisible();
  await page.getByRole('button', { name: 'Review account closure', exact: true }).click();
  await expect(dialog.getByLabel('Account closure verification code', { exact: true })).toHaveValue('');
  mock.scenario.pendingCode = true;
  await dialog.getByLabel('Account closure verification code', { exact: true }).fill('654321');
  await dialog.getByRole('button', { name: 'Request a new code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('existing code is still active');
  await expect(dialog.getByLabel('Account closure verification code', { exact: true })).toHaveValue('654321');
  await screenshot(page, info, 'account-closure-pending-code');
  expect(mock.calls.filter((call) => call === 'POST /account/deletion/request')).toHaveLength(2);
  mock.scenario.failConfirm = false;
  await dialog.getByLabel('Account closure verification code', { exact: true }).fill('654321');
  await confirm.click(); await expect(page).toHaveURL(/\/portal\/login/);
  await expect(page.locator('[data-portal-nav="notifications"]')).toHaveCount(0);
  expect(mock.unexpected).toEqual([]);
});
