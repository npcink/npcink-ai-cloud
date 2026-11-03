import { createRequire } from 'node:module';
import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/critical-network-fixture';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks, LONG_ACCOUNT_ID } from './helpers/admin-operator-fixture';

test.use({ timezoneId: 'Asia/Shanghai' });
const readAction = /Read operation result|读取操作结果/;
const activateAction = /Activate site|激活站点/;
const setAction = /Save unlock time|保存解锁时间/;
const resetAction = /Restore default|恢复默认/;
const clearAction = /Allow now|立即允许/;
const removeAction = /Remove cooldown|移除冷却/;
const untilLabel = /Cross-account unlock time|跨账号解锁时间/;
const recoverySelector = '[data-ui="site-operation-unconfirmed"]';
const released = '2026-07-01T00:00:00.123456Z';
type Action = 'activate' | 'set' | 'clear' | 'reset';
type Mode = 'lost' | 'timeout' | 'malformed' | 'wrong-target' | '408' | '409' | '500' | 'replay' | 'reject' | 'ok';
type ReadMode = 'failed' | 'missing' | 'ambiguous' | 'wrong' | 'conflict' | 'ok';
const unmatched: string[] = [];
const errors: string[] = [];
test.beforeEach(({ page }) => {
  unmatched.length = 0; errors.length = 0;
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(() => { expect(unmatched).toEqual([]); expect(errors).toEqual([]); });

for (const bad of [undefined, null, [], { site_id: 'other', status: 'active' }, { site_id: 'site_mvp', status: '' }, { site_id: 'site_mvp', status: 'invalid' }]) {
  test(`bad site projection cannot enable writes: ${JSON.stringify(bad)}`, async ({ page }) => {
    await installAdminMocks(page, { unhandledAdminRequests: unmatched });
    let recovered = false; let writes = 0;
    page.on('request', request => { if (request.url().includes('/api/admin/sites/') && request.method() !== 'GET') writes++; });
    await page.route('**/api/admin/sites/site_mvp', route => route.fulfill({ json: buildAdminApiEnvelope({ site: recovered ? { site_id: 'site_mvp', status: 'provisioning' } : bad }) }));
    await page.goto('/admin/sites/site_mvp');
    await expect(page.getByRole('heading', { name: /temporarily unavailable|暂时不可用/ })).toBeVisible();
    await expect(page.getByRole('button', { name: activateAction })).toHaveCount(0);
    expect(writes).toBe(0);
    recovered = true; await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
    await expect(page.getByRole('button', { name: activateAction })).toBeEnabled();
    expect(writes).toBe(0);
  });
}
test('site account association must match while optional omissions remain legal', async ({ page }) => {
  await installAdminMocks(page, { unhandledAdminRequests: unmatched });
  let invalid = true;
  await page.route('**/api/admin/sites/site_mvp', route => route.fulfill({ json: buildAdminApiEnvelope({ site: { site_id: 'site_mvp', account_id: 'acct_a', status: 'provisioning' }, ...(invalid ? { account: { account_id: 'other' } } : {}) }) }));
  await page.goto('/admin/sites/site_mvp');
  await expect(page.getByRole('heading', { name: /temporarily unavailable|暂时不可用/ })).toBeVisible();
  invalid = false; await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect(page.getByRole('button', { name: activateAction })).toBeEnabled();
});

async function respondWrite(route: Route, mode: Mode, data: unknown) {
  if (mode === 'lost') return route.abort('connectionfailed');
  if (mode === 'timeout') { await new Promise(resolve => setTimeout(resolve, 12500)); return route.abort('timedout').catch(() => {}); }
  if (['408', '409', '500', 'replay', 'reject'].includes(mode)) return route.fulfill({ status: mode === 'reject' ? 422 : mode === 'replay' ? 409 : Number(mode), json: buildAdminApiErrorEnvelope('synthetic failure', mode === 'reject' ? 'service.validation_error' : mode === 'replay' ? 'auth.replay_blocked' : `http.${mode}`) });
  return route.fulfill({ json: buildAdminApiEnvelope(mode === 'malformed' ? {} : data) });
}
async function scenario(page: Page, action: Action, mode: Mode = 'lost') {
  await installAdminMocks(page, { unhandledAdminRequests: unmatched });
  const state = { mode, read: 'failed' as ReadMode, primaryFailed: false, submitted: false, until: '2026-12-28T00:00:00.123456Z' };
  const writes: { key: string; body: Record<string, string>; method: string }[] = [];
  const reads: string[] = [];
  let primaryReads = 0;
  const rawSite = () => ({ site_id: 'site_mvp', account_id: LONG_ACCOUNT_ID, name: 'Recovery Site', status: action === 'activate' ? state.submitted ? 'active' : 'provisioning' : 'archived', ownership_released_at: action === 'activate' ? null : released, relink_cooldown_until: state.until });
  const policy = () => ({ enabled: true, default_cooldown_days: 90, ownership_released_at: released, cooldown_until: state.until, cross_account_relink_ready: state.submitted && action === 'clear' });
  await page.route('**/api/admin/sites/site_mvp', route => {
    primaryReads++;
    if (state.primaryFailed) return route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('primary read failed') });
    return route.fulfill({ json: buildAdminApiEnvelope({ site: rawSite(), site_relink_policy: action === 'activate' ? {} : policy() }) });
  });
  await page.route(`**/api/admin/sites/site_mvp/${action === 'activate' ? 'activate' : 'relink-cooldown'}`, async route => {
    const body = route.request().postDataJSON();
    writes.push({ key: route.request().headers()['idempotency-key'], body, method: route.request().method() });
    state.submitted = state.mode !== 'reject';
    state.until = action === 'set' ? body.cooldown_until : action === 'reset' ? '2026-09-29T00:00:00.123456Z' : '2026-11-01T00:00:00.654321Z';
    const direct = action === 'activate' ? rawSite() : { ...rawSite(), action, policy_enabled: true, default_cooldown_days: 90, cross_account_relink_ready: action === 'clear' };
    await respondWrite(route, state.mode, state.mode === 'wrong-target' ? { ...direct, site_id: 'wrong' } : direct);
  });
  await page.route('**/api/admin/sites/site_mvp/operations/*?*', route => {
    expect(route.request().method()).toBe('GET'); reads.push(route.request().url());
    const url = new URL(route.request().url()); const operation = decodeURIComponent(url.pathname.split('/').at(-1)!);
    expect(url.searchParams.get('action')).toBe(action);
    if (state.read === 'failed') return route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('confirmation read failed') });
    if (['missing', 'ambiguous'].includes(state.read)) return route.fulfill({ json: buildAdminApiEnvelope({ site_id: 'site_mvp', operation_id: operation, action, state: 'unconfirmed', site: null, receipt: null }) });
    return route.fulfill({ json: buildAdminApiEnvelope({
      site_id: 'site_mvp', operation_id: state.read === 'wrong' ? 'wrong' : operation, action, state: 'confirmed',
      site: { ...rawSite(), ...(state.read === 'conflict' ? action === 'activate' ? { status: 'provisioning' } : { relink_cooldown_until: '2029-01-01T00:00:00Z' } : {}) },
      receipt: action === 'activate' ? null : { site_id: 'site_mvp', operation_id: operation, action, audit_event_id: 9, resolved_cooldown_until: state.until.replace('Z', '+00:00') },
      site_relink_policy: policy(),
    }) });
  });
  await page.goto('/admin/sites/site_mvp');
  if (action === 'set') await page.getByLabel(untilLabel).fill('2027-02-03T12:05');
  async function submit() {
    await page.getByRole('button', { name: action === 'activate' ? activateAction : action === 'set' ? setAction : action === 'reset' ? resetAction : clearAction }).click();
    if (action === 'clear') await page.getByRole('dialog').getByRole('button', { name: removeAction }).click();
  }
  return { state, writes, reads, submit, primaryReads: () => primaryReads };
}

for (const action of ['activate', 'set', 'clear', 'reset'] as const) {
  for (const mode of ['lost', 'timeout', 'malformed', 'wrong-target', '408', '409', 'replay', '500'] as const) {
    test(`${action} ${mode} stays frozen and confirms with only the narrow GET`, async ({ page }) => {
      const { state, writes, reads, submit, primaryReads } = await scenario(page, action, mode);
      await submit();
      await expect.poll(() => reads.length, { timeout: 20000 }).toBe(1);
      const recovery = page.locator(recoverySelector);
      await expect(recovery.getByRole('button', { name: readAction })).toBeEnabled();
      const initialReads = primaryReads();
      if (action === 'activate') await expect(page.getByRole('button', { name: activateAction })).toBeDisabled();
      else {
        await expect(page.getByLabel(untilLabel)).toBeDisabled();
        for (const button of [setAction, clearAction, resetAction]) await expect(page.getByRole('button', { name: button })).toBeDisabled();
      }
      for (const [index, read] of (['missing', 'ambiguous', 'wrong', 'conflict'] as const).entries()) {
        state.read = read; await recovery.getByRole('button', { name: readAction }).click();
        await expect.poll(() => reads.length).toBe(index + 2);
        await expect(recovery).toBeVisible();
      }
      state.read = 'ok'; await recovery.getByRole('button', { name: readAction }).click();
      await expect(recovery).toHaveCount(0);
      expect(writes).toHaveLength(1); expect(primaryReads()).toBe(initialReads);
      expect(reads.every(url => url.includes(`/operations/${writes[0].key}?`))).toBe(true);
      if (action === 'activate') await expect(page.getByRole('button', { name: activateAction })).toHaveCount(0);
      else await expect(page.getByLabel(untilLabel)).toHaveValue(action === 'set' ? '2027-02-03T12:05' : action === 'reset' ? '2026-09-29T08:00' : '2026-11-01T08:00');
    });
  }
  test(`${action} explicit rejection permits a corrected new intent; direct success is real`, async ({ page }) => {
    const { state, writes, reads, submit, primaryReads } = await scenario(page, action, 'reject');
    await submit();
    await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toBeVisible();
    await expect(page.locator(recoverySelector)).toHaveCount(0);
    state.mode = 'ok'; await submit();
    await expect.poll(() => writes.length).toBe(2);
    await expect(page.locator(recoverySelector)).toHaveCount(0);
    expect(writes[0].key).not.toBe(writes[1].key); expect(reads).toHaveLength(0); expect(primaryReads()).toBe(1);
    if (action === 'set') expect(writes[1].body.cooldown_until).toBe('2027-02-03T04:05:00.000Z');
  });
}

for (const width of [1440, 1056]) {
  for (const action of ['activate', 'set', 'clear', 'reset'] as const) {
    test(`${action} survives refresh with visible recovery at ${width}px PC`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const { state, writes, reads, submit, primaryReads } = await scenario(page, action);
      await submit(); await expect.poll(() => reads.length).toBe(1);
      const originalInput = action === 'activate' ? null : await page.getByLabel(untilLabel).inputValue();
      const liveRecovery = page.locator(recoverySelector);
      await liveRecovery.locator('summary').click();
      await expect(liveRecovery.getByRole('button', { name: readAction })).toBeEnabled();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(liveRecovery.getByRole('button', { name: readAction })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`${action}-workspace-${width}.png`) });
      await page.reload();
      await expect(page.locator(recoverySelector)).toBeVisible();
      if (originalInput !== null) await expect(page.getByLabel(untilLabel)).toHaveValue(originalInput);
      state.primaryFailed = true; await page.reload();
      const recovery = page.locator(recoverySelector);
      await expect(recovery).toBeVisible();
      await expect(page.getByRole('heading', { name: /temporarily unavailable|暂时不可用/ })).toBeVisible();
      await recovery.locator('summary').click();
      await expect(recovery).toContainText(writes[0].key);
      await expect(recovery.getByRole('button', { name: readAction })).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`${action}-pending-${width}.png`) });
      const count = primaryReads(); state.read = 'ok';
      await recovery.getByRole('button', { name: readAction }).click();
      await expect(recovery).toHaveCount(0); expect(writes).toHaveLength(1); expect(primaryReads()).toBe(count);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}
test('storage failure prevents activation and every cooldown write', async ({ page }) => {
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key.startsWith('admin.site-operation.')) throw new Error('storage blocked'); original.call(this, key, value); }; });
  for (const action of ['activate', 'set', 'clear', 'reset'] as const) {
    const { writes, submit } = await scenario(page, action, 'ok');
    await submit(); await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/tab|标签页/);
    expect(writes).toHaveLength(0);
  }
});

test('a primary read already in flight cannot overwrite a newer narrow confirmation', async ({ page }) => {
  const { state, writes, submit } = await scenario(page, 'activate');
  await submit();
  await expect(page.locator(recoverySelector).getByRole('button', { name: readAction })).toBeEnabled();
  state.primaryFailed = true; await page.reload();
  await expect(page.getByRole('heading', { name: /temporarily unavailable|暂时不可用/ })).toBeVisible();
  const held: { confirmation?: Route; primary?: Route } = {};
  await page.route('**/api/admin/sites/site_mvp/operations/*?*', route => { held.confirmation = route; });
  await page.locator(recoverySelector).getByRole('button', { name: readAction }).click();
  await expect.poll(() => Boolean(held.confirmation)).toBe(true);
  await page.route('**/api/admin/sites/site_mvp', route => { held.primary = route; });
  await page.getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect.poll(() => Boolean(held.primary)).toBe(true);
  await held.confirmation!.fulfill({ json: buildAdminApiEnvelope({ site_id: 'site_mvp', operation_id: writes[0].key, action: 'activate', state: 'confirmed', site: { site_id: 'site_mvp', account_id: LONG_ACCOUNT_ID, name: 'Confirmed current site', status: 'active' }, receipt: null }) });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('admin.site-operation.v1:site_mvp'))).toBeNull();
  await held.primary!.fulfill({ json: buildAdminApiEnvelope({ site: { site_id: 'site_mvp', account_id: LONG_ACCOUNT_ID, name: 'Stale projection', status: 'provisioning' } }) });
  await expect(page.getByRole('heading', { name: 'Confirmed current site' })).toBeVisible();
  await expect(page.getByRole('button', { name: activateAction })).toHaveCount(0);
  expect(writes).toHaveLength(1);
});

test('corrupt persisted site intent blocks new writes without discarding evidence', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('admin.site-operation.v1:site_mvp', '{invalid'));
  const { writes } = await scenario(page, 'activate', 'ok');
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/tab|标签页/);
  await expect(page.getByRole('button', { name: activateAction })).toBeDisabled();
  expect(writes).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem('admin.site-operation.v1:site_mvp'))).toBe('{invalid');
});

async function installHarness(page: Page, source: string) {
  const require = createRequire(import.meta.url); const viteDependencies = createRequire(require.resolve('vite'));
  const { buildSync } = viteDependencies('esbuild');
  const bundle = buildSync({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text;
  await page.route('**/site-operation-harness', route => route.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
  await page.goto('/site-operation-harness'); await page.addScriptTag({ content: bundle });
}
for (const action of ['activate', 'set', 'clear', 'reset'] as const) {
  for (const responseMode of ['ok', 'lost'] as const) {
  test(`${action} late ${responseMode} context cannot overwrite a different site or newer operation`, async ({ page }) => {
    await installHarness(page, `import React,{useState} from 'react'; import{createRoot}from'react-dom/client';import{useSiteOperations}from'@/features/admin/sites/site-operations';
      function App(){const[id,setId]=useState('a');const[mount,setMount]=useState(0);const[notice,setNotice]=useState('');return <><button onClick={()=>setId(id==='a'?'b':'a')}>switch</button><button onClick={()=>setMount(mount+1)}>remount</button><span data-notice>{notice}</span><Form key={mount} id={id} saved={(s)=>setNotice(s)}/></>}
      function Form({id,saved}){const c=useSiteOperations({siteId:id,site:{site_id:id,account_id:'acct',status:'${action === 'activate' ? 'provisioning' : 'archived'}',site_relink_policy:{ownership_released_at:'${released}',cooldown_until:'2027-01-01T00:00:00Z'}},writeFailure:'write failed',readFailure:'read failed',invalidTime:'invalid',onConfirmed:r=>saved(String(r.site.site_id))});return <><span data-site>{id}</span><input value={c.input} onChange={e=>c.setInput(e.target.value)} disabled={c.locked}/><button disabled={c.locked} onClick={()=>c.submit('${action}')}>submit</button><button disabled={c.busy} onClick={()=>c.confirm()}>confirm</button><span data-pending>{c.intent?.operation_id||''}</span></>};createRoot(document.getElementById('root')).render(<App/>);`);
    const held: { route: Route; key: string; body: Record<string, string>; siteId: string }[] = [];
    await page.route('**/api/admin/sites/*/activate', hold);
    await page.route('**/api/admin/sites/*/relink-cooldown', hold);
    async function hold(route: Route) { held.push({ route, key: route.request().headers()['idempotency-key'], body: route.request().postDataJSON(), siteId: new URL(route.request().url()).pathname.split('/')[4] }); }
    const data = (siteId: string) => ({ site_id: siteId, account_id: 'acct', status: action === 'activate' ? 'active' : 'archived', ownership_released_at: released, relink_cooldown_until: '2027-01-01T00:00:00.000Z' });
    await page.route('**/api/admin/sites/*/operations/*?*', route => {
      const parts = new URL(route.request().url()).pathname.split('/'); const siteId = parts[4]; const key = parts[6];
      return route.fulfill({ json: buildAdminApiEnvelope({ site_id: siteId, operation_id: key, action, state: 'confirmed', site: data(siteId), receipt: action === 'activate' ? null : { site_id: siteId, operation_id: key, action, audit_event_id: 1, resolved_cooldown_until: '2027-01-01T00:00:00Z' }, site_relink_policy: { enabled: true, default_cooldown_days: 90, ownership_released_at: released, cooldown_until: '2027-01-01T00:00:00Z', cross_account_relink_ready: false } }) });
    });
    await page.getByRole('button', { name: 'submit', exact: true }).click(); await expect.poll(() => held.length).toBe(1);
    await page.getByRole('button', { name: 'switch', exact: true }).click();
    await expect(page.locator('[data-site]')).toHaveText('b');
    await expect(page.getByRole('button', { name: 'submit', exact: true })).toBeEnabled();
    if (responseMode === 'lost') await held[0].route.abort('connectionfailed');
    else await held[0].route.fulfill({ json: buildAdminApiEnvelope(action === 'activate' ? data('a') : { ...data('a'), action, policy_enabled: true, default_cooldown_days: 90, cross_account_relink_ready: false }) });
    await expect(page.locator('[data-notice]')).toHaveText('');
    await page.getByRole('button', { name: 'switch', exact: true }).click();
    if (responseMode === 'lost') {
      await expect(page.locator('[data-pending]')).toHaveText(held[0].key);
      await page.getByRole('button', { name: 'confirm', exact: true }).click();
      await expect(page.locator('[data-pending]')).toHaveText('');
    }
    await page.getByRole('button', { name: 'submit', exact: true }).click(); await expect.poll(() => held.length).toBe(2);
    await page.getByRole('button', { name: 'remount', exact: true }).click();
    await page.getByRole('button', { name: 'confirm', exact: true }).click();
    await expect(page.locator('[data-pending]')).toHaveText('');
    await page.getByRole('button', { name: 'submit', exact: true }).click(); await expect.poll(() => held.length).toBe(3);
    const newer = await page.evaluate(() => sessionStorage.getItem('admin.site-operation.v1:a'));
    await held[1].route.fulfill({ json: buildAdminApiEnvelope(action === 'activate' ? data('a') : { ...data('a'), action, policy_enabled: true, default_cooldown_days: 90, cross_account_relink_ready: false }) });
    expect(await page.evaluate(() => sessionStorage.getItem('admin.site-operation.v1:a'))).toBe(newer);
    await expect(page.getByRole('button', { name: 'submit', exact: true })).toBeDisabled();
    await held[2].route.abort('connectionfailed');
  });
}
}
