import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import { buildInitialForm, type PlanIntent } from '@/features/admin/plans/plan-projection';
import { parameters, planCatalog, planConfirmation, planDetail, planWrite } from '../fixtures/admin-plan-parameters';

type Mode = 'normal' | 'before-drop' | 'after-drop' | 'malformed' | 'wrong-target' | 'old-body' | 'rejected' | 'delayed';
async function harness(page: Page) {
  await installAdminMocks(page);
  const state = { versionStatus: 'published', mode: 'normal' as Mode, confirmation: 'normal', detail: 'normal', catalog: 'normal',
    writes: [] as PlanIntent[], reads: [] as string[], values: { ...parameters }, recorded: false,
    requests: [] as string[], writeError: null as { status: number; code: string } | null,
    release: () => {}, confirmRelease: () => {}, delayConfirmation: false };
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/admin/')) state.requests.push(`${request.method()} ${path}`); });
  await page.route('**/api/admin/plans**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (req.method() === 'GET') state.reads.push(path);
    if (path === '/api/admin/plans') {
      const value = state.catalog === 'normal' ? planCatalog() : state.catalog === 'empty' ? { items: [], tier_templates: [] }
        : state.catalog === 'null' ? { ...planCatalog(), items: null } : state.catalog === 'type' ? { ...planCatalog(), items: {} }
          : state.catalog === 'bad-item' ? { ...planCatalog(), items: [{ ...planCatalog().items[0], subscription_counts: {} }] } : {};
      await route.fulfill({ json: buildAdminApiEnvelope(value) }); return;
    }
    const planId = path.split('/')[4];
    if (path.includes('/parameter-operations/')) {
      if (state.delayConfirmation) await new Promise<void>(resolve => { state.confirmRelease = resolve; });
      if (state.confirmation === 'failed') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('read unavailable') }); return; }
      const original = state.writes.find(intent => path.endsWith(intent.operation_id));
      let value: unknown = original ? planConfirmation(original, state.recorded ? 'confirmed' : 'unconfirmed') : {};
      if (original && state.confirmation === 'wrong') value = { ...planConfirmation(original), plan_id: 'wrong' };
      if (original && state.confirmation === 'old') value = { ...planConfirmation(original), current: { ...planConfirmation(original).current, parameters } };
      await route.fulfill({ json: buildAdminApiEnvelope(value) }); return;
    }
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      const { revision, ...values } = body;
      const intent: PlanIntent = { operation_id: req.headers()['idempotency-key'], plan_id: planId, revision, values, plan_version_id: `${planId}_v1`,
        form: buildInitialForm(planDetail(planId, values)) };
      state.writes.push(intent);
      if (state.writeError) { await route.fulfill({ status: state.writeError.status, json: buildAdminApiErrorEnvelope('unknown', state.writeError.code) }); return; }
      if (state.mode === 'rejected') { await route.fulfill({ status: 422, json: buildAdminApiErrorEnvelope('invalid price', 'request.validation_error') }); return; }
      if (state.mode === 'before-drop') { await route.abort('connectionreset'); return; }
      state.recorded = true; state.values = values;
      if (state.mode === 'after-drop') { await route.abort('connectionreset'); return; }
      if (state.mode === 'delayed') await new Promise<void>(resolve => { state.release = resolve; });
      const value = state.mode === 'malformed' ? {} : state.mode === 'wrong-target' ? { ...planWrite(intent), plan_id: 'wrong' }
        : state.mode === 'old-body' ? { ...planWrite(intent), budgets: { max_ai_credits_per_period: 1 } } : planWrite(intent);
      if (value && 'status' in value) value.status = state.versionStatus;
      await route.fulfill({ json: buildAdminApiEnvelope(value) }).catch(() => {}); return;
    }
    const value = planDetail(planId, planId === 'pro' ? state.values : parameters, state.recorded ? 'b' : 'a');
    if (value.latest_version) value.latest_version.status = state.versionStatus;
    if (state.detail === 'failed') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('detail unavailable') }); return; }
    await route.fulfill({ json: buildAdminApiEnvelope(state.detail === 'wrong' ? planDetail('wrong') : state.detail === 'old' ? planDetail(planId) : value) });
  });
  return state;
}
async function switchTarget(page: Page, target: string) {
  await page.evaluate(id => { const a = document.createElement('a'); a.href = `/admin/plans?focus=${id}`; a.textContent = 'target navigation'; document.body.append(a); a.click(); a.remove(); }, target);
  const leave = page.getByRole('button', { name: /Leave and keep pending|Discard draft and leave|离开并保留待确认|放弃草稿并离开/ });
  await expect(leave).toBeVisible();
  await leave.click();
  await expect(workbench(page).getByRole('heading', { name: new RegExp(`Manage ${target}|管理 ${target}`, 'i') })).toBeVisible();
}
const workbench = (page: Page) => page.locator('[data-ui="admin-workbench-dialog"]');
const inputs = (page: Page) => workbench(page).locator('input[type="number"]');
const save = (page: Page) => workbench(page).getByRole('button', { name: /^Save$|^保存$/ });
const read = (page: Page) => page.getByRole('button', { name: /Read operation result|读取操作结果/ });
const pending = (page: Page) => page.locator('[data-ui="plan-pending-operation"]');
async function image(page: Page, state: string, width: number, info: TestInfo) {
  const root = process.env.NPCINK_PLAN_EVIDENCE;
  if (root) await mkdir(root, { recursive: true });
  const path = root ? `${root}/pc-${width}-${state}.png` : info.outputPath(`${state}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(state, { path, contentType: 'image/png' });
}

for (const { width, dark } of [{ width: 1440, dark: false }, { width: 1056, dark: false }, { width: 1440, dark: true }]) {
  test(`submitted operation survives loss, close, refresh and GET-only confirmation PC ${width} ${dark ? 'dark' : 'light'}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.addInitScript(dark => localStorage.setItem('theme', dark ? 'dark' : 'light'), dark);
    const state = await harness(page);
    state.mode = 'after-drop';
    await page.goto('/admin/plans?focus=pro');
    await expect(inputs(page).first()).toHaveValue('99');
    await inputs(page).first().fill('88.88');
    await save(page).click();
    await expect(pending(page)).toBeVisible();
    await expect(save(page)).toBeDisabled();
    await expect(inputs(page).first()).toHaveValue('88.88');
    expect(state.writes).toHaveLength(1);
    const original = state.writes[0];
    const persisted = await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'));
    expect(JSON.parse(persisted!).operation_id).toBe(original.operation_id);
    await image(page, dark ? 'unknown-dark' : 'unknown', width, info);
    await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
    await page.getByRole('button', { name: /Leave and keep|离开并保留/ }).click();
    await expect(page.locator('[data-ui="plan-pending-directory"]')).toContainText('pro');
    await page.getByRole('button', { name: /Open pending package|打开待确认套餐/ }).click();
    await expect(inputs(page).first()).toHaveValue('88.88');
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await expect(pending(page)).toBeVisible();
    await expect(inputs(page).first()).toHaveValue('88.88');
    await expect(save(page)).toBeDisabled();
    expect(state.writes).toHaveLength(1);
    await image(page, dark ? 'restored-dark' : 'restored', width, info);
    for (const mode of ['failed', 'wrong', 'old']) {
      state.confirmation = mode;
      await read(page).click();
      await expect(read(page)).toBeEnabled();
      await expect(save(page)).toBeDisabled();
      await expect(inputs(page).first()).toHaveValue('88.88');
    }
    state.confirmation = 'normal';
    const before = state.reads.length, beforeAll = state.requests.length;
    await read(page).click();
    await expect(pending(page)).toHaveCount(0);
    await expect(save(page)).toBeEnabled();
    await expect(workbench(page)).toContainText(/recorded as successful|成功记录/);
    expect(state.reads.slice(before)).toEqual([`/api/admin/plans/pro/parameter-operations/${original.operation_id}`]);
    expect(state.requests.slice(beforeAll)).toEqual([`GET /api/admin/plans/pro/parameter-operations/${original.operation_id}`]);
    expect(state.writes).toHaveLength(1);
    expect(await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'))).toBeNull();
    await image(page, dark ? 'confirmed-dark' : 'confirmed', width, info);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('pre-execution loss, same values without audit and malformed success stay pending; clear rejection stays editable', async ({ page }) => {
  const state = await harness(page); state.mode = 'before-drop';
  await page.goto('/admin/plans?focus=pro');
  await expect(inputs(page).first()).toHaveValue('99');
  // Same values alone cannot prove this operation ran.
  await save(page).click(); await expect(read(page)).toBeEnabled();
  await read(page).click(); await expect(read(page)).toBeEnabled();
  await expect(pending(page)).toBeVisible(); await expect(save(page)).toBeDisabled();
  expect(state.writes).toHaveLength(1);
  await switchTarget(page, 'plus');
  await expect(inputs(page).first()).toHaveValue('99');
  state.mode = 'rejected';
  await inputs(page).first().fill('88'); await save(page).click();
  await expect(save(page)).toBeEnabled(); await expect(inputs(page).first()).toHaveValue('88');
  await expect(pending(page)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'))).not.toBeNull();
});

for (const mode of ['malformed', 'wrong-target', 'old-body'] as const) {
  test(`bad PATCH success ${mode} preserves snapshot until durable confirmation`, async ({ page }) => {
    const state = await harness(page); state.mode = mode; state.detail = 'old';
    await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
    await inputs(page).first().fill('88.88'); await save(page).click();
    await expect(read(page)).toBeEnabled(); await expect(save(page)).toBeDisabled();
    await expect(workbench(page)).not.toContainText(/recorded as successful|成功记录/);
    await expect(inputs(page).first()).toHaveValue('88.88');
    expect(state.reads.filter(path => path === '/api/admin/plans/pro')).toHaveLength(1);
    await read(page).click(); await expect(pending(page)).toHaveCount(0);
    expect(state.writes).toHaveLength(1);
    await expect(inputs(page).first()).toHaveValue('88.88');
  });
}

test('late write and late confirmation cannot overwrite another target or a newer draft', async ({ page }) => {
  const state = await harness(page); state.mode = 'delayed';
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await switchTarget(page, 'plus');
  await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('77');
  state.release();
  await expect(inputs(page).first()).toHaveValue('77');
  await expect(workbench(page)).not.toContainText(/recorded as successful|成功记录/);
  // The old operation is retained for its own target, not silently cleared.
  await switchTarget(page, 'pro');
  await expect(read(page)).toBeEnabled();
  state.delayConfirmation = true; const initialRelease = state.confirmRelease; await read(page).click();
  await switchTarget(page, 'plus');
  await expect(inputs(page).first()).toHaveValue('99'); await inputs(page).first().fill('66');
  await expect.poll(() => state.confirmRelease !== initialRelease).toBe(true);
  state.confirmRelease();
  await expect(inputs(page).first()).toHaveValue('66');
  expect(await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'))).not.toBeNull();
  expect(state.writes).toHaveLength(1);
});

test('ordinary drafts protect close Escape history internal links and refresh; explicit discard and clean saves leave freely', async ({ page }, info) => {
  const state = await harness(page);
  await page.goto('/admin/subscriptions');
  await page.locator('a[href="/admin/plans"]').first().click();
  await page.getByRole('button', { name: /^Manage pro$|^管理 pro$/i }).click();
  await expect(inputs(page).first()).toHaveValue('99'); await inputs(page).first().fill('88');
  await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
  await image(page, 'discard-dialog', 1440, info);
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await expect(inputs(page).first()).toHaveValue('88');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await page.evaluate(() => history.back());
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await expect(page).toHaveURL(/focus=pro/);
  // The real beforeunload dialog is canceled, not a synthetic event assertion.
  const dialog = page.waitForEvent('dialog', { timeout: 3000 });
  const reload = page.reload({ timeout: 3000 }).catch(() => {});
  await (await dialog).dismiss();
  await reload;
  await expect(inputs(page).first()).toHaveValue('88');
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/admin/credit-packs'; a.textContent = 'test navigation'; document.body.append(a); a.click(); a.remove(); });
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/admin/plans?focus=plus'; a.textContent = 'switch target'; document.body.append(a); a.click(); a.remove(); });
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
  await expect(inputs(page).first()).toHaveValue('88');
  await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
  await page.getByRole('button', { name: /Discard draft and leave|放弃草稿并离开/ }).click();
  await page.getByRole('button', { name: /^Manage pro$|^管理 pro$/i }).click();
  await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click();
  await expect(save(page)).toBeEnabled(); await expect(pending(page)).toHaveCount(0);
  await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
  await expect(workbench(page)).toHaveCount(0);
  await page.getByRole('button', { name: /^Manage pro$|^管理 pro$/i }).click();
  await expect(inputs(page).first()).toHaveValue('88');
  await inputs(page).first().fill('77');
  // Same-object directory refresh must not refill the new ordinary draft.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => /Refresh catalog|刷新目录/.test(button.textContent || ''))?.click());
  await expect(inputs(page).first()).toHaveValue('77');
  expect(state.writes).toHaveLength(1);
});

for (const mode of ['missing', 'null', 'type', 'bad-item', 'empty']) {
  test(`catalog ${mode} differs from legal empty and recovers with GET`, async ({ page }, info) => {
    const state = await harness(page); state.catalog = mode;
    await page.goto('/admin/plans');
    if (mode === 'empty') await expect(page.getByText(/No standard packages|暂无标准套餐/)).toBeVisible();
    else { await expect(page.getByRole('button', { name: /Retry|重试/ })).toBeVisible(); await expect(page.getByText(/No standard packages|暂无标准套餐/)).toHaveCount(0); }
    state.catalog = 'normal';
    await page.getByRole('button', { name: mode === 'empty' ? /Refresh catalog|刷新目录/ : /Retry|重试/ }).click();
    await expect(page.locator('[data-ui="plan-catalog-item"]')).toHaveCount(2);
    state.catalog = 'missing';
    await page.getByRole('button', { name: /Refresh catalog|刷新目录/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /last successfully|最近一次/ })).toBeVisible();
    await expect(page.locator('[data-ui="plan-catalog-item"]')).toHaveCount(2);
    if (mode === 'missing') await image(page, 'catalog-stale', 1440, info);
    expect(state.writes).toHaveLength(0);
  });
}

test('storage failure blocks dispatch and damaged persisted intent is never cleared', async ({ page }) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key.startsWith('admin.plan-parameters.v1:')) throw new Error('storage unavailable'); return set.call(this, key, value); };
  });
  const state = await harness(page);
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click();
  await expect(workbench(page)).toContainText(/storage is unavailable|存储不可用/);
  await expect(save(page)).toBeDisabled(); expect(state.writes).toHaveLength(0);
});

test('real request timeout retains original intent and cannot dispatch another write', async ({ page }) => {
  const state = await harness(page); state.mode = 'delayed';
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click();
  await expect(read(page)).toBeEnabled({ timeout: 20_000 });
  await expect(save(page)).toBeDisabled(); expect(state.writes).toHaveLength(1);
  state.release();
  await read(page).click(); await expect(pending(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});

test('damaged stored evidence blocks writing without silently deleting it', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('admin.plan-parameters.v1:pro', '{damaged'));
  const state = await harness(page);
  await page.goto('/admin/plans?focus=pro');
  await expect(workbench(page)).toContainText(/storage is unavailable|存储不可用/);
  await expect(save(page)).toBeDisabled();
  expect(await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'))).toBe('{damaged');
  expect(state.writes).toHaveLength(0);
});

for (const failure of [{ status: 408, code: 'request.timeout' }, { status: 409, code: 'auth.replay_blocked' }, { status: 409, code: 'service.unknown_conflict' }, { status: 500, code: 'service.error' }]) {
  test(`unknown ${failure.status} ${failure.code} freezes the original operation`, async ({ page }) => {
    const state = await harness(page); state.writeError = failure;
    await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
    await inputs(page).first().fill('88'); await save(page).click(); await expect(read(page)).toBeEnabled();
    await read(page).click(); await expect(read(page)).toBeEnabled();
    await expect(save(page)).toBeDisabled(); await expect(inputs(page).first()).toHaveValue('88');
    expect(state.writes).toHaveLength(1);
    expect(await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'))).not.toBeNull();
  });
}

test('confirmed server proof cannot clear an intent when storage removal fails', async ({ page }) => {
  await page.addInitScript(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) { if (key.startsWith('admin.plan-parameters.v1:')) throw new Error('blocked removal'); return remove.call(this, key); };
  });
  const state = await harness(page);
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click();
  await expect(workbench(page)).toContainText(/storage is unavailable|存储不可用/);
  await expect(save(page)).toBeDisabled(); await expect(pending(page)).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro'))).not.toBeNull();
});

test('pending recovery stays reachable with failed catalog and wrong detail reads', async ({ page }) => {
  const state = await harness(page); state.mode = 'after-drop';
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click(); await expect(read(page)).toBeEnabled();
  await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
  await page.getByRole('button', { name: /Leave and keep|离开并保留/ }).click();
  state.catalog = 'missing'; state.detail = 'wrong'; await page.reload();
  await page.getByRole('button', { name: /Open pending package|打开待确认套餐/ }).click();
  await expect(read(page)).toBeEnabled(); await expect(save(page)).toBeDisabled();
  expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem('admin.plan-parameters.v1:pro')))! ).form.sales_price_cny).toBe('88');
  await read(page).click(); await expect(pending(page)).toHaveCount(0);
  state.detail = 'normal'; await workbench(page).getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect(inputs(page).first()).toHaveValue('88'); expect(state.writes).toHaveLength(1);
});

test('valid background empty catalog cannot unmount an ordinary draft', async ({ page }) => {
  const state = await harness(page);
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('77'); state.catalog = 'empty';
  const before = state.reads.length;
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => /Refresh catalog|刷新目录/.test(button.textContent || ''))?.click());
  await expect.poll(() => state.reads.length).toBeGreaterThan(before);
  await expect(page.getByText(/No standard packages|暂无标准套餐/)).toBeAttached();
  await expect(inputs(page).first()).toHaveValue('77'); await expect(save(page)).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});

test('successful current draft update confirms values without claiming publication', async ({ page }) => {
  const state = await harness(page); state.versionStatus = 'draft';
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await inputs(page).first().fill('88'); await save(page).click();
  await expect(save(page)).toBeEnabled(); await expect(pending(page)).toHaveCount(0);
  await expect(workbench(page)).toContainText(/recorded as successful|成功记录/);
  await expect(workbench(page)).not.toContainText(/已发布|published/i);
  expect(state.writes).toHaveLength(1);
});

test('existing sales success retains the read gate until detail recovery succeeds', async ({ page }) => {
  const state = await harness(page);
  await page.route('**/api/admin/plans/pro/sales', async route => {
    state.detail = 'failed';
    await route.fulfill({ json: buildAdminApiEnvelope({ status: 'retired', receipt: null }) });
  });
  await page.goto('/admin/plans?focus=pro'); await expect(inputs(page).first()).toHaveValue('99');
  await workbench(page).getByRole('button', { name: /^Withdraw$|^下架$/ }).click();
  await expect(workbench(page)).toContainText(/Write succeeded|写入已成功/);
  await expect(save(page)).toBeDisabled(); await expect(inputs(page).first()).toBeDisabled();
  state.detail = 'normal';
  await workbench(page).getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect(save(page)).toBeEnabled(); await expect(inputs(page).first()).toBeEnabled();
  expect(state.writes).toHaveLength(0);
});
