import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';
import { test } from './helpers/critical-network-fixture';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks, LONG_ACCOUNT_ID } from './helpers/admin-operator-fixture';

type WriteMode = 'lost' | 'timeout' | 'malformed' | 'wrong-entry' | 'replay' | '408' | '409' | '500' | 'rejected' | 'ok';
type ReadMode = 'failed' | 'absent' | 'malformed' | 'wrong-account' | 'wrong-operation' | 'ok';
const endpoint = `/api/admin/accounts/${LONG_ACCOUNT_ID}/credit-ledger/adjustments`;
const dialogName = /AI credit adjustment|AI 积分调整/i;
const confirmName = /Read adjustment result|读取调整结果/i;
const applyName = /Apply adjustment|应用调整/i;
const pageErrors: string[] = [];
const unmatched: string[] = [];

test.beforeEach(({ page }) => {
  pageErrors.length = 0;
  unmatched.length = 0;
  page.on('pageerror', error => pageErrors.push(error.message));
});
test.afterEach(() => { expect(pageErrors).toEqual([]); expect(unmatched).toEqual([]); });

async function installCreditScenario(page: Page, mode: WriteMode = 'lost') {
  await installAdminMocks(page, { unhandledAdminRequests: unmatched });
  const writes: { key: string; body: Record<string, unknown> }[] = [];
  const reads: string[] = [];
  const state = { writeMode: mode, readMode: 'failed' as ReadMode, entry: null as Record<string, unknown> | null };
  await page.route(`**${endpoint}`, async route => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const key = route.request().headers()['idempotency-key'];
    writes.push({ key, body });
    if (state.writeMode === 'rejected') {
      await route.fulfill({ status: 422, json: buildAdminApiErrorEnvelope('missing reason', 'service.credit_adjustment_reason_required') });
      return;
    }
    state.entry = {
      ledger_entry_id: 'cle_one_intent', account_id: LONG_ACCOUNT_ID,
      source_type: 'operator_credit_adjustment', source_id: `account_credit_adjustment:${LONG_ACCOUNT_ID}:${key}`,
      event_type: body.event_type, ai_credit_delta: body.ai_credit_delta,
      metadata: { reason: body.reason, note: body.note },
    };
    if (state.writeMode === 'lost') { await route.abort('connectionfailed'); return; }
    if (state.writeMode === 'timeout') {
      await new Promise(resolve => setTimeout(resolve, 12500));
      await route.abort('timedout').catch(() => {});
      return;
    }
    if (['replay', '408', '409', '500'].includes(state.writeMode)) {
      const status = state.writeMode === 'replay' ? 409 : Number(state.writeMode);
      const code = state.writeMode === 'replay' ? 'auth.replay_blocked' : `http.${status}`;
      await route.fulfill({ status, json: buildAdminApiErrorEnvelope('result uncertain', code) });
      return;
    }
    const data = state.writeMode === 'malformed' ? {} : {
      account_id: LONG_ACCOUNT_ID,
      entry: state.writeMode === 'wrong-entry' ? { ...state.entry, source_id: 'unrelated-operation' } : state.entry,
    };
    await route.fulfill({ json: buildAdminApiEnvelope(data) });
  });
  await page.route(`**${endpoint}/*`, async route => {
    expect(route.request().method()).toBe('GET');
    expect(route.request().headers()['idempotency-key']).toBeUndefined();
    const operation = new URL(route.request().url()).pathname.split('/').at(-1)!;
    reads.push(operation);
    if (state.readMode === 'failed') {
      await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read unavailable', 'http.503') });
      return;
    }
    const data = state.readMode === 'malformed' ? {} : {
      account_id: state.readMode === 'wrong-account' ? 'acct_other' : LONG_ACCOUNT_ID,
      operation_id: state.readMode === 'wrong-operation' ? 'another-operation' : operation,
      state: state.readMode === 'absent' ? 'unconfirmed' : 'applied',
      entry: state.readMode === 'absent' ? null : state.entry,
    };
    await route.fulfill({ json: buildAdminApiEnvelope(data) });
  });
  return { writes, reads, state };
}

async function openCredits(page: Page) {
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByRole('tab', { name: /Credits and usage|积分与用量/i }).click();
  await expect(page.locator('[data-ui="account-credit-operations"]')).toBeVisible();
  await page.getByRole('button', { name: /Adjust AI credits|调整AI 积分|调整 AI 积分/i }).click();
  return page.getByRole('dialog', { name: dialogName });
}

async function fillAdjustment(page: Page, delta = 250) {
  const dialog = await openCredits(page);
  await dialog.getByLabel(/Entry type|记录类型/i).selectOption(delta < 0 ? 'adjustment' : 'grant');
  await dialog.getByLabel(/Credit delta|AI 积分变动/i).fill(String(delta));
  await dialog.getByLabel(/^Reason$|^原因$/i).fill('billing correction');
  await dialog.getByLabel(/Operator note|运营备注/i).fill('single immutable intent');
  return dialog;
}

for (const [width, delta] of [[1440, 250], [1056, -250]]) {
  test(`lost ${delta} response remains read-only through close, reload and recovery at ${width}px PC`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const { writes, reads, state } = await installCreditScenario(page);
    const dialog = await fillAdjustment(page, delta);
    await dialog.getByRole('button', { name: applyName }).click();
    await expect(dialog.locator('[data-ui="credit-adjustment-unconfirmed"]')).toBeVisible();
    await expect.poll(() => reads.length).toBe(1);
    await expect(dialog.getByRole('button', { name: confirmName })).toBeEnabled();
    await expect(dialog.getByLabel(/Credit delta|AI 积分变动/i)).toBeDisabled();
    await expect(dialog.getByRole('button', { name: applyName })).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toContainText(/Reading the adjustment result failed|读取调整结果失败/);
    await page.screenshot({ path: testInfo.outputPath(`credit-unconfirmed-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-ui="credit-adjustment-unconfirmed"]')).toBeVisible();
    await page.getByRole('button', { name: confirmName }).first().click();
    await expect(dialog).toBeVisible();
    expect(reads).toEqual([writes[0].key]);
    // Persisted intent survives a new document, including the debit direction.
    await page.reload();
    await page.getByRole('tab', { name: /Credits and usage|积分与用量/i }).click();
    await page.getByRole('button', { name: confirmName }).first().click();
    await expect(dialog.getByLabel(/Credit delta|AI 积分变动/i)).toHaveValue(String(delta));
    state.readMode = 'absent';
    await dialog.getByRole('button', { name: confirmName }).click();
    await expect.poll(() => reads.length).toBe(2);
    await expect(dialog.getByRole('button', { name: confirmName })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: applyName })).toHaveCount(0);
    state.readMode = 'ok';
    await dialog.getByRole('button', { name: confirmName }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-ui="credit-adjustment-unconfirmed"]')).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(reads).toEqual(Array(3).fill(writes[0].key));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`credit-confirmed-${width}.png`) });
  });
}

for (const mode of ['timeout', 'malformed', 'wrong-entry', 'replay', '408', '409', '500'] as const) {
  test(`${mode} write result freezes the intent and confirmation never repeats POST`, async ({ page }) => {
    const { writes, reads, state } = await installCreditScenario(page, mode);
    const dialog = await fillAdjustment(page);
    await dialog.getByRole('button', { name: applyName }).click();
    await expect.poll(() => reads.length, { timeout: 20000 }).toBe(1);
    await expect(dialog.getByRole('button', { name: confirmName })).toBeEnabled();
    state.readMode = 'ok';
    await dialog.getByRole('button', { name: confirmName }).click();
    await expect(dialog).toBeHidden();
    expect(writes).toHaveLength(1);
    expect(reads).toEqual([writes[0].key, writes[0].key]);
  });
}

for (const mode of ['malformed', 'wrong-account', 'wrong-operation'] as const) {
  test(`${mode} confirmation cannot release the pending intent`, async ({ page }) => {
    const { writes, reads, state } = await installCreditScenario(page);
    const dialog = await fillAdjustment(page);
    await dialog.getByRole('button', { name: applyName }).click();
    await expect.poll(() => reads.length).toBe(1);
    state.readMode = mode;
    await dialog.getByRole('button', { name: confirmName }).click();
    await expect.poll(() => reads.length).toBe(2);
    await expect(dialog.getByRole('button', { name: confirmName })).toBeEnabled();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(dialog.getByRole('button', { name: applyName })).toHaveCount(0);
    expect(writes).toHaveLength(1);
  });
}

test('known business rejection preserves editable values and permits a corrected new intent', async ({ page }) => {
  const { writes, reads, state } = await installCreditScenario(page, 'rejected');
  const dialog = await fillAdjustment(page);
  await dialog.getByRole('button', { name: applyName }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel(/^Reason$|^原因$/i)).toHaveValue('billing correction');
  await expect(dialog.getByLabel(/^Reason$|^原因$/i)).toBeEnabled();
  expect(reads).toHaveLength(0);
  state.writeMode = 'ok';
  await dialog.getByLabel(/^Reason$|^原因$/i).fill('corrected reason');
  await dialog.getByRole('button', { name: applyName }).click();
  await expect(dialog).toBeHidden();
  expect(writes).toHaveLength(2);
  expect(writes[0].key).not.toBe(writes[1].key);
  expect(reads).toHaveLength(0);
});

test('operation storage failure blocks dispatch instead of losing duplicate protection', async ({ page }) => {
  const { writes } = await installCreditScenario(page, 'ok');
  const dialog = await fillAdjustment(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('storage unavailable'); }; });
  await dialog.getByRole('button', { name: applyName }).click();
  await expect(dialog.getByRole('alert')).toContainText(/browser|浏览器/);
  await expect(dialog.getByRole('button', { name: applyName })).toHaveCount(0);
  expect(writes).toHaveLength(0);
});

test('profile save sends only operator fields after a concurrent suspension', async ({ page }, testInfo) => {
  await installAdminMocks(page, { unhandledAdminRequests: unmatched });
  const fields: unknown[] = [];
  await page.route(`**/api/admin/accounts/${LONG_ACCOUNT_ID}/operator-profile`, async route => {
    expect(route.request().method()).toBe('PATCH');
    fields.push(route.request().postDataJSON());
    await route.fulfill({ json: buildAdminApiEnvelope({
      account_id: LONG_ACCOUNT_ID, name: 'New canonical name', status: 'suspended',
      metadata: { operator_display_name: 'Npcink AI Demo', operator_note: 'new note', account_status_note: 'concurrent hold' },
    }) });
  });
  await page.goto(`/admin/accounts/${LONG_ACCOUNT_ID}`);
  await page.getByText(/Edit customer info|编辑客户信息/i).click();
  const editor = page.locator('[data-ui="operator-profile-editor"]');
  await editor.getByLabel(/Operator note|运营备注/i).fill('new note');
  await editor.getByRole('button', { name: /Save|保存/i }).click();
  await expect(page.getByText(/Operator note has been saved|运营备注已保存/i)).toBeVisible();
  expect(fields).toEqual([{ operator_display_name: 'Npcink AI Demo', operator_note: 'new note' }]);
  await page.screenshot({ path: testInfo.outputPath('profile-field-scope.png') });
});

// Render the real hook in a tiny browser component to change accountId without
// remounting it. Vite already owns esbuild; no extra test/runtime dependency.
for (const oldResult of ['ok', 'lost', 'superseded'] as const) {
  test(`switching customers isolates a delayed ${oldResult} result and releases the new context`, async ({ page }) => {
    const require = createRequire(import.meta.url);
    const viteDependencies = createRequire(require.resolve('vite'));
    const { buildSync } = viteDependencies('esbuild');
    const bundle = buildSync({
      stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { useAccountCreditAdjustment } from './src/features/admin/accounts/account-credit-adjustment';
        function Harness() {
          const [accountId, setAccountId] = useState('acct_a');
          const [applied, setApplied] = useState('');
          const model = useAccountCreditAdjustment({ accountId, newWritesAllowed: true, failureMessage: 'failed', readFailureMessage: 'read failed', deltaMessage: 'delta', reasonMessage: 'reason', onApplied: data => setApplied(String(data.account_id)) });
          return <div>
            <button onClick={() => setAccountId(id => id === 'acct_a' ? 'acct_b' : 'acct_a')}>Switch customer</button>
            <output data-testid="context">{accountId}</output>
            <output data-testid="pending">{String(model.pending)}</output>
            <output data-testid="intent">{model.intent?.account_id || ''}</output>
            <output data-testid="applied">{applied}</output>
            <button disabled={model.locked} onClick={() => model.setForm({event_type:'grant',ai_credit_delta:'250',reason:'test',note:''})}>Prepare</button>
            <button disabled={model.locked} onClick={() => void model.submit()}>Submit</button>
            <button disabled={model.pending || !model.intent} onClick={() => void model.confirm()}>Confirm</button>
          </div>;
        }
        createRoot(document.getElementById('root')).render(<Harness />);
      ` },
      bundle: true, write: false, format: 'iife', platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"' },
    }).outputFiles[0].text;
    await page.route('**/__credit_context_test', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script src="/__credit_context_harness.js"></script>' }));
    await page.route('**/__credit_context_harness.js', route => route.fulfill({ contentType: 'text/javascript', body: bundle }));
    let releaseA!: () => void;
    let releaseB!: () => void;
    const heldA = new Promise<void>(resolve => { releaseA = resolve; });
    const heldB = new Promise<void>(resolve => { releaseB = resolve; });
    const writes: string[] = [];
    const reads: string[] = [];
    const entries = new Map<string, Record<string, unknown>>();
    await page.route('**/api/admin/accounts/*/credit-ledger/adjustments', async route => {
      const accountId = new URL(route.request().url()).pathname.split('/')[4];
      const key = route.request().headers()['idempotency-key'];
      writes.push(accountId);
      const entry = {
        ledger_entry_id: 'cle_' + accountId, account_id: accountId, event_type: 'grant',
        source_type: 'operator_credit_adjustment', source_id: `account_credit_adjustment:${accountId}:${key}`,
        ai_credit_delta: 250, metadata: { reason: 'test', note: '' },
      };
      entries.set(accountId, entry);
      await (writes.length === 1 ? heldA : heldB);
      if (accountId === 'acct_a' && oldResult === 'lost') { await route.abort('connectionfailed'); return; }
      await route.fulfill({ json: buildAdminApiEnvelope({ account_id: accountId, entry }) });
    });
    await page.route('**/api/admin/accounts/*/credit-ledger/adjustments/*', async route => {
      const parts = new URL(route.request().url()).pathname.split('/');
      const accountId = parts[4];
      reads.push(accountId);
      await route.fulfill({ json: buildAdminApiEnvelope({ account_id: accountId, operation_id: parts.at(-1), state: 'applied', entry: entries.get(accountId) }) });
    });
    await page.goto('/__credit_context_test');
    await page.getByRole('button', { name: 'Prepare' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(() => writes.length).toBe(1);
    await expect(page.getByTestId('pending')).toHaveText('true');
    await page.getByRole('button', { name: 'Switch customer' }).click();
    await expect(page.getByTestId('context')).toHaveText('acct_b');
    await expect(page.getByTestId('pending')).toHaveText('false');
    if (oldResult === 'superseded') {
      // A read can resolve the first intent while its original POST is delayed.
      // That old response must not erase a later intent for the same customer.
      await page.getByRole('button', { name: 'Switch customer' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByTestId('intent')).toHaveText('');
      await page.getByRole('button', { name: 'Prepare' }).click();
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect.poll(() => writes.length).toBe(2);
      const newerIntent = await page.evaluate(() => sessionStorage.getItem('admin.credit-adjustment.v1:acct_a'));
      const oldResponse = page.waitForResponse(response => response.url().includes('/accounts/acct_a/credit-ledger/adjustments'));
      releaseA();
      await oldResponse;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-adjustment.v1:acct_a'))).toBe(newerIntent);
      await expect(page.getByTestId('pending')).toHaveText('true');
      releaseB();
      await expect(page.getByTestId('intent')).toHaveText('');
      expect(writes).toEqual(['acct_a', 'acct_a']);
      expect(reads).toEqual(['acct_a']);
      return;
    }
    await page.getByRole('button', { name: 'Prepare' }).click();
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect.poll(() => writes.length).toBe(2);
    const oldSettled = oldResult === 'lost'
      ? page.waitForEvent('requestfailed', request => request.url().includes('/accounts/acct_a/credit-ledger/adjustments'))
      : page.waitForResponse(response => response.url().includes('/accounts/acct_a/credit-ledger/adjustments'));
    releaseA();
    await oldSettled;
    // The old finally must not unlock B's in-flight operation or apply A's receipt.
    if (oldResult === 'ok') await expect.poll(() => page.evaluate(() => sessionStorage.getItem('admin.credit-adjustment.v1:acct_a'))).toBeNull();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    await expect(page.getByTestId('pending')).toHaveText('true');
    await expect(page.getByTestId('applied')).toHaveText('');
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
    releaseB();
    await expect(page.getByTestId('applied')).toHaveText('acct_b');
    await expect(page.getByTestId('pending')).toHaveText('false');
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(reads).toHaveLength(0);
    if (oldResult === 'lost') {
      await page.getByRole('button', { name: 'Switch customer' }).click();
      await expect(page.getByTestId('intent')).toHaveText('acct_a');
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByTestId('applied')).toHaveText('acct_a');
      expect(reads).toEqual(['acct_a']);
    }
    expect(writes).toEqual(['acct_a', 'acct_b']);
  });
}
