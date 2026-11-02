import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import { collectBrowserEvents, noUnexpectedBrowserEvents } from './helpers/browser-event-inventory';
import { supportDetail, supportTicket, supportMessage, supportAttachment } from '../fixtures/admin-support-detail';
import type { SupportAction, SupportIntent } from '@/features/admin/support-requests/detail-evidence';

const actor = 'platform:operator-e2e', target = 'sr_synthetic', key = `admin.support-intent.v1:${target}`;
const inventories = new WeakMap<Page, ReturnType<typeof collectBrowserEvents>>();
const unmatched = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  inventories.set(page, collectBrowserEvents(page));
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
});
test.afterEach(async ({ page }, info) => {
  const events = inventories.get(page)!;
  const inventory = { test: info.title, statusAtCollection: info.status, ...events.raw, classified: events.classify() };
  const path = await evidencePath(info, `events-${info.title.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 145)}.json`);
  await writeFile(path, JSON.stringify(inventory, null, 2));
  await info.attach('browser-event-inventory', { path, contentType: 'application/json' });
  expect(inventory.classified.unexpected).toEqual(noUnexpectedBrowserEvents);
  expect(unmatched.get(page) || []).toEqual([]);
});
async function evidencePath(info: TestInfo, name: string) {
  const root = process.env.NPCINK_SUPPORT_EVIDENCE;
  if (root) await mkdir(root, { recursive: true });
  return root ? `${root}/${name}` : info.outputPath(name);
}
const reply = (p: Page) => p.getByRole('textbox', { name: 'Public reply', exact: true });
const note = (p: Page) => p.getByRole('textbox', { name: 'Internal note', exact: true });
const send = (p: Page) => p.locator('[data-ui="support-public-action"]');
const status = (p: Page) => p.locator('[data-ui="support-status-action"]');
const saveNote = (p: Page) => p.locator('[data-ui="support-internal-action"]');
const upload = (p: Page) => p.locator('[data-ui="support-attachment-action"]');
const pending = (p: Page) => p.locator('[data-ui="support-operation-recovery"]');
const confirm = (p: Page) => pending(p).getByRole('button', { name: 'Check submitted operation', exact: true });
async function attachments(p: Page) { await p.locator('summary').filter({ hasText: /^Attachments/ }).click(); }
async function open(p: Page) {
  await p.goto(`/admin/support-requests/${target}`);
  await expect(status(p)).toBeEnabled();
}
function digest(action: string, values: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify({ action, values: Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) })).digest('hex');
}
function result(intent: SupportIntent, sequence = 1) {
  const request = { ...supportTicket(intent.request_id), ...(intent.action === 'status' ? { status: intent.values.status } : {}) };
  const suffix = intent.action === 'status' ? '' : intent.action === 'message' ? '/messages' : '/attachments';
  const kind = { message: 'message_created', attachment: 'attachment_created', status: 'updated' }[intent.action];
  return { request, operation_receipt: { request_id: intent.request_id, operation_id: intent.operation_id, action: intent.action, digest: intent.digest,
    actor_ref: actor, actor_kind: 'platform_admin', method: intent.method, path: `/internal/service/admin/support-requests/${intent.request_id}${suffix}`,
    event_kind: `support_request.${kind}`, event_id: 1, created_at: intent.created_at,
    message_id: intent.action === 'message' ? `message_synthetic_${sequence}` : null, attachment_id: intent.action === 'attachment' ? `attachment_synthetic_${sequence}` : null },
    ...(intent.action === 'message' ? { message: { ...supportMessage(intent.request_id), ...intent.values, message_id: `message_synthetic_${sequence}` } } : {}),
    ...(intent.action === 'attachment' ? { attachment: { ...supportAttachment(intent.request_id), ...intent.body, attachment_id: `attachment_synthetic_${sequence}`, byte_size: intent.byte_size } } : {}),
    notification: { delivered: true } };
}
type Mode = 'normal' | 'lost' | 'bad' | 'target' | 'body' | 'visibility' | 'rejected' | 'delay' | 'mail-failed' | 'http503' | 'replay-blocked';
async function harness(page: Page) {
  const unhandled: string[] = []; unmatched.set(page, unhandled);
  await installAdminMocks(page, { unhandledAdminRequests: unhandled });
  const state = { mode: 'normal' as Mode, read: 'normal', confirmation: 'normal', confirmationStatus: 0, identity: actor,
    writes: [] as SupportIntent[], reads: [] as string[], committed: new Map<string, ReturnType<typeof result>>(),
    detail: new Map<string, ReturnType<typeof supportDetail>>(), release: () => {}, unhandled };
  await page.route('**/admin/session', route => route.fulfill({ json: buildAdminApiEnvelope({ principal_id: state.identity, identity_type: 'platform_admin', role: 'platform_admin', capabilities: { can_manage_accounts: true } }) }));
  await page.route('**/api/admin/support-requests/**', async route => {
    const req = route.request(), url = new URL(req.url()), id = url.pathname.split('/')[4];
    const fail = async (http: number, code = 'service.unavailable') => {
      inventories.get(page)!.injectFailure(req, 'Synthetic request-bound failure', { status: http });
      await route.fulfill({ status: http, json: buildAdminApiErrorEnvelope('Synthetic failure', code) });
    };
    if (url.pathname.includes('/operations/')) {
      state.reads.push(url.pathname);
      if (state.confirmationStatus) { await fail(state.confirmationStatus); return; }
      const operation = decodeURIComponent(url.pathname.split('/').at(-1)!);
      const saved = state.committed.get(operation);
      const value = { request_id: id, operation_id: operation, action: url.searchParams.get('action'), digest: url.searchParams.get('digest'),
        state: saved && state.confirmation !== 'missing' ? 'confirmed' : 'unconfirmed', result: saved && state.confirmation !== 'missing' ? saved : null };
      await route.fulfill({ json: buildAdminApiEnvelope(state.confirmation === 'bad' ? {} : state.confirmation === 'wrong' ? { ...value, operation_id: 'other' } : value) }); return;
    }
    if (req.method() === 'GET' && /^\/api\/admin\/support-requests\/[^/]+$/.test(url.pathname)) {
      state.reads.push(url.pathname);
      if (state.read === 'failed') { await fail(503); return; }
      const detail = state.detail.get(id) || supportDetail(id);
      const value = state.read === 'wrong' ? supportDetail('other') : state.read === 'children' ? { ...detail, messages: [null, supportMessage(id), { ...supportMessage(id), message_id: 'foreign', request_id: 'other' }], attachments: [null] } : detail;
      await route.fulfill({ json: buildAdminApiEnvelope(value) }); return;
    }
    if (!['POST', 'PATCH'].includes(req.method()) || !/^\/api\/admin\/support-requests\/[^/]+(?:\/(?:messages|attachments))?$/.test(url.pathname)) {
      state.unhandled.push(`${req.method()} ${url.pathname}`); await fail(500); return;
    }
    const action: SupportAction = req.method() === 'PATCH' ? 'status' : url.pathname.endsWith('/messages') ? 'message' : 'attachment';
    const payload = req.postDataJSON() as Record<string, string>;
    const { content_base64: content, ...body } = payload;
    const values = action === 'attachment' ? { ...body, content_sha256: createHash('sha256').update(Buffer.from(content, 'base64')).digest('hex') } : body;
    const intent: SupportIntent = { request_id: id, account_id: 'acct_synthetic', actor_kind: 'platform_admin', actor_ref: actor, action, body, values,
      method: action === 'status' ? 'PATCH' : 'POST', path: url.pathname, operation_id: req.headers()['idempotency-key'], digest: digest(action, values),
      revision: 1, created_at: '2026-11-01T02:00:00Z', ...(content ? { byte_size: Buffer.from(content, 'base64').length } : {}) };
    state.writes.push(intent);
    if (state.mode === 'rejected') { await fail(422, 'request.validation_error'); return; }
    const saved = result(intent, state.writes.length), detail = state.detail.get(id) || supportDetail(id);
    saved.request = { ...detail.request, ...(action === 'status' ? { status: intent.values.status } : {}) };
    detail.request = saved.request;
    if (saved.message) detail.messages.push(saved.message);
    if (saved.attachment) detail.attachments.push(saved.attachment);
    state.detail.set(id, detail); state.committed.set(intent.operation_id, saved);
    if (state.mode === 'http503' || state.mode === 'replay-blocked') { await fail(state.mode === 'http503' ? 503 : 409, state.mode === 'http503' ? 'service.unavailable' : 'auth.replay_blocked'); return; }
    if (state.mode === 'lost') {
      inventories.get(page)!.injectFailure(req, 'Synthetic post-commit response loss', { failure: 'net::ERR_CONNECTION_RESET' });
      await route.abort('connectionreset'); return;
    }
    if (state.mode === 'delay') await new Promise<void>(resolve => { state.release = resolve; });
    let response: unknown = saved;
    if (state.mode === 'bad') response = {};
    if (state.mode === 'target') response = { ...saved, request: supportTicket('other') };
    if (state.mode === 'body') response = { ...saved, message: { ...saved.message, body: 'Wrong response text' } };
    if (state.mode === 'visibility') response = { ...saved, message: { ...saved.message, visibility: 'internal' } };
    if (state.mode === 'mail-failed') response = { ...saved, notification: { delivered: false } };
    await route.fulfill({ json: buildAdminApiEnvelope(response) });
  });
  return state;
}
async function visual(page: Page, info: TestInfo, width: number, state: string) {
  await page.setViewportSize({ width, height: 1050 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const geometry = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight, bodyHeight: document.body.getBoundingClientRect().height, scrollY: window.scrollY,
    headings: Array.from(document.querySelectorAll('main h1')).map(h => ({ text: h.textContent, y: h.getBoundingClientRect().y })),
    banners: Array.from(document.querySelectorAll('header')).map(h => ({ y: h.getBoundingClientRect().y, height: h.getBoundingClientRect().height })) }));
  const path = await evidencePath(info, `pc-${width}-${state}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await page.screenshot({ path: await evidencePath(info, `pc-${width}-${state}-viewport.png`), fullPage: false, animations: 'disabled' });
  const receipt = { viewport: page.viewportSize(), route: '/admin/support-requests/[requestId]', state, geometry, titleCount: await page.locator('main h1').count(),
    pendingVisible: await pending(page).isVisible(), disabledWrites: await Promise.all([send(page), status(page), saveNote(page)].map(b => b.isDisabled())),
    data: 'synthetic-only', humanAcceptance: 'pending', screenshot: path.split('/').at(-1) };
  await writeFile(await evidencePath(info, `pc-${width}-${state}.json`), JSON.stringify(receipt, null, 2));
  expect(receipt.titleCount).toBe(1); expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

test('normal public internal status and attachment writes are target-bound and serial', async ({ page }, info) => {
  const h = await harness(page); await open(page);
  await reply(page).fill('Synthetic public reply'); await send(page).click();
  await expect(reply(page)).toHaveValue(''); await expect(page.getByText('Reply sent and customer notified.', { exact: true })).toBeVisible();
  await note(page).fill('Synthetic internal note'); await saveNote(page).click(); await expect(note(page)).toHaveValue('');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('resolved'); await status(page).click(); await expect(status(page)).toBeEnabled();
  await attachments(page); await page.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'proof.txt', mimeType: 'text/plain', buffer: Buffer.from('proof') });
  await upload(page).click(); await expect(upload(page)).toBeDisabled(); await expect(page.getByText('proof.txt', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('resolved');
  expect(h.writes.map(w => [w.action, w.values.visibility || w.values.status])).toEqual([['message', 'public'], ['message', 'internal'], ['status', 'resolved'], ['attachment', 'public']]);
  expect(new Set(h.writes.map(w => w.operation_id)).size).toBe(4); expect(h.unhandled).toEqual([]);
  await visual(page, info, 1440, 'normal'); await visual(page, info, 1056, 'normal');
});
for (const mode of ['lost', 'bad', 'target', 'body', 'visibility', 'http503', 'replay-blocked'] as Mode[]) test(`${mode} success stays unknown across reload until original GET evidence`, async ({ page }, info) => {
  const h = await harness(page); h.mode = mode; await open(page);
  await reply(page).fill('Synthetic intended reply'); await send(page).click();
  await expect(confirm(page)).toBeEnabled(); await expect(reply(page)).toHaveValue('Synthetic intended reply'); await expect(send(page)).toBeDisabled();
  const original = await page.evaluate(k => sessionStorage.getItem(k), key);
  expect(JSON.parse(original!).operation_id).toBe(h.writes[0].operation_id);
  if (mode === 'lost') { await visual(page, info, 1440, 'unknown'); await visual(page, info, 1056, 'unknown'); }
  await inventories.get(page)!.beforeReload(); await page.reload(); await expect(confirm(page)).toBeEnabled();
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBe(original);
  await expect(reply(page)).toHaveValue('Synthetic intended reply'); await confirm(page).click();
  await expect(pending(page)).toHaveCount(0); await expect(reply(page)).toHaveValue('');
  expect(h.writes).toHaveLength(1); expect(h.committed.size).toBe(1); expect(h.reads.some(r => r.includes('/operations/'))).toBe(true); expect(h.unhandled).toEqual([]);
});
for (const confirmation of ['missing', 'bad', 'wrong', '401', '403', '409', '422', '503']) test(`confirmation ${confirmation} never releases unknown write`, async ({ page }) => {
  const h = await harness(page); h.mode = 'lost'; await open(page); await reply(page).fill('Synthetic intent'); await send(page).click(); await expect(confirm(page)).toBeEnabled();
  if (/^\d/.test(confirmation)) h.confirmationStatus = Number(confirmation); else h.confirmation = confirmation;
  await confirm(page).click(); await expect(confirm(page)).toBeEnabled(); await expect(send(page)).toBeDisabled(); await expect(reply(page)).toHaveValue('Synthetic intent');
  expect(h.writes).toHaveLength(1); expect(await page.evaluate(k => sessionStorage.getItem(k), key)).not.toBeNull();
});
test('explicit rejection retains ordinary drafts and permits a distinct retry', async ({ page }) => {
  const h = await harness(page); h.mode = 'rejected'; await open(page); await reply(page).fill('Synthetic reply'); await note(page).fill('Other draft');
  await send(page).click(); await expect(page.getByText('This request was rejected before it was saved. Your draft is retained.', { exact: true })).toBeVisible();
  await expect(send(page)).toBeEnabled(); await expect(note(page)).toHaveValue('Other draft');
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBeNull(); h.mode = 'normal'; await send(page).click();
  await expect(reply(page)).toHaveValue(''); await expect(note(page)).toHaveValue('Other draft'); expect(h.writes).toHaveLength(2);
  expect(h.writes[0].operation_id).not.toBe(h.writes[1].operation_id);
});
test('mail failure is saved rather than an unsaved retry', async ({ page }) => {
  const h = await harness(page); h.mode = 'mail-failed'; await open(page); await reply(page).fill('Synthetic reply'); await send(page).click();
  await expect(page.getByText('Reply saved. Email notification was not delivered.', { exact: true })).toBeVisible(); await expect(reply(page)).toHaveValue(''); expect(h.writes).toHaveLength(1);
});
test('double click and all cross actions stay blocked until the single response', async ({ page }) => {
  const h = await harness(page); h.mode = 'delay'; await open(page); await reply(page).fill('Synthetic reply'); await note(page).fill('Other note');
  await attachments(page); await page.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'proof.txt', mimeType: 'text/plain', buffer: Buffer.from('proof') });
  await send(page).evaluate(b => { (b as HTMLButtonElement).click(); (b as HTMLButtonElement).click(); });
  await expect.poll(() => h.writes.length).toBe(1);
  for (const b of [send(page), status(page), saveNote(page), upload(page)]) await expect(b).toBeDisabled();
  await status(page).evaluate(b => (b as HTMLButtonElement).click()); await saveNote(page).evaluate(b => (b as HTMLButtonElement).click());
  expect(h.writes).toHaveLength(1); h.release(); await expect(reply(page)).toHaveValue(''); await expect(note(page)).toHaveValue('Other note');
});
for (const initial of ['failed', 'wrong']) test(`initial ${initial} detail disables writes then GET retry preserves drafts`, async ({ page }, info) => {
  const h = await harness(page); h.read = initial; await page.goto(`/admin/support-requests/${target}`);
  const recovery = page.locator('[data-ui="support-read-recovery"]'); await expect(recovery).toBeVisible();
  await reply(page).fill('Ordinary draft'); await note(page).fill('Other draft');
  for (const b of [send(page), status(page), saveNote(page)]) await expect(b).toBeDisabled(); expect(h.writes).toHaveLength(0);
  if (initial === 'failed') { await visual(page, info, 1440, 'read-failed'); await visual(page, info, 1056, 'read-failed'); }
  h.read = 'normal'; await recovery.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(status(page)).toBeEnabled();
  await expect(reply(page)).toHaveValue('Ordinary draft'); await expect(note(page)).toHaveValue('Other draft'); expect(h.writes).toHaveLength(0);
});
test('invalid children remain local visible issues and GET retry retains draft and unknown', async ({ page }, info) => {
  const h = await harness(page); h.read = 'children'; await open(page); const issues = page.locator('[data-ui="support-child-issues"]'); await expect(issues).toBeVisible();
  await expect(page.getByText('Intended reply', { exact: true })).toBeVisible(); await note(page).fill('Other draft'); await reply(page).fill('Pending draft');
  h.mode = 'lost'; await send(page).click(); await expect(confirm(page)).toBeEnabled();
  h.read = 'normal'; await issues.getByRole('button', { name: 'Retry', exact: true }).click(); await expect(issues).toHaveCount(0);
  await expect(confirm(page)).toBeEnabled(); await expect(reply(page)).toHaveValue('Pending draft'); await expect(note(page)).toHaveValue('Other draft'); expect(h.writes).toHaveLength(1);
  await visual(page, info, 1056, 'retry-pending');
});
for (const failure of ['getItem', 'setItem', 'removeItem']) test(`storage ${failure} failure closes writes`, async ({ page }) => {
  const h = await harness(page);
  if (failure === 'getItem') await page.addInitScript(() => { const original = Storage.prototype.getItem; Storage.prototype.getItem = function(k) { if (k.startsWith('admin.support-intent.')) throw new Error('Synthetic storage blocked'); return original.call(this, k); }; });
  await page.goto(`/admin/support-requests/${target}`);
  await expect(reply(page)).toBeVisible();
  if (failure !== 'getItem') {
    await expect(status(page)).toBeEnabled();
    await page.evaluate(method => { Storage.prototype[method] = function() { throw new Error('Synthetic storage failure'); }; }, failure as 'setItem' | 'removeItem');
    await reply(page).fill('Synthetic reply'); await send(page).click();
  }
  await expect(page.getByText('Recovery storage or operator identity is unavailable. Writes are blocked; keep this tab and restore access before continuing.', { exact: true })).toBeVisible();
  await expect(status(page)).toBeDisabled(); expect(h.writes).toHaveLength(failure === 'removeItem' ? 1 : 0);
});
test('five MB attachment persists only minimal unknown evidence and confirms without upload replay', async ({ page }) => {
  const h = await harness(page); h.mode = 'lost'; await open(page); await attachments(page);
  await page.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'five-mb.txt', mimeType: 'text/plain', buffer: Buffer.alloc(5 * 1024 * 1024, 120) });
  await upload(page).click(); await expect(confirm(page)).toBeEnabled();
  const raw = await page.evaluate(k => sessionStorage.getItem(k), key), stored = JSON.parse(raw!);
  expect(raw!.length).toBeLessThan(2048); expect(raw).not.toContain('content_base64'); expect(stored.byte_size).toBe(5 * 1024 * 1024); expect(stored.values.content_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(h.writes[0].byte_size).toBe(5 * 1024 * 1024);
  await inventories.get(page)!.beforeReload(); await page.reload(); await expect(confirm(page)).toBeEnabled(); await confirm(page).click(); await expect(pending(page)).toHaveCount(0); expect(h.writes).toHaveLength(1);
});
test('late response cannot clear original intent or mutate another target', async ({ page }) => {
  const h = await harness(page); h.mode = 'delay'; await open(page); await reply(page).fill('Original target draft'); await send(page).click(); await expect.poll(() => h.writes.length).toBe(1);
  await page.route('**/api/admin/support-requests?*', route => route.fulfill({ json: buildAdminApiEnvelope({ items: [supportTicket('sr_other')], pagination: { total: 1, limit: 100, offset: 0, has_more: false }, summary: {} }) }));
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await page.getByRole('link', { name: 'Open conversation', exact: true }).click();
  await expect(page).toHaveURL(/sr_other/); await expect(page.locator('main h1')).toHaveText('Synthetic ticket sr_other'); await expect(status(page)).toBeEnabled();
  await reply(page).fill('New target draft'); h.release(); await expect(reply(page)).toHaveValue('New target draft'); await expect(pending(page)).toHaveCount(0);
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).not.toBeNull(); expect(h.writes).toHaveLength(1);
});

test('historical status confirmation reads the later current status and preserves unrelated note', async ({ page }) => {
  const h = await harness(page); h.mode = 'lost'; await open(page); await note(page).fill('Unsubmitted note');
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('resolved'); await status(page).click(); await expect(confirm(page)).toBeEnabled();
  const current = h.detail.get(target)!; current.request = { ...current.request, status: 'closed' };
  await confirm(page).click(); await expect(pending(page)).toHaveCount(0); await expect(status(page)).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('closed'); await expect(note(page)).toHaveValue('Unsubmitted note'); expect(h.writes).toHaveLength(1);
});
test('changed actor cannot confirm or adopt another operator stored intent', async ({ page }) => {
  const h = await harness(page); h.mode = 'lost'; await open(page); await reply(page).fill('Original actor intent'); await send(page).click(); await expect(confirm(page)).toBeEnabled();
  h.identity = 'platform:another-operator'; await confirm(page).click(); await expect(confirm(page)).toBeDisabled();
  expect(h.reads.filter(r => r.includes('/operations/'))).toHaveLength(0);
  await inventories.get(page)!.beforeReload(); await page.reload(); await expect(status(page)).toBeDisabled();
  await expect(page.getByText('Recovery storage or operator identity is unavailable. Writes are blocked; keep this tab and restore access before continuing.', { exact: true })).toBeVisible();
  expect(h.writes).toHaveLength(1); expect(await page.evaluate(k => sessionStorage.getItem(k), key)).not.toBeNull();
});

test('changed stored snapshot cannot be cleared by a late success with the same key', async ({ page }) => {
  const h = await harness(page); h.mode = 'delay'; await open(page); await reply(page).fill('Synthetic immutable intent'); await send(page).click();
  await expect.poll(() => h.writes.length).toBe(1);
  await page.evaluate(k => { const intent = JSON.parse(sessionStorage.getItem(k)!); intent.created_at = '2026-11-01T03:00:00Z'; sessionStorage.setItem(k, JSON.stringify(intent)); }, key);
  h.release();
  await expect(page.getByText('Recovery storage or operator identity is unavailable. Writes are blocked; keep this tab and restore access before continuing.', { exact: true })).toBeVisible();
  await expect(status(page)).toBeDisabled(); await expect(reply(page)).toHaveValue('Synthetic immutable intent');
  expect(h.writes).toHaveLength(1); expect(await page.evaluate(k => sessionStorage.getItem(k), key)).not.toBeNull();
});

test('restoring a stored digest keeps all writes closed until verification finishes', async ({ page }) => {
  const h = await harness(page); h.mode = 'lost'; await open(page); await reply(page).fill('Synthetic stored intent'); await send(page).click(); await expect(confirm(page)).toBeEnabled();
  await page.addInitScript(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'digest', { value: (...args: Parameters<SubtleCrypto['digest']>) => {
      if (!new TextDecoder().decode(args[1]).startsWith('{"action":"message","values":')) return original(...args);
      return new Promise<ArrayBuffer>(resolve => {
      (window as Window & { releaseSupportDigest?: () => void }).releaseSupportDigest = () => { void original(...args).then(resolve); };
    }); } });
  });
  await inventories.get(page)!.beforeReload(); await page.reload();
  await expect(page.locator('main h1')).toHaveText('Synthetic ticket sr_synthetic');
  await expect.poll(() => page.evaluate(() => typeof (window as Window & { releaseSupportDigest?: () => void }).releaseSupportDigest)).toBe('function');
  await expect(status(page)).toBeDisabled(); expect(h.writes).toHaveLength(1);
  await page.evaluate(() => (window as Window & { releaseSupportDigest?: () => void }).releaseSupportDigest?.());
  await expect(confirm(page)).toBeEnabled(); await expect(status(page)).toBeDisabled(); await expect(reply(page)).toHaveValue('Synthetic stored intent'); expect(h.writes).toHaveLength(1);
});
