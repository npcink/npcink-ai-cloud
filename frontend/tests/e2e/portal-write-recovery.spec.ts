import { expect, test, type Page, type Route } from '@playwright/test';
import type { UseSessionReturn } from '../../src/hooks/useSession';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1050 } });
const title = 'Explicit recovery intention';
const description = 'Please inspect this synthetic support record.';
const ticket = (index: number) => ({ request_id: `recovery_${index}`, title, description, topic: 'general', status: 'open', created_at: '2026-10-25T00:00:00Z', updated_at: '2026-10-25T00:00:00Z' });
const reply = (route: Route, data: unknown, status = 200, error = '') => route.fulfill({ status, json: { status: status === 200 ? 'ok' : 'error', error_code: error, message: 'PRIVATE fixture', data, meta: { trace_id: 'recovery-reference', revision: 'm7' } } });

async function fixture(page: Page, baseURL: string | undefined, locale: 'en' | 'zh-CN', theme: 'light' | 'dark' = 'light') {
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Bound isolated loopback candidate required');
  const origin = new URL(baseURL).origin;
  const state = { unexpected: [] as string[], errors: [] as string[], posts: [] as { path: string; key: string; body: Record<string, unknown> }[], rows: [] as ReturnType<typeof ticket>[], mode: 'unknown', uploads: 0, sessionStatus: 200, siteId: '', sites: [] as { site_id: string; name: string; status: string; allowed_actions: string[] }[], holdSession: false, releaseSession: null as null | (() => void), sessionReads: 0 };
  await page.context().addCookies([{ name: 'npcink_portal_session_token', value: 'recovery-fixture', url: origin }]);
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('locale', locale); localStorage.setItem('theme', theme);
    const unhandled: string[] = []; Object.defineProperty(window, '__portalRecoveryUnhandled', { value: unhandled });
    window.addEventListener('unhandledrejection', (event) => unhandled.push(String(event.reason)));
    for (const id of ['site_a', 'site_b']) sessionStorage.setItem(`npcink.portal.journey.sent.v1:${id}:login:succeeded`, '1');
  }, { locale, theme });
  page.on('pageerror', (error) => state.errors.push(error.message));
  const session = () => ({ email: 'recovery@example.test', sites: state.sites, selected_context: state.siteId ? { site: state.sites.find((s) => s.site_id === state.siteId), allowed_actions: [], current_subscription: null } : null, auth_mode: 'jwt', session: { state: 'active', transport: 'cookie', revocable: true } });
  await page.context().route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname; const method = request.method();
    if (url.origin === origin) {
      if (method === 'GET' && !path.startsWith('/api/')) return route.continue();
      if (method === 'GET' && path === '/api/portal/session') {
        state.sessionReads += 1; const payload = session(); const status = state.sessionStatus;
        if (state.holdSession) { state.holdSession = false; await new Promise<void>((resolve) => { state.releaseSession = resolve; }); }
        return reply(route, payload, status, status === 200 ? '' : 'service.unavailable');
      }
      if (method === 'POST' && path === '/api/portal/session/site') { state.siteId = request.postDataJSON().site_id; return reply(route, session()); }
      if (method === 'POST' && path === '/api/portal/logout') return reply(route, {});
      if (method === 'GET' && path === '/api/portal/totp/challenge/status') return reply(route, { challenge_status: 'missing' }, 401, 'auth.portal_factor_invalid');
      if (method === 'GET' && path === '/api/portal/notifications') return reply(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0 });
      if (method === 'GET' && path === '/api/portal/auth/login-options') return reply(route, { qq_available: false });
      if (path === '/api/portal/support-requests' && method === 'GET') return reply(route, { summary: { open: state.rows.length, in_progress: 0, resolved: 0, closed: 0 }, items: state.rows, pagination: { limit: 10, offset: 0, total: state.rows.length, has_more: false } });
      if (path === '/api/portal/support-requests/recovery_0' && method === 'GET') return reply(route, { request: ticket(0), messages: [], attachments: [], feedback: null });
      if (method === 'POST' && (path === '/api/portal/support-requests' || path === '/api/portal/support-requests/recovery_0/messages')) {
        const key = request.headers()['idempotency-key']; expect(key).toBeTruthy();
        state.posts.push({ path, key, body: request.postDataJSON() });
        if (state.mode === 'success') { const row = ticket(state.rows.length); state.rows.push(row); return reply(route, { request: row }); }
        if (state.rows.length === 0) state.rows.push(ticket(0));
        return reply(route, {}, state.posts.length === 1 ? 503 : 409, state.posts.length === 1 ? 'portal.idempotency_persist_failed' : 'portal.idempotency_indeterminate');
      }
      if (method === 'POST' && path === '/api/portal/support-requests/recovery_0/attachments') {
        state.uploads += 1; const payload = request.postDataJSON(); return reply(route, { attachment: { attachment_id: 'uploaded_note', request_id: 'recovery_0', filename: payload.filename, byte_size: 7, content_type: 'text/plain' } });
      }
    }
    state.unexpected.push(`${method} ${url.origin}${path}`); await route.abort('blockedbyclient');
  });
  return state;
}
async function openForm(page: Page) {
  await page.locator('[data-portal-support="submit-ticket"]').click();
  const form = page.locator('[data-portal-support="new-ticket-dialog"]');
  await form.locator('input').fill(title); await form.locator('textarea').fill(description);
  return form;
}
const submit = (page: Page) => page.locator('[data-portal-support="new-ticket-dialog"]').getByRole('button', { name: /^(Submit|提交)$/ });
const unknownCopy = (locale: string) => locale === 'en' ? 'Cloud could not confirm whether this change completed. Check the current record before trying again.' : 'Cloud 无法确认本次更改是否已经完成。再次操作前，请先检查当前记录。';

for (const locale of ['zh-CN', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
  test(`[F01-20] ${locale} ${theme} committed-but-unknown ordinary write keeps its key and offers honest readback`, async ({ page, baseURL }, info) => {
    const state = await fixture(page, baseURL, locale, theme);
    await page.goto('/portal/support'); await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') }); await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    const form = await openForm(page); await submit(page).click();
    await expect(form.getByRole('alert')).toHaveText(unknownCopy(locale));
    expect(state.posts).toHaveLength(1); expect(state.rows).toHaveLength(1);
    await page.clock.fastForward(7 * 86400 * 1000); expect(state.posts).toHaveLength(1);
    await submit(page).click(); await expect(submit(page)).toBeEnabled();
    expect(state.posts).toHaveLength(2); expect(state.posts[0].key).toBe(state.posts[1].key); expect(state.rows).toHaveLength(1);
    await expect(form.getByRole('alert')).toHaveText(unknownCopy(locale));
    await expect(page.locator('body')).not.toContainText('PRIVATE');
    await page.screenshot({ path: info.outputPath('unknown-write.png'), fullPage: true });
    await form.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    // A real UI filter refresh reads the committed fixture; closing the dialog is not rollback.
    await page.getByRole('tab', { name: /^(Open|待处理)$/ }).click();
    await expect(page.locator('[data-portal-support="tickets-table"]')).toContainText(title);
    expect(state.posts).toHaveLength(2); expect(state.rows).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('readback-record.png'), fullPage: true });
    await info.attach('write-evidence', { body: JSON.stringify(state), contentType: 'application/json' });
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __portalRecoveryUnhandled: string[] }).__portalRecoveryUnhandled)).toEqual([]);
  });
}

test('[F01-21] confirmed success allows an independent identical ordinary intention', async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL, 'zh-CN'); state.mode = 'success';
  await page.goto('/portal/support');
  for (let index = 0; index < 2; index += 1) {
    const form = await openForm(page); await submit(page).click(); await expect(form).toHaveCount(0);
    expect(state.posts).toHaveLength(index + 1); expect(state.rows).toHaveLength(index + 1);
  }
  expect(state.posts[0].key).not.toBe(state.posts[1].key); expect(state.posts[0].body).toEqual(state.posts[1].body);
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

test('[F01-22] unknown reply preserves uploaded attachment IDs without reupload or false bubble', async ({ page, baseURL }, info) => {
  const state = await fixture(page, baseURL, 'zh-CN');
  await page.goto('/portal/support/recovery_0');
  await page.locator('[data-portal-support="composer-attach-input"]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.locator('textarea').fill(description); expect(state.uploads).toBe(0);
  const send = page.getByRole('button', { name: '发送回复', exact: true });
  await send.click(); await expect(send).toBeEnabled();
  expect(state.uploads).toBe(1); expect(state.posts).toHaveLength(1);
  await expect(page.locator('[data-portal-support="bubble-customer"]')).toHaveCount(0);
  await expect(page.locator('textarea')).toHaveValue(description);
  await send.click(); await expect(send).toBeEnabled();
  expect(state.uploads).toBe(1); expect(state.posts).toHaveLength(2);
  expect(state.posts[0].body.attachment_ids).toEqual(['uploaded_note']); expect(state.posts[1].body).toEqual(state.posts[0].body);
  expect(state.posts[0].key).toBe(state.posts[1].key);
  await expect(page.locator('[data-portal-support="bubble-customer"]')).toHaveCount(0);
  await expect(page.locator('[data-portal-support="attachment-chip"]')).toContainText('note.txt');
  await page.screenshot({ path: info.outputPath('unknown-reply.png'), fullPage: true });
  await info.attach('attachment-evidence', { body: JSON.stringify(state), contentType: 'application/json' });
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

// Integration probe of the mounted production hook through its React provider.
// No product globals/debug endpoint, module mock, reload, or fake hook implementation.
async function sessionAction(page: Page, action: 'refresh' | 'selectSite' | 'clearSession' | 'logout' | 'accept' | 'challenge' | 'state', siteId = '') {
  return page.evaluate(async ({ action, siteId }) => {
    type Fiber = { return?: Fiber; memoizedProps?: { value?: UseSessionReturn } };
    let controller: UseSessionReturn | undefined;
    for (const element of document.querySelectorAll('*')) {
      const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'));
      if (!key) continue;
      let fiber: Fiber | undefined = (element as unknown as Record<string, Fiber>)[key];
      while (fiber) {
        const value = fiber.memoizedProps?.value;
        if (value && typeof value.refresh === 'function' && typeof value.clearSession === 'function') { controller = value; break; }
        fiber = fiber.return;
      }
      if (controller) break;
    }
    if (!controller) throw new Error('Mounted Portal session provider not found');
    if (action === 'state') return { authenticated: controller.isAuthenticated, siteId: controller.session?.selected_context?.site.site_id || '', secondFactor: !!controller.secondFactor };
    if (action === 'selectSite') await controller.selectSite(siteId);
    else if (action === 'accept' || action === 'challenge') await controller.verifyRegistrationResult(action === 'challenge' ? { status: 'second_factor_required', methods: ['totp'], challenge_id: null, expires_at: null, expires_in_seconds: 300, primary_method: 'email_code' } : { email: 'accepted@example.test', sites: [], selected_context: null, auth_mode: 'jwt', session: { state: 'active', transport: 'cookie', issued_at: '', expires_at: '', revocable: true } });
    else { try { await controller[action](); } catch { /* The probe owns this rejected refresh. */ } }
    return null;
  }, { action, siteId });
}

test('[F01-24 F04-05] mounted hook keeps ordinary and transient refresh intentions, scopes sites, resets auth epochs and retires stale reads', async ({ page, baseURL }, info) => {
  const state = await fixture(page, baseURL, 'zh-CN');
  state.sites = ['site_a', 'site_b'].map((site_id) => ({ site_id, name: site_id, status: 'active', allowed_actions: [] })); state.siteId = 'site_a';
  await page.goto('/portal/support');
  const write = async () => { await openForm(page); await submit(page).click(); await expect(submit(page)).toBeEnabled(); await page.locator('[data-portal-support="new-ticket-dialog"]').getByRole('button', { name: '取消', exact: true }).click(); return state.posts.at(-1)!.key; };
  const first = await write();
  await sessionAction(page, 'refresh'); expect(await write()).toBe(first);
  state.sessionStatus = 503; await sessionAction(page, 'refresh');
  expect(await sessionAction(page, 'state')).toMatchObject({ authenticated: true, siteId: 'site_a' }); expect(await write()).toBe(first);
  state.sessionStatus = 200;
  await sessionAction(page, 'selectSite', 'site_b'); const other = await write(); expect(other).not.toBe(first);
  await sessionAction(page, 'selectSite', 'site_a'); expect(await write()).toBe(first);
  await sessionAction(page, 'accept'); const accepted = await write(); expect(accepted).not.toBe(first);
  // Local clear while GET is pending: its old projection may not resurrect auth.
  state.holdSession = true;
  const refresh = sessionAction(page, 'refresh'); await expect.poll(() => state.releaseSession !== null).toBe(true);
  await sessionAction(page, 'clearSession'); state.releaseSession!(); await refresh;
  await expect.poll(async () => (await sessionAction(page, 'state'))?.authenticated).toBe(false);
  await sessionAction(page, 'accept'); const cleared = await write(); expect(cleared).not.toBe(accepted);
  await sessionAction(page, 'challenge'); await expect.poll(async () => (await sessionAction(page, 'state'))?.secondFactor).toBe(true);
  await sessionAction(page, 'accept'); const challenged = await write(); expect(challenged).not.toBe(cleared);
  await sessionAction(page, 'logout'); await expect.poll(async () => (await sessionAction(page, 'state'))?.authenticated).toBe(false);
  await sessionAction(page, 'accept'); expect(await write()).not.toBe(challenged);
  await info.attach('mounted-hook-evidence', { body: JSON.stringify({ ...state, probe: 'React provider public hook return; same document' }), contentType: 'application/json' });
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});
