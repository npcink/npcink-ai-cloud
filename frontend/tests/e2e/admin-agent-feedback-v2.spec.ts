import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

const feedbackData = {
  artifact_type: 'agent_feedback_quality_summary',
  contract_version: 'v1',
  scope: 'all_sites',
  site_id: '',
  window_hours: 24,
  generated_at: '2026-07-12T12:00:00Z',
  window_start_at: '2026-07-11T12:00:00Z',
  last_event_at: '2026-07-12T11:58:00Z',
  events_total: 40,
  limited: false,
  max_events: 5000,
  outcomes: { accepted: 24, rejected: 16 },
  labels: { evidence_useful: 22, evidence_weak: 9, wrong_next_step: 5, too_generic: 4 },
  source_runtimes: { cloud_hosted: 40 },
  local_surfaces: { writing_support: 40 },
  scenarios: [{ local_surface: 'writing_support', source_runtime: 'cloud_hosted', events_total: 40, outcomes: { accepted: 24, rejected: 16 }, labels: { evidence_weak: 9, wrong_next_step: 5 }, accepted_rate: 0.6, evidence_weak_rate: 0.225, wrong_next_step_rate: 0.125 }],
  quality_trend: [{ bucket: '2026-07-12T11:00:00Z', events_total: 40, accepted: 24, rejected: 16, evidence_weak: 9, wrong_next_step: 5 }],
  low_quality_labels: [{ label: 'evidence_weak', count: 9 }, { label: 'wrong_next_step', count: 5 }],
  rejection_reasons: [{ label: 'too_generic', count: 4 }],
  rates: { accepted_rate: 0.6, evidence_useful_rate: 0.55, evidence_weak_rate: 0.225, wrong_next_step_rate: 0.125 },
  read_only: true,
  production_mutation: false,
  approval_truth: 'wordpress_local',
  preflight_truth: 'wordpress_local',
  final_write_truth: 'wordpress_local',
  boundary: { production_mutation: false, approval_truth: 'wordpress_local', preflight_truth: 'wordpress_local', final_write_truth: 'wordpress_local', control_plane: 'wordpress_local' },
};

async function installFeedbackHarness(page: Page) {
  await installAdminMocks(page);
  const urls: string[] = [];
  let failNext = false;
  await page.route('**/api/admin/agent-feedback?*', async (route) => {
    urls.push(route.request().url());
    if (failNext) {
      failNext = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary feedback telemetry failure')) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope(feedbackData)) });
  });
  return { urls: () => urls, failNextRequest: () => { failNext = true; } };
}

test('Agent feedback keeps scope and selected quality issue URL-backed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const harness = await installFeedbackHarness(page);
  await page.goto('/admin/agent-feedback');

  await expect(page.locator('[data-ui="feedback-quality-item"]')).toHaveCount(2);
  await expect(page.locator('#feedback-quality-inspector')).toContainText(/Evidence weak|证据偏弱/i);
  await page.locator('[data-ui="feedback-quality-item"]').nth(1).click();
  await expect(page).toHaveURL(/focus=wrong_next_step/);

  await page.getByRole('button', { name: '7d' }).click();
  await expect(page).toHaveURL(/window=168/);
  await expect.poll(() => harness.urls().some((url) => url.includes('window_hours=168'))).toBe(true);
  await page.getByLabel(/Filter by site ID|按站点 ID 筛选/i).fill('site_mvp');
  await page.getByRole('button', { name: /^Filter$|^筛选$/i }).click();
  await expect(page).toHaveURL(/site=site_mvp/);

  const advanced = page.locator('details').filter({ hasText: /Advanced contract and governance boundary|高级契约与治理边界/i });
  await expect(advanced).not.toHaveAttribute('open', '');

  harness.failNextRequest();
  await page.getByRole('button', { name: /^Refresh$|^刷新$/i }).click();
  await expect(page.getByText(/last successfully loaded feedback snapshot|最近一次成功加载的反馈观测快照/i)).toBeVisible();
  await expect(page.locator('[data-ui="feedback-quality-item"]')).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Agent feedback exits initial loading with a scoped retry', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/agent-feedback?*', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('feedback diagnostics unavailable')) });
  });
  await page.goto('/admin/agent-feedback');

  await expect(page.getByRole('heading', { name: /Agent Feedback Quality|Agent 反馈质量/i })).toBeVisible();
  await expect(page.locator('[role="alert"]').filter({ hasText: /feedback diagnostics unavailable|Failed to load Agent feedback diagnostics|加载 Agent 反馈诊断失败/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Retry$|^重试$/i })).toBeVisible();
});

test('feedback preserves absent focus and never shows another site snapshot after failure', async ({ page }) => {
  await installAdminMocks(page);
  await page.setViewportSize({ width: 900, height: 1050 });
  await page.route('**/api/admin/agent-feedback?*', async route => {
    const site = new URL(route.request().url()).searchParams.get('site_id');
    await route.fulfill(site ? { status: 503, json: buildAdminApiErrorEnvelope('site unavailable') }
      : { json: buildAdminApiEnvelope(feedbackData) });
  });
  await page.goto('/admin/agent-feedback?window=168&focus=missing-label');
  await expect(page.getByText(/selected label was not returned|当前范围未返回所选标签/)).toBeVisible();
  await expect(page.locator('[data-ui="feedback-quality-item"][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('60.0%');
  await page.getByLabel(/Filter by site ID|按站点 ID 筛选/).fill('another-site');
  await page.getByRole('button', { name: /^Filter$|^筛选$/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('60.0%');
  await expect(page.locator('[data-ui="feedback-quality-item"]')).toHaveCount(0);
  await expect(page.getByText(/last successfully loaded feedback snapshot|最近一次成功加载的反馈观测快照/)).toHaveCount(0);
});

test('feedback exposes all eligible trend buckets and recommendation save receipts on PC', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  await page.setViewportSize({ width: 900, height: 1050 });
  await page.route('**/api/admin/agent-feedback?*', async route => {
    const empty = new URL(route.request().url()).searchParams.get('window_hours') === '24';
    await route.fulfill({ json: buildAdminApiEnvelope({ ...feedbackData,
      events_total: empty ? 0 : 40, quality_events_total: empty ? 0 : 40,
      quality_trend: Array.from({ length: 10 }, (_, i) => ({ bucket: `2026-10-28T${String(i).padStart(2, '0')}:00:00Z`, events_total: 1, accepted: 1, rejected: 0, ignored: 0, expired: 0, blocked: 0 })),
      recommendation_quality: { minimum_sample_size: 20, internal_links: { events_total: 4, impression_sessions_total: 2, apply_total: 1, saved_sessions_total: 0, undo_total: 1, sample_status: 'insufficient' } },
    }) });
  });
  await page.goto('/admin/agent-feedback?window=168');
  const distributions = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /Feedback labels, sources and hourly distribution|反馈标签、来源与小时分布/ }) });
  await expect(distributions).not.toHaveAttribute('open', '');
  await distributions.locator('summary').press('Enter');
  await expect(page.getByText(/All 10 hourly buckets|展示全部 10 个/)).toBeVisible();
  const recommendations = page.locator('[data-ui="feedback-recommendation-quality"]');
  await expect(recommendations).toContainText('0 / 2');
  await expect(recommendations).toContainText(/Below 20|少于 20/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 1050 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
      await page.screenshot({ path: testInfo.outputPath(`feedback-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  }
  await page.getByRole('button', { name: '24h', exact: true }).click();
  await expect(page.getByText(/No feedback in this window|当前窗口没有反馈/, { exact: true })).toBeVisible();
  await page.goto('/admin/agent-feedback?window=24&focus=missing-label');
  await expect(page.getByText(/selected label was not returned|当前范围未返回所选标签/)).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('60.0%');
  await expect(page.getByRole('main')).toContainText('—');
});
