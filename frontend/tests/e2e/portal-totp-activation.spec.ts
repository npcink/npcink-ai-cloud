import { test, expect, type Page, type BrowserContext, type Route } from '@playwright/test';
import { createHmac } from 'node:crypto';

// Secrets must never be retained in traces, screenshots, videos, HARs or attachments.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const seed = 'A'.repeat(32); // synthetic contract fixture only
const codes = () => Array.from({ length: 8 }, (_, index) => `synthetic-recovery-${index}`);
const session = () => ({ email: 'member@example.test', sites: [], selected_context: null, auth_mode: 'jwt',
  session: { state: 'active', transport: 'cookie', issued_at: new Date(Date.now() - 10000).toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(), revocable: true } });
const panel = (page: Page) => page.locator('[data-totp-settings]');
const confirmButton = (page: Page) => panel(page).getByRole('button', { name: '确认', exact: true });
const codeInput = (page: Page) => panel(page).getByLabel('验证器验证码', { exact: true });

async function contract(context: BrowserContext, page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error('Bound local compiled frontend required');
  const origin = new URL(baseURL).origin;
  const state = { enabled: false, starts: 0, confirms: 0, wrong: false, lost: false, hold: false,
    stale: false, expires: 300000, forbidden: 0, errors: 0, reads: 0, release: null as null | (() => void), held: false };
  context.on('page', (tab) => tab.on('pageerror', () => { state.errors += 1; }));
  page.on('pageerror', () => { state.errors += 1; });
  await context.addCookies([{ name: 'npcink_portal_session_token', value: 'synthetic', url: origin }]);
  await context.addInitScript(() => { localStorage.setItem('locale', 'zh-CN'); });
  const reply = (route: Route, data: unknown, status = 200, error = '') => route.fulfill({ status, json: {
    status: status === 200 ? 'ok' : 'error', data, error_code: error, message: 'synthetic',
    meta: { trace_id: 'totp-contract', revision: 'm6' },
  } });
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) { state.forbidden += 1; await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.replace('/api/portal/', '');
    if (path === 'session') { state.reads += 1; return reply(route, session()); }
    if (path === 'totp/status') { state.reads += 1; return reply(route, { enabled: state.enabled, recovery_codes_remaining: state.enabled ? 8 : 0 }); }
    if (path.startsWith('totp/') && path.endsWith('/start')) {
      state.starts += 1;
      return reply(route, { status: 'second_factor_required', setup_id: `setup-${state.starts}`,
        secret: seed, otpauth_uri: `otpauth://totp/Fixture?secret=${seed}`, expires_at: new Date(Date.now() + state.expires).toISOString() });
    }
    if (path.startsWith('totp/') && path.endsWith('/confirm')) {
      state.confirms += 1;
      if (req.headers()['idempotency-key']) state.forbidden += 1;
      if (state.hold) { state.held = true; await new Promise<void>((resolve) => { state.release = resolve; }); }
      if (state.wrong) { state.wrong = false; return reply(route, { challenge_status: 'retryable', attempts_remaining: 4 }, 401, 'auth.portal_factor_invalid'); }
      if (state.stale) return reply(route, { challenge_status: 'terminal' }, 401, 'auth.portal_factor_invalid');
      state.enabled = !path.includes('/disable/');
      if (state.lost) { await route.abort('failed'); return; }
      return reply(route, { ...session(), status: 'authenticated', recovery_codes: state.enabled ? codes() : [] });
    }
    if (path === 'auth/identity-providers') return reply(route, { providers: [] });
    if (path === 'auth/login-options') return reply(route, { qq_available: false });
    if (path === 'notifications') return reply(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0 });
    if (path === 'account/payment-orders') return reply(route, { items: [], total_count: 0, counts: { all: 0, pending: 0 }, limit: 10, offset: 0 });
    if (path === 'sessions') return reply(route, { items: [], pagination: { limit: 10, offset: 0, total: 0 } });
    if (path === 'logout') return reply(route, {});
    state.forbidden += 1; await route.abort();
  });
  await page.goto('/portal/account'); await expect(panel(page).getByRole('button', { name: '启用验证器' })).toBeVisible();
  return state;
}
async function begin(page: Page) {
  await panel(page).getByRole('button', { name: '启用验证器' }).click();
  await expect(codeInput(page)).toBeVisible();
  await expect(panel(page).locator('[data-totp-secret]')).toHaveCount(1);
}
async function submit(page: Page) { await codeInput(page).fill('123456'); await confirmButton(page).click(); }
async function saved(page: Page) {
  await expect(panel(page).getByRole('list', { name: '恢复码列表' }).getByRole('listitem')).toHaveCount(8);
  await panel(page).getByRole('button', { name: '我已保存恢复码' }).click();
  await expect(panel(page).locator('[data-totp-secret]')).toHaveCount(0);
}

test('@contract E01 E02 E03 activation, retryable proof, replacement session, once-only codes and protected management', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.wrong = true;
  await begin(page); await submit(page);
  await expect(panel(page).getByRole('alert')).toBeVisible(); await expect(codeInput(page)).toHaveValue('');
  await submit(page); await saved(page);
  await expect(panel(page).getByText('已启用', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('剩余 8 枚恢复码', { exact: true })).toBeVisible();
  await page.locator('[data-portal-account="sessions"]').getByRole('button', { name: '查看', exact: true }).click();
  await expect(page.locator('[data-portal-account="sessions"]')).toBeVisible();
  await panel(page).getByRole('button', { name: '重新生成恢复码' }).click();
  await panel(page).getByLabel('验证方式').selectOption('recovery_code');
  await panel(page).getByLabel('恢复码', { exact: true }).fill('synthetic'); await confirmButton(page).click(); await saved(page);
  await panel(page).getByRole('button', { name: '停用验证器' }).click(); await submit(page);
  await expect(panel(page).getByRole('button', { name: '启用验证器' })).toBeVisible();
  expect(state.confirms === 4 && state.errors === 0 && state.forbidden === 0).toBe(true);
});
test('@contract E04 committed response loss clears secrets and never repeats confirm', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.lost = true;
  await begin(page); await submit(page);
  await expect(panel(page).getByText(/结果尚无法确定/)).toBeVisible();
  await expect(panel(page).locator('[data-totp-secret]')).toHaveCount(0);
  await panel(page).getByRole('button', { name: '重新检查账号' }).click();
  await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
  expect(state.confirms === 1 && state.errors === 0 && state.forbidden === 0).toBe(true);
});
test('@contract E05 pagehide, persisted pageshow and late completion erase secrets before restoration', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.hold = true;
  await begin(page); await submit(page); await expect.poll(() => state.held).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  expect(await panel(page).locator('[data-totp-secret]').evaluateAll((nodes) => nodes.every((node) => !node.textContent))).toBe(true);
  state.release?.();
  await expect.poll(() => state.enabled).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
  await expect(panel(page).getByRole('list')).toHaveCount(0);
  expect(state.confirms === 1 && state.errors === 0).toBe(true);
});
test('@contract E05 focus during a held confirm waits for settlement and never restores codes', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.hold = true;
  await begin(page); await submit(page); await expect.poll(() => state.held).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(panel(page).getByRole('button', { name: '重新检查账号' })).toBeDisabled();
  expect(await panel(page).locator('[data-totp-secret]').count() === 0).toBe(true);
  state.release?.();
  await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
  await expect(panel(page).getByRole('list')).toHaveCount(0);
  expect(state.confirms === 1 && state.starts === 1 && state.errors === 0).toBe(true);
});
test('@contract Z21-P2-01 cancel during confirm cannot read stale state or start another write', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.hold = true;
  await begin(page); await submit(page); await expect.poll(() => state.held).toBe(true);
  const readsBeforeCancel = state.reads;
  await panel(page).getByRole('button', { name: '取消', exact: true }).click();
  await expect(panel(page).getByText(/结果尚无法确定/)).toBeVisible();
  const recheck = panel(page).getByRole('button', { name: '重新检查账号' });
  await expect(recheck).toBeDisabled();
  await recheck.evaluate((button) => { (button as HTMLButtonElement).click(); });
  await expect(panel(page).getByRole('button', { name: '启用验证器' })).toHaveCount(0);
  expect(state.reads === readsBeforeCancel && state.starts === 1 && state.confirms === 1).toBe(true);
  state.release?.();
  await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
  await expect(panel(page).getByRole('list')).toHaveCount(0);
  expect(state.enabled && state.reads === readsBeforeCancel + 2 && state.confirms === 1 && state.errors === 0).toBe(true);
});
test('@contract Z21-P2-01 an uncertain canceled confirm requires an explicit post-settlement read', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.hold = true; state.lost = true;
  await begin(page); await submit(page); await expect.poll(() => state.held).toBe(true);
  const readsBeforeCancel = state.reads;
  await panel(page).getByRole('button', { name: '取消', exact: true }).click();
  const recheck = panel(page).getByRole('button', { name: '重新检查账号' });
  await expect(recheck).toBeDisabled(); state.release?.();
  await expect(recheck).toBeEnabled();
  expect(state.enabled && state.reads === readsBeforeCancel && state.confirms === 1).toBe(true);
  await expect(panel(page).getByRole('button', { name: '启用验证器' })).toHaveCount(0);
  await recheck.click();
  await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
  expect(state.confirms === 1 && state.errors === 0).toBe(true);
});
test('@contract E05 cancel, refresh, route return and logout cannot recover a displayed batch', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL);
  await begin(page); await panel(page).getByRole('button', { name: '取消' }).click();
  await expect(panel(page).getByRole('button', { name: '启用验证器' })).toBeVisible();
  await begin(page); await submit(page);
  await expect(panel(page).getByRole('listitem')).toHaveCount(8);
  await page.reload(); await expect(panel(page).getByText('已启用', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('listitem')).toHaveCount(0);
  await page.goto('/portal/account?return=1'); await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(panel(page)).toHaveCount(0); expect(state.errors === 0 && state.forbidden === 0).toBe(true);
});
test('@contract E06 single-flight keyboard confirmation and terminal replaced challenge', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.hold = true;
  await begin(page); await codeInput(page).fill('123456'); await codeInput(page).press('Enter');
  await expect.poll(() => state.held).toBe(true); await expect(panel(page).locator('button[type=submit]')).toBeDisabled();
  await panel(page).locator('button[type=submit]').evaluate((button) => { (button as HTMLButtonElement).click(); });
  state.stale = true; state.release?.();
  await expect(panel(page).getByText(/本次验证暂不可用/)).toBeVisible();
  expect(state.confirms === 1 && state.errors === 0).toBe(true);
});
test('@contract E06 expiry clears pending key and status reread requires an explicit new start', async ({ page, context, baseURL }) => {
  const state = await contract(context, page, baseURL); state.expires = 1500;
  await begin(page); await expect(panel(page).getByText(/本次验证暂不可用/)).toBeVisible();
  await expect(panel(page).locator('[data-totp-secret]')).toHaveCount(0);
  await panel(page).getByRole('button', { name: '重新检查账号' }).click();
  await expect(panel(page).getByRole('button', { name: '启用验证器' })).toBeVisible();
  expect(state.starts === 1 && state.confirms === 0 && state.errors === 0).toBe(true);
});

function totp(secret: string) {
  let bits = ''; for (const char of secret) bits += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', bytes).update(counter).digest(), offset = digest[19] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
test('@live E01–E06 real activation, lifecycle, old sessions, lost response and protected management', async ({ page, context, baseURL, browser }) => {
  // No fallback, route.fulfill, debugging login bypass or conditional skip.
  if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname)
    || process.env.NPCINK_TOTP_LIVE_APPROVED !== '1' || !process.env.NPCINK_TOTP_LIVE_EMAIL || !process.env.NPCINK_TOTP_LIVE_LOGIN_CODE) {
    throw new Error('Controlled compiled frontend/backend/PG and fresh disposable-account credentials required');
  }
  let errors = 0; page.on('pageerror', () => { errors += 1; });
  let manual = '', recovery = '', oldRecovery = '';
  const other = await browser.newContext({ baseURL });
  try {
    await context.addInitScript(() => { localStorage.setItem('locale', 'zh-CN'); });
    const response = await context.request.post(`${baseURL}/api/portal/auth/code/verify`, { data: {
      email: process.env.NPCINK_TOTP_LIVE_EMAIL, code: process.env.NPCINK_TOTP_LIVE_LOGIN_CODE, remember_me: false,
    } });
    expect(response.ok()).toBe(true);
    await other.addCookies(await context.cookies());
    await page.goto('/portal/account'); await begin(page);
    // Cancellation and bfcache restoration must discard the pending key.
    await panel(page).getByRole('button', { name: '取消' }).click();
    await begin(page);
    expect(await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      return [...document.querySelectorAll('[data-totp-secret]')].every((node) => !node.textContent);
    })).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(panel(page).getByRole('button', { name: '启用验证器' })).toBeVisible();
    const initialSetup = page.waitForResponse('**/api/portal/totp/setup/start');
    await begin(page);
    const initialId = (await (await initialSetup).json()).data.setup_id;
    // Two real pages share the challenge cookie. A later setup replaces binding.
    manual = await panel(page).locator('[data-totp-secret]').innerText();
    const second = await context.newPage(); second.on('pageerror', () => { errors += 1; });
    await second.goto('/portal/account'); await begin(second);
    const stale = await context.request.post(`${baseURL}/api/portal/totp/setup/confirm`, { data: {
      setup_id: initialId, method: 'totp', code: totp(manual),
    } });
    expect(stale.status() === 401).toBe(true);
    await second.close();
    await page.reload(); await begin(page);
    manual = await panel(page).locator('[data-totp-secret]').innerText();
    const currentCode = totp(manual);
    const wrongCode = String((Number(currentCode) + 1) % 1000000).padStart(6, '0');
    await codeInput(page).fill(wrongCode); await confirmButton(page).click();
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await codeInput(page).fill(totp(manual)); await codeInput(page).press('Enter');
    await expect(panel(page).getByRole('listitem')).toHaveCount(8);
    recovery = await panel(page).getByRole('listitem').first().innerText(); oldRecovery = recovery; await saved(page);
    const revoked = await other.request.get(`${baseURL}/api/portal/session`); expect(revoked.status() === 401).toBe(true);
    await page.locator('[data-portal-account="sessions"]').getByRole('button', { name: '查看', exact: true }).click();
    // Drop the committed response body, preserving the real replacement cookie.
    // No success response is fabricated; route.fetch executes the real BFF/PG write.
    let committed = 0;
    await page.route('**/api/portal/totp/recovery-reset/confirm', async (route) => {
      const real = await route.fetch();
      if (real.ok()) { committed += 1; await route.fulfill({ response: real, body: '{' }); }
      else await route.fulfill({ response: real });
    });
    await panel(page).getByRole('button', { name: '重新生成恢复码' }).click();
    await panel(page).getByLabel('验证方式').selectOption('recovery_code');
    await panel(page).getByLabel('恢复码', { exact: true }).fill(recovery); recovery = ''; await confirmButton(page).click();
    await expect(panel(page).getByText(/结果尚无法确定/)).toBeVisible();
    expect(committed === 1).toBe(true);
    await page.unroute('**/api/portal/totp/recovery-reset/confirm');
    await panel(page).getByRole('button', { name: '重新检查账号' }).click();
    await expect(panel(page).getByRole('button', { name: '重新生成恢复码' })).toBeVisible();
    // A fresh counter is required: setup consumed its own TOTP counter.
    const delay = 30000 - Date.now() % 30000 + 150; await page.waitForTimeout(delay);
    await panel(page).getByRole('button', { name: '重新生成恢复码' }).click();
    await codeInput(page).fill(totp(manual)); await confirmButton(page).click();
    await expect(panel(page).getByRole('listitem')).toHaveCount(8);
    recovery = await panel(page).getByRole('listitem').first().innerText(); await saved(page);
    await page.reload(); await expect(panel(page).getByText('已启用', { exact: true })).toBeVisible();
    await expect(panel(page).getByRole('listitem')).toHaveCount(0);
    await panel(page).getByRole('button', { name: '停用验证器' }).click();
    await panel(page).getByLabel('验证方式').selectOption('recovery_code');
    await panel(page).getByLabel('恢复码', { exact: true }).fill(oldRecovery); oldRecovery = ''; await confirmButton(page).click();
    await expect(panel(page).getByRole('alert')).toBeVisible();
    await panel(page).getByLabel('恢复码', { exact: true }).fill(recovery); recovery = ''; await confirmButton(page).click();
    await expect(panel(page).getByRole('button', { name: '启用验证器' })).toBeVisible();
    expect(errors === 0).toBe(true);
  } catch {
    throw new Error('Live TOTP assertions failed; sensitive call details suppressed');
  } finally { manual = ''; recovery = ''; oldRecovery = ''; await other.close(); }
});
