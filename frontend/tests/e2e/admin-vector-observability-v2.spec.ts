import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

const vectorData = {
  generated_at: '2026-07-12T12:00:00Z',
  window: { hours: 24, start_at: '2026-07-11T12:00:00Z', end_at: '2026-07-12T12:00:00Z' },
  totals: {
    index_jobs_total: 12,
    index_succeeded_total: 11,
    index_failed_total: 1,
    index_success_rate: 0.9167,
    indexed_documents_total: 320,
    indexed_chunks_total: 1280,
    failed_documents_total: 1,
    avg_index_duration_ms: 840,
    p95_index_duration_ms: 1450,
    search_queries_total: 48,
    search_succeeded_total: 45,
    search_failed_total: 3,
    search_success_rate: 0.9375,
    no_hit_total: 14,
    no_hit_rate: 0.2917,
    avg_search_latency_ms: 92,
    p95_search_latency_ms: 210,
    avg_top1_score: 0.742,
    indexed_site_count: 2,
    current_document_count: 320,
    current_chunk_count: 1280,
  },
  health: { status: 'warning', score: 71, summary: 'No-hit rate requires review.' },
  timeline: [{ bucket_start_at: '2026-07-12T11:00:00Z', index_jobs_total: 12, indexed_chunks_total: 1280, search_queries_total: 48, no_hit_total: 14, failed_total: 4 }],
  intents: [{ intent: 'product_support', queries_total: 48, no_hit_total: 14, no_hit_rate: 0.2917, avg_top1_score: 0.742, avg_latency_ms: 92 }],
  sites: [{ site_id: 'site_mvp', queries_total: 48, no_hit_total: 14, no_hit_rate: 0.2917, avg_top1_score: 0.742, avg_latency_ms: 92, last_search_finished_at: '2026-07-12T11:58:00Z', document_count: 320, chunk_count: 1280, last_indexed_at: '2026-07-12T11:40:00Z' }],
  index_snapshots: [{ site_id: 'site_mvp', document_count: 320, chunk_count: 1280, post_type_counts: { post: 320 }, source_type_counts: { wordpress: 320 }, last_indexed_at: '2026-07-12T11:40:00Z', embedding_provider: 'openai', embedding_model: 'text-embedding-3-small', embedding_dimensions: 1536, vector_backend: 'pgvector', captured_at: '2026-07-12T11:40:00Z' }],
  errors: [{ error_code: 'vector_search_timeout', count: 3, last_seen_at: '2026-07-12T11:58:00Z' }],
};

async function installVectorHarness(page: Page, responseData: unknown = vectorData) {
  await installAdminMocks(page);
  const urls: string[] = [];
  let failNext = false;
  await page.route('**/api/admin/vector-observability?*', async (route) => {
    urls.push(route.request().url());
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary vector telemetry failure')) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope(responseData)) });
  });
  return { urls: () => urls, failNextRequest: () => { failNext = true; } };
}

test('vector observability keeps scope and selected error URL-backed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installVectorHarness(page);
  await page.goto('/admin/vector-observability');

  await expect(page.locator('[data-ui="admin-primary-nav"] a[href="/admin/usage-statistics"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-ui="backoffice-page-header"]')).toContainText(/Vector Observability|向量观测/);

  await expect(page.locator('[data-ui="vector-handling-guidance"]')).toContainText(/inspect the records first|先核对失败记录/);
  await expect(page.locator('[data-ui="vector-failure-guidance"]')).toContainText(/cannot distinguish|无法区分/);
  await expect(page.locator('[data-ui="vector-error-item"]')).toHaveCount(1);
  await expect(page.locator('#vector-error-inspector')).toContainText('vector_search_timeout');
  await page.locator('[data-ui="vector-error-item"]').click();
  await expect(page).toHaveURL(/focus=search%3Avector_search_timeout/);

  await page.getByRole('button', { name: /^14 天$|^14 days$/ }).click();
  await expect(page).toHaveURL(/window=336/);
  await expect.poll(() => harness.urls().some((url) => url.includes('window_hours=336'))).toBe(true);
  await page.getByLabel(/Filter by site ID|按站点 ID 筛选/i).fill('site_mvp');
  await page.getByRole('button', { name: /^Apply$|^应用$/i }).click();
  await expect(page).toHaveURL(/site=site_mvp/);

  const advanced = page.locator('details').filter({ hasText: /Advanced index snapshots|高级索引快照/i });
  await expect(advanced).not.toHaveAttribute('open', '');

  harness.failNextRequest();
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.locator('[data-ui="vector-handling-guidance"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="vector-failure-guidance"]')).toContainText(/older failure records only|仅解释保留的旧失败记录/);
  await expect(page.getByText(/last successfully loaded vector snapshot|最近一次成功加载的向量观测快照/i)).toBeVisible();
  await expect(page.locator('[data-ui="vector-error-item"]')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('vector observability exits initial loading with a scoped retry', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/vector-observability?*', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('vector diagnostics unavailable')) });
  });
  await page.goto('/admin/vector-observability');

  await expect(page.getByRole('heading', { name: /Vector Observability|向量观测/i })).toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: /vector diagnostics unavailable|Failed to load vector diagnostics|加载向量诊断失败/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Retry$|^重试$/i })).toBeVisible();
});

test('vector errors lead the PC workspace while methods and distributions are available on demand', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installVectorHarness(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/vector-observability');
  const queue = page.locator('[data-ui="vector-error-workspace"]');
  await expect(queue).toBeVisible();
  await expect(page.locator('[data-ui="vector-observability-scope-row"]')).toContainText(/Health score: 71|健康分: 71/);
  await expect(page.locator('[data-ui="vector-signal-scope"]')).toContainText(/recovery is unverified|未核实当前恢复状态/);
  const method = page.locator('details').filter({ has: page.locator('summary', { hasText: /Health scoring method|健康评分口径/ }) });
  await expect(method).not.toHaveAttribute('open', '');
  const distributions = page.locator('[data-ui="vector-distributions"]');
  await expect(distributions).not.toHaveAttribute('open', '');
  const trend = page.getByRole('heading', { name: /Searches and no-hit|搜索与无命中/ });
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 1050 });
    await expect.poll(() => page.locator('[data-ui="vector-error-item"]').first().evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThan(1050);
    const positions = await page.evaluate(() => ({ queue: document.querySelector('[data-ui="vector-error-workspace"]')!.getBoundingClientRect().top, trend: Array.from(document.querySelectorAll('h3')).find(el => /Searches and no-hit|搜索与无命中/.test(el.textContent || ''))!.getBoundingClientRect().top, overflow: document.documentElement.scrollWidth > innerWidth }));
    expect(positions.queue).toBeLessThan(positions.trend);
    expect(positions.overflow).toBe(false);
    await page.screenshot({ path: `/tmp/admin-hierarchy-vector-${width}.png` });
  }
  await expect(trend).toBeVisible();
  await distributions.locator('summary').press('Enter');
  await expect(distributions.getByText('site_mvp', { exact: true })).toBeVisible();
  await method.locator('summary').press('Enter');
  await expect(method).toContainText(/Score deductions|评分依据/);
});


test('slow development guidance retains time and scoped diagnostic action on PC', async ({ page }) => {
  const harness = await installVectorHarness(page, {
    ...vectorData,
    window: { hours: 336, start_at: '2026-10-20T00:00:00Z', end_at: '2026-11-03T00:00:00Z' },
    totals: { ...vectorData.totals, index_failed_total: 0, search_failed_total: 0, p95_search_latency_ms: 5391, no_hit_rate: 0.12, last_search_finished_at: '2026-10-31T16:50:22Z' },
    errors: [],
    index_snapshots: [{ ...vectorData.index_snapshots[0], embedding_provider: 'ollama-m4-embedding', vector_backend: 'postgres_json' }],
  });
  await page.goto('/admin/vector-observability?window=336&site=site_mvp');
  const guidance = page.locator('[data-ui="vector-handling-guidance"]');
  await expect(guidance).toContainText(/Slow (?:development searches|searches in this period)|开发检索较慢|所选时段检索较慢/);
  await expect(guidance).toContainText(/does not establish (?:the current runtime|a model or vector database failure)|不代表当前运行配置|不能证明模型或向量数据库故障/);
  await expect(guidance).toContainText(/Last search|最近检索/);
  await expect(guidance.getByRole('link')).toHaveAttribute('href', '/admin/troubleshooting?window=336&site=site_mvp');
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 1050 });
    await expect(guidance.getByRole('link')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `/tmp/admin-vector-slow-${width}.png` });
  }
  await page.getByRole('button', { name: /Language|语言/ }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(guidance).toContainText(/Slow (?:development searches|searches in this period)/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '/tmp/admin-vector-slow-en-900.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: '/tmp/admin-vector-slow-dark-900.png' });
  harness.failNextRequest();
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.getByText(/last successfully loaded vector snapshot|最近一次成功加载的向量观测快照/i)).toBeVisible();
  await expect(guidance).toHaveCount(0);
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(guidance).toBeVisible();
  await guidance.getByRole('link').click();
  await expect(page).toHaveURL(/admin\/troubleshooting\?window=336&site=site_mvp/);
});

test('incomplete evidence and unknown errors retain uncertainty and a next step', async ({ page }) => {
  await installVectorHarness(page, {
    ...vectorData,
    totals: { ...vectorData.totals, index_failed_total: null, search_failed_total: null },
    errors: [],
  });
  await page.goto('/admin/vector-observability?window=336');
  await expect(page.locator('[data-ui="vector-handling-guidance"]')).toContainText(/does not mean zero failures|不能按零失败处理/);
  await expect(page.locator('[data-ui="vector-observability-metrics"]')).toContainText(/Counts unverified|计数未核实/);
  await expect(page.getByText(/No index or search failures in this period|所选时段没有索引或搜索失败/)).toHaveCount(0);
  await expect(page.locator('[data-ui="vector-handling-guidance"] a')).toHaveAttribute('href', '/admin/troubleshooting?window=336');
  await page.unroute('**/api/admin/vector-observability?*');
  await page.route('**/api/admin/vector-observability?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ ...vectorData, errors: [{ error_code: 'future_error', count: 1, last_seen_at: '2026-07-12T11:58:00Z' }] })) }));
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.locator('[data-ui="vector-failure-guidance"]')).toContainText(/does not establish the root cause|不足以确认根因/);
  await expect(page.locator('[data-ui="vector-failure-guidance"]')).toContainText(/run_id/);
});
