import { expect, test, type Page, type Route } from '@playwright/test';
import { buildAuditMetadata } from '../fixtures/admin-audit-metadata';
import serializers from '../fixtures/admin-diagnostic-serializers.json' with { type: 'json' };
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

test('audit preserves failed and unknown outcomes and reports missing focused evidence', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 1050 });
  const requests = await installAuditBoundaryHarness(page, async (route, url) => {
    await route.fulfill({ json: buildAdminApiEnvelope({ ...(url.searchParams.get('event_id') === '999' ? auditPage(0, 0) : { ...auditPage(1, 0), items: auditPage(1, 0).items.map(row => ({ ...row, site_id: 'bounded-site', outcome: url.searchParams.get('outcome') || '' })) }), ...buildAuditMetadata(url.searchParams) }) });
  });
  for (const outcome of ['failed', 'future-outcome']) {
    await page.goto(`/admin/audit?outcome=${outcome}&site_id=bounded-site&focus=999`);
    const absent = page.locator('[data-ui="admin-audit-focus-absent"]');
    await expect(absent).toContainText('999');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(900);
    await page.screenshot({ path: testInfo.outputPath(`audit-absent-${outcome}-900.png`), fullPage: true, animations: 'disabled' });
    await page.getByText(/More filters|更多筛选/, { exact: true }).click();
    await expect(page.locator('select[name="outcome"]')).toHaveValue(outcome);
    await page.getByRole('button', { name: /Apply filters|应用筛选/, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`outcome=${outcome}`));
    await page.goto(`/admin/audit?outcome=${outcome}&site_id=bounded-site&focus=999`);
    await page.getByRole('button', { name: /Find this exact event|精确查找此事件/ }).click();
    await expect.poll(() => requests.at(-1)?.searchParams.get('event_id')).toBe('999');
    expect(requests.at(-1)?.searchParams.get('site_id')).toBe('bounded-site');
    expect(requests.at(-1)?.searchParams.get('outcome')).toBe(outcome);
  }
});

test('audit workspace keeps exact evidence URL-backed and excludes raw payloads', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  let failNextAuditRequest = false;
  await page.route('**/api/admin/audit-events*', async (route) => {
    if (!failNextAuditRequest) {
      await route.fallback();
      return;
    }
    failNextAuditRequest = false;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('temporary audit evidence failure')),
    });
  });

  await page.goto('/admin/audit?event_id=101&focus=101');
  await expect(page.getByRole('heading', { name: /^Audit evidence$|^审计证据$/i })).toBeVisible();
  const directory = page.locator('[data-ui="admin-audit-directory"]');
  const queryEvidence = page.locator('[data-ui="admin-audit-query-evidence"]');
  await expect(directory).toBeVisible();
  await expect(directory.locator('tbody tr')).toHaveCount(1);
  await expect(queryEvidence).toContainText(/Evidence generated|证据生成时间/i);
  await expect(queryEvidence).toContainText(/1 records returned|返回 1 条记录/i);
  await expect(queryEvidence).toContainText(/Query duration:\s+4\.3 ms|查询耗时:\s+4\.3 ms/i);
  await expect(directory).toContainText(/Link subscription|订阅/i);
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('audit-bind-101');
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).not.toContainText(/payload_json|secret/i);
  await expect(page).toHaveURL(/event_id=101/);
  await expect(page).toHaveURL(/focus=101/);

  await page.locator('[data-ui="admin-inspector-drawer-close"]').click();
  await expect(page).not.toHaveURL(/focus=101/);
  await page.goto('/admin/audit');
  await page.getByText(/More filters|更多筛选/, { exact: true }).click();
  if (!await page.getByLabel(/Idempotency key|幂等键/i).isVisible()) await page.getByText(/More filters|更多筛选/, { exact: true }).click();
  await page.getByLabel(/Idempotency key|幂等键/i).fill('audit-rebuild-102');
  await page.getByRole('button', { name: /Apply filters|应用筛选/i }).click();
  await expect(page).toHaveURL(/idempotency_key=audit-rebuild-102/);
  await expect(page.locator('[data-ui="admin-audit-active-filters"]')).toContainText('audit-rebuild-102');
  await expect(directory.locator('tbody tr')).toHaveCount(1);
  await expect(directory).toContainText(/Refresh billing statistics|计费用量/i);

  await directory.getByRole('button', { name: /Inspect|查看/i }).click();
  await expect(page).toHaveURL(/focus=102/);
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('trace-audit-102');
  await page.locator('[data-ui="admin-inspector-drawer-close"]').click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toHaveCount(0);
  await directory.getByRole('button', { name: /Inspect|查看/i }).click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toBeVisible();
  await page.locator('[data-ui="admin-inspector-drawer-close"]').click();

  await page.goto('/admin/audit');
  await page.getByText(/More filters|更多筛选/i).click();
  await page.getByLabel(/^Operator ID$|^操作方 ID$/i).fill('operator');
  await page.getByLabel(/^From time$|^起始时间$/i).fill('2026-04-07T00:00');
  await page.getByLabel(/^To time$|^结束时间$/i).fill('2026-04-09T23:59');
  await page.getByRole('button', { name: /Apply filters|应用筛选/i }).click();
  await expect(page).toHaveURL(/actor_ref=operator/);
  await expect(page).toHaveURL(/created_from=2026-04-/);
  await expect(page).toHaveURL(/created_to=2026-04-/);
  await expect(directory.locator('tbody tr')).toHaveCount(1);

  failNextAuditRequest = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.getByText(/last loaded audit page remains visible|仍保留上次成功加载的审计页/i)).toBeVisible();
  await expect(directory.locator('tbody tr')).toHaveCount(1);

  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: '/admin/audit',
    pageModel: 'diagnostic',
    testedStates: ['ready', 'filtered', 'selected', 'refresh_error'],
    dataMode: 'mocked',
    humanAcceptance: 'pending',
    pageTitle: page.getByRole('heading', { name: /^Audit evidence$|^审计证据$/i }),
    workingSurface: directory,
    browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'the filter workbench exposes one apply action; refresh and clear remain secondary' },
      { id: 'textual-status', status: 'pass', evidence: 'audit outcomes and stale evidence state include text labels' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'inspect stays on the matching audit row and opens its exact event detail' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'selected row, drawer focus, and refresh error remain visually distinct' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'the shared inspector contains focus, closes with Escape/button, and restores trigger focus' },
      { id: 'context-stability', status: 'pass', evidence: 'a failed refresh preserves the filtered audit row and selected-event context' },
    ],
    interactionResults: [
      { id: 'exact-receipt-navigation', status: 'pass', evidence: 'event_id and focus open the exact persisted event' },
      { id: 'url-backed-filtering', status: 'pass', evidence: 'idempotency filtering survives as shareable URL state' },
      { id: 'payload-boundary', status: 'pass', evidence: 'the directory and inspector expose metadata without audit payload values' },
    ],
  });
});

test('audit workspace recovers deep pages and distinguishes filtered empty', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);

  await page.goto('/admin/audit?offset=75');
  await expect(page.getByText(/Audit page no longer available|当前审计页已不可用/i)).toBeVisible();
  await page.locator('[data-ui="admin-audit-pagination-recovery"]').click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(2);

  if (!await page.getByLabel(/Idempotency key|幂等键/i).isVisible()) await page.getByText(/More filters|更多筛选/, { exact: true }).click();
  await page.getByLabel(/Idempotency key|幂等键/i).fill('missing-audit-event');
  await page.getByRole('button', { name: /Apply filters|应用筛选/i }).click();
  await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/i)).toBeVisible();
});

test('audit workspace preserves precise RFC3339 URL filters when reapplied', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const preciseFrom = '2026-04-08T09:45:59.123Z';
  const preciseTo = '2026-04-08T09:46:00.987Z';

  await page.goto(`/admin/audit?created_from=${encodeURIComponent(preciseFrom)}&created_to=${encodeURIComponent(preciseTo)}`);
  await page.getByText(/More filters|更多筛选/i).click();
  await page.getByRole('button', { name: /Apply filters|应用筛选/i }).click();

  const url = new URL(page.url());
  expect(url.searchParams.get('created_from')).toBe(preciseFrom);
  expect(url.searchParams.get('created_to')).toBe(preciseTo);
});

test('audit workspace exposes an initial failure and retry path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const auditFailureController = { enabled: true };
  await installAdminMocks(page, { auditFailureController });
  await page.goto('/admin/audit');
  await expect(page.locator('[role="alert"]').filter({ hasText: /审计证据加载失败|Failed to load audit evidence\./ })).toBeVisible();
  await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(0);
  await expect(page.getByText('initial audit evidence failure', { exact: true })).toHaveCount(0);
  auditFailureController.enabled = false;
  await page.getByRole('button', { name: /Retry|重试/i }).click();
  await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(2);
});

function auditPage(total: number, offset: number, includeOffset = true) {
  const count = Math.max(0, Math.min(10, total - offset));
  return {
    ...buildAuditMetadata(new URLSearchParams()),
    items: Array.from({ length: count }, (_, index) => ({
      account_id: '', site_id: '', key_id: '', subscription_id: '', plan_id: '', plan_version_id: '',
      method: '', path: '', actor_kind: 'platform_admin', idempotency_key: '',
      event_id: 101 + offset + index, event_kind: 'site.configuration.saved',
      outcome: index % 3 ? 'succeeded' : 'error', scope_kind: 'site',
      scope_id: `site-${offset + index}`, actor_ref: 'operator-fixture',
      trace_id: `trace-fixture-${offset + index}`, created_at: '2026-10-25T01:02:03.456Z',
    })),
    total, pagination: {
      limit: 10, ...(includeOffset ? { offset } : {}), total,
      has_more: offset + count < total,
      next_offset: offset + count < total ? offset + 10 : null,
      is_out_of_range: offset >= total && offset > 0,
      last_offset: total ? Math.floor((total - 1) / 10) * 10 : 0,
    },
    generated_at: '2026-10-25T01:03:00Z',
    diagnostics: { returned_count: count, query_duration_ms: 2.5 },
  };
}

async function installAuditBoundaryHarness(
  page: Page,
  handler: (route: Route, url: URL) => Promise<unknown>,
) {
  await installAdminMocks(page);
  const requests: URL[] = [];
  await page.route('**/api/admin/audit-events?*', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    expect(route.request().method()).toBe('GET');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('include_payload')).toBe('false');
    expect(url.searchParams.has('focus')).toBe(false);
    await handler(route, url);
  });
  return requests;
}

const directorySelector = '[data-ui="admin-audit-directory"]';
const rangeSelector = '[data-ui="admin-audit-pagination"]';

for (const total of [0, 1, 10, 11, 21]) {
  test(`audit fixed ten-row pages expose honest ranges for total ${total}`, async ({ page }) => {
    const requests = await installAuditBoundaryHarness(page, (route, url) => route.fulfill({
      json: buildAdminApiEnvelope(auditPage(total, Number(url.searchParams.get('offset')))),
    }));
    await page.goto('/admin/audit?limit=500');
    const directory = page.locator(directorySelector);
    const range = directory.locator(rangeSelector);
    await expect(directory.locator('tbody tr')).toHaveCount(Math.min(total, 10));
    await expect(range).toContainText(`${total ? 1 : 0}–${Math.min(total, 10)}`);
    await expect(directory.locator('[data-ui="admin-audit-filter-workbench"]')).toBeVisible();
    await expect(directory.getByRole('button', { name: /^Previous$|^上一页$/ })).toBeDisabled();
    const next = directory.getByRole('button', { name: /^Next page$|^下一页$/ });
    if (total === 0) await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toBeVisible();
    if (total <= 10) await expect(next).toBeDisabled();
    else {
      await next.click();
      await expect(directory.locator('tbody tr')).toHaveCount(Math.min(total - 10, 10));
      await expect(range).toContainText(`11–${Math.min(total, 20)}`);
      await expect.poll(() => requests.at(-1)?.searchParams.get('offset')).toBe('10');
      if (total === 21) {
        await next.click();
        await expect(range).toContainText('21–21');
        await expect(directory.locator('tbody tr')).toHaveCount(1);
      }
    }
  });
}

for (const includeOffset of [true, false]) {
  test(`audit rejects ${includeOffset ? 'wrong server offset' : 'missing offset'} rather than certifying an unrelated page`, async ({ page }) => {
    await installAuditBoundaryHarness(page, route => route.fulfill({
      json: buildAdminApiEnvelope({ ...auditPage(100, 37, includeOffset), items: auditPage(40, 37).items }),
    }));
    await page.goto('/admin/audit?offset=83');
    await expect(page.locator('main [role="alert"]')).toBeVisible();
    await expect(page.locator(directorySelector).locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toHaveCount(0);
  });
}

test('audit pending pages retain their loaded range and prevent repeated page actions', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests = await installAuditBoundaryHarness(page, async (route, url) => {
    const offset = Number(url.searchParams.get('offset'));
    if (offset === 10) await held;
    await route.fulfill({ json: buildAdminApiEnvelope(auditPage(21, offset)) });
  });
  try {
    await page.goto('/admin/audit');
    const next = page.locator(directorySelector).getByRole('button', { name: /^Next page$|^下一页$/ });
    await expect(page.locator(rangeSelector)).toContainText('1–10');
    await next.click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(page).toHaveURL(/offset=10/);
    await expect(page.locator(rangeSelector)).toContainText('1–10');
    await expect(next).toBeDisabled();
    await expect(page.locator(directorySelector).getByRole('button', { name: /^Previous$|^上一页$/ })).toBeDisabled();
    // Invoke the installed handler as a stale caller would; disabled DOM alone is insufficient.
    await next.evaluate(element => {
      const key = Object.keys(element).find(key => key.startsWith('__reactProps$'))!;
      (element as unknown as Record<string, { onClick: () => void }>)[key].onClick();
    });
    expect(requests).toHaveLength(2);
    expect(new URL(page.url()).searchParams.get('offset')).toBe('10');
    release();
    await expect(page.locator(rangeSelector)).toContainText('11–20');
  } finally { release(); }
});

test('audit deep recovery stays server-owned and guarded during refresh', async ({ page }) => {
  let refreshing = false;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests = await installAuditBoundaryHarness(page, async (route, url) => {
    if (refreshing) await held;
    const offset = Number(url.searchParams.get('offset'));
    await route.fulfill({ json: buildAdminApiEnvelope({ ...(offset === 83
      ? auditPage(40, 83)
      : { ...auditPage(40, offset), items: auditPage(40, offset).items.map(row => ({ ...row, site_id: 'site-original' })) }), ...buildAuditMetadata(url.searchParams) }) });
  });
  try {
    await page.goto('/admin/audit?offset=83&site_id=site-original');
    const recovery = page.locator('[data-ui="admin-audit-pagination-recovery"]');
    await expect(recovery).toBeVisible();
    await expect(page.locator(rangeSelector)).toContainText('0–0');
    await expect(page.getByText(/This position is beyond|当前起始位置超出/)).toBeVisible();
    await expect(page.getByText(/9\.3|4\.7/)).toHaveCount(0);
    const previous = page.locator(directorySelector).getByRole('button', { name: /^Previous$|^上一页$/ });
    await expect(previous).toBeEnabled();
    refreshing = true;
    await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(recovery).toBeDisabled();
    await expect(previous).toBeDisabled();
    expect(await recovery.locator('..').evaluate(form => {
      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event); return event.defaultPrevented;
    })).toBe(true);
    release();
    await expect(recovery).toBeEnabled();
    refreshing = false;
    await recovery.click();
    await expect(page).toHaveURL(/offset=30/);
    await expect(page).toHaveURL(/site_id=site-original/);
    await expect(page.locator(rangeSelector)).toContainText('31–40');
    expect(requests.at(-1)?.searchParams.get('offset')).toBe('30');
  } finally { release(); }
});

test('audit failure is not successful empty and same-URL Apply retries the current scope', async ({ page }) => {
  let fail = true;
  const requests = await installAuditBoundaryHarness(page, (route, url) => route.fulfill(fail
    ? { status: 503, json: buildAdminApiErrorEnvelope('bounded fixture failure') }
    : { json: buildAdminApiEnvelope({ ...auditPage(0, 0), ...buildAuditMetadata(url.searchParams) }) }));
  await page.goto('/admin/audit?site_id=site-original');
  await expect(page.getByRole('alert').filter({ hasText: /审计证据加载失败|Failed to load audit evidence\./ })).toBeVisible();
  await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
  await expect.poll(() => requests.length).toBe(2);
  await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toBeVisible();
  expect(requests.at(-1)?.searchParams.get('site_id')).toBe('site-original');
});

test('audit scope errors discard old rows and a late response cannot replace a newer filter', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let slowRequested = false;
  let slowFinished = false;
  const requests = await installAuditBoundaryHarness(page, async (route, url) => {
    const key = url.searchParams.get('idempotency_key');
    if (key === 'failed-scope') { await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('bounded scope failure') }); return; }
    if (key === 'slow-scope') { slowRequested = true; await held; }
    await route.fulfill({ json: buildAdminApiEnvelope({ ...auditPage(1, 0), ...buildAuditMetadata(url.searchParams), items: [{ ...auditPage(1, 0).items[0], idempotency_key: key || '', actor_ref: key || 'initial-scope' }] }) });
    if (key === 'slow-scope') slowFinished = true;
  });
  try {
    await page.goto('/admin/audit');
    const directory = page.locator(directorySelector);
    await expect(directory).toContainText('initial-scope');
    if (!await page.getByLabel(/Idempotency key|幂等键/).isVisible()) await page.getByText(/More filters|更多筛选/, { exact: true }).click();
    await page.getByLabel(/Idempotency key|幂等键/).fill('failed-scope');
    await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /审计证据加载失败|Failed to load audit evidence\./ })).toBeVisible();
    await expect(directory.locator('tbody tr')).toHaveCount(0);
    await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toHaveCount(0);
    if (!await page.getByLabel(/Idempotency key|幂等键/).isVisible()) await page.getByText(/More filters|更多筛选/, { exact: true }).click();
    await page.getByLabel(/Idempotency key|幂等键/).fill('slow-scope');
    await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
    await expect.poll(() => slowRequested).toBe(true);
    if (!await page.getByLabel(/Idempotency key|幂等键/).isVisible()) await page.getByText(/More filters|更多筛选/, { exact: true }).click();
    await page.getByLabel(/Idempotency key|幂等键/).fill('newest-scope');
    await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
    await expect(directory).toContainText('newest-scope');
    release();
    await expect.poll(() => requests.length).toBe(4);
    await expect.poll(() => slowFinished).toBe(true);
    await expect(directory).not.toContainText('slow-scope');
    await expect(page).toHaveURL(/idempotency_key=newest-scope/);
  } finally { release(); }
});

test('audit retains all eleven precise filters and keeps drawer focus outside query identity', async ({ page }) => {
  const filters = { event_id: '101', idempotency_key: 'key-101', actor_ref: 'operator', scope_kind: 'site', scope_id: 'site-a', site_id: 'site-a', account_id: 'account-a', event_kind: 'site.configuration.saved', outcome: 'succeeded', created_from: '2026-10-25T09:45:59.123+08:00', created_to: '2026-10-25T09:46:00.987+08:00' };
  const requests = await installAuditBoundaryHarness(page, (route, url) => {
    const offset = Number(url.searchParams.get('offset'));
    const data = auditPage(1, offset);
    data.items = data.items.map(row => ({ ...row, ...filters, event_id: 101, created_at: '2026-10-25T01:46:00Z' }));
    return route.fulfill({ json: buildAdminApiEnvelope({ ...data, ...buildAuditMetadata(url.searchParams) }) });
  });
  await page.goto(`/admin/audit?${new URLSearchParams({ ...filters, offset: '83', focus: '999' })}`);
  await expect(page.locator('[data-ui="admin-audit-pagination-recovery"]')).toBeVisible();
  for (const [key, value] of Object.entries(filters)) expect(requests[0].searchParams.get(key)).toBe(value);
  await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
  await expect(page).toHaveURL(/focus=101/);
  await expect.poll(() => requests.length).toBe(2);
  const url = new URL(page.url());
  expect(url.searchParams.has('offset')).toBe(false);
  for (const [key, value] of Object.entries(filters)) expect(url.searchParams.get(key)).toBe(value);
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  const count = requests.length;
  const inspect = page.locator(directorySelector).getByRole('button', { name: /Inspect|查看/ });
  await inspect.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspect).toBeFocused();
  expect(requests).toHaveLength(count);
  await page.getByRole('link', { name: /Clear filters|清除筛选/ }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
  await expect.poll(() => requests.at(-1)?.searchParams.has('event_id')).toBe(false);
});

test('audit Quiet PC workspace keeps filters outside table scrolling in both languages and themes', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const evidence = observeAdminBrowserEvidence(page);
  let failNextRefresh = false;
  const requests = await installAuditBoundaryHarness(page, (route, url) => {
    if (failNextRefresh) {
      failNextRefresh = false;
      return route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('bounded visual refresh failure') });
    }
    return route.fulfill({ json: buildAdminApiEnvelope({ ...auditPage(21, Number(url.searchParams.get('offset'))), ...buildAuditMetadata(url.searchParams) }) });
  });
  const measurements = [];
  await page.goto('/admin/audit');
  for (const width of [1280, 1440]) for (const locale of ['en', 'zh-CN']) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1050 });
    await page.evaluate(({ locale, theme }) => { localStorage.setItem('locale', locale); localStorage.setItem('theme', theme); }, { locale, theme });
    await page.goto('/admin/audit');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    else await expect(page.locator('html')).not.toHaveClass(/dark/);
    const directory = page.locator(directorySelector);
    await expect(directory.locator('tbody tr')).toHaveCount(10);
    await expect(directory.locator('[data-ui="admin-audit-filter-workbench"]')).toBeVisible();
    const form = directory.locator('form').first();
    const scroll = directory.locator('[data-ui="admin-audit-table-scroll"]');
    expect(await scroll.evaluate(element => element.contains(document.querySelector('[data-ui="admin-audit-filter-workbench"]')))).toBe(false);
    const before = await form.boundingBox();
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; element.scrollLeft = element.scrollWidth; });
    expect((await form.boundingBox())?.y).toBe(before?.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const box = await directory.boundingBox();
    expect(box!.width).toBeGreaterThan(900);
    expect(box!.y).toBeLessThan(400);
    measurements.push({ width, locale, theme, directory: box, form: before });
    await scroll.evaluate(element => { element.scrollTop = 0; element.scrollLeft = 0; });
    await page.screenshot({ path: testInfo.outputPath(`audit-${locale}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    const moreFilters = form.locator('summary');
    await moreFilters.click();
    await expect(form.locator('input, select')).toHaveCount(11);
    for (const field of await form.locator('input, select').all()) await expect(field).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath(`audit-expanded-${locale}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    await moreFilters.click();
  }
  await testInfo.attach('audit-PC-geometry', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  const directory = page.locator(directorySelector);
  if (!await page.getByLabel(/^Scope type$|^范围类型$/).isVisible()) await page.getByText(/More filters|更多筛选/, { exact: true }).click();
  await page.getByLabel(/^Scope type$|^范围类型$/).fill('site');
  await page.getByRole('button', { name: /Apply filters|应用筛选/ }).click();
  await expect(page).toHaveURL(/scope_kind=site/);
  await expect.poll(() => requests.at(-1)?.searchParams.get('scope_kind')).toBe('site');
  await expect(directory.locator('tbody tr')).toHaveCount(10);
  const inspect = directory.getByRole('button', { name: /Inspect|查看/ }).first();
  await inspect.click();
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await expect(drawer).toBeVisible();
  await expect(directory.locator('tr[aria-selected="true"]')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('audit-selected.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(inspect).toBeFocused();
  failNextRefresh = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(page.getByText(/last loaded audit page remains visible|仍保留上次成功加载的审计页/)).toBeVisible();
  await expect(directory.locator('tbody tr')).toHaveCount(10);
  await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('audit-refresh-error.png'), fullPage: true, animations: 'disabled' });
  await writeAdminVisualReceipt({ page, testInfo, route: '/admin/audit', pageModel: 'diagnostic', dataMode: 'mocked', testedStates: ['ready', 'filtered', 'selected', 'refresh_error'], humanAcceptance: 'pending', pageTitle: page.getByRole('heading', { name: /^Audit evidence$|^审计证据$/ }), workingSurface: page.locator(directorySelector), browserEvidence: evidence, expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'one explicit Apply in directory filters; refresh/clear/inspect secondary' },
      { id: 'textual-status', status: 'pass', evidence: 'outcome badge includes text and range describes actual returned rows' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'filters and semantic rows share one directory, Inspect remains visible on each row' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'selected row, focus restoration and stale refresh state exercised in this test' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'opened exact row drawer, closed with Escape and observed Inspect focus restoration' },
      { id: 'context-stability', status: 'pass', evidence: 'table scroll does not move filter form, URL filters retained' },
    ], interactionResults: [{ id: 'PC-localization-and-scrolling', status: 'pass', evidence: '1280/1440 × en/zh-CN × light/dark,10 rows, no page horizontal overflow, filters outside independent scroll' }] });
});

test('Chinese audit labels distinguish known roles and keep exact raw evidence on demand', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.route('**/api/admin/audit-events?*', route => route.fulfill({ json: buildAdminApiEnvelope({
    ...serializers.audit, ...buildAuditMetadata(new URL(route.request().url()).searchParams),
    items: [
      { event_id: 201, event_kind: 'customer_notification.sent', outcome: 'succeeded', actor_kind: 'platform_admin', actor_ref: 'platform:internal_root', scope_kind: 'account', scope_id: 'acct_a', account_id: 'acct_a', created_at: '2026-11-04T01:00:00Z' },
      { event_id: 202, event_kind: 'worker.heartbeat', outcome: 'succeeded', actor_kind: 'system_worker', actor_ref: 'ops_cadence', scope_kind: 'worker', scope_id: 'ops_cadence', created_at: '2026-11-04T01:00:00Z' },
      { event_id: 203, event_kind: 'future.event', outcome: 'future-result', actor_kind: 'unverified', actor_ref: 'unknown-source', scope_kind: 'site', scope_id: 'site_a', site_id: 'site_a', created_at: '2026-11-04T01:00:00Z' },
    ].map(row => ({ ...serializers.audit.items[0], account_id: '', site_id: '', idempotency_key: '', ...row })), total: 3, pagination: { limit: 10, offset: 0, total: 3, has_more: false, next_offset: null, last_offset: 0, is_out_of_range: false },
    diagnostics: { returned_count: 3, query_duration_ms: 1 },
  }) }));
  await page.goto('/admin/audit');
  const table = page.locator(directorySelector);
  await expect(table).toContainText('发送客户通知');
  await expect(table).toContainText('后台任务心跳');
  await expect(table).toContainText('系统任务 · 定时维护任务');
  await expect(table).toContainText('成功');
  await expect(table).toContainText('future.event');
  await expect(table.locator('tbody tr').last()).not.toContainText('平台管理员');
  await table.getByRole('button', { name: '查看证据', exact: true }).first().click();
  const drawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await drawer.getByText('技术详情', { exact: true }).click();
  await expect(drawer).toContainText('事件代码');
  await expect(drawer).toContainText('customer_notification.sent');
  await expect(drawer).toContainText('platform:internal_root');
  await page.screenshot({ path: testInfo.outputPath('audit-readable-evidence-1440.png'), fullPage: true });
});
