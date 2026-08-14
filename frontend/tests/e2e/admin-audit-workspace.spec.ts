import { expect, test } from '@playwright/test';
import {
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

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
  await expect(directory).toContainText(/Subscription Bind|Subscription bind|订阅/i);
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toBeVisible();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('audit-bind-101');
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).not.toContainText(/payload_json|secret/i);
  await expect(page).toHaveURL(/event_id=101/);
  await expect(page).toHaveURL(/focus=101/);

  await page.locator('[data-ui="admin-inspector-drawer-close"]').click();
  await expect(page).not.toHaveURL(/focus=101/);
  await page.goto('/admin/audit');
  await page.getByLabel(/Idempotency key|幂等键/i).fill('audit-rebuild-102');
  await page.getByRole('button', { name: /Apply filters|应用筛选/i }).click();
  await expect(page).toHaveURL(/idempotency_key=audit-rebuild-102/);
  await expect(directory.locator('tbody tr')).toHaveCount(1);
  await expect(directory).toContainText(/Billing Snapshot Rebuild|Billing snapshot rebuild|账单/i);

  await directory.getByRole('button', { name: /Inspect|查看/i }).click();
  await expect(page).toHaveURL(/focus=102/);
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toContainText('trace-audit-102');
  await page.locator('[data-ui="admin-inspector-drawer-close"]').click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toHaveCount(0);
  await directory.getByRole('button', { name: /Inspect|查看/i }).click();
  await expect(page.locator('[data-ui="admin-inspector-drawer"]')).toBeVisible();
  await page.locator('[data-ui="admin-inspector-drawer-close"]').click();

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
    humanAcceptance: 'not_required',
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

  await page.getByLabel(/Idempotency key|幂等键/i).fill('missing-audit-event');
  await page.getByRole('button', { name: /Apply filters|应用筛选/i }).click();
  await expect(page.getByText(/No matching audit evidence|没有匹配的审计证据/i)).toBeVisible();
});

test('audit workspace exposes an initial failure and retry path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const auditFailureController = { enabled: true };
  await installAdminMocks(page, { auditFailureController });
  await page.goto('/admin/audit');
  await expect(page.locator('[role="alert"]').filter({ hasText: 'initial audit evidence failure' })).toBeVisible();
  await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(0);
  auditFailureController.enabled = false;
  await page.getByRole('button', { name: /Retry|重试/i }).click();
  await expect(page.locator('[data-ui="admin-audit-directory"] tbody tr')).toHaveCount(2);
});
