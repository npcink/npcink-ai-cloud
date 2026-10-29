import { expect, test, type Page } from '@playwright/test';
import { buildAdminApiEnvelope, buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

const window = { hours: 720, start_at: '2026-09-29T12:17:00Z', end_at: '2026-10-29T12:17:00Z' };
const generated_at = window.end_at;
const vector = {
  generated_at, window, health: { status: 'warning', score: 75 },
  totals: { index_jobs_total: 1, index_failed_total: 1, search_queries_total: 1, search_failed_total: 1, current_document_count: 10, current_chunk_count: 20, p95_search_latency_ms: 25 },
  sites: [{ site_id: 'index-only', document_count: 10, chunk_count: 20, queries_total: 0, index_jobs_total: 1, index_failed_total: 1, captured_at: '2026-10-01T12:17:00Z' }],
  failure_groups: [{ kind: 'index', error_code: '', count: 1, last_seen_at: generated_at }, { kind: 'search', error_code: 'search.timeout', count: 1, last_seen_at: generated_at }],
  failure_groups_truncated: true,
  timeline: [{ bucket_start_at: '2026-10-01T12:17:00Z', bucket_end_at: '2026-10-02T18:17:00Z', indexed_chunks_total: 2000, search_queries_total: 1, no_hit_total: 0, failed_total: 2 }],
};
const media = {
  generated_at, window, health: { status: 'ok', score: 100 }, totals: { jobs_total: 5, succeeded_total: 5, success_rate: 1, failed_total: 0, active_artifact_count: 1, active_artifact_bytes: 1024, delivery_started_count: 2, delivery_stream_completed_count: 2, delivery_acknowledged_count: 1 },
  delivery_evidence: { by_operation: [{ operation: 'image.generate.v1', delivery_started_count: 2, delivery_stream_completed_count: 2, delivery_acknowledged_count: 1 }] },
  timeline: [{ bucket_start_at: '2026-10-01T12:17:00Z', bucket_end_at: '2026-10-02T18:17:00Z', jobs_total: 5, failed_total: 0 }],
  recent_failures: [{ run_id: 'actual-media-run', site_id: 'site_mvp', target_format: 'webp', error_code: 'media.fixture', source_bytes: 100, processing_duration_ms: 10, finished_at: generated_at }],
};
async function reply(page: Page, pattern: string, data: unknown) {
  await page.route(pattern, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope(data)) }));
}

async function capture(page: Page, path: string) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
}

test('vector totals include every failure and absent focus never selects another error', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  await reply(page, '**/api/admin/vector-observability?*', vector);
  await page.goto('/admin/vector-observability?window=720&focus=missing');
  await expect(page.locator('[data-ui="vector-focus-absent"]')).toBeVisible();
  await expect(page.locator('[data-ui="vector-error-item"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('#vector-error-inspector')).not.toContainText('search.timeout');
  await expect(page.locator('[data-ui="vector-observability-metrics"]').getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByText(/当前恢复状态|current recovery is unverified/)).toBeVisible();
  const site = page.getByRole('row').filter({ hasText: 'index-only' });
  await expect(site).toContainText('10');
  await expect(site).toContainText('—');
  await page.locator('[data-ui="vector-error-item"]').first().click();
  await expect(page).toHaveURL(/focus=index%3A/);
  await expect(page.locator('#vector-error-inspector')).toContainText(/未提供错误码|No error code provided/);
  await page.getByText(/查看区间与计数|View intervals and counts/, { exact: true }).last().click();
  const intervals = page.getByRole('table', { name: /趋势区间与计数|Trend intervals and counts/ }).last();
  await expect(intervals).toContainText('2,000');
  await expect(intervals).toContainText('2026');
  await expect(intervals.getByRole('cell', { name: '2', exact: true })).toBeVisible();
  await capture(page, testInfo.outputPath('vector-light-1440.png'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, testInfo.outputPath('vector-dark-1440.png'));
  await page.setViewportSize({ width: 900, height: 1050 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, testInfo.outputPath('vector-900.png'));
});

test('media preserves requested run, normal success tone and delivery in empty history', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  let empty = false;
  await page.route('**/api/admin/media-observability?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ ...media, totals: { ...media.totals, jobs_total: empty ? 0 : 5 } })) }));
  await page.goto('/admin/media-observability?window=720&focus=missing');
  await expect(page.locator('[data-ui="media-focus-absent"]')).toBeVisible();
  await expect(page.locator('[data-ui="media-failure-item"][aria-pressed="true"]')).toHaveCount(0);
  const success = page.locator('[data-ui="media-observability-metrics"]').getByText('100.0%', { exact: true });
  await expect(success).not.toHaveClass(/amber|rose/);
  await expect(page.locator('[data-ui="media-delivery-evidence"]')).toContainText('image.generate.v1');
  await page.getByText(/查看区间与计数|View intervals and counts/, { exact: true }).click();
  await expect(page.getByRole('table', { name: /趋势区间与计数|Trend intervals and counts/ })).toContainText('2026');
  await capture(page, testInfo.outputPath('media-light-1440.png'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await capture(page, testInfo.outputPath('media-dark-1440.png'));
  empty = true;
  await page.getByRole('button', { name: /^刷新$|^Refresh$/ }).click();
  await expect(page.getByRole('heading', { name: /暂无衍生处理历史|No derivative processing history/ })).toBeVisible();
  await expect(page.locator('[data-ui="media-delivery-evidence"]')).toContainText('2 / 2 / 1');
  await expect(page.locator('[data-ui="media-history-scope"]')).toContainText(/已暂停|are paused/);
  await page.setViewportSize({ width: 900, height: 1050 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, testInfo.outputPath('media-empty-900.png'));
});

test('plugin problem history keeps exact conditions through paging and links the same run', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  const summaries: URL[] = [];
  await page.route('**/api/admin/plugin-observability?*', route => {
    summaries.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ generated_at, window,
      totals: { events_total: 80, error_total: 32 }, sites: [{ site_id: 'site_mvp', events_total: 80, error_total: 32 }],
      errors: [{ site_id: 'site_mvp', plugin_slug: 'npcink-cloud-addon', event_kind: 'unknown.event', error_code: 'unknown.reason', count: 32, last_seen_at: generated_at }], recent_activity: [],
    })) });
  });
  const historyRequests: URL[] = [];
  await page.route('**/api/admin/plugin-observability/history?*', route => {
    const url = new URL(route.request().url()); historyRequests.push(url);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ items: [{ id: Number(url.searchParams.get('page')), event_id: 'fixture-event', site_id: 'site_mvp', plugin_slug: 'npcink-cloud-addon', event_kind: 'unknown.event', error_code: 'unknown.reason', status: 'failed', received_at: generated_at, run_id: 'target-run' }], page: Number(url.searchParams.get('page')), pages: 2, total: 32, totals: { events: 32, failed: 32, succeeded: 0 }, snapshot: { at: generated_at, id: 80 } })) });
  });
  await reply(page, '**/api/admin/runtime-telemetry/runs?*', { items: [{ run_id: 'target-run', site_id: 'site_mvp', ability_name: 'fixture-ability', status: 'failed', error_code: 'unknown.reason', started_at: generated_at, finished_at: generated_at, duration_ms: 1, provider_call_count: 0, has_meter_event: false }] });
  await page.goto('/admin/plugin-observability?window=720');
  const problems = page.locator('[data-ui="plugin-problems"]');
  await expect(problems).toContainText('unknown.reason');
  await expect(problems).toContainText('unknown.event');
  await page.getByLabel(/近期事件类别|Recent event category/).selectOption('activity');
  await expect.poll(() => summaries.at(-1)?.searchParams.get('activity_category')).toBe('activity');
  expect(historyRequests).toHaveLength(0);
  await problems.getByRole('button', { name: /排查|Inspect/ }).click();
  const history = page.locator('[data-ui="usage-recent-activity"]').filter({ hasText: /此问题的留存记录|Retained records for this problem/ });
  await expect(history).toContainText('unknown.reason');
  await history.getByRole('button', { name: /下一页|Next/ }).click();
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get('page')).toBe('2');
  const params = historyRequests.at(-1)!.searchParams;
  for (const [key, value] of Object.entries({ site_id: 'site_mvp', plugin_slug: 'npcink-cloud-addon', event_kind: 'unknown.event', error_code: 'unknown.reason', status: 'failed', snapshot_id: '80' })) expect(params.get(key)).toBe(value);
  await capture(page, testInfo.outputPath('plugin-problem-1440.png'));
  await history.getByRole('link', { name: /查看此运行|Inspect this run/ }).click();
  await expect(page).toHaveURL(/run_id=target-run/);
  await expect(page.locator('[data-ui="runtime-exact-run"]')).toContainText('fixture-ability');
  await page.reload();
  await expect(page.locator('[data-ui="runtime-exact-run"]')).toContainText('fixture-ability');
  await capture(page, testInfo.outputPath('exact-run-1440.png'));
});

test('exact run lookup distinguishes absent evidence from source failure', async ({ page }) => {
  await installAdminMocks(page);
  let fail = false;
  await page.route('**/api/admin/runtime-telemetry/runs?*', route => {
    const exact = new URL(route.request().url()).searchParams.has('run_id');
    return route.fulfill({ status: fail && exact ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail && exact ? buildAdminApiErrorEnvelope('fixture unavailable') : buildAdminApiEnvelope({ items: [] })) });
  });
  await page.goto('/admin/troubleshooting?window=720&site=site_mvp&run_id=absent');
  const panel = page.locator('[data-ui="runtime-exact-run"]');
  await expect(panel).toContainText(/未找到此运行|was not found/);
  fail = true;
  await page.getByRole('button', { name: /^刷新$|^Refresh$/ }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  fail = false;
  await panel.getByRole('button', { name: /重试|Retry/ }).click();
  await expect(panel).toContainText(/未找到此运行|was not found/);
});
