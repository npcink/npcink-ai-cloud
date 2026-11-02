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
    directoryMode: 'normal', rows: [{ ...supportTicket(), admin_note: 'Historical internal note', waiting_on: 'operator' }], directoryReads: [] as string[],
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
      state.reads.push(url.pathname + url.search);
      if (state.confirmationStatus) { await fail(state.confirmationStatus); return; }
      const operation = decodeURIComponent(url.pathname.split('/').at(-1)!);
      const saved = state.committed.get(operation);
      const matches = saved && saved.operation_receipt.digest === url.searchParams.get('digest') && saved.operation_receipt.action === url.searchParams.get('action');
      const value = { request_id: id, operation_id: operation, action: url.searchParams.get('action'), digest: url.searchParams.get('digest'),
        state: matches && state.confirmation !== 'missing' ? 'confirmed' : 'unconfirmed', result: matches && state.confirmation !== 'missing' ? saved : null };
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
    saved.request = { ...detail.request, ...(action === 'status' ? { status: intent.values.status, admin_note: intent.values.admin_note || detail.request.admin_note } : {}) };
    if (action === 'status' && intent.values.admin_note) detail.messages.push({ ...supportMessage(id), visibility: 'internal', body: intent.values.admin_note });
    if (action === 'status') state.rows = state.rows.map(row => row.request_id === id ? { ...row, ...saved.request } : row);
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
  await page.route('**/api/admin/support-requests?*', async route => {
    const url = new URL(route.request().url()); state.directoryReads.push(url.search);
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit'));
    let rows = state.directoryMode === 'empty' ? [] : state.rows.filter(row => (!url.searchParams.get('status') || row.status === url.searchParams.get('status'))
      && (!url.searchParams.get('q') || row.title.toLowerCase().includes(url.searchParams.get('q')!.toLowerCase())));
    const summary = { open: rows.filter(r => r.status === 'open').length, in_progress: 0, critical: 0, warning: rows.length,
      monitor: 0, stable: 0, waiting_for_operator: rows.length, waiting_for_customer: 0, overdue: 0 };
    if (state.directoryMode === 'all-rows') rows = [null] as unknown as typeof rows;
    if (state.directoryMode === 'rows') rows = [rows[0], null, { ...rows[0], priority: null }, rows[0]] as typeof rows;
    const items = rows.slice(offset, offset + limit);
    const payload = { items, summary, pagination: { offset, limit, total: rows.length, has_more: offset + items.length < rows.length } };
    const data = state.directoryMode === 'shape' ? {} : state.directoryMode === 'summary' ? { ...payload, summary: {} }
      : state.directoryMode === 'pagination' ? { ...payload, pagination: { ...payload.pagination, offset: 99 } } : payload;
    await route.fulfill({ json: buildAdminApiEnvelope(data) });
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
  const receipt = { viewport: page.viewportSize(), route: new URL(page.url()).pathname, state, geometry,
    titleCount: await page.locator('main h1').count(),
    data: 'synthetic-only', humanAcceptance: 'pending', screenshot: path.split('/').at(-1),
    visibleAlerts: await page.locator('main').getByRole('alert').allTextContents(), dialogs: await page.getByRole('dialog').allTextContents() };
  await writeFile(await evidencePath(info, `pc-${width}-${state}.json`), JSON.stringify(receipt, null, 2));
  expect(receipt.titleCount).toBe(1); expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
}

const leaveDialog = (page: Page) => page.getByRole('dialog', { name: 'Discard unsaved ticket draft?' });
const discard = (page: Page) => leaveDialog(page).getByRole('button', { name: 'Discard draft and leave' });
const editor = (page: Page) => page.locator('[data-ui="admin-workbench-dialog"]');
async function openEditor(page: Page) {
  await page.goto('/admin/support-requests');
  await page.getByRole('button', { name: /^Inspect$/ }).first().click();
  await page.getByRole('button', { name: 'Edit handling', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
}
for (const field of ['public', 'internal', 'status', 'file']) test(`${field} ordinary draft guards Back cancel discard and clean return`, async ({ page }, info) => {
  await harness(page); await open(page);
  if (field === 'public') await reply(page).fill('Unsaved public revision');
  if (field === 'internal') await note(page).fill('Unsaved internal revision');
  if (field === 'status') await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('closed');
  if (field === 'file') { await attachments(page); await page.getByLabel('Attachments', { exact: true }).setInputFiles({ name: 'draft.txt', mimeType: 'text/plain', buffer: Buffer.from('draft') }); }
  await page.getByRole('link', { name: 'Back', exact: true }).click(); await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/support-requests/${target}$`));
  if (field === 'public') await expect(reply(page)).toHaveValue('Unsaved public revision');
  if (field === 'internal') await expect(note(page)).toHaveValue('Unsaved internal revision');
  if (field === 'status') await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('closed');
  if (field === 'file') expect(await page.getByLabel('Attachments', { exact: true }).inputValue()).toContain('draft.txt');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  if (field === 'public') { await visual(page, info, 1440, 'draft-exit'); await visual(page, info, 1056, 'draft-exit'); }
  await discard(page).click(); await expect(page).toHaveURL(/\/admin\/support-requests$/);
  await page.getByRole('link', { name: 'Open conversation', exact: true }).first().click();
  await expect(status(page)).toBeEnabled(); await expect(reply(page)).toHaveValue(''); await expect(note(page)).toHaveValue('');
  await page.getByRole('link', { name: 'Back', exact: true }).click(); await expect(leaveDialog(page)).toHaveCount(0);
});

test('sidebar, history and native reload each preserve drafts on cancel', async ({ page }) => {
  await harness(page); await page.goto('/admin/support-requests');
  await page.getByRole('link', { name: 'Open conversation', exact: true }).first().click();
  await expect(status(page)).toBeEnabled(); await reply(page).fill('Navigation draft');
  await page.locator('aside a[href="/admin"]').first().click();
  await expect(leaveDialog(page)).toBeVisible(); await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => window.history.back());
  await expect(leaveDialog(page)).toBeVisible(); await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(reply(page)).toHaveValue('Navigation draft');
  const native = page.waitForEvent('dialog');
  const reload = page.evaluate(() => window.location.reload());
  const dialog = await native; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); await reload;
  await expect(reply(page)).toHaveValue('Navigation draft');
  await page.evaluate(() => window.history.back()); await discard(page).click();
  await expect(page).toHaveURL(/\/admin\/support-requests$/);
});

test('reverting a status draft makes the page clean', async ({ page }) => {
  await harness(page); await open(page);
  const select = page.getByRole('combobox', { name: 'Status', exact: true });
  await select.selectOption('closed'); await select.selectOption('open');
  await page.getByRole('link', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/admin\/support-requests$/);
  await expect(leaveDialog(page)).toHaveCount(0);
});

test('explicit rejection and same-target GET recovery preserve unrelated ordinary drafts', async ({ page }) => {
  const h = await harness(page); h.mode = 'rejected'; await open(page);
  await reply(page).fill('Rejected draft'); await note(page).fill('Separate note'); await send(page).click();
  await expect(send(page)).toBeEnabled(); await expect(reply(page)).toHaveValue('Rejected draft');
  h.mode = 'normal'; h.read = 'failed'; await send(page).click();
  await expect(page.getByText('Current ticket evidence is unavailable. Writes are blocked; retry the read without changing your draft.')).toBeVisible();
  await expect(note(page)).toHaveValue('Separate note');
  h.read = 'normal'; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(status(page)).toBeEnabled(); await expect(note(page)).toHaveValue('Separate note');
});

test('discarding ordinary drafts preserves the exact unknown submitted snapshot', async ({ page }) => {
  const h = await harness(page); h.mode = 'lost'; await open(page);
  await note(page).fill('Unsubmitted ordinary note'); await reply(page).fill('Submitted reply'); await send(page).click();
  await expect(confirm(page)).toBeEnabled();
  const original = await page.evaluate(k => sessionStorage.getItem(k), key);
  await page.getByRole('link', { name: 'Back', exact: true }).click(); await discard(page).click();
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBe(original);
  await page.getByRole('link', { name: 'Open conversation', exact: true }).first().click();
  await expect(confirm(page)).toBeEnabled(); await expect(note(page)).toHaveValue('');
  await expect(reply(page)).toHaveValue('Submitted reply'); await confirm(page).click();
  await expect(reply(page)).toHaveValue(''); expect(h.writes).toHaveLength(1);
});

test('queue status-only preserves historical note and new note uses one durable operation', async ({ page }, info) => {
  const h = await harness(page); h.detail.set(target, { ...supportDetail(), request: { ...supportTicket(), admin_note: 'Historical internal note' } });
  await openEditor(page);
  await expect(editor(page).getByRole('textbox', { name: 'New internal note', exact: true })).toHaveValue('');
  await editor(page).getByRole('combobox').selectOption('resolved'); await editor(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor(page)).toHaveCount(0); expect(h.writes[0].values).toEqual({ status: 'resolved', admin_note: '' });
  expect(h.detail.get(target)!.messages).toHaveLength(0);
  await expect(page.locator('[data-ui="admin-context-drawer"]')).toContainText('Historical internal note');
  await expect(page.getByText('Ticket saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit handling', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(page.getByText('Ticket saved', { exact: true })).toHaveCount(0);
  await editor(page).getByRole('textbox', { name: 'New internal note', exact: true }).fill('New note once'); h.mode = 'lost';
  await editor(page).getByRole('button', { name: 'Save', exact: true }).click(); await expect(confirm(page)).toBeEnabled();
  const original = await page.evaluate(k => sessionStorage.getItem(k), key);
  await visual(page, info, 1440, 'queue-unknown'); await visual(page, info, 1056, 'queue-unknown');
  await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(leaveDialog(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit handling', exact: true }).click(); await expect(confirm(page)).toBeEnabled();
  await expect(editor(page).getByRole('textbox', { name: 'New internal note', exact: true })).toHaveValue('New note once');
  expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBe(original);
  await confirm(page).click(); await expect(editor(page)).toHaveCount(0);
  expect(h.writes).toHaveLength(2); expect(h.detail.get(target)!.messages).toHaveLength(1);
});

test('queue ordinary modal exit cancels or explicitly discards and pending inputs stay locked', async ({ page }, info) => {
  const h = await harness(page); await openEditor(page);
  const input = editor(page).getByRole('textbox', { name: 'New internal note', exact: true });
  await input.fill('Modal ordinary note'); await page.keyboard.press('Escape');
  await expect(leaveDialog(page)).toBeVisible();
  await visual(page, info, 1440, 'queue-draft-exit'); await visual(page, info, 1056, 'queue-draft-exit');
  await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(input).toHaveValue('Modal ordinary note'); await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await discard(page).click(); await page.getByRole('button', { name: 'Edit handling', exact: true }).click();
  await expect(input).toHaveValue(''); await expect(input).toBeEnabled(); await input.fill('Submitted modal note');
  h.mode = 'delay'; await editor(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(input).toBeDisabled(); await expect(editor(page).getByRole('combobox')).toBeDisabled();
  await visual(page, info, 1440, 'queue-pending'); await visual(page, info, 1056, 'queue-pending');
  h.release(); await expect(editor(page)).toHaveCount(0); expect(h.writes).toHaveLength(1);
});

for (const mode of ['shape', 'summary', 'pagination']) test(`directory ${mode} fails closed then recovers by GET`, async ({ page }) => {
  const h = await harness(page); h.directoryMode = mode; await page.goto('/admin/support-requests');
  await expect(page.locator('main').getByRole('alert')).toBeVisible(); await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(0);
  h.directoryMode = 'normal'; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(1); expect(h.writes).toHaveLength(0);
});

test('directory bad rows are visible, preserve order and block editor; valid empty remains distinct', async ({ page }, info) => {
  const h = await harness(page); h.directoryMode = 'rows'; await page.goto('/admin/support-requests');
  await expect(page.locator('[data-ui="support-directory-issues"]')).toContainText('3 directory rows');
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(1);
  await page.getByRole('button', { name: /^Inspect$/ }).first().click();
  await expect(page.getByRole('button', { name: 'Edit handling', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await visual(page, info, 1440, 'directory-row-issues'); await visual(page, info, 1056, 'directory-row-issues');
  h.directoryMode = 'empty'; await page.getByRole('button', { name: 'Refresh tickets', exact: true }).click();
  await expect(page.locator('[data-ui="support-directory-issues"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(0); await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
});

test('same-scope and filtered malformed refresh retain visible evidence and disable updates', async ({ page }, info) => {
  const h = await harness(page); await page.goto('/admin/support-requests');
  await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(1);
  h.directoryMode = 'summary'; await page.getByRole('button', { name: 'Refresh tickets', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible(); await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(1);
  await page.getByRole('button', { name: /^Inspect$/ }).first().click(); await expect(page.getByRole('button', { name: 'Edit handling', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox').fill('different'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText(/Showing the last successfully loaded page/)).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('different');
  await visual(page, info, 1440, 'directory-retained'); await visual(page, info, 1056, 'directory-retained');
  h.directoryMode = 'normal'; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0); await expect(page.locator('[data-ui="support-request-row"]')).toHaveCount(0);
  expect(h.writes).toHaveLength(0);
});


for (const mode of ['rejected', 'bad'] as Mode[]) test(`queue ${mode} result preserves note and uses GET recovery`, async ({ page }) => {
  const h = await harness(page); h.read = 'failed';
  await page.goto('/admin/support-requests'); await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Edit handling', exact: true }).click();
  const save = editor(page).getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled(); await expect(editor(page).getByText(/Current ticket evidence is unavailable/)).toBeVisible();
  h.read = 'normal'; await editor(page).getByRole('button', { name: 'Retry', exact: true }).click(); await expect(save).toBeEnabled();
  const input = editor(page).getByRole('textbox', { name: 'New internal note', exact: true });
  await input.fill('Preserved new note'); h.mode = mode; await save.click();
  await expect(input).toHaveValue('Preserved new note');
  if (mode === 'rejected') {
    await expect(save).toBeEnabled(); await expect(editor(page).getByText(/rejected before it was saved/)).toBeVisible();
    expect(await page.evaluate(k => sessionStorage.getItem(k), key)).toBeNull();
    await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(leaveDialog(page)).toBeVisible();
  } else {
    await expect(confirm(page)).toBeEnabled(); await expect(save).toBeDisabled();
    await confirm(page).click(); await expect(editor(page)).toHaveCount(0);
  }
  expect(h.writes).toHaveLength(1);
});

test('all malformed rows show unavailable evidence instead of an empty queue', async ({ page }, info) => {
  const h = await harness(page); h.directoryMode = 'all-rows'; await page.goto('/admin/support-requests');
  await expect(page.getByText('Ticket rows could not be verified', { exact: true })).toBeVisible();
  await expect(page.getByText('No support tickets yet', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-ui="support-directory-issues"]')).toBeVisible();
  await visual(page, info, 1440, 'directory-all-issues'); await visual(page, info, 1056, 'directory-all-issues');
});

test('existing urgent queue priority stays editable through validated current detail', async ({ page }) => {
  const h = await harness(page); h.rows[0].priority = 'urgent';
  h.detail.set(target, { ...supportDetail(), request: { ...supportTicket(), priority: 'urgent' } });
  await openEditor(page); await expect(editor(page).getByRole('combobox')).toBeEnabled(); expect(h.writes).toHaveLength(0);
});
