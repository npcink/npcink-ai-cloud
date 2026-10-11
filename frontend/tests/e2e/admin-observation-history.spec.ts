import { test, expect } from '@playwright/test';
import { installAdminMocks, buildAdminApiEnvelope } from './helpers/admin-operator-fixture';
import { observeAdminBrowserEvidence, writeAdminVisualReceipt } from './helpers/admin-visual-receipt';

test('dimension lines differ and retained history pages keep a snapshot', async ({ page }, testInfo) => {
  const evidence = observeAdminBrowserEvidence(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const points = (runs: number[]) => runs.map((value, index) => ({ day: `2026-09-0${index + 1}`, runs: value, failed: index }));
  const comparison = { sites: { series: [{ id: 'site-a', points: points([7, 1]) }, { id: 'site-b', points: points([2, 9]) }], other: points([3, 4]), group_count: 7 }, functions: { series: [{ id: 'wp-ai.classification', points: points([4, 8]) }, { id: 'wp-ai.editorial', points: points([8, 6]) }], other: [], group_count: 2 } };
  await page.route('**/api/admin/runtime-telemetry?*', route => route.fulfill({ json: buildAdminApiEnvelope({ generated_at: '2026-09-16T00:00:00Z', usage_statistics: { runs: 26, failed: 2, active_sites: 7, sites: [], functions: [], timeline: [], comparison } }) }));
  const historyRequests: URL[] = [];
  let failNext = false;
  await page.route('**/api/admin/plugin-observability/history?*', route => {
    const url = new URL(route.request().url()); historyRequests.push(url);
    if (failNext) { failNext = false; return route.fulfill({ status: 503, json: {} }); }
    const query = url.searchParams;
    const pageNo = Number(query.get('page'));
    const events = query.get('view') === 'events';
    const filtered = Boolean(query.get('event_kind'));
    const total = filtered ? 42 : events ? 125 : 25;
    const count = Math.min(20, total - (pageNo - 1) * 20);
    return route.fulfill({ json: buildAdminApiEnvelope({ items: Array.from({ length: count }, (_, i) => ({ id: (pageNo - 1) * 20 + i, site_id: 'site-a', plugin_slug: 'npcink-cloud-addon', event_kind: filtered ? query.get('event_kind') : `kind-${(pageNo - 1) * 20 + i}`, received_at: '2026-09-15T00:00:00Z', events: 5, failed: 1, status: 'ok' })), page: pageNo, pages: Math.ceil(total / 20), total, totals: { events: filtered ? 42 : 125, failed: 25, succeeded: 100 }, snapshot: { at: '2026-09-16T00:00:00Z', id: 125 } }) });
  });
  await page.goto('/admin/usage-statistics?window=720');
  await page.getByRole('tab', { name: /图表|Chart/ }).click();
  const chart = page.locator('[data-ui="dimension-trend"]');
  await expect(chart.getByRole('heading')).toContainText(/按站点|Site/);
  await expect(chart.locator('table')).toContainText('site-a');
  await expect(chart.locator('tbody tr').first().locator('td')).toHaveText(['7', '2', '3']);
  await chart.getByLabel(/指标|Metric/).selectOption('failed');
  await expect(chart.locator('tbody tr').first().locator('td')).toHaveText(['0', '0', '0']);
  await page.getByRole('link', { name: /按功能|By function/ }).click();
  await expect(chart.getByRole('heading')).toContainText(/按功能|Function/);
  await chart.getByLabel(/指标|Metric/).selectOption('runs');
  await expect(chart.locator('tbody tr').first().locator('td')).toHaveText(['4', '8']);
  await expect(chart.locator('canvas')).toBeVisible();
  await expect.poll(() => chart.locator('canvas').evaluate(el => Math.abs(el.getBoundingClientRect().width - el.parentElement!.parentElement!.getBoundingClientRect().width))).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('comparison-1440.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => chart.locator('canvas').evaluate(el => Math.abs(el.getBoundingClientRect().width - el.parentElement!.parentElement!.getBoundingClientRect().width))).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('comparison-1920.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: /插件运行记录|Plugin activity records/ }).click();
  const table = page.locator('[data-ui="usage-recent-activity"]');
  await expect(table.locator('tbody tr')).toHaveCount(20);
  await table.getByRole('button', { name: /下一页|Next/ }).click();
  await expect(table.locator('tbody tr')).toHaveCount(5);
  expect(historyRequests.at(-1)!.searchParams.get('snapshot_id')).toBe('125');
  await table.getByRole('button', { name: /查看记录|View records/ }).first().click();
  await expect(table).toContainText(/42/);
  expect(historyRequests.at(-1)!.searchParams.get('event_kind')).toBe('kind-20');
  await table.getByRole('button', { name: /下一页|Next/ }).click();
  await expect(table.locator('tbody tr').first()).toContainText(/成功|Succeeded/);
  failNext = true;
  await table.getByLabel(/状态筛选|Status filter/).selectOption('failed');
  await expect(table.getByRole('alert')).toContainText(/加载失败|could not be loaded/);
  await expect(table.locator('tbody tr')).toHaveCount(0);
  await table.getByRole('button', { name: /重试|Retry/ }).click();
  await expect(table.locator('tbody tr')).toHaveCount(20);
  expect(historyRequests.at(-1)!.searchParams.get('page')).toBe('1');
  expect(historyRequests.at(-1)!.searchParams.has('snapshot_id')).toBe(false);
  await page.getByRole('button', { name: /14 天|14 days/ }).click();
  await expect.poll(() => historyRequests.at(-1)!.searchParams.get('window_hours')).toBe('336');
  expect(historyRequests.at(-1)!.searchParams.has('event_kind')).toBe(false);
  await expect(table.locator('tbody tr')).toHaveCount(20);
  await page.screenshot({ path: testInfo.outputPath('history-1920.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 900, height: 1050 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('history-900.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await writeAdminVisualReceipt({ page, testInfo, dataMode: 'mocked', route: '/admin/usage-statistics', pageModel: 'diagnostic', testedStates: ['ready', 'filtered', 'paginated', 'partial_error'], pageTitle: page.getByRole('heading', { name: /使用统计|Usage Statistics/, exact: true }), workingSurface: table, browserEvidence: evidence, humanAcceptance: 'pending', expectedConsoleErrors: [/503/], routeRuleResults: [
    { id: 'single-primary-action', status: 'not_applicable', evidence: 'read-only comparison and history' },
    { id: 'textual-status', status: 'pass', evidence: 'failure, loading, retained scope and page counts are explicit' },
    { id: 'action-object-proximity', status: 'pass', evidence: 'group drill-down and pagination remain in the working table' },
    { id: 'distinct-interaction-states', status: 'pass', evidence: 'selected dimensions and disabled pagination bounds' },
    { id: 'dialog-focus-recovery', status: 'not_applicable', evidence: 'in-flow history without modal' },
    { id: 'context-stability', status: 'pass', evidence: 'snapshot retained on pagination; filter and time changes reset old rows' },
  ], interactionResults: [{ id: 'comparison-and-history', status: 'pass', evidence: 'distinct series, metric selection, group drill-down, server paging, failure/retry and scope reset exercised' }] });
});
