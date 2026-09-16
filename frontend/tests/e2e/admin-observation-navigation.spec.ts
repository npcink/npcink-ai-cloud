import { expect, test } from '@playwright/test';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';
import { observeAdminBrowserEvidence, writeAdminVisualReceipt } from './helpers/admin-visual-receipt';

test('four observation views share time and site scope with one selected tab', async ({ page }, testInfo) => {
  const evidence = observeAdminBrowserEvidence(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/admin/')) requests.push(request.url()); });
  for (const path of ['media-observability', 'vector-observability']) {
    await page.route(`**/api/admin/${path}?*`, route => route.fulfill({ json: buildAdminApiEnvelope({ generated_at: '2026-09-16T02:00:00Z', totals: {}, window: { hours: Number(new URL(route.request().url()).searchParams.get('window_hours')) } }) }));
  }
  const tabs = page.locator('[data-ui="admin-observability-tabs"]');
  const period = page.getByRole('group', { name: /Observation period|观测时间范围/ });
  await page.goto('/admin/usage-statistics?view=quality&window=336&site=site-a');
  await expect(tabs.locator('[aria-current="page"]')).toHaveText(/Editorial quality evidence|编辑质量证据/);
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(period).toHaveCount(1);
  await expect(period.getByRole('button', { pressed: true })).toHaveText(/14/);
  await expect(page.locator('[data-ui="editor-assist-quality-panel"]')).toContainText('65');
  expect(requests.filter(url => /\/api\/admin\/(runtime-telemetry|plugin-observability)\?/.test(url))).toHaveLength(0);
  await expect.poll(() => requests.some(url => url.includes('editor-assist-quality?') && url.includes('window_hours=336') && url.includes('site_id=site-a'))).toBe(true);
  await page.waitForTimeout(1200); // Let the chart's initial animation settle before visual review.
  await page.screenshot({ path: testInfo.outputPath('quality-1440.png'), fullPage: true, animations: 'disabled' });

  for (const [label, path] of [[/Media observability|媒体观测/, 'media-observability'], [/Vector observability|向量观测/, 'vector-observability'], [/Usage statistics|使用统计/, 'usage-statistics']] as const) {
    await tabs.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${path}\\?window=336&site=site-a$`));
    await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(tabs.locator('[aria-current="page"]')).toHaveText(label);
    await expect(period.getByRole('button', { pressed: true })).toHaveText(/14/);
    if (path !== 'usage-statistics') await expect.poll(() => requests.some(url => url.includes(`/api/admin/${path}?`) && url.includes('window_hours=336') && url.includes('site_id=site-a'))).toBe(true);
  }
  await period.getByRole('button', { name: /^30 天$|^30 days$/ }).click();
  await expect(page).toHaveURL(/window=720&site=site-a/);
  await expect.poll(() => requests.some(url => url.includes('runtime-telemetry?') && url.includes('recent_minutes=43200') && url.includes('site_id=site-a'))).toBe(true);
  await expect.poll(() => requests.some(url => url.includes('plugin-observability?') && url.includes('window_hours=720') && url.includes('site_id=site-a'))).toBe(true);
  await page.reload();
  await expect(period.getByRole('button', { pressed: true })).toHaveText(/30/);
  await page.goBack();
  await expect(period.getByRole('button', { pressed: true })).toHaveText(/14/);
  await page.goForward();
  await expect(period.getByRole('button', { pressed: true })).toHaveText(/30/);

  await tabs.getByRole('link', { name: /Editorial quality evidence|编辑质量证据/ }).click();
  await expect(page.locator('[data-ui="editor-assist-quality-panel"]')).toContainText('65');
  await expect(tabs.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="usage-definitions"]')).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => page.locator('.echarts-for-react').evaluate(element => Math.abs(element.clientWidth - (element.querySelector('canvas')?.clientWidth || 0)))) .toBeLessThan(2);
  await page.waitForTimeout(1200); // ECharts resize and animation are asynchronous.
  await page.screenshot({ path: testInfo.outputPath('quality-1920.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.admin-shell-content').evaluate(element => getComputedStyle(element).paddingLeft)).toBe('0px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('quality-narrow.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.route('**/api/admin/editor-assist-quality?*', route => route.fulfill({ status: 503, json: {} }));
  await page.getByRole('button', { name: /^刷新$|^Refresh$/ }).click();
  await expect(page.locator('[data-ui="editor-assist-quality-panel"] [role="alert"]')).toHaveText(/Failed to load editor-assist quality|加载编辑辅助质量数据失败/);
  await expect(period.getByRole('button', { pressed: true })).toHaveText(/30/);
  await expect(page.locator('[data-ui="editor-assist-quality-export"]')).toBeDisabled();
  await expect(page.locator('[data-ui="editor-assist-quality-panel"] dd')).toHaveText(['—', '—', '—', '—']);
  await expect(page.locator('[data-ui="editor-assist-quality-candidate-table"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('quality-error-1440.png'), fullPage: true });
  await writeAdminVisualReceipt({ page, testInfo, route: '/admin/usage-statistics', pageModel: 'diagnostic', testedStates: ['ready', 'filtered', 'partial_error'], pageTitle: page.getByRole('heading', { name: /Editorial quality evidence|编辑质量证据/, exact: true }), workingSurface: page.locator('[data-ui="editor-assist-quality-panel"]'), browserEvidence: evidence, dataMode: 'mocked', humanAcceptance: 'pending', expectedConsoleErrors: [/503/], routeRuleResults: [
    { id: 'single-primary-action', status: 'not_applicable', evidence: 'read-only observation views' },
    { id: 'textual-status', status: 'pass', evidence: 'quality sample stage and explicit fetch failure' },
    { id: 'action-object-proximity', status: 'pass', evidence: 'shared period above active evidence' },
    { id: 'distinct-interaction-states', status: 'pass', evidence: 'one current navigation link and one pressed period' },
    { id: 'dialog-focus-recovery', status: 'not_applicable', evidence: 'no dialog' },
    { id: 'context-stability', status: 'pass', evidence: 'period/site survive tab switch, reload and history; failed export disabled' },
  ], interactionResults: [{ id: 'shared-scope', status: 'pass', evidence: 'four views, 14/30 day queries, site filters and history verified' }] });
});
