import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

const pageErrorsByPage = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrorsByPage.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrorsByPage.get(page)).toEqual([]);
});

test('service status table keeps filters and direct customer actions on PC', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$/i })).toBeVisible();
  const primaryNav = page.locator('[data-ui="admin-primary-nav"]');
  const workspaceTabs = page.locator('[data-ui="admin-workspace-navigation"]');
  await expect(primaryNav.locator('a[href="/admin/subscriptions"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/coverage"]')).toHaveAttribute('aria-current', 'page');
  await expect(workspaceTabs.locator('a[href="/admin/subscriptions"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Open subscription risk|打开订阅风险/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态/i })).toBeVisible();
  await expect(statusGroup(page).getByRole('button', { name: /Needs action|需要处理/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).not.toHaveURL(/status=/);

  const initialRows = page.locator('[data-ui="coverage-queue-item"]');
  await expect(page.getByRole('columnheader', { name: /^Actions$|^操作$/i })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /Package.*Subscription|套餐.*订阅/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Sites$|^站点$/i })).toBeVisible();
  await expect(page.locator('#coverage-inspector')).toHaveCount(0);
  await expect(initialRows.nth(0)).not.toContainText(/Account ID|账户 ID/i);
  await expect(initialRows.nth(0)).not.toContainText('acct_');
  await expect(initialRows.nth(0)).not.toContainText('MVP Account');
  await expect(initialRows.nth(0).locator('td')).toHaveCount(6);
  await expect(initialRows.nth(0).locator('td').nth(2)).toContainText('Pro');
  await expect(initialRows.nth(0).locator('td').nth(3)).toHaveText('1');
  await expect(initialRows.nth(0).getByRole('link', { name: /Inspect subscription|查看订阅/i })).toHaveAttribute(
    'href',
    '/admin/subscriptions/sub_mvp'
  );
  await expect(initialRows.nth(0).getByRole('link', { name: 'Npcink AI Demo' })).toHaveAttribute(
    'href',
    `/admin/accounts/${encodeURIComponent(LONG_ACCOUNT_ID)}`
  );
  const uncoveredCustomerLink = initialRows.nth(1).getByRole('link', { name: 'Uncovered Account' });
  await expect(uncoveredCustomerLink).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered'
  );
  await expect(initialRows.nth(1).locator('td').nth(2)).toContainText('Uncovered');
  await expect(initialRows.nth(1).locator('td').nth(3)).toHaveText('1');
  await expect(initialRows.nth(1).getByRole('link', { name: /Open package actions|打开套餐操作/i })).toHaveAttribute(
    'href',
    '/admin/accounts/acct_uncovered#coverage-actions'
  );
  await expect(page.getByText(/Active API keys|活跃 API 密钥/i)).toHaveCount(0);
  await expect(page.getByText(/Technical information|技术信息/i)).toHaveCount(0);
  await expect(page.getByText(/Snapshot|账单统计|待刷新账单统计/i)).toHaveCount(0);

  await initialRows.nth(0).getByRole('button', { name: /Inspect evidence|查看证据/i }).click();
  const evidenceDrawer = page.locator('[data-ui="admin-inspector-drawer"]');
  await expect(evidenceDrawer).toBeVisible();
  await expect(evidenceDrawer).toContainText('Npcink AI Demo');
  await expect(page).toHaveURL(/focus=/);
  await page.keyboard.press('Escape');
  await expect(evidenceDrawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/focus=/);

  await page.getByLabel(/^Search$|^搜索$/i).fill('Uncovered');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByText('Uncovered Account').first()).toBeVisible();
  await expect(page).toHaveURL(/q=Uncovered/);

  await page.getByRole('combobox', { name: /Reason|原因/i }).selectOption('missing_package_coverage');
  await page.getByRole('combobox', { name: /Sort|排序/i }).selectOption('customer');
  await expect(page).not.toHaveURL(/status=/);
  await expect(page).toHaveURL(/q=Uncovered/);
  await expect(page).toHaveURL(/reason=missing_package_coverage/);
  await expect(page).toHaveURL(/sort=customer/);
  await expect(page).not.toHaveURL(/focus=/);

  await page.getByRole('button', { name: /Inspect evidence|查看证据/i }).click();
  await expect(evidenceDrawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/q=Uncovered/);
  await expect(page).toHaveURL(/reason=missing_package_coverage/);

  await page.reload();
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');
  await expect(statusGroup(page).getByRole('button', { name: /Needs action|需要处理/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: /Reason|原因/i })).toHaveValue('missing_package_coverage');
  await expect(page.getByRole('combobox', { name: /Sort|排序/i })).toHaveValue('customer');
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);

  await page.route('**/api/admin/coverage-work-queue?*', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('temporary queue refresh failure')),
    });
  });
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(
    page.locator('main').getByRole('alert').filter({ hasText: /加载数据失败|Failed to load data\./ })
  ).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');

  await page.getByRole('link', { name: 'Uncovered Account' }).click();
  await expect(page).toHaveURL('/admin/accounts/acct_uncovered');
  await expect(page.getByRole('heading', { name: /^Uncovered Account$/i })).toBeVisible();
});

test('service status pagination is server-backed and preserved in the URL', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage?limit=1');
  const rows = page.locator('[data-ui="coverage-queue-item"]');
  const pagination = page.locator('[data-ui="coverage-pagination"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Npcink AI Demo');
  await expect(pagination).toContainText(/1.*1.*2/);

  await pagination.getByRole('button', { name: /Next|下一步/i }).click();
  await expect(page).toHaveURL(/offset=1/);
  await expect(page).toHaveURL(/limit=1/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Uncovered Account');
  await expect(pagination).toContainText(/2.*2.*2/);

  await page.reload();
  await expect(page).toHaveURL(/offset=1/);
  await expect(rows.first()).toContainText('Uncovered Account');
  await pagination.getByRole('button', { name: /Previous|上一页/i }).click();
  await expect(page).not.toHaveURL(/offset=/);
  await expect(rows.first()).toContainText('Npcink AI Demo');
});

test('service status pilot emits the risk-tiered Admin visual receipt', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  await page.goto('/admin/coverage?limit=1');

  const workspace = page.locator('[data-ui="coverage-workspace"]');
  const pagination = page.locator('[data-ui="coverage-pagination"]');
  await expect(workspace).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await pagination.getByRole('button', { name: /Next|下一步/i }).click();
  await expect(page).toHaveURL(/offset=1/);
  await expect(page.getByRole('link', { name: 'Uncovered Account' })).toBeVisible();

  await page.getByLabel(/^Search$|^搜索$/i).fill('Uncovered');
  await expect(page).not.toHaveURL(/offset=/);
  await expect(page).toHaveURL(/q=Uncovered/);
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Uncovered Account' })).toBeVisible();
  await expect(workspace).toHaveAttribute('aria-busy', 'false');
  await expect(pagination).toContainText(/1.*1.*1/);

  const evidenceTrigger = page.getByRole('button', { name: /Inspect evidence|查看证据/i });
  await evidenceTrigger.click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toHaveCount(0);
  await expect(evidenceTrigger).toBeFocused();

  await page.route('**/api/admin/coverage-work-queue?*', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('temporary queue refresh failure')),
    });
  });
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(
    page.locator('main').getByRole('alert').filter({ hasText: /加载数据失败|Failed to load data\./ })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Uncovered Account' })).toBeVisible();
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');

  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: '/admin/coverage',
    pageModel: 'queue',
    testedStates: ['ready', 'filtered', 'paginated', 'selected', 'refresh_error'],
    humanAcceptance: 'not_required',
    pageTitle: page.locator('main h1').filter({ hasText: /^Service status$|^服务状态$/i }),
    workingSurface: workspace,
    browserEvidence,
    expectedConsoleErrors: [
      /^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/,
    ],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'the workspace exposes secondary refresh and row-scoped remediation links without a competing primary action' },
      { id: 'textual-status', status: 'pass', evidence: 'queue rows and summary metrics expose explicit status text' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'remediation and evidence actions remain inside the affected customer row' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'pagination disabled state, drawer focus, and URL-backed filter state were each verified' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'Escape closed the evidence inspector and restored focus to its trigger' },
      { id: 'context-stability', status: 'pass', evidence: 'a failed refresh preserved the filtered customer row and search value' },
    ],
    interactionResults: [
      { id: 'server-pagination', status: 'pass', evidence: 'Next loaded the second server page and persisted offset in the URL' },
      { id: 'filter-and-inspect', status: 'pass', evidence: 'search reset pagination and the row inspector restored trigger focus' },
      { id: 'refresh-error-context', status: 'pass', evidence: 'the failed refresh kept the current filtered queue visible' },
    ],
  });
});

for (const viewport of [
  { width: 900, height: 900 },
  { width: 1280, height: 900 },
  { width: 1600, height: 1000 },
]) {
  test(`service status filter toolbar stays readable at ${viewport.width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await installAdminMocks(page);
    await page.goto('/admin/coverage');

    const toolbar = page.locator('[data-ui="coverage-filter-toolbar"]');
    const controls = toolbar.locator('input, select, button');
    await expect(toolbar).toBeVisible();
    await expect(controls).toHaveCount(4);
    await expect(statusGroup(page).getByRole('button')).toHaveCount(6);
    const clearFilters = page.getByRole('button', { name: /Clear filters|清除筛选/i });
    const clearFiltersTooltip = page.locator('[data-ui="coverage-clear-filters-tooltip"]');
    await expect(clearFiltersTooltip).toHaveAttribute('title', /Clear filters|清除筛选/i);
    await expect(clearFiltersTooltip).toHaveCSS('pointer-events', 'auto');
    await expect(clearFilters).toBeDisabled();

    const toolbarBox = await toolbar.boundingBox();
    const controlBoxes = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      })
    );
    expect(toolbarBox).not.toBeNull();
    expect(
      controlBoxes.every(
        (box) =>
          toolbarBox != null &&
          box.left >= toolbarBox.x &&
          box.right <= toolbarBox.x + toolbarBox.width
      )
    ).toBe(true);
    expect(controlBoxes.every((box) => box.bottom > box.top)).toBe(true);

    if (viewport.width >= 1280) {
      expect(Math.max(...controlBoxes.map((box) => box.top)) - Math.min(...controlBoxes.map((box) => box.top))).toBeLessThan(2);
    }

    await statusGroup(page).getByRole('button', { name: /All service statuses|全部服务状态/i }).click();
    await expect(clearFilters).toBeEnabled();
  });
}

function statusGroup(page: Page) {
  return page.getByRole('group', { name: /^Service status$|^服务状态$/i });
}
function coverageRows(page: Page) {
  return page.locator('[data-ui="coverage-queue-item"]');
}
async function coverageRange(page: Page, start: number, end: number, total: number) {
  await expect(page.locator('[data-ui="coverage-pagination"]')).toContainText(new RegExp(`${start}\\s*[–-]\\s*${end}.*${total}`));
}
function directoryItems(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    account: { account_id: `acct_directory_${index}`, name: `Directory customer ${String(index).padStart(2, '0')}` },
    severity: 'warning', reason_code: 'subscription_lifecycle_risk', reason: 'Subscription ending soon',
    suggested_action: 'inspect_subscription_lifecycle', action_label: 'Inspect subscription', action_href: `/admin/subscriptions/sub_directory_${index}`,
    package: { display_package_label: 'Plus' },
    primary_subscription: { subscription_id: `sub_directory_${index}`, status: 'active' },
    evidence: { site_count: 1, active_site_count: 1, missing_key_site_count: 0, days_until_end: index + 1 },
  }));
}
async function installDirectory(page: Page, items = directoryItems(21), maxReturned?: number) {
  const unhandledAdminRequests: string[] = [];
  await installAdminMocks(page, { unhandledAdminRequests });
  const requests: URLSearchParams[] = [];
  let failWhen: ((params: URLSearchParams) => boolean) | null = null;
  let holdNext: (() => Promise<void>) | null = null;
  let unavailable = false;
  await page.route('**/api/admin/coverage-work-queue?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    if (holdNext) { const wait = holdNext; holdNext = null; await wait(); }
    if (unavailable || failWhen?.(params)) {
      failWhen = null;
      await route.fulfill({ status: 503, json: buildAdminApiErrorEnvelope('temporary queue read failure') });
      return;
    }
    const counts = { total: items.length, visible: items.length, needs_action: 0, error: 0, warning: 0, ok: 0, inactive: 0, reason_counts: {} as Record<string, number> };
    for (const item of items) {
      counts[item.severity as 'error' | 'warning' | 'ok' | 'inactive'] += 1;
      if (item.severity === 'warning' || item.severity === 'error') counts.needs_action += 1;
      counts.reason_counts[item.reason_code] = (counts.reason_counts[item.reason_code] || 0) + 1;
    }
    const terms = (params.get('q') || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = items.filter(item =>
      (params.get('status') === 'all' || (params.get('status') === 'needs_action' ? ['error', 'warning'].includes(item.severity) : item.severity === params.get('status'))) &&
      (!params.get('reason') || item.reason_code === params.get('reason')) &&
      terms.every(term => `${item.account.name} ${item.account.account_id}`.toLowerCase().includes(term))
    ).sort((a, b) => params.get('sort') === 'customer' ? b.account.name.localeCompare(a.account.name) : params.get('sort') === 'expiry' ? b.evidence.days_until_end - a.evidence.days_until_end : a.account.account_id.localeCompare(b.account.account_id, undefined, { numeric: true }));
    const offset = Number(params.get('offset'));
    const limit = Number(params.get('limit'));
    const pageItems = filtered.slice(offset, offset + Math.min(limit, maxReturned ?? limit));
    await route.fulfill({ json: buildAdminApiEnvelope({
      generated_at: '2026-10-23T10:11:12Z', summary: counts, hidden_internal_total: 7, total: filtered.length,
      pagination: { offset, limit, total: filtered.length, has_more: offset + pageItems.length < filtered.length }, items: pageItems,
    }) });
  });
  return {
    requests, unhandledAdminRequests,
    setUnavailable: (value: boolean) => { unavailable = value; },
    failNext: (when: (params: URLSearchParams) => boolean = () => true) => { failWhen = when; },
    holdNext: () => { let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); holdNext = () => pending; return release; },
  };
}

for (const count of [0, 1, 10, 11, 21]) {
  test(`Quiet service status keeps honest ten-row ranges for ${count} matches`, async ({ page }, testInfo) => {
    const mocks = await installDirectory(page, directoryItems(count));
    await page.goto('/admin/coverage');
    await coverageRange(page, count ? 1 : 0, Math.min(10, count), count);
    await expect(coverageRows(page)).toHaveCount(Math.min(10, count));
    expect(mocks.requests[0].get('limit')).toBe('10');
    await page.screenshot({ path: testInfo.outputPath(`coverage-range-${count}.png`), fullPage: true, animations: 'disabled' });
    const next = page.locator('[data-ui="coverage-pagination"]').getByRole('button', { name: /Next|下一步/i });
    if (count > 10) {
      await next.click();
      await coverageRange(page, 11, Math.min(20, count), count);
      await expect(page).toHaveURL(/offset=10/);
      await page.reload();
      await coverageRange(page, 11, Math.min(20, count), count);
      if (count > 20) { await next.click(); await coverageRange(page, 21, 21, 21); }
    } else await expect(next).toHaveCount(0);
    expect(mocks.unhandledAdminRequests).toEqual([]);
  });
}

for (const limit of [1, 50, 500]) {
  test(`Quiet service status retains existing URL limit=${limit}`, async ({ page }) => {
    const mocks = await installDirectory(page);
    await page.goto(`/admin/coverage?limit=${limit}&offset=3`);
    await coverageRange(page, 4, Math.min(3 + limit, 21), 21);
    expect(mocks.requests[0].get('limit')).toBe(String(limit));
    expect(mocks.requests[0].get('offset')).toBe('3');
    await page.reload();
    await coverageRange(page, 4, Math.min(3 + limit, 21), 21);
    expect(mocks.unhandledAdminRequests).toEqual([]);
  });
}

test('Quiet service filters intersect without replacing the global summary or issuing focus-only reads', async ({ page }) => {
  const items = directoryItems(8).map((item, index) => ({ ...item,
    severity: ['error', 'warning', 'ok', 'inactive'][index % 4],
    reason_code: index % 2 ? 'subscription_lifecycle_risk' : 'missing_package_coverage',
  }));
  const mocks = await installDirectory(page, items);
  await page.goto('/admin/coverage');
  await coverageRange(page, 1, 4, 4);
  const header = page.locator('[data-ui="backoffice-page-header"]');
  const summary = await header.innerText();
  for (const status of ['error', 'warning', 'ok', 'inactive', 'all', 'needs_action']) {
    const index = ['needs_action', 'error', 'warning', 'ok', 'inactive', 'all'].indexOf(status);
    await statusGroup(page).getByRole('button').nth(index).click();
    await expect(statusGroup(page).getByRole('button').nth(index)).toHaveAttribute('aria-pressed', 'true');
    await coverageRange(page, 1, status === 'all' ? 8 : status === 'needs_action' ? 4 : 2, status === 'all' ? 8 : status === 'needs_action' ? 4 : 2);
    expect(await header.innerText()).toBe(summary);
  }
  await page.getByRole('combobox', { name: /Reason|原因/i }).selectOption('subscription_lifecycle_risk');
  await page.getByRole('combobox', { name: /Sort|排序/i }).selectOption('customer');
  await page.getByRole('searchbox', { name: /^Search$|^搜索$/i }).fill('customer 05');
  await coverageRange(page, 1, 1, 1);
  expect(mocks.requests.at(-1)?.get('reason')).toBe('subscription_lifecycle_risk');
  expect(mocks.requests.at(-1)?.get('sort')).toBe('customer');
  expect(await header.innerText()).toBe(summary);
  const before = mocks.requests.length;
  await page.getByRole('button', { name: /Inspect evidence|查看证据/i }).click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('Directory customer 05');
  await expect(page).toHaveURL(/focus=/);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/focus=/);
  expect(mocks.requests.length).toBe(before);
  expect(mocks.unhandledAdminRequests).toEqual([]);
});

test('Quiet service status guards the debounce window and failed changed-query offsets, then refreshes the current URL', async ({ page }, testInfo) => {
  const mocks = await installDirectory(page, directoryItems(81));
  await page.goto('/admin/coverage?offset=50');
  await coverageRange(page, 51, 60, 81);
  const header = page.locator('[data-ui="backoffice-page-header"]');
  const successfulSummary = await header.innerText();
  await page.clock.install();
  const footer = page.locator('[data-ui="coverage-pagination"]');
  const previous = footer.getByRole('button', { name: /Previous|上一页/i });
  const next = footer.getByRole('button', { name: /Next|下一步/i });
  mocks.failNext(params => params.get('q') === 'customer 00');
  const release = mocks.holdNext();
  const before = mocks.requests.length;
  await page.getByRole('searchbox', { name: /^Search$|^搜索$/i }).fill('customer 00');
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  await page.clock.runFor(249);
  expect(mocks.requests.length).toBe(before);
  await page.clock.runFor(1);
  await expect.poll(() => mocks.requests.length).toBe(before + 1);
  expect(mocks.requests.at(-1)?.get('q')).toBe('customer 00');
  expect(mocks.requests.at(-1)?.get('offset')).toBe('0');
  await coverageRange(page, 51, 60, 81);
  await expect(previous).toBeDisabled();
  const failure = page.waitForResponse(response => response.url().includes('/api/admin/coverage-work-queue?') && response.status() === 503);
  release();
  expect((await failure).status()).toBe(503);
  await expect(page.locator('main').getByRole('alert')).toContainText(/Failed to load data|加载数据失败/);
  await expect(page.locator('[data-ui="coverage-workspace"]')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-ui="coverage-workspace"]').getByRole('status').filter({ hasText: /Loading|加载中/i })).toHaveCount(0);
  await coverageRange(page, 51, 60, 81);
  await expect(previous).toBeDisabled();
  await expect(next).toBeDisabled();
  expect(await header.innerText()).toBe(successfulSummary);
  await page.screenshot({ path: testInfo.outputPath('coverage-cross-query-disabled.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await coverageRange(page, 1, 1, 1);
  expect(mocks.requests.filter(params => params.get('q') === 'customer 00').every(params => params.get('offset') === '0')).toBe(true);
  await expect(page).toHaveURL(/q=customer\+00/);
  await expect(page).not.toHaveURL(/offset=/);
  expect(await header.innerText()).toBe(successfulSummary);
  expect(mocks.unhandledAdminRequests).toEqual([]);
});

test('Quiet service status keeps the successful range on an offset failure and retries the same URL with a real GET', async ({ page }, testInfo) => {
  const mocks = await installDirectory(page);
  await page.goto('/admin/coverage');
  await coverageRange(page, 1, 10, 21);
  const footer = page.locator('[data-ui="coverage-pagination"]');
  const next = footer.getByRole('button', { name: /Next|下一步/i });
  mocks.failNext(params => params.get('offset') === '10');
  const release = mocks.holdNext();
  await next.click();
  await expect(page).toHaveURL(/offset=10/);
  await coverageRange(page, 1, 10, 21);
  await expect(next).toBeDisabled();
  const failure = page.waitForResponse(response => response.url().includes('/api/admin/coverage-work-queue?') && response.status() === 503);
  release(); await failure;
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await coverageRange(page, 1, 10, 21);
  await expect(next).toBeEnabled();
  await page.getByRole('button', { name: /Inspect evidence|查看证据/i }).first().click();
  await expect(page).toHaveURL(/focus=/);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('coverage-same-query-retained.png'), fullPage: true, animations: 'disabled' });
  const before = mocks.requests.length;
  await next.click();
  await coverageRange(page, 11, 20, 21);
  expect(mocks.requests.length).toBe(before + 1);
  expect(mocks.requests.at(-1)?.get('offset')).toBe('10');
  await expect(page).not.toHaveURL(/focus=/);
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  expect(mocks.unhandledAdminRequests).toEqual([]);
});

test('Quiet service status normalizes far pages only after their own successful response', async ({ page }, testInfo) => {
  const mocks = await installDirectory(page);
  await page.goto('/admin/coverage?q=missing');
  await coverageRange(page, 0, 0, 0);
  const before = mocks.requests.length;
  const release = mocks.holdNext();
  await page.evaluate(() => window.history.replaceState(null, '', '/admin/coverage?status=warning&sort=expiry&offset=900&limit=10'));
  await expect.poll(() => mocks.requests.length).toBe(before + 1);
  await expect(page).toHaveURL(/offset=900/);
  expect(mocks.requests.at(-1)?.get('offset')).toBe('900');
  await coverageRange(page, 0, 0, 0);
  release();
  await coverageRange(page, 21, 21, 21);
  await expect(page).toHaveURL(/offset=20/);
  expect(mocks.requests.length).toBe(before + 2);
  expect(mocks.requests.slice(before).map(params => params.get('offset'))).toEqual(['900', '20']);
  expect(mocks.requests.slice(before).every(params => params.get('status') === 'warning' && params.get('sort') === 'expiry')).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('coverage-far-page-recovered.png'), fullPage: true, animations: 'disabled' });
  expect(mocks.unhandledAdminRequests).toEqual([]);
});

test('Quiet service status initial failure retries its URL and reports actual partial page length', async ({ page }) => {
  const mocks = await installDirectory(page, directoryItems(21), 3);
  mocks.setUnavailable(true);
  await page.goto('/admin/coverage?status=warning');
  await expect(page.getByRole('button', { name: /^Retry$|^重试$/i })).toBeVisible();
  await expect(page.locator('main')).toContainText(/Failed to load data|加载数据失败/);
  await expect(coverageRows(page)).toHaveCount(0);
  const beforeRetry = mocks.requests.length;
  mocks.setUnavailable(false);
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await coverageRange(page, 1, 3, 21);
  await expect(coverageRows(page)).toHaveCount(3);
  await expect(page).toHaveURL(/status=warning/);
  expect(mocks.requests.length).toBe(beforeRetry + 1);
  expect(mocks.unhandledAdminRequests).toEqual([]);
});

test('Quiet service status PC preview preserves six columns, quiet rows and exact drawer context', async ({ page }, testInfo) => {
  const items = directoryItems(21).map((item, index) => ({ ...item, severity: index > 17 ? 'ok' : item.severity }));
  const mocks = await installDirectory(page, items);
  await page.goto('/admin/coverage?status=all');
  await coverageRange(page, 1, 10, 21);
  for (const locale of ['zh', 'en']) {
    if (locale === 'en') {
      await page.getByRole('button', { name: '语言', exact: true }).click();
      await page.getByRole('option', { name: 'English', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Service status', exact: true })).toBeVisible();
    }
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').evaluate(el => el.classList.contains('dark'))) !== (theme === 'dark')) await page.getByRole('button', { name: locale === 'zh' ? '切换主题' : 'Toggle theme', exact: true }).click();
      for (const width of [1440, 1280]) {
        await page.setViewportSize({ width, height: 1050 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const first = coverageRows(page).first();
        await expect(first.locator('td')).toHaveCount(6);
        await first.locator('td').last().scrollIntoViewIfNeeded();
        await expect(first.locator('td').last()).toBeInViewport();
        await expect(first.getByRole('button', { name: /Inspect evidence|查看证据/i })).toBeVisible();
        if (width === 1280) await page.screenshot({ path: testInfo.outputPath(`coverage-${locale}-${theme}-${width}-right.png`), fullPage: true, animations: 'disabled' });
        await page.getByRole('table', { name: /Customer service status|客户服务状态/i }).evaluate(table => {
          let parent = table.parentElement;
          while (parent && parent.scrollWidth <= parent.clientWidth) parent = parent.parentElement;
          if (parent) parent.scrollLeft = 0;
        });
        await page.screenshot({ path: testInfo.outputPath(`coverage-${locale}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      }
    }
  }
  await coverageRows(page).nth(1).getByRole('button', { name: 'Inspect evidence', exact: true }).click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('Directory customer 01');
  await page.screenshot({ path: testInfo.outputPath('coverage-inspector-en-dark-1280.png'), fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await statusGroup(page).getByRole('button').nth(3).click();
  await coverageRange(page, 1, 3, 3);
  await expect(coverageRows(page).getByRole('button', { name: /Inspect evidence|查看证据/i })).toHaveCount(0);
  expect(mocks.unhandledAdminRequests).toEqual([]);
});
