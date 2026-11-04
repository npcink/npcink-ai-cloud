import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';
import { test } from './helpers/critical-network-fixture';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks, LONG_ACCOUNT_ID } from './helpers/admin-operator-fixture';

const readAction = /Read operation result|读取操作结果/;
const createAction = /Create customer|创建客户/;
const addAction = /Add customer|添加客户/;
const editorSelector = '[data-ui="operator-profile-editor"]';
const unmatched: string[] = [];
const pageErrors: string[] = [];
test.beforeEach(({ page }) => {
  unmatched.length = 0; pageErrors.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterEach(() => { expect(unmatched).toEqual([]); expect(pageErrors).toEqual([]); });

for (const bad of [{}, { items: null, total: 0 }, { items: [], total: '0' }]) {
  test(`directory rejects required projection ${JSON.stringify(bad)}`, async ({ page }) => {
    await installAdminMocks(page, { unhandledAdminRequests: unmatched });
    let recovered = false;
    await page.route('**/api/admin/accounts?*', route => route.fulfill({ json: buildAdminApiEnvelope(recovered ? { items: [], total: 0 } : bad) }));
    await page.goto('/admin/accounts');
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
    recovered = true;
    await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Customers · 0|客户 · 0/ })).toBeVisible();
  });
}
for (const account of [undefined, null, { account_id: 'wrong', name: '', status: 'active', metadata: {} }, { account_id: LONG_ACCOUNT_ID, name: '', status: null, metadata: {} }, { account_id: LONG_ACCOUNT_ID, name: '', status: 'active', metadata: [] }]) {
  test(`detail blocks writes for unsafe account ${JSON.stringify(account)}`, async ({ page }) => {
    await installAdminMocks(page, { unhandledAdminRequests: unmatched });
    await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}`, route => route.fulfill({ json: buildAdminApiEnvelope({ account }) }));
    let writes = 0;
    page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/admin/accounts')) writes++; });
    await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
    await expect(page.locator(editorSelector)).toHaveCount(0);
    expect(writes).toBe(0);
  });
}

type WriteMode = 'lost' | 'malformed' | 'timeout' | '408' | '409' | 'replay' | '500' | 'reject' | 'ok' | 'bad-principal' | 'bad-membership' | 'bad-subscription';
type ReadMode = 'failed' | 'absent' | 'wrong' | 'ok';
async function uncertainWrite(route: import('@playwright/test').Route, mode: WriteMode, data: unknown) {
  if (mode === 'lost') return route.abort('connectionfailed');
  if (mode === 'timeout') { await new Promise(resolve => setTimeout(resolve, 12500)); return route.abort('timedout').catch(() => {}); }
  if (['408', '409', 'replay', '500', 'reject'].includes(mode)) {
    const status = mode === 'reject' ? 422 : mode === 'replay' ? 409 : Number(mode);
    return route.fulfill({ status, json: buildAdminApiErrorEnvelope('synthetic refusal', mode === 'reject' ? 'service.validation_error' : mode === 'replay' ? 'auth.replay_blocked' : `http.${status}`) });
  }
  return route.fulfill({ json: buildAdminApiEnvelope(mode === 'malformed' ? {} : data) });
}
async function profileScenario(page: Page, mode: WriteMode = 'lost') {
  await installAdminMocks(page, { unhandledAdminRequests: unmatched });
  const state = { readMode: 'failed' as ReadMode, writeMode: mode, submitted: null as Record<string, string> | null };
  const writes: { key: string; body: Record<string, string> }[] = [];
  const reads: string[] = [];
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/operator-profile`, async route => {
    const body = route.request().postDataJSON();
    state.submitted = body;
    writes.push({ key: route.request().headers()['idempotency-key'], body });
    await uncertainWrite(route, state.writeMode, { account_id: LONG_ACCOUNT_ID, name: 'Canonical', status: 'suspended', metadata: { ...body, retained: 'latest' } });
  });
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}`, async route => {
    if (!state.submitted) return route.fallback();
    expect(route.request().method()).toBe('GET'); reads.push(route.request().url());
    if (state.readMode === 'failed') return route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read failed') });
    await route.fulfill({ json: buildAdminApiEnvelope({ account: {
      account_id: state.readMode === 'wrong' ? 'acct_wrong' : LONG_ACCOUNT_ID,
      name: 'Canonical', status: 'suspended', metadata: state.readMode === 'absent' ? {} : { ...state.submitted, retained: 'latest' },
    }, sites: [], subscriptions: [] }) });
  });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.locator(editorSelector).locator('summary').click();
  const editor = page.locator(editorSelector);
  await editor.getByLabel(/Operator note|运营备注/).fill('submitted profile');
  return { state, writes, reads, editor };
}
for (const mode of ['lost', 'malformed', 'timeout', 'replay', '408', '409', '500'] as const) {
  test(`profile ${mode} preserves intent and uses GET-only recovery`, async ({ page }) => {
    const { state, writes, reads, editor } = await profileScenario(page, mode);
    await editor.getByRole('button', { name: /^Save$|^保存$/ }).click();
    const recovery = page.locator('[data-ui="customer-profile-unconfirmed"]');
    await expect.poll(() => reads.length, { timeout: 20000 }).toBe(1);
    await expect(recovery.getByRole('button', { name: readAction })).toBeEnabled();
    await expect(editor.getByLabel(/Operator note|运营备注/)).toBeDisabled();
    await editor.locator('summary').click();
    await expect(recovery).toBeVisible();
    state.readMode = 'absent'; await recovery.getByRole('button', { name: readAction }).click();
    await expect.poll(() => reads.length).toBe(2);
    state.readMode = 'wrong'; await recovery.getByRole('button', { name: readAction }).click();
    await expect.poll(() => reads.length).toBe(3);
    state.readMode = 'ok'; await recovery.getByRole('button', { name: readAction }).click();
    await expect(recovery).toHaveCount(0);
    await editor.locator('summary').click();
    await expect(editor.getByText(/Operator note has been saved|运营备注已保存/)).toBeVisible();
    expect(writes).toHaveLength(1);
  });
}
for (const width of [1440, 1056]) {
  test(`profile intent survives reload at ${width}px PC`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, writes, reads, editor } = await profileScenario(page);
    const longNote = '长备注用于核对原提交内容，完整文本保留。'.repeat(150).slice(0, 2500);
    await editor.getByLabel(/Operator note|运营备注/).fill(longNote);
    await editor.getByRole('button', { name: /^Save$|^保存$/ }).click();
    await expect.poll(() => reads.length).toBe(1);
    await page.reload();
    // Primary read is unavailable too; GET recovery remains possible after it returns.
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
    state.readMode = 'absent';
    await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
    const recovery = page.locator('[data-ui="customer-profile-unconfirmed"]');
    await expect(recovery).toBeVisible();
    await page.getByRole('tab', { name: /Usage|用量/ }).click();
    await expect(recovery).toBeVisible();
    const snapshot = recovery.getByRole('region', { name: /Submitted values|已提交内容/ });
    await expect(snapshot).toContainText(longNote);
    expect(await snapshot.evaluate(element => element.clientHeight <= 96 && element.scrollHeight > element.clientHeight)).toBe(true);
    await expect(recovery.getByRole('button', { name: readAction })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`profile-unconfirmed-${width}.png`) });
    state.readMode = 'ok'; await recovery.getByRole('button', { name: readAction }).click();
    await expect(recovery).toHaveCount(0);
    expect(writes).toHaveLength(1);
  });
}

async function createScenario(page: Page, mode: WriteMode = 'lost') {
  await installAdminMocks(page, { unhandledAdminRequests: unmatched });
  const writes: { key: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const state = { writeMode: mode, readMode: 'failed' as ReadMode, rejectEmail: false };
  await page.route('**/api/admin/accounts', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON(); const key = route.request().headers()['idempotency-key']; writes.push({ key, body });
    if (state.rejectEmail) return route.fulfill({ status: 409, json: buildAdminApiErrorEnvelope('already belongs', 'service.single_account_membership_limit') });
    await uncertainWrite(route, state.writeMode, {
      account_id: LONG_ACCOUNT_ID, name: body.name, status: 'active', metadata: body.metadata,
      creation_operation_id: key, creation_receipt: { operation_id: key, account_id: LONG_ACCOUNT_ID, audit_event_id: 1 }, primary_identity: { principal_id: state.writeMode === 'bad-principal' ? {} : 'prn_created', email: body.primary_email, status: 'active' },
      membership: { membership_id: state.writeMode === 'bad-membership' ? [] : 'aum_created', role: 'owner', status: 'active' }, current_subscription: { subscription_id: state.writeMode === 'bad-subscription' ? 12 : 'sub_created' },
    });
  });
  await page.route('**/api/admin/accounts/creation-operations/*?*', async route => {
    const url = new URL(route.request().url());
    const key = url.pathname.split('/').at(-1)!;
    expect(route.request().method()).toBe('GET'); expect(url.searchParams.get('primary_email')).toBe('owner@example.com');
    reads.push(key);
    if (state.readMode === 'failed') return route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read failed') });
    await route.fulfill({ json: buildAdminApiEnvelope(state.readMode === 'absent' ? { operation_id: key, state: 'unconfirmed', account_id: null, receipt: null } : {
      operation_id: state.readMode === 'wrong' ? 'wrong_key' : key, state: 'confirmed', account_id: LONG_ACCOUNT_ID,
      receipt: { operation_id: key, account_id: LONG_ACCOUNT_ID, audit_event_id: 1 },
    }) });
  });
  await page.goto('/admin/accounts');
  await page.getByRole('button', { name: addAction }).click();
  const dialog = page.getByRole('dialog', { name: addAction });
  await dialog.getByLabel(/^Name$|^名称$/).fill('New Customer');
  await dialog.getByLabel(/Login email|登录邮箱/).fill('Owner@Example.com');
  return { state, writes, reads, dialog };
}
for (const mode of ['lost', 'malformed', 'timeout', 'replay', '408', '409', '500', 'bad-principal', 'bad-membership', 'bad-subscription'] as const) {
  test(`creation ${mode} never repeats POST before exact confirmation`, async ({ page }) => {
    const { state, writes, reads, dialog } = await createScenario(page, mode);
    await dialog.getByRole('button', { name: createAction }).click();
    await expect.poll(() => reads.length, { timeout: 20000 }).toBe(1);
    await expect(dialog.getByLabel(/^Name$|^名称$/)).toBeDisabled();
    for (const next of ['absent', 'wrong'] as const) {
      state.readMode = next; await dialog.getByRole('button', { name: readAction }).click();
      await expect.poll(() => reads.length).toBe(next === 'absent' ? 2 : 3);
      await expect(dialog.getByRole('button', { name: createAction })).toHaveCount(0);
    }
    state.readMode = 'ok'; await dialog.getByRole('button', { name: readAction }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/accounts/${LONG_ACCOUNT_ID}`));
    expect(writes).toHaveLength(1); expect(reads).toEqual(Array(4).fill(writes[0].key));
  });
}
for (const width of [1440, 1056]) {
  test(`creation restores submitted snapshot after close and reload at ${width}px PC`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, writes, reads, dialog } = await createScenario(page);
    await dialog.getByRole('button', { name: createAction }).click();
    await expect.poll(() => reads.length).toBe(1);
    await expect(dialog.getByRole('button', { name: readAction })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-ui="customer-creation-unconfirmed"]')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: addAction }).click();
    await expect(dialog.getByLabel(/^Name$|^名称$/)).toHaveValue('New Customer');
    await expect(dialog.getByLabel(/Login email|登录邮箱/)).toHaveValue('owner@example.com');
    await page.screenshot({ path: testInfo.outputPath(`creation-unconfirmed-${width}.png`) });
    state.readMode = 'ok'; await dialog.getByRole('button', { name: readAction }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/accounts/${LONG_ACCOUNT_ID}`));
    expect(writes).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('creation explicit 422 and existing-email 409 retain correctable fields and use a new key', async ({ page }) => {
  const { state, writes, dialog } = await createScenario(page, 'reject');
  await dialog.getByRole('button', { name: createAction }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel(/^Name$|^名称$/)).toBeEnabled();
  state.rejectEmail = true;
  await dialog.getByRole('button', { name: createAction }).click();
  await expect.poll(() => writes.length).toBe(2);
  await expect(dialog.getByLabel(/Login email|登录邮箱/)).toBeEnabled();
  await expect(dialog.getByRole('alert')).toContainText(/email already belongs|邮箱已属于现有客户/);
  expect(writes[0].key).not.toBe(writes[1].key);
  state.rejectEmail = false; state.writeMode = 'ok';
  await dialog.getByRole('button', { name: createAction }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/accounts/${LONG_ACCOUNT_ID}`));
  expect(writes).toHaveLength(3);
});
test('storage failure blocks both customer forms before dispatch', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('admin.customer-')) throw new Error('storage unavailable'); original.call(this, key, value); }; });
  const { writes, dialog } = await createScenario(page, 'ok');
  await dialog.getByRole('button', { name: createAction }).click();
  await expect(dialog.getByRole('alert')).toContainText(/tab|标签页/); expect(writes).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/tab|标签页/);
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  let patches = 0; page.on('request', request => { if (request.method() === 'PATCH') patches++; });
  await page.locator(editorSelector).locator('summary').click();
  await page.locator(editorSelector).getByRole('button', { name: /^Save$|^保存$/ }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/tab|标签页/); expect(patches).toBe(0);
});

async function installHarness(page: Page, source: string) {
  const require = createRequire(import.meta.url); const viteDependencies = createRequire(require.resolve('vite'));
  const { buildSync } = viteDependencies('esbuild');
  const js = buildSync({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: source }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text;
  await page.route('**/__customer_harness', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/__customer_harness.js"></script>' }));
  await page.route('**/__customer_harness.js', route => route.fulfill({ contentType: 'text/javascript', body: js }));
}
for (const oldResult of ['ok', 'lost', 'superseded']) {
  test(`profile switching customers isolates late ${oldResult} response`, async ({ page }) => {
    await installHarness(page, `
      import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {useAccountOperatorProfile} from './src/features/admin/accounts/account-operator-profile';
      function Harness() { const [id,setId]=useState('acct_a'); const [applied,setApplied]=useState('');
        const model=useAccountOperatorProfile({account:{account_id:id,name:'',status:'active',metadata:{},operator_note:'',operator_display_name:''},errorFallback:'failed',readFailure:'read failed',savedNotice:'saved',onSaved:()=>setApplied(id)});
        return <div><button onClick={()=>setId(id==='acct_a'?'acct_b':'acct_a')}>Switch</button><output data-testid="applied">{applied}</output><output data-testid="busy">{String(model.isSaving)}</output><output data-testid="intent">{model.intent?.account_id||''}</output><button disabled={model.locked} onClick={()=>model.setField('operator_note','note')}>Prepare</button><button disabled={model.locked} onClick={()=>void model.submit()}>Submit</button><button disabled={model.isSaving||!model.intent} onClick={()=>void model.confirm()}>Confirm</button></div>;
      } createRoot(document.getElementById('root')).render(<Harness/>);`);
    let releaseA!: () => void; let releaseB!: () => void;
    const heldA = new Promise<void>(resolve => { releaseA = resolve; }); const heldB = new Promise<void>(resolve => { releaseB = resolve; });
    const writes: string[] = [];
    await page.route('**/api/admin/accounts/*/operator-profile', async route => {
      const id = new URL(route.request().url()).pathname.split('/')[4]; writes.push(id);
      await (writes.length === 1 ? heldA : heldB);
      if (id === 'acct_a' && oldResult === 'lost') return route.abort();
      await route.fulfill({ json: buildAdminApiEnvelope({ account_id: id, name: '', status: 'active', metadata: route.request().postDataJSON() }) });
    });
    await page.route('**/api/admin/accounts/acct_a', route => route.fulfill({ json: buildAdminApiEnvelope({ account: { account_id: 'acct_a', name: '', status: 'active', metadata: { operator_note: 'note' } } }) }));
    await page.goto('/__customer_harness');
    await page.getByRole('button', { name: 'Prepare', exact: true }).click(); await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    await page.getByRole('button', { name: 'Switch', exact: true }).click();
    if (oldResult === 'superseded') {
      await page.getByRole('button', { name: 'Switch', exact: true }).click();
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByTestId('intent')).toHaveText('');
      await page.getByRole('button', { name: 'Prepare', exact: true }).click(); await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await expect.poll(() => writes.length).toBe(2);
      const saved = await page.evaluate(() => sessionStorage.getItem('admin.customer-profile.v1:acct_a'));
      const oldResponse = page.waitForResponse(response => response.url().includes('/acct_a/operator-profile'));
      releaseA(); await oldResponse; await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      expect(await page.evaluate(() => sessionStorage.getItem('admin.customer-profile.v1:acct_a'))).toBe(saved);
      await expect(page.getByTestId('busy')).toHaveText('true');
      releaseB(); await expect(page.getByTestId('intent')).toHaveText('');
      expect(writes).toEqual(['acct_a', 'acct_a']); return;
    }
    await page.getByRole('button', { name: 'Prepare', exact: true }).click(); await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect.poll(() => writes.length).toBe(2);
    const oldSettled = oldResult === 'lost' ? page.waitForEvent('requestfailed') : page.waitForResponse(response => response.url().includes('/acct_a/operator-profile'));
    releaseA(); await oldSettled;
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(page.getByTestId('busy')).toHaveText('true'); await expect(page.getByTestId('applied')).toHaveText('');
    releaseB(); await expect(page.getByTestId('applied')).toHaveText('acct_b'); await expect(page.getByTestId('busy')).toHaveText('false');
    if (oldResult === 'lost') { await page.getByRole('button', { name: 'Switch', exact: true }).click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click(); await expect(page.getByTestId('applied')).toHaveText('acct_a'); }
    expect(writes).toEqual(['acct_a', 'acct_b']);
  });
}

test('old creation response cannot navigate again or erase a newer persisted intent', async ({ page }) => {
  await installHarness(page, `
    import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {useAccountCreation} from './src/features/admin/accounts/account-create-confirmation';
    function Form({onCreated}) {const model=useAccountCreation({onCreated,failureMessage:'failed',readFailureMessage:'read failed'}); return <div><output data-testid="busy">{String(model.busy)}</output><button disabled={model.locked} onClick={()=>void model.submit({name:'Customer',primary_email:'owner@example.com',operator_display_name:'',operator_note:'',bind_default_free:false})}>Submit</button><button disabled={model.busy||!model.intent} onClick={()=>void model.confirm()}>Confirm</button></div>;}
    function Harness(){const [epoch,setEpoch]=useState(0); const [calls,setCalls]=useState(0);return <div><button onClick={()=>setEpoch(epoch+1)}>Remount</button><output data-testid="calls">{calls}</output><Form key={epoch} onCreated={()=>setCalls(n=>n+1)}/></div>;} createRoot(document.getElementById('root')).render(<Harness/>);`);
  let releaseOld!: () => void; let releaseNew!: () => void;
  const oldHeld = new Promise<void>(resolve => { releaseOld = resolve; }); const newHeld = new Promise<void>(resolve => { releaseNew = resolve; });
  const keys: string[] = [];
  await page.route('**/api/admin/accounts', async route => {
    const key = route.request().headers()['idempotency-key']; keys.push(key);
    await (keys.length === 1 ? oldHeld : newHeld);
    await route.fulfill({ json: buildAdminApiEnvelope({ account_id: 'acct_generated', name: 'Customer', status: 'active', metadata: {}, creation_operation_id: key, creation_receipt: { operation_id: key, account_id: 'acct_generated', audit_event_id: 1 }, primary_identity: { principal_id: 'p1', email: 'owner@example.com', status: 'active' }, membership: { membership_id: 'm1', role: 'owner', status: 'active' } }) });
  });
  await page.route('**/api/admin/accounts/creation-operations/*?*', route => {
    const key = new URL(route.request().url()).pathname.split('/').at(-1);
    return route.fulfill({ json: buildAdminApiEnvelope({ operation_id: key, state: 'confirmed', account_id: 'acct_generated', receipt: { operation_id: key, account_id: 'acct_generated', audit_event_id: 1 } }) });
  });
  await page.goto('/__customer_harness'); await page.getByRole('button', { name: 'Submit', exact: true }).click(); await expect.poll(() => keys.length).toBe(1);
  await page.getByRole('button', { name: 'Remount' }).click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click(); await expect(page.getByTestId('calls')).toHaveText('1');
  await page.getByRole('button', { name: 'Remount' }).click(); await page.getByRole('button', { name: 'Submit', exact: true }).click(); await expect.poll(() => keys.length).toBe(2);
  const saved = await page.evaluate(() => sessionStorage.getItem('admin.customer-create.v1'));
  const oldResponse = page.waitForResponse(response => response.url().endsWith('/api/admin/accounts'));
  releaseOld(); await oldResponse; await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  expect(await page.evaluate(() => sessionStorage.getItem('admin.customer-create.v1'))).toBe(saved); await expect(page.getByTestId('calls')).toHaveText('1'); await expect(page.getByTestId('busy')).toHaveText('true');
  releaseNew(); await expect(page.getByTestId('calls')).toHaveText('2');
});

// B4-06: field locking is verified across the three actual result branches,
// alongside the original pending-key/context tests above.
for (const kind of ['creation', 'profile'] as const) {
  for (const outcome of ['ok', 'reject', 'lost'] as const) {
    test(`${kind} delayed ${outcome} keeps both fields equal to the submitted snapshot`, async ({ page }) => {
      const scenario = kind === 'creation' ? await createScenario(page, outcome) : await profileScenario(page, outcome);
      const region = kind === 'creation' ? page.getByRole('dialog', { name: addAction }) : page.locator(editorSelector);
      const fields = kind === 'creation' ? region.locator('input[name="name"], input[name="primary_email"]') : region.locator('input');
      const snapshot = await fields.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
      expect(snapshot).toHaveLength(2);
      // The existing create model canonicalizes the dispatched email; the locked
      // input must show that same submitted value in all three result branches.
      if (kind === 'creation') snapshot[1] = snapshot[1].trim().toLowerCase();
      let release!: () => void; let started = false;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route(kind === 'creation' ? '**/api/admin/accounts' : `**/api/admin/accounts/${LONG_ACCOUNT_ID}/operator-profile`, async route => {
        if (route.request().method() === 'GET') return route.fallback();
        started = true; await held; await route.fallback();
      });
      await region.getByRole('button', { name: kind === 'creation' ? createAction : /^Save$|^保存$/ }).click();
      await expect.poll(() => started).toBe(true);
      for (let index = 0; index < 2; index++) await expect(fields.nth(index)).toBeDisabled();
      expect(await fields.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(snapshot);
      // Find the actual persisted same-tab intent without assuming a new key format.
      const saved = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('admin.customer')).map(key => ({ key, value: sessionStorage.getItem(key) })));
      expect(saved.length).toBeGreaterThan(0);
      release();
      await expect.poll(() => scenario.writes.length).toBe(1);
      if (outcome === 'lost') {
        await expect.poll(() => scenario.reads.length).toBe(1);
        for (let index = 0; index < 2; index++) await expect(fields.nth(index)).toBeDisabled();
        expect(await fields.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(snapshot);
        expect(await page.evaluate(saved => sessionStorage.getItem(saved.key), saved[0])).toBe(saved[0].value);
      } else if (outcome === 'reject') {
        for (let index = 0; index < 2; index++) await expect(fields.nth(index)).toBeEnabled();
        expect(await fields.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(snapshot);
      } else if (kind === 'creation') {
        await expect(page).toHaveURL(new RegExp(`/admin/accounts/${LONG_ACCOUNT_ID}`));
      } else {
        await expect(region.getByText(/Operator note has been saved|运营备注已保存/)).toBeVisible();
        expect(await fields.evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(snapshot);
        // A confirmed save establishes a clean baseline, so ordinary navigation is free.
        await page.getByRole('link', { name: /Back to customers|返回客户列表/i }).click();
        await expect(page).toHaveURL(/\/admin\/accounts$/);
      }
      expect(scenario.writes).toHaveLength(1);
    });
  }
}
