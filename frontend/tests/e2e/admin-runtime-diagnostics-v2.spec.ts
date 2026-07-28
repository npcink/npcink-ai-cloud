import { expect, test, type Locator } from '@playwright/test';
import { buildAdminApiErrorEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

async function countQualityTrendAccentPixels(panel: Locator): Promise<number> {
  return panel.locator('canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let accentPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      const pixelX = (index / 4) % canvas.width;
      const matchesAdoption = Math.abs(red - 5) < 24
        && Math.abs(green - 150) < 24
        && Math.abs(blue - 105) < 24;
      const matchesRepeat = Math.abs(red - 217) < 24
        && Math.abs(green - 119) < 24
        && Math.abs(blue - 6) < 24;
      if (
        pixelX > canvas.width * 0.65
        && alpha > 100
        && (matchesAdoption || matchesRepeat)
      ) {
        accentPixels += 1;
      }
    }
    return accentPixels;
  });
}

test('runtime diagnostics is telemetry-driven, URL-backed, and mobile safe', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installAdminMocks(page);
  const telemetryRequests: string[] = [];
  const qualityRequests: string[] = [];
  let failNextTelemetry = false;
  await page.route('**/api/admin/runtime-telemetry*', async (route) => {
    if (!failNextTelemetry) {
      await route.fallback();
      return;
    }
    failNextTelemetry = false;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary diagnostic failure')) });
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/admin/runtime-telemetry')) telemetryRequests.push(request.url());
    if (request.url().includes('/api/admin/editor-assist-quality')) qualityRequests.push(request.url());
  });

  await page.goto('/admin/troubleshooting');
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);
  await expect(page.locator('#runtime-diagnostic-inspector')).toContainText(/Provider call coverage gap|供应商调用遥测缺口/i);
  await expect(page.locator('#runtime-diagnostic-inspector a')).toHaveAttribute('href', '#runtime-evidence');
  await expect(page.locator('main input')).toHaveCount(0);
  const qualityPanel = page.locator('[data-ui="editor-assist-quality-panel"]');
  await expect(qualityPanel).toContainText(/Editor-assist quality|编辑辅助质量/i);
  await expect(qualityPanel).toContainText(/Exact adoption|精确采纳率/i);
  await expect(qualityPanel).toContainText(/Repeat pressure|重复生成偏高/i);
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);
  await qualityPanel.getByLabel(/Task|任务/i).selectOption('content_summary');
  await expect.poll(() => qualityRequests.some((url) => url.includes('task_key=content_summary'))).toBe(true);

  await page.getByRole('button', { name: '72h' }).click();
  await expect(page).toHaveURL(/window=72/);
  await expect.poll(() => telemetryRequests.some((url) => url.includes('recent_minutes=4320'))).toBe(true);
  await expect.poll(() => qualityRequests.some((url) => url.includes('window_hours=72'))).toBe(true);
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);

  await page.getByRole('button', { name: /Provider call coverage gap|供应商调用遥测缺口/i }).click();
  await expect(page).toHaveURL(/focus=hosted_model.provider_call_gap/);
  await expect(page.locator('#runtime-diagnostic-inspector')).toContainText(/Provider call coverage gap|供应商调用遥测缺口/i);
  await page.reload();
  await expect(page.getByRole('button', { name: /Provider call coverage gap|供应商调用遥测缺口/i })).toHaveAttribute('aria-pressed', 'true');

  const metadata = page.locator('#runtime-evidence');
  await expect(metadata).not.toHaveAttribute('open', '');
  await metadata.locator('summary').click();
  await expect(metadata.getByText(/Runtime resolution|运行时解析/i)).toBeVisible();
  await expect.poll(() => countQualityTrendAccentPixels(qualityPanel)).toBeGreaterThan(20);
  await testInfo.attach('p4-e03-editor-assist-quality', {
    body: await qualityPanel.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('p4-e03-admin-runtime-diagnostics', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  failNextTelemetry = true;
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.getByText(/last successfully loaded diagnostic snapshot|最近一次成功加载的诊断快照/i)).toBeVisible();
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('[data-ui="runtime-diagnostic-issue"]').first()).toBeVisible();
  await expect(qualityPanel).toBeVisible();
  await qualityPanel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -88));
  await testInfo.attach('p4-e03-editor-assist-quality-mobile', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('runtime diagnostics keeps narrow evidence lanes as secondary navigation', async ({ page }) => {
  await installAdminMocks(page);
  await page.goto('/admin/troubleshooting');

  const lanes = page.locator('#evidence-lanes');
  await expect(lanes.locator('a[href="/admin/plugin-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/media-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/vector-observability"]')).toBeVisible();
  await expect(lanes.locator('a[href="/admin/agent-feedback"]')).toBeVisible();
  await expect(page.getByText(/Groups|分组/)).toHaveCount(0);
});
