import { expect, test, type Page, type TestInfo } from '@playwright/test';
import serializerQueue from '../fixtures/admin-subscription-serializer-queue.json' with { type: 'json' };
import { mkdir, writeFile } from 'node:fs/promises';
import { collectBrowserEvents, noUnexpectedBrowserEvents } from './helpers/browser-event-inventory';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import { subscriptionFixture, subscriptionQueueFixture } from '../fixtures/admin-subscriptions';

test.use({ viewport: { width: 1440, height: 1050 } });
type DomainEvidence = { reads: string[]; writes: string[]; audits: string[]; timeline: Array<{ at: number; event: string; url?: string }> };
const domainEvidence = new WeakMap<Page, DomainEvidence>();
const inventories = new WeakMap<Page, ReturnType<typeof collectBrowserEvents>>();
test.beforeEach(({ page }) => { inventories.set(page, collectBrowserEvents(page)); });
test.afterEach(async ({ page }, info) => {
  const events = inventories.get(page)!;
  await events.beforeReload();
  const path = info.outputPath('browser-event-inventory.json');
  await writeFile(path, JSON.stringify({ test: info.title, statusAtCollection: info.status, ...events.raw, classified: events.classify() }, null, 2));
  await info.attach('browser-event-inventory', { path, contentType: 'application/json' });
  const domain = domainEvidence.get(page);
  await writeFile(info.outputPath('subscription-business-evidence.json'), JSON.stringify({ businessAssertionsCompleted: info.status === 'passed', ...domain }, null, 2));
  expect(events.classify().unexpected).toEqual(noUnexpectedBrowserEvents);
});
const detailHeading = (page: Page) => page.getByRole('heading', { name: /^Subscription detail:|^订阅详情/ });
const stable = (page: Page) => page.getByRole('heading', { name: /Subscription coverage is stable|订阅覆盖稳定/ });
const unknown = (page: Page) => page.getByRole('heading', { name: /Subscription evidence needs verification|订阅证据待核实/ });
const refresh = (page: Page) => page.getByRole('button', { name: /Rebuild current-period billing snapshots|Refresh.*statistics|重建本周期账单快照|刷新.*统计/ });
const retry = (page: Page) => page.getByRole('button', { name: /^Retry$|^重试$/ });
const badSites = (page: Page) => page.locator('[data-ui="subscription-site-evidence"]');
async function harness(page: Page) {
  const unhandled: string[] = [];
  await installAdminMocks(page, { unhandledAdminRequests: unhandled });
  const value = subscriptionFixture({ billing_snapshot_status: { status: 'stale', stale_site_count: 1 } });
  const state = { detail: value as unknown, queueMode: 'normal', queuePayload: null as unknown, writes: [] as string[], reads: [] as string[], audits: [] as string[],
    timeline: [] as DomainEvidence['timeline'], holdId: '', holdError: false, holdPost: false, held: 0, release: () => {}, unhandled };
  domainEvidence.set(page, state);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/admin/subscriptions') || url.pathname.startsWith('/api/admin/audit-events')) state.timeline.push({ at: Date.now(), event: request.method(), url: url.pathname + url.search });
    if (url.pathname.startsWith('/api/admin/audit-events')) state.audits.push(url.pathname + url.search);
  });
  await page.route('**/api/admin/subscriptions**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') {
      state.writes.push(url.pathname);
      if (state.holdPost) { state.held += 1; await new Promise<void>(resolve => { state.release = resolve; }); }
      await route.fulfill({ json: buildAdminApiEnvelope({}) }); return;
    }
    state.reads.push(url.pathname + url.search);
    if (url.pathname === '/api/admin/subscriptions') {
      const params = url.searchParams;
      const items = ['a', 'b'].map(suffix => subscriptionFixture({ subscription: { subscription_id: `sub_${suffix}`, status: 'past_due' },
        account: { account_id: `acct_${suffix}`, name: `Customer ${suffix.toUpperCase()}` } }));
      let payload: unknown = subscriptionQueueFixture({ items, total: 2 }, params);
      if (state.queueMode === 'empty') payload = subscriptionQueueFixture({ items: [], total: 0, summary: { critical: 0, warning: 0, monitor: 0, stable: 8 } }, params);
      if (state.queueMode === 'short-page') payload = subscriptionQueueFixture({ items: [], total: 1 }, params);
      if (state.queueMode === 'zero-total') payload = subscriptionQueueFixture({ items: [items[0]], total: 0 }, params);
      if (state.queuePayload) payload = state.queuePayload;
      if (state.queueMode === 'missing') payload = {};
      if (state.queueMode === 'null-items') payload = { ...payload as object, items: null };
      if (state.queueMode === 'bad-items') payload = { ...payload as object, items: {} };
      if (state.queueMode === 'summary') payload = { ...payload as object, summary: {} };
      if (state.queueMode === 'scope') payload = { ...payload as object, filters: { ...(payload as ReturnType<typeof subscriptionQueueFixture>).filters, customer: 'other' } };
      await route.fulfill({ json: buildAdminApiEnvelope(payload) }); return;
    }
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
    if (state.holdId === id) {
      state.held += 1;
      await new Promise<void>(resolve => { state.release = resolve; });
      if (state.holdError) {
        inventories.get(page)!.injectFailure(req, 'Deliberately delayed old-target read failure', { status: 503 });
        await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('old target unavailable') }); return;
      }
    }
    const payload = id === 'sub_mvp' ? state.detail : subscriptionFixture({ subscription: { subscription_id: id },
      account: { account_id: `acct_${id.slice(4)}`, name: `Customer ${id.slice(4).toUpperCase()}` },
      billing_snapshot_status: { status: 'stale', stale_site_count: 1 } });
    await route.fulfill({ json: buildAdminApiEnvelope(payload) });
  });
  return state;
}
async function settled(page: Page) { await inventories.get(page)!.beforeReload(); }
async function capture(page: Page, name: string, info: TestInfo) {
  await settled(page);
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, height: innerHeight, width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    pageTitles: document.querySelectorAll('main h1').length,
    workingTop: document.querySelector('[data-ui="subscription-queue-item"], [data-ui="subscription-summary-card"]')?.getBoundingClientRect().top ?? null }));
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewport + 1);
  const root = process.env.NPCINK_SUBSCRIPTION_EVIDENCE || info.outputDir;
  await mkdir(root, { recursive: true });
  const path = `${root}/${name}.png`;
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
  await writeFile(`${root}/${name}.geometry.json`, JSON.stringify(geometry));
}

test('subscription queue legal empty retains pre-risk summary and GET recovery', async ({ page }) => {
  const state = await harness(page); state.queueMode = 'empty';
  await page.goto('/admin/subscriptions');
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(0);
  await expect(page.getByText(/No subscriptions need follow-up|没有需要跟进的订阅/)).toBeVisible();
  await expect(page.locator('[data-ui="backoffice-page-header"]')).toContainText('8');
  state.queueMode = 'normal';
  await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅/ }).click();
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(2);
  expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
});
for (const mode of ['missing', 'null-items', 'bad-items', 'summary', 'scope']) {
  test(`subscription queue rejects ${mode} rather than inventing an empty register`, async ({ page }, info) => {
    const state = await harness(page); state.queueMode = mode;
    await page.goto('/admin/subscriptions');
    await expect(page.getByRole('alert').filter({ hasText: /evidence is incomplete|订阅证据不完整/ })).toBeVisible();
    await expect(page.getByText(/No subscriptions need follow-up|没有需要跟进的订阅/)).toHaveCount(0);
    state.queueMode = 'normal'; await retry(page).click();
    await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(2);
    state.queueMode = mode;
    await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /last successfully loaded|最近一次成功/ })).toBeVisible();
    await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(2);
    if (mode === 'summary') await capture(page, 'pc-1440-queue-retained', info);
    state.queueMode = 'normal'; await retry(page).click();
    await expect(page.getByRole('alert').filter({ hasText: /evidence is incomplete|订阅证据不完整/ })).toHaveCount(0);
    expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
  });
}
for (const mode of ['missing', 'budget', 'wrong-id', 'missing-account']) {
  test(`subscription detail refuses ${mode} and recovers locally with no rebuild or global audit`, async ({ page }, info) => {
    const state = await harness(page); const good = subscriptionFixture();
    state.detail = mode === 'missing' ? {} : mode === 'budget' ? { ...good, budget_state: {} }
      : mode === 'wrong-id' ? { ...good, subscription: { ...good.subscription, subscription_id: 'sub_other' } }
        : { ...good, account: undefined };
    await page.goto('/admin/subscriptions/sub_mvp');
    await expect(page.getByRole('heading', { name: /Subscription detail is temporarily unavailable|订阅详情暂时不可用/ })).toBeVisible();
    await expect(stable(page)).toHaveCount(0); await expect(refresh(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Budget and usage|预算与用量/ })).toHaveCount(0);
    expect(state.audits).toEqual([]); expect(state.writes).toEqual([]);
    if (mode === 'wrong-id') { await page.setViewportSize({ width: 1056, height: 1050 }); await capture(page, 'pc-1056-wrong-target', info); }
    state.detail = good; await retry(page).click(); await expect(detailHeading(page)).toBeVisible();
    await settled(page); expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
  });
}
for (const mode of ['null-collection', 'null-entry', 'wrong-type', 'missing-id', 'duplicate', 'mixed']) {
  test(`covered sites isolate ${mode}, retain valid detail and permit only GET recovery`, async ({ page }, info) => {
    const state = await harness(page);
    const good = subscriptionFixture({ billing_snapshot_status: { status: 'stale', stale_site_count: 1 } });
    const valid = good.covered_sites[0];
    const bad: unknown = mode === 'null-collection' ? null : mode === 'null-entry' ? [null] : mode === 'wrong-type' ? ['broken']
      : mode === 'missing-id' ? [{ ...valid, site_id: undefined }] : mode === 'duplicate' ? [valid, valid]
        : [valid, null, 'bad', { ...valid, site_id: 'duplicate' }, { ...valid, site_id: 'duplicate' }, { ...valid, site_id: 'foreign', account_id: 'acct_other' }];
    state.detail = { ...good, covered_sites: bad };
    await page.goto('/admin/subscriptions/sub_mvp');
    await expect(detailHeading(page)).toBeVisible(); await expect(badSites(page)).toBeVisible();
    await expect(unknown(page)).toBeVisible(); await expect(stable(page)).toHaveCount(0);
    await expect(badSites(page)).not.toContainText(/\{(?:count|valid|index)\}/);
    await expect(page.getByRole('heading', { name: /Budget and usage|预算与用量/ })).toBeVisible();
    await expect(refresh(page)).toBeDisabled();
    await expect(page.locator('main a[href="/admin/sites/duplicate"], main a[href="/admin/sites/foreign"], main a[href="/admin/sites/"]')).toHaveCount(0);
    if (mode === 'mixed') {
      await expect(page.locator('main a[href="/admin/sites/site_mvp"]')).toHaveCount(1);
      await expect(badSites(page)).toContainText(/5 covered-site|5 条关联站点/);
      await expect(badSites(page)).toContainText(/Site entry 2|站点条目 2/);
      await expect(page.locator('[data-ui="backoffice-page-header"]')).toContainText(/1 valid.*5 unavailable|1 个有效.*5 条不可用/);
      for (const width of [1440, 1056]) { await page.setViewportSize({ width, height: 1050 }); await capture(page, `pc-${width}-mixed-sites`, info); }
    }
    expect(state.writes).toEqual([]);
    state.detail = good; await badSites(page).getByRole('button', { name: /^Retry$|^重试$/ }).click();
    await expect(badSites(page)).toHaveCount(0); await expect(refresh(page)).toBeEnabled();
    await refresh(page).click(); await expect.poll(() => state.writes.length).toBe(1);
    await expect(refresh(page)).toBeEnabled(); expect(state.writes).toEqual(['/api/admin/subscriptions/sub_mvp/billing-snapshots/rebuild']);
    expect(state.unhandled).toEqual([]);
  });
}
test('nullable association objects preserve valid metrics but never imply stable or load global audits', async ({ page }, info) => {
  const state = await harness(page);
  state.detail = { ...subscriptionFixture({ covered_sites: [] }), account: null, plan: null, plan_version: null };
  await page.goto('/admin/subscriptions/sub_mvp');
  await expect(detailHeading(page)).toBeVisible(); await expect(unknown(page)).toBeVisible();
  await expect(page.locator('[data-ui="subscription-audit-unavailable"]')).toBeVisible();
  await settled(page); expect(state.audits).toEqual([]); expect(state.writes).toEqual([]);
  await capture(page, 'pc-1440-null-associations', info);
});
test('complete detail preserves zero unlimited limits and live plan version, then marks failed read stale', async ({ page }, info) => {
  const state = await harness(page); const good = subscriptionFixture({ usage_totals: { runs: 0, tokens_total: 731, cost_cny: 0, cost_cny_snapshot_missing_count: 0 }, covered_sites: [] });
  good.budget_state.runs.limit = 0; good.budget_state.tokens.limit = -1;
  state.detail = good; await page.goto('/admin/subscriptions/sub_mvp');
  await expect(stable(page)).toBeVisible();
  await expect(page.getByRole('table').first()).toContainText('731');
  for (const width of [1440, 1056]) { await page.setViewportSize({ width, height: 1050 }); await capture(page, `pc-${width}-normal`, info); }
  // A pending successful rebuild's readback must use the same validation. This
  // case exercises that existing recovery path without changing its key policy.
  state.detail = subscriptionFixture({ billing_snapshot_status: { status: 'stale', stale_site_count: 1 } });
  await inventories.get(page)!.beforeReload(); await page.reload(); await expect(refresh(page)).toBeEnabled();
  state.detail = {};
  await refresh(page).click(); await expect.poll(() => state.writes.length).toBe(1);
  await expect(page.getByRole('alert').filter({ hasText: /last valid detail|上次有效详情/ })).toBeVisible();
  await expect(unknown(page)).toBeVisible(); await expect(refresh(page)).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: /Billing statistics refreshed|账单统计已刷新/ })).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1050 }); await capture(page, 'pc-1440-stale-readback', info);
  await expect(retry(page)).toHaveCount(1);
  const beforeFailedRetry = state.reads.length;
  await retry(page).click();
  await expect.poll(() => state.reads.length).toBe(beforeFailedRetry + 1);
  await expect(refresh(page)).toBeDisabled();
  await expect(page.getByText(/Write succeeded|写入已成功/)).toBeVisible();
  expect(state.writes).toHaveLength(1);
  state.detail = subscriptionFixture({ billing_snapshot_status: { status: 'stale', stale_site_count: 1 } });
  const beforeRecoveredRetry = state.reads.length;
  await retry(page).click();
  await expect(refresh(page)).toBeEnabled();
  expect(state.reads).toHaveLength(beforeRecoveredRetry + 1); expect(state.writes).toHaveLength(1);
});

for (const outcome of ['read-success', 'read-error', 'write-success']) {
  test(`actual history switches subscription target while old ${outcome} is late`, async ({ page }) => {
    const state = await harness(page);
    await page.goto('/admin/subscriptions');
    await page.locator('[data-ui="subscription-queue-item"]').first().getByRole('link').click();
    await expect(page.locator('[data-ui="subscription-summary-card"]')).toContainText('Customer A');
    await page.getByRole('link', { name: /Back to subscription operations|返回订阅运营/ }).click();
    await page.locator('[data-ui="subscription-queue-item"]').nth(1).getByRole('link').click();
    await expect(page.locator('[data-ui="subscription-summary-card"]')).toContainText('Customer B');
    if (outcome !== 'write-success') { state.holdId = 'sub_a'; state.holdError = outcome === 'read-error'; }
    await page.evaluate(() => history.go(-2));
    await expect(page).toHaveURL(/\/subscriptions\/sub_a\?/);
    if (outcome === 'write-success') {
      await expect(refresh(page)).toBeEnabled(); state.holdPost = true; await refresh(page).click();
    }
    await expect.poll(() => state.held).toBe(1);
    await page.evaluate(() => history.go(2));
    await expect(page.locator('[data-ui="subscription-summary-card"]')).toContainText('Customer B');
    state.timeline.push({ at: Date.now(), event: 'new target B ready before releasing old response' });
    const oldReads = state.reads.filter(url => url === '/api/admin/subscriptions/sub_a').length;
    state.release(); await settled(page);
    state.timeline.push({ at: Date.now(), event: 'old response settled while B remains current' });
    await expect(page.locator('[data-ui="subscription-summary-card"]')).toContainText('Customer B');
    await expect(page.locator('[data-ui="subscription-summary-card"]')).not.toContainText('Customer A');
    await expect(page.getByRole('alert').filter({ hasText: /evidence is incomplete|订阅证据不完整/ })).toHaveCount(0);
    expect(state.reads.filter(url => url === '/api/admin/subscriptions/sub_a')).toHaveLength(oldReads);
    expect(state.writes).toHaveLength(outcome === 'write-success' ? 1 : 0);
    expect(state.unhandled).toEqual([]);
  });
}

test('verified account scopes both audit summary and opened trail without adding its first site', async ({ page }) => {
  const state = await harness(page);
  await page.goto('/admin/subscriptions/sub_mvp');
  await page.getByRole('button', { name: /View 4 audit records|查看 4 条审计记录/i }).click();
  await expect(page.getByRole('dialog', { name: /Recent audit records|近期审计记录/i })).toBeVisible();
  await settled(page);
  expect(state.audits.some(url => url.startsWith('/api/admin/audit-events/summary?'))).toBe(true);
  expect(state.audits.some(url => url.startsWith('/api/admin/audit-events?'))).toBe(true);
  for (const raw of state.audits) {
    const url = new URL(raw, 'http://127.0.0.1');
    expect(url.searchParams.get('account_id')).toBe('acct_subscription');
    expect(url.searchParams.has('site_id')).toBe(false);
  }
  expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
});


for (const mode of ['short-page', 'zero-total']) {
  test(`review R1 retains rows range and successful timestamp on ${mode}`, async ({ page }, info) => {
    const state = await harness(page);
    await page.clock.install({ time: new Date('2026-11-02T04:00:00Z') });
    await page.goto('/admin/subscriptions');
    const rows = page.locator('[data-ui="subscription-queue-item"]');
    await expect(rows).toHaveCount(2);
    const header = page.locator('[data-ui="backoffice-page-header"]');
    const before = await header.innerText();
    const range = await page.locator('[data-ui="subscription-queue-range"]').innerText();
    await page.clock.fastForward(120000);
    state.queueMode = mode;
    await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /last successfully loaded|最近一次成功/ })).toBeVisible();
    await expect(rows).toHaveCount(2);
    expect(await header.innerText()).toBe(before);
    expect(await page.locator('[data-ui="subscription-queue-range"]').innerText()).toBe(range);
    state.timeline.push({ at: Date.now(), event: `rejected ${mode}; retained header timestamp and range: ${range}` });
    if (mode === 'short-page') await capture(page, 'pc-1440-r1-retained-tuple', info);
    state.queueMode = 'normal'; await retry(page).click();
    await expect(page.getByRole('alert').filter({ hasText: /evidence is incomplete|订阅证据不完整/ })).toHaveCount(0);
    expect(await header.innerText()).not.toBe(before);
    expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
  });
}
for (const mode of ['status', 'counts', 'null-item', 'foreign-snapshot']) {
  test(`review R2 refuses ${mode} billing and recovers by one GET`, async ({ page }, info) => {
    const state = await harness(page); const good = subscriptionFixture();
    const bad = structuredClone(good);
    if (mode === 'status') { bad.billing_snapshot_status.fresh_site_count = 0; bad.billing_snapshot_status.stale_site_count = 1; }
    if (mode === 'counts') bad.billing_snapshot_status.site_count = 10;
    if (mode === 'null-item') (bad.billing_snapshot_status as unknown as { items: unknown[] }).items = [null];
    if (mode === 'foreign-snapshot') bad.latest_billing_snapshots[0].site_id = 'foreign_site';
    state.detail = bad; await page.goto('/admin/subscriptions/sub_mvp');
    await expect(page.getByRole('heading', { name: /Subscription detail is temporarily unavailable|订阅详情暂时不可用/ })).toBeVisible();
    await expect(stable(page)).toHaveCount(0); await expect(refresh(page)).toHaveCount(0);
    expect(state.writes).toEqual([]); expect(state.audits).toEqual([]);
    const reads = state.reads.length;
    if (mode === 'foreign-snapshot') { await page.setViewportSize({ width: 1056, height: 1050 }); await capture(page, 'pc-1056-r2-billing-target', info); }
    state.detail = good; await retry(page).click();
    await expect(stable(page)).toBeVisible();
    expect(state.reads).toHaveLength(reads + 1); expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
  });
}
test('review R3 actual isolated serializer inspector distinguishes unknown cost and explicit zero', async ({ page }, info) => {
  const state = await harness(page);
  // Unchanged first queue response from the isolated synthetic SQLite serializer.
  const authentic = serializerQueue; state.queuePayload = authentic.data;
  await page.goto(`/admin/subscriptions?${authentic.requestKey}`);
  const row = page.locator('[data-ui="subscription-queue-item"]').filter({ hasText: 'Synthetic serializer account' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /^Inspect$|^检查$/ }).click();
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  const cost = drawer.locator('dl > div').filter({ hasText: /Estimated Cost|预估成本/ }).locator('dd');
  await expect(cost).toHaveText(/Unknown|未知/);
  await capture(page, 'pc-1440-r3-authentic-unknown', info);
  await drawer.getByRole('button', { name: /^Close$|^关闭$/ }).click();
  const params = new URLSearchParams(authentic.requestKey);
  const zero = subscriptionFixture({ subscription: { status: 'past_due' }, latest_billing_snapshots: [{ snapshot_id: 'zero', totals: { cost: 0 } }] });
  state.queuePayload = subscriptionQueueFixture({ items: [zero], total: 1 }, params);
  await page.getByRole('button', { name: /Refresh subscriptions|刷新订阅/ }).click();
  await expect(page.locator('[data-ui="subscription-queue-item"]')).toHaveCount(1);
  await page.locator('[data-ui="subscription-queue-item"]').getByRole('button', { name: /^Inspect$|^检查$/ }).click();
  await expect(cost).toHaveText(/¥0(?:\.00)?/);
  expect(state.writes).toEqual([]); expect(state.unhandled).toEqual([]);
});
