import { createRequire } from 'node:module';
import { expect, type Page, type Route } from '@playwright/test';
import { test } from './helpers/critical-network-fixture';
import { buildAdminApiEnvelope as envelope, buildAdminApiErrorEnvelope as failure, installAdminMocks, LONG_ACCOUNT_ID as id } from './helpers/admin-operator-fixture';
import { quotaFixture, ledgerFixture, ledgerEntryFixture } from '../fixtures/admin-account-evidence';

test.setTimeout(30_000);

const creditTab = /Credits and usage|积分与用量/;
const noteLabel = /Operator note|运营备注/;
const leaveName = /Leave with unsaved customer changes|放弃未保存的客户更改/;
const siteLeave = /Leave with an unsaved unlock time|放弃未保存的解锁时间/;
let unmatched: string[] = [];
let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  unmatched = []; errors = [];
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(() => { expect(unmatched).toEqual([]); expect(errors).toEqual([]); });
const mocks = (page: Page, options: Parameters<typeof installAdminMocks>[1] = {}) => installAdminMocks(page, { ...options, unhandledAdminRequests: unmatched });
const writesOn = (page: Page) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/admin/') && !['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  return writes;
};
const sitePayload = (until = '2026-12-01T00:00:00Z') => ({
  site: { site_id: 'site_mvp', account_id: id, name: 'MVP Site', status: 'archived' },
  site_relink_policy: { enabled: true, default_cooldown_days: 90, ownership_released_at: '2026-07-01T00:00:00Z', cooldown_until: until, cross_account_relink_ready: false },
});
async function openProfile(page: Page) {
  const editor = page.locator('[data-ui="operator-profile-editor"]');
  if (!await editor.getAttribute('open')) await editor.locator('summary').click();
  return editor;
}
async function harness(page: Page, contents: string) {
  const require = createRequire(import.meta.url); const deps = createRequire(require.resolve('vite'));
  const js = deps('esbuild').buildSync({ stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text;
  await page.route('**/evidence-review-harness', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('/evidence-review-harness'); await page.addScriptTag({ content: js });
}

for (const [caseIndex, bad] of [null, [null], [{ site_id: 's', name: '', status: 'active' }], [{ site_id: 's', account_id: 'other', name: '', status: 'active' }]].entries()) {
  test(`site evidence case ${caseIndex} rejects ${JSON.stringify(bad)} while keeping independent uncovered facts`, async ({ page }, testInfo) => {
    const controller = { value: bad as unknown }; await mocks(page, { accountSitesController: controller });
    const writes = writesOn(page);
    await page.goto(`/admin/accounts/${id}`);
    await expect(page.getByRole('heading', { name: /Uncovered commercial posture|未覆盖/ }).first()).toBeVisible();
    await expect(page.getByText(/This customer has site footprint without readable package coverage/)).toHaveCount(0);
    await page.getByRole('tab', { name: /Commercial|商业套餐/ }).click();
    await expect(page.getByText(/Site footprint is attached to current subscription coverage|站点规模已关联/)).toHaveCount(0);
    await page.getByRole('tab', { name: /^Sites$|^站点$/ }).click();
    await expect(page.locator('[data-ui="account-site-evidence-error"]')).toBeVisible();
    if (bad === null) {
      for (const width of [1440, 1056]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator('[data-ui="account-site-evidence-error"]').getByRole('button')).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`site-unavailable-${width}.png`) });
      }
    }
    controller.value = [];
    await page.locator('[data-ui="account-site-evidence-error"]').getByRole('button').click();
    await expect(page.getByText(/No sites on this customer|这个客户下暂无站点/)).toBeVisible();
    expect(writes).toEqual([]);
  });
}

for (const bad of [{}, { ...quotaFixture(id), account_id: 'other' }, { ...quotaFixture(id), ai_credits: { ...quotaFixture(id).ai_credits, key: 'bound_sites', unit: 'site' } }]) {
  test(`bad quota ${JSON.stringify(bad)} blocks new credit actions and GET recovers`, async ({ page }) => {
    const quota = { value: bad as unknown }; await mocks(page, { quotaPayloadController: quota });
    const writes = writesOn(page);
    await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: creditTab }).click();
    await expect(page.locator('[data-ui="account-credit-actions-blocked"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Adjust AI credits|调整 AI 积分/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Open top-up options|打开加量包选项/ })).toBeDisabled();
    await expect(page.locator('[data-ui="account-credit-summary"]')).toHaveCount(0);
    quota.value = quotaFixture(id);
    await page.locator('#quota-posture').getByRole('button', { name: /^Retry$|^重试$/ }).click();
    await expect(page.getByRole('button', { name: /Adjust AI credits|调整 AI 积分/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Open top-up options|打开加量包选项/ })).toBeEnabled();
    expect(writes).toEqual([]);
  });
}

test('quota re-read freezes new writes before a malformed result arrives', async ({ page }) => {
  await mocks(page, { quotaPayload: { ...quotaFixture(id), status: 'near_limit' } }); const writes = writesOn(page);
  await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: creditTab }).click();
  await page.getByRole('button', { name: /View quota details|查看额度详情/ }).click();
  const quotaDialog = page.getByRole('dialog', { name: /Quota details|额度详情/ });
  await quotaDialog.getByRole('tab', { name: /Advanced|高级/ }).click();
  let held: Route | undefined;
  await page.route(`**/api/admin/accounts/${id}/quota-summary`, route => { held = route; });
  await quotaDialog.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await quotaDialog.getByRole('button', { name: /^Close$|^关闭$/ }).click();
  // A re-read freezes new writes immediately, before its result arrives.
  await expect(page.getByRole('button', { name: /Open top-up options|打开加量包选项/ })).toBeDisabled();
  await held!.fulfill({ json: envelope({}) });
  await expect(page.locator('[data-ui="account-credit-actions-blocked"]')).toBeVisible();
  expect(writes).toEqual([]);
});

test('ledger first load and held retry never declare empty or complete', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mocks(page); const writes = writesOn(page); const held: Route[] = [];
  await page.route(`**/api/admin/accounts/${id}/credit-ledger?*`, route => { held.push(route); });
  await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: creditTab }).click();
  await page.getByRole('button', { name: /View ledger|查看本期流水/ }).click();
  const drawer = page.getByRole('dialog', { name: /Credit ledger detail|AI 积分账本明细/ });
  await expect(drawer.locator('[data-ui="account-credit-ledger-pending"]')).toBeVisible();
  await expect(drawer.getByText(/No ledger records|本周期暂无账本记录/)).toHaveCount(0);
  await expect(drawer.getByText(/Unknown records|未知.*条|正常/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('ledger-pending-1440x900.png') });
  await held[0].fulfill({ json: envelope({ account_id: id, items: [] }) });
  await expect(drawer.locator('[data-ui="account-credit-ledger-error"]')).toBeVisible();
  await drawer.getByRole('button', { name: /^Retry$|^重试$/ }).click();
  await expect.poll(() => held.length).toBe(2);
  await expect(drawer.locator('[data-ui="account-credit-ledger-pending"]')).toBeVisible();
  await expect(drawer.getByText(/No ledger records|本周期暂无账本记录/)).toHaveCount(0);
  await held[1].fulfill({ json: envelope(ledgerFixture(id)) });
  await expect(drawer.getByText(/No ledger records|本周期暂无账本记录/)).toBeVisible();
  expect(writes).toEqual([]);
});

test('bad quota does not block pending adjustment exact GET or release its key', async ({ page }) => {
  await mocks(page, { quotaPayload: {} }); const writes = writesOn(page);
  const intent = { account_id: id, operation_id: 'admin_credit_adjustment_review_123456789', body: { event_type: 'adjustment', ai_credit_delta: -10, reason: 'review', note: 'retained' } };
  await page.addInitScript(({ id, intent }) => sessionStorage.setItem(`admin.credit-adjustment.v1:${id}`, JSON.stringify(intent)), { id, intent });
  let reads = 0;
  await page.route(`**/api/admin/accounts/${id}/credit-ledger/adjustments/*`, route => {
    reads++; expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: envelope({ account_id: id, operation_id: intent.operation_id, state: 'unconfirmed', entry: null }) });
  });
  await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: creditTab }).click();
  const notice = page.locator('[data-ui="credit-adjustment-unconfirmed"]');
  await expect(notice).toContainText(intent.operation_id);
  await notice.getByRole('button', { name: /Read adjustment result|读取调整结果/ }).click();
  await expect.poll(() => reads).toBe(1);
  expect(await page.evaluate(id => JSON.parse(sessionStorage.getItem(`admin.credit-adjustment.v1:${id}`)!).operation_id, id)).toBe(intent.operation_id);
  expect(writes).toEqual([]);
});

for (const dirty of [false, true]) {
  test(`same-customer delayed refresh ${dirty ? 'preserves draft' : 'updates clean baseline'}`, async ({ page }) => {
    await mocks(page, { accountSites: null }); const writes = writesOn(page);
    await page.goto(`/admin/accounts/${id}`);
    const editor = await openProfile(page);
    if (dirty) await editor.getByLabel(noteLabel).fill('my newer draft');
    await page.getByRole('tab', { name: /^Sites$|^站点$/ }).click();
    let held: Route | undefined;
    await page.route(`**/api/admin/accounts/${id}`, route => { held = route; });
    await page.locator('[data-ui="account-site-evidence-error"]').getByRole('button').click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await held!.fulfill({ json: envelope({ account: { account_id: id, name: 'Remote customer', status: 'active', metadata: { operator_display_name: 'remote', operator_note: 'server refreshed' } }, sites: [], subscriptions: [] }) });
    await page.getByRole('tab', { name: /^Overview$|^概况$/ }).click();
    await openProfile(page);
    await expect(editor.getByLabel(noteLabel)).toHaveValue(dirty ? 'my newer draft' : 'server refreshed');
    await page.getByRole('link', { name: /Back to customers|返回客户列表/i }).click();
    if (dirty) await expect(page.getByRole('dialog', { name: leaveName })).toBeVisible();
    else await expect(page).toHaveURL(/\/admin\/accounts$/);
    expect(writes).toEqual([]);
  });
}

for (const kind of ['profile', 'site'] as const) {
  test(`${kind} saved baseline survives delayed same-object props, initializes new context, and is clean after save`, async ({ page }) => {
    await harness(page, `import React,{useState}from'react';import{createRoot}from'react-dom/client';
      import{useAccountOperatorProfile}from'@/features/admin/accounts/account-operator-profile';
      import{useSiteOperations}from'@/features/admin/sites/site-operations';
      function App(){const[id,setId]=useState('a');const[remote,setRemote]=useState('${kind === 'site' ? '2026-12-01T00:00:00Z' : 'initial'}');
      const c=${kind === 'site' ? "useSiteOperations({siteId:id,site:{site_id:id,account_id:'acct',status:'archived',site_relink_policy:{ownership_released_at:'2026-07-01T00:00:00Z',cooldown_until:remote}},writeFailure:'failed',readFailure:'read failed',invalidTime:'invalid',onConfirmed:r=>setRemote(r.policy.cooldown_until)})" : "useAccountOperatorProfile({account:{account_id:id,name:'',status:'active',metadata:{},operator_display_name:'',operator_note:remote},errorFallback:'failed',readFailure:'read failed',savedNotice:'saved',onSaved:r=>setRemote(r.operator_note)})"};
      return <><input aria-label="draft" value={${kind === 'site' ? 'c.input' : 'c.values.operator_note'}} disabled={${kind === 'site' ? 'c.locked' : 'c.locked'}} onChange={e=>${kind === 'site' ? 'c.setInput(e.target.value)' : "c.setField('operator_note',e.target.value)"}}/>
      <output data-dirty>{String(${kind === 'site' ? 'c.inputDirty' : 'c.dirty'})}</output><button onClick={()=>setRemote(current=>current==='${kind === 'site' ? '2027-01-01T00:00:00Z' : 'refreshed'}'?'${kind === 'site' ? '2027-03-01T00:00:00Z' : 'later server'}':'${kind === 'site' ? '2027-01-01T00:00:00Z' : 'refreshed'}')}>refresh</button>
      <button onClick={()=>setId(id==='a'?'b':'a')}>switch</button><button onClick={()=>${kind === 'site' ? "c.submit('set')" : 'c.submit()'}}>save</button></>};createRoot(document.getElementById('root')).render(<App/>);`);
    await expect(page.locator('[data-dirty]')).toHaveText('false');
    await page.getByRole('button', { name: 'refresh', exact: true }).click();
    await expect(page.getByLabel('draft')).toHaveValue(kind === 'site' ? /2027-01-01/ : 'refreshed');
    await expect(page.locator('[data-dirty]')).toHaveText('false');
    const draft = kind === 'site' ? '2027-02-03T12:05' : 'newer draft';
    await page.getByLabel('draft').fill(draft);
    // A later same-object projection arrives after the user typed.
    await page.getByRole('button', { name: 'refresh', exact: true }).click();
    await expect(page.getByLabel('draft')).toHaveValue(draft);
    await expect(page.locator('[data-dirty]')).toHaveText('true');
    await page.getByRole('button', { name: 'switch', exact: true }).click();
    await expect(page.locator('[data-dirty]')).toHaveText('false');
    await page.getByLabel('draft').fill(draft);
    let held: Route | undefined;
    await page.route(kind === 'site' ? '**/api/admin/sites/b/relink-cooldown' : '**/api/admin/accounts/b/operator-profile', route => { held = route; });
    await page.getByRole('button', { name: 'save', exact: true }).click();
    await expect.poll(() => Boolean(held)).toBe(true);
    await expect(page.getByLabel('draft')).toBeDisabled();
    const body = held!.request().postDataJSON();
    await held!.fulfill({ json: envelope(kind === 'site' ? { site_id: 'b', account_id: 'acct', status: 'archived', action: 'set', ownership_released_at: '2026-07-01T00:00:00Z', relink_cooldown_until: body.cooldown_until, policy_enabled: true, default_cooldown_days: 90, cross_account_relink_ready: false } : { account_id: 'b', name: '', status: 'active', metadata: body }) });
    await expect(page.getByLabel('draft')).toBeEnabled();
    await expect(page.getByLabel('draft')).toHaveValue(draft);
    await expect(page.locator('[data-dirty]')).toHaveText('false');
  });
}

for (const target of ['customer', 'site'] as const) {
  test(`${target} real dirty guard covers internal link, history both directions, beforeunload and tabs`, async ({ page }, testInfo) => {
    await mocks(page, { sitePayloadController: { value: sitePayload() } }); const writes = writesOn(page);
    await page.goto('/admin/accounts');
    await page.locator(`a[href^="/admin/accounts/${id}"]`).first().click();
    if (target === 'site') {
      await page.getByRole('tab', { name: /^Sites$|^站点$/ }).click();
      await page.getByRole('link', { name: 'site_mvp', exact: true }).click();
    }
    const destination = target === 'site' ? /\/admin\/sites\/site_mvp/ : new RegExp(`/admin/accounts/${id}`);
    await expect(page).toHaveURL(destination);
    // Clean navigation produces no modal and creates a forward entry.
    await page.locator('[data-ui="admin-primary-nav"] a[href="/admin/accounts"]').click();
    await expect(page).toHaveURL(/\/admin\/accounts$/);
    await page.goBack(); await expect(page).toHaveURL(destination);
    const draft = target === 'site' ? page.getByLabel(/Cross-account unlock time|跨账号解锁时间/) : (await openProfile(page)).getByLabel(noteLabel);
    const value = target === 'site' ? '2027-02-03T12:05' : 'history protected draft';
    await draft.fill(value);
    if (target === 'customer') {
      await page.getByRole('tab', { name: creditTab }).click();
      await page.getByRole('tab', { name: /^Overview$|^概况$/ }).click();
      await openProfile(page); await expect(draft).toHaveValue(value);
    }
    const dialog = page.getByRole('dialog', { name: target === 'site' ? siteLeave : leaveName });
    await page.locator('[data-ui="admin-primary-nav"] a[href="/admin/accounts"]').click();
    await expect(dialog).toBeVisible();
    for (const width of [1440, 1056]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog.getByRole('button', { name: /Discard and leave|放弃并离开/ })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${target}-draft-leave-${width}.png`) });
    }
    await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
    for (const direction of ['back', 'forward'] as const) {
      await page.evaluate(direction => window.history[direction](), direction);
      await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
      await expect(page).toHaveURL(destination); await expect(draft).toHaveValue(value);
    }
    expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
    const unload = page.waitForEvent('dialog');
    await page.evaluate(() => { setTimeout(() => window.location.reload(), 0); });
    const native = await unload; expect(native.type()).toBe('beforeunload'); await native.dismiss();
    await expect(draft).toHaveValue(value);
    await page.evaluate(() => window.history.forward());
    await expect(dialog).toBeVisible(); await dialog.getByRole('button', { name: /Discard and leave|放弃并离开/ }).click();
    await expect(page).toHaveURL(/\/admin\/accounts$/);
    expect(writes).toEqual([]);
  });
}

for (const kind of ['profile', 'site'] as const) {
  test(`${kind} pending intent survives ordinary navigation away and same-tab return`, async ({ page }) => {
    await mocks(page, { sitePayloadController: { value: sitePayload() } }); const writes = writesOn(page);
    const key = kind === 'profile' ? `admin.customer-profile.v1:${id}` : 'admin.site-operation.v1:site_mvp';
    const intent = kind === 'profile'
      ? { account_id: id, operation_id: 'profile_review_original_key', values: { operator_display_name: 'retained name', operator_note: 'original pending note' } }
      : { site_id: 'site_mvp', account_id: id, operation_id: 'site_review_original_key', action: 'set', cooldown_until: '2027-02-03T04:05:00.000Z', input_utc: '2027-02-03T04:05:00.000Z', ownership_released_at: '2026-07-01T00:00:00Z' };
    await page.addInitScript(({ key, intent }) => sessionStorage.setItem(key, JSON.stringify(intent)), { key, intent });
    const path = kind === 'profile' ? `/admin/accounts/${id}` : '/admin/sites/site_mvp';
    const recovery = page.locator(kind === 'profile' ? '[data-ui="customer-profile-unconfirmed"]' : '[data-ui="site-operation-unconfirmed"]');
    await page.goto(path); await expect(recovery).toContainText(intent.operation_id);
    const stored = await page.evaluate(key => sessionStorage.getItem(key), key);
    await page.locator('[data-ui="admin-primary-nav"] a[href="/admin/accounts"]').click();
    await expect(page).toHaveURL(/\/admin\/accounts$/);
    await page.goBack(); await expect(recovery).toContainText(intent.operation_id);
    expect(await page.evaluate(key => sessionStorage.getItem(key), key)).toBe(stored);
    if (kind === 'profile') {
      await openProfile(page);
      await expect(page.getByLabel(noteLabel)).toHaveValue('original pending note');
      await expect(page.getByLabel(noteLabel)).toBeDisabled();
    } else await expect(page.getByLabel(/Cross-account unlock time|跨账号解锁时间/)).toBeDisabled();
    expect(writes).toEqual([]);
  });
}

for (const oldBad of [false, true]) {
  test(`late ${oldBad ? 'malformed' : 'valid'} quota and ledger cannot replace a new customer`, async ({ page }) => {
    const held: Route[] = [];
    await page.route('**/api/admin/accounts/a/quota-summary', route => { held.push(route); });
    await page.route('**/api/admin/accounts/a/credit-ledger?*', route => { held.push(route); });
    await page.route('**/api/admin/accounts/b/quota-summary', route => route.fulfill({ json: envelope(quotaFixture('b')) }));
    await page.route('**/api/admin/accounts/b/credit-ledger?*', route => route.fulfill({ json: envelope(ledgerFixture('b')) }));
    await harness(page, `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{AdminQueryProvider}from'@/components/admin/AdminQueryProvider';import{useAccountCreditEvidence}from'@/features/admin/accounts/account-credit-evidence';
    function Form(){const[id,setId]=useState('a');const c=useAccountCreditEvidence(id,true);return <><button onClick={()=>setId('b')}>switch</button><output data-id>{id}</output><output data-quota>{c.quotaSummary?.account_id||''}</output><output data-ledger>{c.creditLedger?.account_id||''}</output><output data-error>{String(c.quotaQuery.isError||c.ledgerQuery.isError)}</output></>};createRoot(document.getElementById('root')).render(<AdminQueryProvider><Form/></AdminQueryProvider>);`);
    await expect.poll(() => held.length).toBe(2);
    await page.getByRole('button', { name: 'switch', exact: true }).click();
    await expect(page.locator('[data-quota]')).toHaveText('b'); await expect(page.locator('[data-ledger]')).toHaveText('b');
    for (const route of held) {
      const data = oldBad ? {} : route.request().url().includes('quota-summary') ? quotaFixture('a') : ledgerFixture('a');
      await route.fulfill({ json: envelope(data) }).catch(() => {}); // Query cancellation may already have closed this old request.
    }
    await expect(page.locator('[data-quota]')).toHaveText('b'); await expect(page.locator('[data-ledger]')).toHaveText('b');
    await expect(page.locator('[data-error]')).toHaveText('false');
  });
}

test('late associated-site retry cannot overwrite another customer shell', async ({ page }) => {
  await mocks(page, { accountSites: null }); const writes = writesOn(page);
  await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: /^Sites$|^站点$/ }).click();
  let held: Route | undefined;
  await page.route(`**/api/admin/accounts/${id}`, route => { held = route; });
  await page.locator('[data-ui="account-site-evidence-error"]').getByRole('button').click();
  await expect.poll(() => Boolean(held)).toBe(true);
  await page.locator('[data-ui="admin-primary-nav"] a[href="/admin/accounts"]').click();
  await page.locator('a[href^="/admin/accounts/acct_free_primary"]').first().click();
  await expect(page).toHaveURL(/\/admin\/accounts\/acct_free_primary/);
  await held!.fulfill({ json: envelope({ account: { account_id: id, name: 'Late old customer', status: 'active', metadata: {} }, sites: [null], subscriptions: [] }) }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Late old customer' })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Sites$|^站点$/ }).click();
  await expect(page.locator('[data-ui="account-site-evidence-error"]')).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('adjustment final submit checks current quota allowance without touching a pending intent', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/admin/accounts/a/credit-ledger/adjustments', route => { writes++; return route.fulfill({ json: envelope({}) }); });
  await harness(page, `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{useAccountCreditAdjustment}from'@/features/admin/accounts/account-credit-adjustment';
    function App(){const[allowed,setAllowed]=useState(true);const c=useAccountCreditAdjustment({accountId:'a',newWritesAllowed:allowed,failureMessage:'failed',readFailureMessage:'failed read',deltaMessage:'delta',reasonMessage:'reason',onApplied:()=>{}});
    return <><button onClick={()=>c.setForm({event_type:'adjustment',ai_credit_delta:'-10',reason:'review',note:'original'})}>prepare</button><button onClick={()=>setAllowed(false)}>lose quota</button><button onClick={()=>c.submit()}>submit</button><output data-intent>{c.intent?.operation_id||''}</output></>};createRoot(document.getElementById('root')).render(<App/>);`);
  await page.getByRole('button', { name: 'prepare', exact: true }).click();
  await page.getByRole('button', { name: 'lose quota', exact: true }).click();
  await page.getByRole('button', { name: 'submit', exact: true }).click();
  await expect(page.locator('[data-intent]')).toHaveText('');
  expect(await page.evaluate(() => sessionStorage.getItem('admin.credit-adjustment.v1:a'))).toBeNull();
  expect(writes).toBe(0);
});

test('open top-up reflects quota loss and cannot dispatch after reconnect refetch', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1056, height: 900 });
  await mocks(page); const writes = writesOn(page);
  await page.clock.install();
  await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: creditTab }).click();
  await page.getByRole('button', { name: /Open top-up options/ }).click();
  const dialog = page.getByRole('dialog', { name: /Top-up packs/ });
  await expect(dialog.getByRole('button', { name: /Apply top-up/ })).toBeEnabled();
  await page.route(`**/api/admin/accounts/${id}/quota-summary`, route => route.fulfill({ json: envelope({}) }));
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Apply top-up/ })).toHaveCount(0);
  await expect(dialog.getByText('OK', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('topup-quota-unavailable-1056x900.png') });
  expect(writes).toEqual([]);
});

for (const defect of ['null-item', 'wrong-row-account', 'missing-summary', 'missing-pagination'] as const) {
  test(`ledger ${defect} stays local and recovers to real nonempty serializer shape`, async ({ page }) => {
    const valid = { ...ledgerFixture(id), items: [ledgerEntryFixture(id)], pagination: { limit: 12, offset: 0, total: 1, has_more: false }, summary: { ...ledgerFixture(id).summary, entry_count: 1, net_ai_credit_delta: -10, net_used_ai_credits: 10, breakdown: [{ key: 'runs', quantity: 1, unit: 'run', rate: 10, ai_credits: 10 }], event_type_totals: { adjustment: -10 }, category_totals: { operator_adjustment: { label: 'Operator adjustment', net_ai_credit_delta: -10 } } } };
    const corrupt = defect === 'null-item' ? { ...valid, items: [null] } : defect === 'wrong-row-account' ? { ...valid, items: [{ ...valid.items[0], account_id: 'other' }] } : defect === 'missing-summary' ? { ...valid, summary: undefined } : { ...valid, pagination: undefined };
    const controller = { value: corrupt as unknown }; await mocks(page, { ledgerPayloadController: controller }); const writes = writesOn(page);
    await page.goto(`/admin/accounts/${id}`); await page.getByRole('tab', { name: creditTab }).click();
    await expect(page.locator('[data-ui="account-credit-summary"]')).toBeVisible();
    await page.getByRole('button', { name: /Read ledger result/ }).click();
    const drawer = page.getByRole('dialog', { name: /Credit ledger detail/ });
    await expect(drawer.locator('[data-ui="account-credit-ledger-error"]')).toBeVisible();
    controller.value = valid;
    await drawer.getByRole('button', { name: /^Retry$/ }).click();
    await expect(drawer.locator('[data-ui="account-credit-ledger-error"]')).toHaveCount(0);
    await expect(drawer.getByText('-10', { exact: true })).toBeVisible();
    await expect(drawer.getByText('adjustment', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });
}
