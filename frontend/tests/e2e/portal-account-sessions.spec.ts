import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';

type SessionRow = { session_id: string; is_current: boolean; created_at: string; expires_at: string; auth_method: 'email_code' | 'registration' | 'qq'; client_hint: string | null };
type WriteMode = 'ok' | '403' | '404' | '503-committed' | '503-rollback' | 'lost-committed' | 'lost-active' | 'lost-ended' | 'readback-unavailable';
const installed = new WeakMap<Page, { unexpected: string[]; errors: string[] }>();

async function fixture(page: Page, baseURL: string | undefined, count = 21, locale = 'zh-CN', currentIndex = 0) {
  if (!baseURL) throw new Error('External compiled or development preview URL required');
  const origin = new URL(baseURL).origin;
  const state = {
    rows: Array.from({ length: count }, (_, index): SessionRow => ({ session_id: `sid_${index}`, is_current: index === currentIndex,
      created_at: '2026-10-24T00:00:00Z', expires_at: '2026-11-24T00:00:00Z', auth_method: (['email_code', 'registration', 'qq'] as const)[index % 3],
      client_hint: index === 1 ? `Browser / OS ${'long-unverified-hint-'.repeat(4)}` : null })),
    active: true, readStatus: 200, writeMode: 'ok' as WriteMode,
    calls: [] as { method: string; path: string; key: string | undefined }[], readOffsets: [] as number[],
    readHook: null as null | ((offset: number) => void),
    holdRead: false, releaseRead: null as null | (() => void), readStarted: false,
    holdWrite: false, releaseWrite: null as null | (() => void), writes: 0,
    unexpected: [] as string[], errors: [] as string[], documents: [] as string[],
  };
  installed.set(page, state);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.context().addCookies([
    { name: 'npcink_portal_session_token', value: 'own-sessions-fixture', url: origin },
    { name: 'npcink_locale', value: locale, url: origin },
  ]);
  await page.addInitScript((value) => localStorage.setItem('locale', value), locale);
  page.on('pageerror', (error) => state.errors.push(error.message));
  page.on('request', (request) => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) state.documents.push(request.url()); });
  const reply = (route: Route, data: unknown, status = 200, error = '') => route.fulfill({ status, contentType: 'application/json',
    body: JSON.stringify({ status: status < 400 ? 'ok' : 'error', error_code: error, message: 'fixture', data, meta: { trace_id: 'session-ui-fixture', revision: 'm7' } }) });
  await page.context().route('**/*', async (route) => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin !== origin) { state.unexpected.push(`external:${url.host}`); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const path = url.pathname.replace('/api/portal', ''); const method = req.method();
    state.calls.push({ method, path, key: req.headers()['idempotency-key'] });
    if (path === '/session' && method === 'GET') {
      await reply(route, state.active ? { email: 'member@example.test', sites: [], selected_context: null, auth_mode: 'jwt', session: { state: 'active', transport: 'cookie' } } : {}, state.active ? 200 : 401, state.active ? '' : 'auth.portal_session_revoked');
    } else if (url.pathname === '/api/portal/totp/challenge/status' && method === 'GET') {
      await reply(route, { challenge_status: 'missing' }, 401, 'auth.portal_factor_invalid');
    } else if (path === '/sessions' && method === 'GET') {
      const offset = Number(url.searchParams.get('offset')); const limit = Number(url.searchParams.get('limit'));
      state.readOffsets.push(offset); state.readHook?.(offset);
      const data = { items: state.rows.slice(offset, offset + limit), pagination: { limit, offset, total: state.rows.length } };
      const status = state.active ? state.readStatus : 401;
      if (state.holdRead) {
        state.holdRead = false; state.readStarted = true;
        await new Promise<void>((resolve) => { state.releaseRead = resolve; });
      }
      await reply(route, status === 200 ? data : {}, status, status === 401 ? 'auth.portal_session_revoked' : 'portal.sessions_unavailable');
    } else if (method === 'POST' && (path === '/sessions/revoke-others' || /^\/sessions\/sid_\d+\/revoke$/.test(path))) {
      state.writes += 1; const mode = state.writeMode;
      if (state.holdWrite) await new Promise<void>((resolve) => { state.releaseWrite = resolve; });
      const targetId = path.split('/')[2];
      const target = state.rows.find((row) => row.session_id === targetId);
      const before = state.rows.length;
      if (['ok', '503-committed', 'lost-committed', 'lost-ended', 'readback-unavailable'].includes(mode)) {
        state.rows = path === '/sessions/revoke-others' ? state.rows.filter((row) => row.is_current) : state.rows.filter((row) => row.session_id !== targetId);
        if (target?.is_current || mode === 'lost-ended') state.active = false;
      }
      if (mode === 'readback-unavailable') state.readStatus = 503;
      if (mode.startsWith('lost-')) { await route.abort('failed'); return; }
      const status = mode === '403' ? 403 : mode === '404' ? 404 : mode.startsWith('503') || mode === 'readback-unavailable' ? 503 : 200;
      await reply(route, status === 200 ? { revoked_count: before - state.rows.length } : {}, status, status === 404 ? 'portal.session_not_found' : status === 403 ? 'auth.origin_forbidden' : status === 503 ? 'portal.idempotency_persist_failed' : '');
    } else if (path === '/notifications' && method === 'GET') await reply(route, { items: [], total_count: 3, unread_count: 3, limit: 1, offset: 0 });
    else if (path === '/auth/identity-providers') await reply(route, { providers: [] });
    else if (path === '/auth/login-options') await reply(route, { qq_available: false });
    else if (path === '/account/payment-orders') await reply(route, { items: [], total_count: 0, counts: { all: 0, pending: 0 }, limit: 10, offset: 0 });
    else { state.unexpected.push(`${method} ${path}`); await route.abort(); }
  });
  await page.goto(`${origin}/portal/account?keep=account#payment-orders`);
  const panel = page.locator('[data-portal-account="sessions"]');
  await expect(panel).toBeVisible();
  return { state, panel, origin };
}

test.afterEach(async ({ page }) => {
  const state = installed.get(page);
  if (state) { expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]); }
});
async function open(page: Page) {
  const panel = page.locator('[data-portal-account="sessions"]');
  await panel.getByRole('button', { name: /^(查看|View)$/ }).click();
  return panel;
}
async function confirm(page: Page) {
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^(退出|Sign out)$/ }).click();
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}

for (const locale of ['zh-CN', 'en']) for (const theme of ['light', 'dark']) {
  test(`[F04-01 F04-02 F04-03] boundary Retry is single-flight and catches repeated 503 ${locale} ${theme}`, async ({ page, baseURL }, info) => {
    if (!baseURL) throw new Error('Bound isolated candidate required');
    const origin = new URL(baseURL).origin;
    const state = { unexpected: [] as string[], errors: [] as string[], sessionReads: 0, challengeReads: 0, writes: [] as string[] };
    installed.set(page, state);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.context().addCookies([{ name: 'npcink_portal_session_token', value: 'boundary-fixture', url: origin }]);
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem('locale', locale); localStorage.setItem('theme', theme);
      const unhandled: string[] = [];
      Object.defineProperty(window, '__portalUnhandled', { value: unhandled });
      window.addEventListener('unhandledrejection', (event) => unhandled.push(String(event.reason)));
    }, { locale, theme });
    page.on('pageerror', (error) => state.errors.push(error.message));
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const reply = (route: Route, data: unknown, status = 200) => route.fulfill({ status, json: {
      status: status === 200 ? 'ok' : 'error', error_code: status === 200 ? '' : 'service.unavailable',
      message: 'fixture', data, meta: { trace_id: 'boundary-reference', revision: 'm7' },
    } });
    await page.context().route('**/*', async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin === origin && request.method() === 'GET' && !url.pathname.startsWith('/api/')) return route.continue();
      if (url.origin === origin && request.method() === 'GET') {
        if (url.pathname === '/api/portal/session') {
          state.sessionReads += 1;
          if (state.sessionReads === 2) await held;
          return state.sessionReads < 3 ? reply(route, {}, 503) : reply(route, {
            email: 'boundary@example.test', sites: [], selected_context: null, auth_mode: 'jwt',
            session: { state: 'active', transport: 'cookie' },
          });
        }
        if (url.pathname === '/api/portal/totp/challenge/status') { state.challengeReads += 1; return reply(route, {}, 503); }
        if (url.pathname === '/api/portal/notifications') return reply(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0 });
        if (url.pathname === '/api/portal/auth/identity-providers') return reply(route, { providers: [] });
        if (url.pathname === '/api/portal/auth/login-options') return reply(route, { qq_available: false });
        if (url.pathname === '/api/portal/account/payment-orders') return reply(route, { items: [], total_count: 0, counts: { all: 0, pending: 0 }, limit: 10, offset: 0 });
      }
      if (request.method() !== 'GET') state.writes.push(`${request.method()} ${url.pathname}`);
      state.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`); await route.abort('blockedbyclient');
    });
    await page.goto('/portal/account');
    const retry = page.getByRole('button', { name: /^(重试|Retry)$/ });
    await expect(retry).toBeVisible(); expect(state.sessionReads).toBe(1); expect(state.challengeReads).toBe(1);
    await expect(page.locator('[data-portal-account="sessions"]')).toHaveCount(0);
    await retry.evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect.poll(() => state.sessionReads).toBe(2); release();
    await expect.poll(() => state.challengeReads).toBe(2); await expect(retry).toBeVisible();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('boundary-reference');
    await capture(page, info, 'boundary-retry-503');
    await retry.click(); await expect(page.locator('[data-portal-account="sessions"]')).toBeVisible();
    expect(state.sessionReads).toBe(3); expect(state.challengeReads).toBe(2); expect(state.writes).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __portalUnhandled: string[] }).__portalUnhandled)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, info, 'boundary-recovered');
    await info.attach('boundary-read-counts', { body: JSON.stringify(state), contentType: 'application/json' });
  });
}

for (const width of [1440, 1280]) for (const locale of ['zh-CN', 'en']) for (const theme of ['light', 'dark'] as const) {
  test(`PC own session table ${width} ${locale} ${theme}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.addInitScript((value) => { localStorage.setItem('theme', value); }, theme);
    const { state, panel } = await fixture(page, baseURL, 21, locale);
    expect(state.readOffsets).toEqual([]);
    await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(10);
    await expect(panel.getByRole('columnheader', { name: /浏览器|Browser/ })).toBeVisible();
    await expect(panel).toContainText(locale === 'en' ? 'Unknown' : '未知');
    await expect(panel).toContainText(locale === 'en' ? 'Unverified hint' : '未经验证的提示');
    await expect(page.locator('[data-ui="portal-primary-nav"] a')).toHaveCount(4);
    await expect(page.locator('[data-portal-breadcrumb]')).toHaveCount(0);
    await expect(page.locator('[data-portal-account="payment-orders-section"]')).toBeVisible();
    await expect(page.locator('[data-portal-account="revoke-sessions"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, info, 'table');
    await panel.getByRole('button', { name: /^(下一页|Next)$/ }).click();
    await expect(panel.locator('[data-session-row="sid_10"]')).toBeVisible();
    expect(state.readOffsets).toEqual([0, 10]);
    await panel.getByRole('button', { name: /^(上一页|Previous)$/ }).click();
    await expect(panel.locator('[data-session-row="sid_0"]')).toBeVisible();
    expect(state.calls.filter((call) => call.method === 'POST')).toEqual([]);
    await expect(page).toHaveURL(/\/portal\/account\?keep=account#payment-orders$/);
  });
}

test('one-session and empty result have bounded pagination and disabled other-session action', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL, 1);
  await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: '退出其他会话', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await capture(page, info, 'single');
  state.rows = []; await panel.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(panel).toContainText('此结果中没有有效会话');
  await expect(panel).toContainText('第 0–0 条，共 0 个会话');
  await capture(page, info, 'empty');
});

test('initial failure is distinct from empty, retry and retained failure stay local', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL); state.readStatus = 503;
  await open(page); await expect(panel.getByRole('alert')).toContainText('会话列表加载失败');
  await expect(panel.getByRole('table')).toHaveCount(0); await capture(page, info, 'initial-error');
  state.readStatus = 200; await panel.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(panel.locator('[data-session-row]')).toHaveCount(10);
  state.readStatus = 403; await panel.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('暂时保留上次结果');
  await expect(panel.locator('[data-session-row]')).toHaveCount(10);
  await expect(panel.locator('[data-session-row] button').first()).toBeDisabled(); await capture(page, info, 'retained-error');
  expect(state.writes).toBe(0);
});

test('single revoke confirms scope, cancel restores focus, busy double click writes once with a real key', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL);
  await open(page); const trigger = panel.locator('[data-session-row="sid_1"] button');
  await trigger.click(); await expect(page.getByRole('dialog')).toContainText('当前登录及其他会话保留');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(trigger).toBeFocused(); expect(state.writes).toBe(0);
  state.holdWrite = true; await trigger.click();
  await page.getByRole('dialog').getByRole('button', { name: '退出', exact: true }).evaluate((button) => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => state.writes).toBe(1); await expect(page.getByRole('button', { name: '正在退出…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeVisible(); await capture(page, info, 'busy');
  state.releaseWrite?.(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel).toContainText('服务器已确认退出 1 个会话'); await expect(panel.locator('[data-session-row="sid_1"]')).toHaveCount(0);
  expect(state.readOffsets).toEqual([0, 0]);
  const writes = state.calls.filter((call) => call.method === 'POST'); expect(writes).toHaveLength(1);
  expect(writes[0].key).toMatch(/^[A-Za-z0-9._:-]{1,128}$/); expect(writes[0].path).toBe('/sessions/sid_1/revoke');
});

test('already revoked target reports zero and reads the authoritative list', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL);
  await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(10);
  await panel.locator('[data-session-row="sid_1"] button').click();
  state.rows = state.rows.filter((row) => row.session_id !== 'sid_1');
  await confirm(page); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('确认退出 0 个会话');
  await expect(panel.locator('[data-session-row="sid_1"]')).toHaveCount(0);
  expect(state.readOffsets).toEqual([0, 0]); expect(state.writes).toBe(1);
  await capture(page, info, 'zero-confirmed');
});

test('confirmed write with failed refresh remains confirmed and retries only GET', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL);
  await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(10);
  state.readStatus = 503;
  await panel.locator('[data-session-row="sid_1"] button').click(); await confirm(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('确认退出 1 个会话');
  await expect(panel.getByRole('alert')).toContainText('暂时保留上次结果');
  await expect(panel.locator('[data-session-row] button').first()).toBeDisabled();
  await capture(page, info, 'confirmed-refresh-error');
  state.readStatus = 200; await panel.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(panel.locator('[data-session-row="sid_1"]')).toHaveCount(0);
  expect(state.writes).toBe(1); expect(state.readOffsets).toEqual([0, 0, 0]);
});

test('revoke others retains current even when it is outside page one', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL, 21, 'zh-CN', 20);
  await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(10);
  await panel.getByRole('button', { name: '退出其他会话', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('保留当前 Portal 登录'); await confirm(page);
  await expect(panel.locator('[data-session-row]')).toHaveCount(1); await expect(panel).toContainText('当前会话');
  expect(state.active).toBe(true); expect(state.rows[0].session_id).toBe('sid_20');
  expect(state.readOffsets).toEqual([0, 0]); await capture(page, info, 'others-complete');
});

for (const mode of ['403', '404', '503-committed', '503-rollback', 'lost-committed', 'lost-active', 'readback-unavailable'] as const) {
  test(`write ${mode} always reads again without claiming a global outcome`, async ({ page, baseURL }, info) => {
    const { state, panel } = await fixture(page, baseURL); state.writeMode = mode;
    await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(10);
    await panel.locator('[data-session-row="sid_1"] button').click(); await confirm(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel.getByRole('status')).toContainText(mode === '403' ? '请求被拒绝' : mode === '404' ? '此会话已不可用' : '无法确认本次退出');
    if (mode === 'readback-unavailable') await expect(panel.getByRole('alert')).toContainText('暂时保留上次结果');
    else await expect(panel.getByRole('status')).toContainText('重新读取列表');
    expect(state.readOffsets).toEqual([0, 0]); expect(state.writes).toBe(1);
    await expect(page).toHaveURL(/\/portal\/account/); await capture(page, info, `write-${mode}`);
    if (mode === '503-committed' || mode === 'lost-committed') await expect(panel.locator('[data-session-row="sid_1"]')).toHaveCount(0);
    if (mode === 'readback-unavailable') await expect(panel.locator('[data-session-row] button').first()).toBeDisabled();
    if (mode === 'lost-active') {
      const firstKey = state.calls.find((call) => call.method === 'POST')?.key; state.writeMode = 'ok';
      await panel.locator('[data-session-row="sid_1"] button').click(); await confirm(page);
      await expect(panel.locator('[data-session-row="sid_1"]')).toHaveCount(0);
      expect(state.calls.filter((call) => call.method === 'POST')[1].key).not.toBe(firstKey);
    }
  });
}

for (const mode of ['ok', 'lost-ended'] as const) test(`current session ${mode} clears local state and creates a login document`, async ({ page, baseURL }) => {
  const { state, panel } = await fixture(page, baseURL); state.writeMode = mode;
  await open(page); await panel.locator('[data-session-row="sid_0"] button').click();
  await expect(page.getByRole('dialog')).toContainText('当前 Portal 登录将失效'); await confirm(page);
  await expect(page).toHaveURL(/\/portal\/login$/);
  expect(state.documents.some((url) => url.endsWith('/portal/login'))).toBe(true);
  await expect(page.locator('[data-portal-notification-badge]')).toHaveCount(0);
  expect(state.calls.some((call) => call.method === 'POST' && call.path === '/logout')).toBe(false);
});

test('list 401 invalidation returns to login while a 503 never logs out', async ({ page, baseURL }) => {
  const { state, panel } = await fixture(page, baseURL); state.readStatus = 503;
  await open(page); await expect(panel.getByRole('alert')).toBeVisible(); await expect(page).toHaveURL(/\/portal\/account/);
  state.readStatus = 401; await panel.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page).toHaveURL(/\/portal\/login$/);
});

test('late success from a closed scope cannot overwrite a newer list', async ({ page, baseURL }, info) => {
  const { state, panel } = await fixture(page, baseURL); state.holdRead = true;
  await open(page); await expect.poll(() => state.readStarted).toBe(true);
  await capture(page, info, 'loading'); await panel.getByRole('button', { name: '收起', exact: true }).click();
  state.rows = state.rows.slice(0, 1); await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(1);
  state.releaseRead?.(); await expect(panel.locator('[data-session-row]')).toHaveCount(1);
  await expect(panel).toContainText('共 1 个会话'); expect(state.writes).toBe(0);
});

test('late failure from a closed scope cannot poison newer data', async ({ page, baseURL }) => {
  const { state, panel } = await fixture(page, baseURL); state.readStatus = 503; state.holdRead = true;
  await open(page); await expect.poll(() => state.readStarted).toBe(true);
  await panel.getByRole('button', { name: '收起', exact: true }).click(); state.readStatus = 200;
  await open(page); await expect(panel.locator('[data-session-row]')).toHaveCount(10); state.releaseRead?.();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.locator('[data-session-row] button').first()).toBeEnabled();
});

test('a removed last row reads the real corrected page instead of relabeling the empty response', async ({ page, baseURL }) => {
  const { state, panel } = await fixture(page, baseURL);
  await open(page); await panel.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(panel.locator('[data-session-row="sid_10"]')).toBeVisible();
  await panel.getByRole('button', { name: '下一页', exact: true }).click(); await expect(panel.locator('[data-session-row="sid_20"]')).toBeVisible();
  await panel.locator('[data-session-row="sid_20"] button').click(); await confirm(page);
  await expect(panel.locator('[data-session-row="sid_10"]')).toBeVisible(); expect(state.readOffsets).toEqual([0, 10, 20, 20, 10]);
  await expect(panel).toContainText('第 11–20 条，共 20 个会话');
});

test('repeated shrink is bounded and leaves the last successful scope read-only', async ({ page, baseURL }) => {
  const { state, panel } = await fixture(page, baseURL);
  await open(page); await panel.getByRole('button', { name: '下一页', exact: true }).click(); await expect(panel.locator('[data-session-row="sid_10"]')).toBeVisible();
  await panel.getByRole('button', { name: '下一页', exact: true }).click(); await expect(panel.locator('[data-session-row="sid_20"]')).toBeVisible();
  state.readHook = (offset) => { state.rows = state.rows.slice(0, offset === 20 ? 11 : 1); };
  await panel.getByRole('button', { name: '刷新', exact: true }).click(); await expect(panel.getByRole('alert')).toContainText('暂时保留上次结果');
  expect(state.readOffsets).toEqual([0, 10, 20, 20, 10]); await expect(panel.locator('[data-session-row] button').first()).toBeDisabled();
});
