import { expect, test, type Page, type Route } from '@playwright/test';

async function fixture(page: Page, baseURL: string | undefined, status = 200) {
  if (!baseURL) throw new Error('baseURL required');
  const origin = new URL(baseURL).origin;
  const unexpected: string[] = [], errors: string[] = [];
  let issued = 0, confirmed = 0;
  let release: (() => void) | undefined;
  let hold = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.context().addCookies([
    { name: 'npcink_portal_session_token', value: 'offline-export-only', url: origin },
    { name: 'npcink_locale', value: 'zh-CN', url: origin },
  ]);
  const reply = (route: Route, data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok', data, message: 'fixture', error_code: '', meta: { trace_id: 'export-offline', revision: 'export-local' } }) });
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { unexpected.push('external'); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const path = url.pathname.replace('/api/portal', '');
    if (path === '/account/data-export/code') {
      issued++;
      await reply(route, { challenge_id: 'fixture-challenge', expires_in_seconds: 300 });
    } else if (path === '/account/data-export/confirm') {
      confirmed++;
      expect(route.request().postDataJSON()).toEqual({ challenge_id: 'fixture-challenge', code: '123456' });
      if (hold) await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200
        ? { schema: 'cloud-principal-copy.v1', data: { profile: { principal_id: 'own', email: 'copy-only@example.test' } } }
        : { error_code: 'private-error' }) });
    } else if (path === '/session') await reply(route, { email: 'member@example.test', sites: [], selected_context: null, auth_mode: 'jwt', session: { state: 'active', transport: 'cookie' } });
    else if (path === '/notifications') await reply(route, { items: [], total_count: 0, unread_count: 0, limit: 20, offset: 0 });
    else if (path === '/auth/identity-providers') await reply(route, { providers: [] });
    else if (path === '/auth/login-options') await reply(route, { qq_available: false });
    else if (path === '/account/payment-orders') await reply(route, { items: [], total_count: 0, counts: { all: 0, pending: 0 }, limit: 10, offset: 0 });
    else { unexpected.push(path); await route.abort(); }
  });
  await page.goto(new URL('/portal/account', baseURL).href);
  const trigger = page.locator('[data-portal-account="data-export"] button');
  await expect(trigger).toBeVisible();
  return { trigger, errors, unexpected, issued: () => issued, confirmed: () => confirmed,
    hold: () => { hold = true; }, release: () => release?.() };
}

async function enter(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(dialog.getByText('验证码已发送', { exact: false })).toBeVisible();
  await dialog.getByLabel('六位验证码').fill('123456');
  return dialog;
}

test('keyboard cancel restores focus; single busy confirmation downloads only an in-memory JSON copy', async ({ page, baseURL }, info) => {
  const mock = await fixture(page, baseURL);
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL.bind(URL);
    (window as Window & { revokedUrls?: number }).revokedUrls = 0;
    URL.revokeObjectURL = url => { (window as Window & { revokedUrls: number }).revokedUrls++; original(url); };
  });
  // Reload once so the URL lifetime probe is installed before download.
  await page.reload();
  await mock.trigger.click();
  await page.keyboard.press('Escape');
  await expect(mock.trigger).toBeFocused();
  expect(mock.issued()).toBe(0);
  await mock.trigger.click();
  const dialog = await enter(page);
  mock.hold();
  const button = dialog.getByRole('button', { name: '确认并下载 JSON' });
  const downloaded = page.waitForEvent('download');
  await button.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
  await expect.poll(mock.confirmed).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('export-busy.png'), fullPage: true });
  mock.release();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('cloud-personal-data.json');
  await download.saveAs(info.outputPath('cloud-personal-data.json'));
  await expect(dialog.getByText('已发起下载', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { revokedUrls: number }).revokedUrls)).toBe(1);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('copy-only');
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(mock.errors).toEqual([]); expect(mock.unexpected).toEqual([]);
});

for (const [status, copy] of [[400, '验证码无效'], [401, '当前会话已失效'], [413, '数据副本超过'], [429, '请求过于频繁'], [503, '本人数据副本暂不可用'], [504, '未能确认下载结果']] as const) {
  test(`download error ${status} leaves no file or code in persistent storage`, async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL, status);
    const downloads: string[] = [];
    page.on('download', file => downloads.push(file.suggestedFilename()));
    await mock.trigger.click();
    const dialog = await enter(page);
    await dialog.getByRole('button', { name: '确认并下载 JSON' }).click();
    await expect(dialog.getByRole('status')).toContainText(copy);
    expect(downloads).toEqual([]);
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('123456');
    expect(mock.errors).toEqual([]); expect(mock.unexpected).toEqual([]);
  });
}

test('English via hydrated language control stays within mobile viewport and cancels without sending', async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mock = await fixture(page, baseURL);
  await page.locator('button[aria-controls="portal-mobile-nav"]').click();
  await page.getByRole('button', { name: '语言', exact: true }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await page.locator('button[aria-controls="portal-mobile-nav"]').click();
  await mock.trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('control of that email for this download');
  await expect(dialog).toContainText('not a complete legal compliance report');
  await expect(dialog.getByRole('button', { name: 'Send verification code', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('export-english-mobile.png'), fullPage: true });
  await dialog.getByText('Close', { exact: true }).click();
  await expect(mock.trigger).toBeFocused();
  expect(mock.issued()).toBe(0); expect(mock.confirmed()).toBe(0);
  expect(mock.errors).toEqual([]); expect(mock.unexpected).toEqual([]);
});
