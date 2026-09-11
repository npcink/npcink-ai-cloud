import { test, expect } from '@playwright/test';
import { installAdminMocks, buildAdminApiEnvelope } from './helpers/admin-operator-fixture';
import { observeAdminBrowserEvidence, writeAdminVisualReceipt } from './helpers/admin-visual-receipt';

test('usage counts, period filters and source failure stay honest', async ({ page }, testInfo) => {
  const evidence = observeAdminBrowserEvidence(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  let pluginFail = false;
  const requests: string[] = [];
  const row = { id: 'site-a', runs: 12, failed: 2, success_rate: 0.75, avg_latency_ms: 1200 };
  await page.route('**/api/admin/runtime-telemetry*', route => {
    requests.push(route.request().url());
    return route.fulfill({ json: buildAdminApiEnvelope({ generated_at: '2026-09-10T12:00:00Z', window: { since: '2026-09-03T12:00:00Z', until: '2026-09-10T12:00:00Z' }, usage_statistics: { ...row, active_sites: 1, latency_samples: 10, possibly_truncated: false, sites: [row], functions: [{ ...row, id: 'wp-ai.classification' }], timeline: [{ ...row, day: '2026-09-10' }] } }) });
  });
  await page.route('**/api/admin/plugin-observability*', route => route.fulfill(pluginFail ? { status: 503, json: {} } : { json: buildAdminApiEnvelope({ generated_at: '2026-09-10T12:00:00Z', totals: { events_total: 23, active_site_count: 1 }, plugins: [{ plugin_slug: 'test-plugin', events_total: 23, error_total: 1, success_rate: 22 / 23, avg_latency_ms: 200 }], timeline: [{ bucket_start_at: '2026-09-10T12:00:00Z', events_total: 23, error_total: 1 }] }) }));
  await page.goto('/admin/usage-statistics');
  await expect(page.locator('[data-ui="usage-statistics-workspace"]')).toContainText('12');
  await expect(page.getByRole('link', { name: /Site diagnostics|站点诊断/ })).toHaveAttribute('href', '/admin/troubleshooting?window=168&site=site-a');
  await page.getByRole('link', { name: /By function|按功能/ }).click();
  await expect(page.locator('[data-ui="usage-breakdown"]')).toContainText(/Classification|内容分类/);
  await page.getByRole('link', { name: /Plugin activity records|插件运行记录/ }).click();
  await expect(page.locator('[data-ui="usage-breakdown"]')).toContainText('23');
  await expect(page.getByRole('link', { name: /Plugin records|插件记录/ })).toHaveAttribute('href', '/admin/plugin-observability?window=168&plugin=test-plugin');
  const testRequest = page.waitForRequest(request => request.url().includes('record_scope=test'));
  await page.getByRole('link', { name: /View test records|查看测试记录/ }).click();
  await testRequest;
  await expect(page).toHaveURL(/records=test/);
  await expect(page.locator('[data-ui="usage-breakdown"]')).toContainText(/Test record|测试记录/);
  const operationalRequest = page.waitForRequest(request => request.url().includes('record_scope=operational'));
  await page.getByRole('link', { name: /Back to activity records|返回运行记录/ }).click();
  await operationalRequest;
  await page.getByRole('link', { name: /Last 3 days|近 3 天/ }).click();
  await expect.poll(() => requests.some(url => url.includes('recent_minutes=4320'))).toBe(true);
  await expect(page).toHaveURL(/window=72/);
  await page.reload();
  await expect(page.getByRole('link', { name: /Last 3 days|近 3 天/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Plugin activity records|插件运行记录/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-ui="usage-breakdown"]')).toContainText('23');
  await page.goBack();
  await expect(page).not.toHaveURL(/window=72/);
  await page.goForward();
  await expect(page).toHaveURL(/window=72/);
  await expect(page.getByRole('button', { name: /^Refresh$|^刷新$/ })).toBeEnabled();
  pluginFail = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('[data-ui="usage-statistics-workspace"]')).toContainText('12');
  await expect(page.locator('[data-ui="usage-breakdown"]')).not.toContainText('23');
  await writeAdminVisualReceipt({ page, testInfo, dataMode: 'mocked', route: '/admin/usage-statistics', pageModel: 'diagnostic', testedStates: ['ready', 'filtered', 'partial_error'], pageTitle: page.getByRole('heading', { name: /Usage Statistics|使用统计/, exact: true }), workingSurface: page.locator('[data-ui="usage-statistics-workspace"]'), browserEvidence: evidence, humanAcceptance: 'pending', expectedConsoleErrors: [/503/], routeRuleResults: [
    { id: 'single-primary-action', status: 'not_applicable', evidence: 'read-only filters and navigation' },
    { id: 'textual-status', status: 'pass', evidence: 'explicit source error and unavailable text' },
    { id: 'action-object-proximity', status: 'pass', evidence: 'site and plugin row links preserve identity' },
    { id: 'distinct-interaction-states', status: 'pass', evidence: 'aria-current window and dimension links' },
    { id: 'dialog-focus-recovery', status: 'not_applicable', evidence: 'no dialog' },
    { id: 'context-stability', status: 'pass', evidence: 'URL retains scope; independent source remains available' },
  ], interactionResults: [{ id: 'filters-and-partial-failure', status: 'pass', evidence: 'period requests, dimension links, and partial source failures verified' }] });
});
