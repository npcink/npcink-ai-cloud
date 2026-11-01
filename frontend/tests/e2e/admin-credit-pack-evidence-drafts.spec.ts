import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import { collectBrowserEvents, noUnexpectedBrowserEvents } from './helpers/browser-event-inventory';
import { buildForm, type PackIntent } from '@/features/admin/credit-packs/catalog-projection';
import { packCatalog, packConfirmation, packItems, packWrite, revision } from '../fixtures/admin-credit-packs';
const inventories = new WeakMap<Page, ReturnType<typeof collectBrowserEvents>>();
test.beforeEach(({ page }) => { inventories.set(page, collectBrowserEvents(page)); });
test.afterEach(async ({ page }, info) => {
  const events = inventories.get(page)!;
  const inventory = { test: info.title, statusAtCollection: info.status, ...events.raw, classified: events.classify() };
  const root = process.env.NPCINK_CREDIT_PACK_EVIDENCE;
  if (root) await mkdir(root, { recursive: true });
  const name = `events-${info.title.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 150)}.json`;
  const path = root ? `${root}/${name}` : info.outputPath(name);
  await writeFile(path, JSON.stringify(inventory, null, 2));
  await info.attach('browser-event-inventory', { path, contentType: 'application/json' });
  expect(inventory.classified.unexpected).toEqual(noUnexpectedBrowserEvents);
});
async function harness(page: Page) {
  await installAdminMocks(page);
  const state = { mode: 'normal', catalogMode: 'normal', confirmMode: 'normal', writes: [] as PackIntent[],
    items: packItems(), rev: revision(), recorded: false, reads: [] as string[], release: () => {}, delayConfirmation: false };
  await page.route('**/api/admin/credit-packs**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const failure = async (status: number, code: string) => {
      inventories.get(page)!.injectFailure(req, 'Exact credit pack injected response failure', { status });
      await route.fulfill({ status, json: buildAdminApiErrorEnvelope('injected failure', code) });
    };
    if (req.method() === 'GET') state.reads.push(path);
    if (path.includes('/operations/')) {
      if (state.delayConfirmation) await new Promise<void>(resolve => { state.release = resolve; });
      if (['409', '422', '503'].includes(state.confirmMode)) { await failure(Number(state.confirmMode), state.confirmMode === '409' ? 'service.credit_pack_catalog_revision_conflict' : 'request.validation_error'); return; }
      const original = state.writes.find(item => path.endsWith(item.operation_id));
      const evidence = original ? packConfirmation(original, state.recorded) : null;
      const value = evidence ? { ...evidence, current: evidence.current ? { ...evidence.current, revision: state.rev } : null, receipt: evidence.receipt ? { ...evidence.receipt, revision: state.rev } : null } : {};
      if (state.confirmMode === 'wrong' && 'operation_id' in value) value.operation_id = 'other-operation';
      if (state.confirmMode === 'old' && 'current' in value && value.current) value.current.items = packItems();
      await route.fulfill({ json: buildAdminApiEnvelope(value) }); return;
    }
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      const intent: PackIntent = { ...body, operation_id: req.headers()['idempotency-key'], target: 'pack_small', form: buildForm(body.items[0]) };
      state.writes.push(intent);
      if (state.mode === 'conflict') { state.items = packItems().map((item, i) => i === 1 ? { ...item, amount: 350 } : item); state.rev = revision('c'); await failure(409, 'service.credit_pack_catalog_revision_conflict'); return; }
      if (state.mode === 'reject') { await failure(422, 'request.validation_error'); return; }
      if (state.mode === 'before-drop') {
        inventories.get(page)!.injectFailure(req, 'Pre-execution response loss', { failure: 'net::ERR_CONNECTION_RESET' }); await route.abort('connectionreset'); return;
      }
      state.items = body.items; state.rev = revision((state.writes.length + 10).toString(16)); state.recorded = true;
      if (state.mode === 'after-drop') {
        inventories.get(page)!.injectFailure(req, 'Post-commit response loss', { failure: 'net::ERR_CONNECTION_RESET' }); await route.abort('connectionreset'); return;
      }
      const value = { ...packWrite(intent), revision: state.rev };
      let response: unknown = value;
      if (state.mode === 'missing-items') { const { items: _, ...rest } = value; response = rest; }
      if (state.mode === 'missing-revision') response = { ...value, revision: '' };
      if (state.mode === 'bad-row') response = { ...value, items: [null] };
      if (state.mode === 'duplicate') response = { ...value, items: [body.items[0], body.items[0]] };
      if (state.mode === 'missing-target') response = { ...value, items: body.items.slice(1) };
      if (state.mode === 'other-pack') response = { ...value, items: body.items.map((item: object, i: number) => i === 1 ? { ...item, amount: 1 } : item) };
      await route.fulfill({ json: buildAdminApiEnvelope(response) }); return;
    }
    let value: unknown = packCatalog(state.items, state.rev);
    if (state.catalogMode === 'empty') value = packCatalog([]);
    if (state.catalogMode === 'missing') value = {};
    if (state.catalogMode === 'null') value = { ...packCatalog(), items: null };
    if (state.catalogMode === 'bad-row') value = { ...packCatalog(), items: [null] };
    await route.fulfill({ json: buildAdminApiEnvelope(value) });
  });
  return state;
}
const workbench = (page: Page) => page.locator('[data-ui="admin-workbench-dialog"]');
const numbers = (page: Page) => workbench(page).locator('input[type="number"]');
const save = (page: Page) => workbench(page).getByRole('button', { name: /Save pack|保存(?: AI )?积分包/ });
const read = (page: Page) => page.getByRole('button', { name: /Read operation result|读取操作结果/ });
const pending = (page: Page) => page.locator('[data-ui="credit-pack-pending-operation"]');
async function open(page: Page) {
  await page.goto('/admin/credit-packs');
  await page.locator('[data-pack-id="pack_small"]').getByRole('button').click();
  await expect(numbers(page).first()).toHaveValue('10000');
  await expect(workbench(page).locator('[data-ui="admin-workbench-close"]')).toBeFocused();
}
async function screenshot(page: Page, name: string, info: TestInfo) {
  const root = process.env.NPCINK_CREDIT_PACK_EVIDENCE;
  if (root) await mkdir(root, { recursive: true });
  const path = root ? `${root}/${name}.png` : info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true }); await info.attach(name, { path, contentType: 'image/png' });
}
for (const width of [1440, 1056]) {
  test(`defaults decimals and unified Enter/button validation PC ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page); await open(page);
    for (const amount of ['0', '-1', '0.0000001', '0.1234567', '']) {
      await numbers(page).nth(1).fill(amount); await numbers(page).nth(1).press('Enter'); await save(page).click();
      expect(state.writes).toHaveLength(0);
    }
    for (const value of ['0', '1.5', '10000001']) {
      await numbers(page).nth(1).fill('99'); await numbers(page).first().fill(value);
      await numbers(page).first().press('Enter'); await save(page).click(); expect(state.writes).toHaveLength(0);
    }
    await numbers(page).first().fill('10000');
    await workbench(page).locator('input').first().fill('New name');
    expect(await numbers(page).first().evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
    expect(await numbers(page).nth(1).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
    await screenshot(page, `pc-${width}-valid-defaults`, info);
    await numbers(page).nth(1).press('Enter'); await expect(workbench(page)).toHaveCount(0); expect(state.writes).toHaveLength(1);
    for (const [i, amount] of ['29.9', '0.123456', '0.000001'].entries()) {
      await page.locator('[data-pack-id="pack_small"]').getByRole('button').click();
      await expect(workbench(page).locator('[data-ui="admin-workbench-close"]')).toBeFocused();
      await numbers(page).nth(1).fill(amount);
      await expect(save(page)).toBeEnabled();
      expect(await numbers(page).nth(1).evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
      if (i % 2) await numbers(page).nth(1).press('Enter'); else await save(page).click();
      await expect(workbench(page)).toHaveCount(0); expect(state.writes).toHaveLength(i + 2);
    }
    await expect(page.locator('[data-pack-id="pack_small"]')).toContainText('0.000001');
    await expect(page.getByRole('button', { name: 'Close notification' })).toHaveCount(0, { timeout: 7000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await screenshot(page, `pc-${width}-confirmed`, info);
  });
  test(`post-commit loss preserves same-tab snapshot through close reload and readonly recovery PC ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 }); const state = await harness(page); state.mode = 'after-drop'; await open(page);
    await numbers(page).nth(1).fill('88.123456'); await save(page).click(); await expect(read(page)).toBeEnabled();
    await expect(save(page)).toBeDisabled(); expect(state.writes).toHaveLength(1);
    const original = state.writes[0];
    const snapshot = await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'));
    expect(JSON.parse(snapshot!).items).toEqual(original.items);
    await screenshot(page, `pc-${width}-unknown`, info);
    if (width === 1440) {
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(page.locator('html')).toHaveClass(/dark/);
      await screenshot(page, 'pc-1440-unknown-dark', info);
      await page.emulateMedia({ colorScheme: 'light' });
      await expect(page.locator('html')).not.toHaveClass(/dark/);
    }
    await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
    await page.getByRole('button', { name: /Leave and keep pending|离开并保留待确认/ }).click();
    await expect(pending(page)).toBeVisible(); await expect(workbench(page)).toHaveCount(0);
    await inventories.get(page)!.beforeReload(); page.once('dialog', dialog => dialog.accept()); await page.reload();
    await expect(numbers(page).nth(1)).toHaveValue('88.123456'); await expect(save(page)).toBeDisabled();
    await screenshot(page, `pc-${width}-restored`, info);
    for (const mode of ['503', '409', '422', 'wrong', 'old']) {
      state.confirmMode = mode; await read(page).click(); await expect(read(page)).toBeEnabled(); await expect(pending(page)).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'))).toBe(snapshot);
    }
    state.confirmMode = 'normal'; const before = state.reads.length;
    await read(page).click(); await expect(pending(page)).toHaveCount(0); await expect(workbench(page)).toHaveCount(0);
    expect(state.writes).toHaveLength(1); expect(state.reads.slice(before)).toEqual([`/api/admin/credit-packs/operations/${original.operation_id}`]);
    expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'))).toBeNull();
  });
}
for (const mode of ['missing-items', 'missing-revision', 'bad-row', 'duplicate', 'missing-target', 'other-pack']) {
  test(`malformed success ${mode} preserves old directory and submitted snapshot`, async ({ page }) => {
    const state = await harness(page); state.mode = mode; await open(page); await numbers(page).nth(1).fill('88'); await save(page).click();
    await expect(read(page)).toBeEnabled(); await expect(save(page)).toBeDisabled(); await expect(numbers(page).nth(1)).toHaveValue('88');
    await expect(page.locator('[data-pack-id="pack_small"]')).toContainText('99.00');
    await expect(page.locator('[data-pack-id]')).toHaveCount(3);
    expect(state.writes).toHaveLength(1); await read(page).click(); await expect(pending(page)).toHaveCount(0); expect(state.writes).toHaveLength(1);
  });
}
test('pre-execution loss cannot confirm identical current values or replay after navigation', async ({ page }) => {
  const state = await harness(page); state.mode = 'before-drop'; await open(page); await numbers(page).nth(1).fill('99.000001'); await save(page).click();
  await expect(read(page)).toBeEnabled(); state.items = state.writes[0].items; await read(page).click(); await expect(read(page)).toBeEnabled(); await expect(save(page)).toBeDisabled();
  const stored = await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'));
  await page.locator('[data-ui="admin-workspace-navigation"] a[href="/admin/plans"]').evaluate(a => (a as HTMLAnchorElement).click());
  await page.getByRole('button', { name: /Leave and keep pending|离开并保留待确认/ }).click();
  await expect(page).toHaveURL(/\/admin\/plans/);
  await inventories.get(page)!.beforeReload();
  await page.goto('/admin/credit-packs'); await expect(pending(page)).toBeVisible(); await expect(save(page)).toBeDisabled();
  expect(state.writes).toHaveLength(1); expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'))).toBe(stored);
});
test('real conflict retains draft through failed latest read and requires explicit adoption; rejection stays editable', async ({ page }, info) => {
  const state = await harness(page); state.mode = 'conflict'; await open(page); await numbers(page).nth(1).fill('88'); await save(page).click();
  await expect(page.getByRole('button', { name: /Read latest catalog|读取最新目录/ })).toBeVisible(); await expect(numbers(page).nth(1)).toHaveValue('88');
  expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'))).toBeNull();
  state.catalogMode = 'missing'; await page.getByRole('button', { name: /Read latest catalog|读取最新目录/ }).click();
  await expect(page.getByRole('button', { name: /Discard draft and adopt latest|放弃草稿并采用最新目录/ })).toHaveCount(0);
  state.catalogMode = 'normal'; await page.getByRole('button', { name: /Read latest catalog|读取最新目录/ }).click();
  await expect(page.getByRole('button', { name: /Discard draft and adopt latest|放弃草稿并采用最新目录/ })).toBeVisible();
  await expect(numbers(page).nth(1)).toHaveValue('88'); await screenshot(page, 'conflict-comparison', info);
  await page.getByRole('button', { name: /Discard draft and adopt latest|放弃草稿并采用最新目录/ }).click();
  await page.getByRole('button', { name: /Discard draft and leave|放弃草稿并离开/ }).click();
  await expect(numbers(page).nth(1)).toHaveValue('99');
  state.mode = 'reject'; await numbers(page).nth(1).fill('89'); await save(page).click(); await expect(save(page)).toBeEnabled();
  await expect(numbers(page).nth(1)).toHaveValue('89'); expect(state.writes).toHaveLength(2);
});
test('ordinary dirty draft guards X Escape same-route history and reload, clean saved state leaves freely', async ({ page }, info) => {
  const state = await harness(page); await open(page); await numbers(page).nth(1).fill('88');
  for (const exit of ['x', 'escape', 'same-route', 'route']) {
    if (exit === 'x') await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
    if (exit === 'escape') await page.keyboard.press('Escape');
    if (exit === 'route') await page.locator('[data-ui="admin-workspace-navigation"] a[href="/admin/plans"]').evaluate(a => (a as HTMLAnchorElement).click());
    if (exit === 'same-route') await page.evaluate(() => { const a = document.createElement('a'); a.href = '/admin/credit-packs?focus=pack_medium'; document.body.append(a); a.click(); a.remove(); });
    await expect(page.getByRole('button', { name: /Discard draft and leave|放弃草稿并离开/ })).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$|^取消$/ }).last().click(); await expect(numbers(page).nth(1)).toHaveValue('88');
  }
  await page.evaluate(() => history.pushState(history.state, '', `${location.pathname}${location.search}&history_probe=1`));
  await page.evaluate(() => history.back());
  await expect(page.getByRole('button', { name: /Discard draft and leave|放弃草稿并离开/ })).toBeVisible();
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).last().click();
  await inventories.get(page)!.beforeReload();
  const originalUrl = page.url();
  const documentMarker = await page.evaluate(() => {
    const marker = crypto.randomUUID(); document.documentElement.dataset.reloadProbe = marker; return marker;
  });
  const reloadStartedAt = Date.now();
  const unload = page.waitForEvent('dialog', { timeout: 3000 });
  const reload = page.reload({ timeout: 3000 }).then(() => null, (error: Error) => error.message);
  const dialog = await unload;
  expect(dialog.type()).toBe('beforeunload');
  const dialogAt = Date.now(); await dialog.dismiss();
  const reloadError = await reload;
  expect(reloadError).toMatch(/Timeout 3000ms exceeded|ERR_ABORTED|navigation.*cancel/i);
  expect(page.url()).toBe(originalUrl);
  expect(await page.evaluate(() => document.documentElement.dataset.reloadProbe)).toBe(documentMarker);
  await expect(numbers(page).nth(1)).toHaveValue('88');
  expect(state.writes).toHaveLength(0);
  const reloadEvidence = JSON.stringify({ reloadStartedAt, dialogAt, completedAt: Date.now(), dialogType: dialog.type(), dismissed: true, reloadError, sameUrl: true, sameDocument: true, draftAmount: '88', patches: state.writes.length });
  const evidenceRoot = process.env.NPCINK_CREDIT_PACK_EVIDENCE;
  if (evidenceRoot) { await mkdir(evidenceRoot, { recursive: true }); await writeFile(`${evidenceRoot}/cancelled-reload-evidence.json`, reloadEvidence); }
  await info.attach('cancelled-reload-evidence', { body: reloadEvidence, contentType: 'application/json' });
  await save(page).click(); await expect(workbench(page)).toHaveCount(0);
  await page.locator('[data-ui="admin-workspace-navigation"] a[href="/admin/plans"]').evaluate(a => (a as HTMLAnchorElement).click()); await expect(page).toHaveURL(/\/admin\/plans/);
});
test('initial malformed and stale reads remain unavailable; legal empty and GET recovery stay distinct', async ({ page }, info) => {
  const state = await harness(page); state.catalogMode = 'missing'; await page.goto('/admin/credit-packs');
  await expect(page.getByRole('button', { name: /Retry|重试/ })).toBeVisible(); await expect(page.locator('[data-pack-id]')).toHaveCount(0);
  state.catalogMode = 'empty'; await page.getByRole('button', { name: /Retry|重试/ }).click(); await expect(page.locator('[data-ui="credit-pack-directory-table"]')).toBeVisible();
  await expect(page.locator('[data-pack-id]')).toHaveCount(0);
  state.catalogMode = 'normal'; await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click(); await expect(page.locator('[data-pack-id]')).toHaveCount(3);
  for (const mode of ['missing', 'null', 'bad-row']) {
    state.catalogMode = mode; await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
    await expect(page.getByRole('button', { name: /^Retry$|^重试$/ })).toBeVisible();
    await expect(page.locator('[data-pack-id="pack_small"]').getByRole('button')).toBeDisabled(); await expect(page.locator('[data-pack-id]')).toHaveCount(3);
  }
  await screenshot(page, 'damaged-read-retains-directory', info);
  state.catalogMode = 'normal'; await page.getByRole('button', { name: /^Retry$|^重试$/ }).click(); await expect(page.locator('[data-pack-id="pack_small"]').getByRole('button')).toBeEnabled();
});
test('unavailable or damaged same-tab storage blocks all writes', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('admin.credit-pack-catalog.v1', '{damaged'));
  const state = await harness(page); await page.goto('/admin/credit-packs');
  await expect(page.getByRole('alert').filter({ hasText: /storage|存储/ })).toBeVisible();
  await expect(page.locator('[data-pack-id="pack_small"]').getByRole('button')).toBeDisabled(); expect(state.writes).toHaveLength(0);
});
test('late confirmation after leaving cannot replace a new context or release persisted intent', async ({ page }) => {
  const state = await harness(page); state.delayConfirmation = true; await open(page);
  await numbers(page).nth(1).fill('88'); await save(page).click();
  await expect.poll(() => state.reads.some(path => path.includes('/operations/'))).toBe(true);
  const snapshot = await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'));
  await page.locator('[data-ui="admin-workspace-navigation"] a[href="/admin/plans"]').evaluate(a => (a as HTMLAnchorElement).click());
  await page.getByRole('button', { name: /Leave and keep pending|离开并保留待确认/ }).click();
  await expect(page).toHaveURL(/\/admin\/plans/);
  state.delayConfirmation = false; state.release();
  await expect.poll(() => state.reads.filter(path => path.includes('/operations/')).length).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'))).toBe(snapshot);
  await inventories.get(page)!.beforeReload();
  await page.goto('/admin/credit-packs'); await expect(numbers(page).nth(1)).toHaveValue('88');
  await expect(save(page)).toBeDisabled(); await read(page).click(); await expect(pending(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(1);
});
test('failed intent persistence prevents dispatch and retains numeric draft', async ({ page }) => {
  const state = await harness(page); await open(page); await numbers(page).nth(1).fill('88');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'admin.credit-pack-catalog.v1') throw new Error('injected storage failure');
      return original.call(this, key, value);
    };
  });
  await save(page).click(); await expect(save(page)).toBeDisabled(); await expect(numbers(page).nth(1)).toHaveValue('88');
  expect(state.writes).toHaveLength(0);
});

test('empty recommendations reject Enter and button before persistence; restoring a tier saves', async ({ page }) => {
  const state = await harness(page); await open(page);
  await workbench(page).getByRole('checkbox', { name: 'free', exact: true }).uncheck();
  await workbench(page).getByRole('checkbox', { name: 'plus', exact: true }).uncheck();
  await numbers(page).first().press('Enter');
  await expect(workbench(page).getByRole('alert')).toContainText(/recommended package|推荐套餐/);
  await save(page).click();
  expect(state.writes).toHaveLength(0); await expect(pending(page)).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-pack-catalog.v1'))).toBeNull();
  await workbench(page).locator('[data-ui="admin-workbench-close"]').click();
  await expect(page.getByRole('button', { name: /Discard draft and leave|放弃草稿并离开/ })).toBeVisible();
  await page.getByRole('button', { name: /^Cancel$|^取消$/ }).last().click();
  await workbench(page).getByRole('checkbox', { name: 'plus', exact: true }).check();
  await save(page).click(); await expect(workbench(page)).toHaveCount(0);
  expect(state.writes).toHaveLength(1); expect(state.writes[0].items[0].recommended_for_tiers).toEqual(['plus']);
});
