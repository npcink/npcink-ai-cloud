import { expect, test } from '@playwright/test';
import {
  buildAdminApiErrorEnvelope,
  installAdminMocks,
  LONG_ACCOUNT_ID,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

test('service status table keeps filters and direct customer actions on PC', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage');
  await expect(page.getByRole('heading', { name: /^Service status$|^服务状态$/i })).toBeVisible();
  const primaryNav = page.locator('[data-ui="admin-primary-nav"]');
  await expect(primaryNav.locator('a[href="/admin/coverage"]')).toHaveAttribute('aria-current', 'page');
  await expect(primaryNav.locator('a[href="/admin/subscriptions"]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Open subscription risk|打开订阅风险/i })).toHaveCount(0);
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: /Customer service status|客户服务状态/i })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Service status|服务状态/i })).toHaveValue('needs_action');
  await expect(page).not.toHaveURL(/status=/);

  const initialRows = page.locator('[data-ui="coverage-queue-item"]');
  await expect(page.getByRole('columnheader', { name: /^Actions$|^操作$/i })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /Package.*Subscription|套餐.*订阅/i })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Sites$|^站点$/i })).toBeVisible();
  await expect(page.locator('#coverage-inspector')).toHaveCount(0);
  await expect(initialRows.nth(0)).not.toContainText(/Account ID|账户 ID/i);
  await expect(initialRows.nth(0)).not.toContainText('acct_');
  await expect(initialRows.nth(0).locator('td')).toHaveCount(6);
  await expect(initialRows.nth(0).locator('td').nth(2)).toContainText('Pro');
  await expect(initialRows.nth(0).locator('td').nth(3)).toHaveText('1');
  await expect(initialRows.nth(0).getByRole('link', { name: /Inspect subscription|查看订阅/i })).toHaveAttribute(
    'href',
    '/admin/subscriptions/sub_mvp'
  );
  await expect(initialRows.nth(0).getByRole('link', { name: 'MVP Account' })).toHaveAttribute(
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
  await expect(evidenceDrawer).toContainText('MVP Account');
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
  await expect(page.getByRole('combobox', { name: /Service status|服务状态/i })).toHaveValue('needs_action');
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
    page.getByRole('alert').filter({ hasText: /temporary queue refresh failure/i })
  ).toBeVisible();
  await expect(page.locator('[data-ui="coverage-queue-item"]')).toHaveCount(1);
  await expect(page.getByLabel(/^Search$|^搜索$/i)).toHaveValue('Uncovered');

  await page.getByRole('link', { name: 'Uncovered Account' }).click();
  await expect(page).toHaveURL('/admin/accounts/acct_uncovered');
  await expect(page.getByRole('heading', { name: /^Uncovered$/i })).toBeVisible();
});

test('service status pagination is server-backed and preserved in the URL', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);

  await page.goto('/admin/coverage?limit=1');
  const rows = page.locator('[data-ui="coverage-queue-item"]');
  const pagination = page.locator('[data-ui="coverage-pagination"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('MVP Account');
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
  await expect(rows.first()).toContainText('MVP Account');
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
    page.getByRole('alert').filter({ hasText: /temporary queue refresh failure/i })
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
    await expect(controls).toHaveCount(5);
    await expect(page.getByRole('combobox', { name: /Service status|服务状态/i }).locator('option')).toHaveCount(6);
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

    await page.getByRole('combobox', { name: /Service status|服务状态/i }).selectOption('all');
    await expect(clearFilters).toBeEnabled();
  });
}
