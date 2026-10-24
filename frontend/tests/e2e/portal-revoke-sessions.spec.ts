import { expect, test, type Page, type Route } from '@playwright/test';

type Mode = 'success' | 'rejected' | 'lost-active' | 'lost-ended' | 'lost-unavailable' | 'server-error' | 'timeout-response';

async function fixture(page: Page, baseURL: string | undefined, mode: Mode = 'success') {
  if (!baseURL) throw new Error('Portal tests require the Playwright project baseURL');
  const origin = new URL(baseURL).origin;
  let submitted = 0;
  let readbacks = 0;
  let active = true;
  let release: (() => void) | undefined;
  let gated = false;
  const unexpected: string[] = [];
  const errors: string[] = [];
  const documents: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url()); });
  await page.context().addCookies([
    { name: 'npcink_portal_session_token', value: 'offline-revoke-fixture', url: origin },
    { name: 'npcink_locale', value: 'zh-CN', url: origin },
  ]);
  const reply = (route: Route, data: unknown, status = 200, error = '') => route.fulfill({
    status, contentType: 'application/json', body: JSON.stringify({ status: status === 200 ? 'ok' : 'error', data, message: 'fixture', error_code: error, meta: { trace_id: 'q3-offline', revision: 'q3-local' } }),
  });
  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push(`external:${url.host}`); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const path = url.pathname.replace('/api/portal', '');
    const method = route.request().method();
    if (path === '/session' && method === 'GET') {
      if (submitted) readbacks++;
      if (submitted && mode === 'lost-unavailable') { await reply(route, {}, 503, 'service.unavailable'); return; }
      await reply(route, active ? { email: 'member@example.test', sites: [], selected_context: null, auth_mode: 'jwt', session: { state: 'active', transport: 'cookie' } } : {}, active ? 200 : 401, active ? '' : 'auth.portal_session_revoked');
    } else if (url.pathname === '/api/portal/totp/challenge/status' && method === 'GET') {
      await reply(route, { challenge_status: 'missing' }, 401, 'auth.portal_factor_invalid');
    } else if (path === '/session/revoke' && method === 'POST') {
      submitted++;
      if (gated) await new Promise<void>((resolve) => { release = resolve; });
      if (mode === 'success') { active = false; await reply(route, {}); }
      else if (mode === 'timeout-response') await reply(route, {}, 408, 'client.request_timeout');
      else if (mode === 'server-error') await reply(route, {}, 503, 'service.unavailable');
      else if (mode === 'rejected') await reply(route, {}, 403, 'auth.origin_forbidden');
      else { if (mode === 'lost-ended') active = false; await route.abort('failed'); }
    } else if (path === '/notifications' && method === 'GET') {
      await reply(route, { items: [], total_count: 3, unread_count: 3, limit: 20, offset: 0 });
    } else if (path === '/auth/identity-providers') await reply(route, { providers: [] });
    else if (path === '/auth/login-options') await reply(route, { qq_available: false });
    else if (path === '/account/payment-orders') await reply(route, { items: [], total_count: 0, counts: { all: 0, pending: 0 }, limit: 10, offset: 0 });
    else { unexpected.push(`${method} ${path}`); await route.abort(); }
  });
  await page.goto(new URL('/portal/account', baseURL).href);
  const trigger = page.locator('[data-portal-account="revoke-sessions"] button');
  await expect(trigger).toBeVisible();
  return { trigger, submitted: () => submitted, readbacks: () => readbacks, documents, errors, unexpected,
    setMode: (next: Mode) => { mode = next; },
    hold: () => { gated = true; }, release: () => release?.() };
}

async function confirm(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('包括当前浏览器');
  await expect(dialog).toContainText('WordPress');
  return dialog.getByRole('button', { name: '确认全部退出', exact: true });
}

test('cancel restores focus; busy confirmation submits once; success starts a new login document', async ({ page, baseURL }, info) => {
  const mock = await fixture(page, baseURL);
  await mock.trigger.click();
  await confirm(page);
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(mock.trigger).toBeFocused();
  expect(mock.submitted()).toBe(0);
  mock.hold();
  await mock.trigger.click();
  const submit = await confirm(page);
  await submit.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(mock.submitted).toBe(1);
  await expect(page.getByRole('button', { name: '正在退出…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: info.outputPath('revoke-busy.png'), fullPage: true });
  mock.release();
  await expect(page).toHaveURL(/\/portal\/login$/);
  expect(mock.documents.some((url) => url.endsWith('/portal/login'))).toBe(true);
  await expect(page.locator('[data-portal-notification-badge]')).toHaveCount(0);
  expect(mock.submitted()).toBe(1);
  expect(mock.unexpected).toEqual([]);
  expect(mock.errors).toEqual([]);
});

for (const mode of ['rejected', 'lost-active', 'lost-ended', 'lost-unavailable', 'server-error', 'timeout-response'] as const) {
  test(`honest outcome and session readback: ${mode}`, async ({ page, baseURL }, info) => {
    const mock = await fixture(page, baseURL, mode);
    await mock.trigger.click();
    await (await confirm(page)).click();
    const alert = page.getByRole('dialog').getByRole('alert');
    await expect(alert).toContainText(mode === 'rejected' ? '请求被拒绝' : mode === 'lost-ended' ? '当前浏览器会话已失效' : (mode === 'lost-active' || mode === 'server-error' || mode === 'timeout-response') ? '当前浏览器会话仍有效' : '无法核实当前浏览器会话');
    expect(mock.readbacks()).toBe(1);
    await expect(page).toHaveURL(/\/portal\/account$/);
    await page.screenshot({ path: info.outputPath(`revoke-${mode}.png`), fullPage: true });
    if (mode === 'lost-ended') {
      await page.getByRole('button', { name: '返回登录', exact: true }).click();
      await expect(page).toHaveURL(/\/portal\/login$/);
    } else if (mode === 'lost-active') {
      mock.setMode('success');
      await page.getByRole('dialog').getByRole('button', { name: '确认全部退出', exact: true }).click();
      await expect(page).toHaveURL(/\/portal\/login$/);
    } else {
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
      await expect(mock.trigger).toBeFocused();
    }
    expect(mock.submitted()).toBe(mode === 'lost-active' ? 2 : 1);
    expect(mock.unexpected).toEqual([]);
    expect(mock.errors).toEqual([]);
  });
}

test('English copy via locale control keeps cancellation local on mobile', async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await fixture(page, baseURL);
  await page.locator('button[aria-controls="portal-mobile-nav"]').click();
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await page.locator('button[aria-controls="portal-mobile-nav"]').click();
  await mock.trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('including this browser');
  await expect(dialog).toContainText('Other users, WordPress logins and site API keys are unaffected');
  await expect(dialog.getByRole('button', { name: 'Sign out everywhere', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('revoke-english-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(mock.trigger).toBeFocused();
  expect(mock.submitted()).toBe(0);
  expect(mock.unexpected).toEqual([]);
  expect(mock.errors).toEqual([]);
});
