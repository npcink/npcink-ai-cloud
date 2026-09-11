import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

import { observeAdminBrowserEvidence, writeAdminVisualReceipt } from './helpers/admin-visual-receipt';

const pluginObservabilityData = {
  generated_at: '2026-07-12T12:00:00Z',
  totals: {
    events_total: 40,
    ok_total: 36,
    error_total: 4,
    success_rate: 0.9,
    avg_latency_ms: 640,
    active_site_count: 2,
    active_plugin_count: 3,
    last_seen_at: '2026-07-12T11:58:00Z',
  },
  health: { status: 'warning', score: 72, summary: 'Plugin telemetry needs review.', reasons: ['error_rate'] },
  attention: [
    {
      attention_key: 'attention-plugin-errors',
      severity: 'warning',
      code: 'plugin_observability.error_rate_elevated',
      title: 'Elevated plugin error rate',
      detail: 'Plugin errors require review.',
      suggested_action: 'Review the linked metadata and local plugin logs.',
      workflow_status: 'active',
      site_id: 'site_mvp',
      plugin_slug: 'npcink-cloud-addon',
      event_kind: 'runtime_request',
      error_code: 'provider_timeout',
      state: null,
    },
  ],
  attention_workflow: { active: 1, acknowledged: 0, muted: 0, resolved: 0, total: 1, needs_attention: 1 },
  digest: { period_label: 'daily', window_hours: 24, headline: '', bullets: [], top_plugin_slug: 'npcink-cloud-addon', top_error_code: 'provider_timeout' },
  plugins: [
    { plugin_slug: 'npcink-cloud-addon', events_total: 24, ok_total: 20, error_total: 4, success_rate: 0.8333, avg_latency_ms: 710, last_seen_at: '2026-07-12T11:58:00Z', event_kinds: [{ event_kind: 'runtime_request', events_total: 24, error_total: 4, success_rate: 0.8333, avg_latency_ms: 710, last_seen_at: '2026-07-12T11:58:00Z' }] },
  ],
  sites: [
    { site_id: 'site_mvp', events_total: 24, error_total: 4, ok_total: 20, success_rate: 0.8333, avg_latency_ms: 710, plugin_count: 1, last_seen_at: '2026-07-12T11:58:00Z', health: { status: 'warning', score: 70, summary: 'Errors need review.', reasons: ['error_rate'] } },
  ],
  timeline: [
    { bucket_start_at: '2026-07-12T10:00:00Z', bucket_end_at: '2026-07-12T11:00:00Z', bucket_hours: 1, events_total: 18, ok_total: 16, error_total: 2, success_rate: 0.8889, avg_latency_ms: 620 },
    { bucket_start_at: '2026-07-12T11:00:00Z', bucket_end_at: '2026-07-12T12:00:00Z', bucket_hours: 1, events_total: 22, ok_total: 20, error_total: 2, success_rate: 0.9091, avg_latency_ms: 660 },
  ],
  errors: [{ site_id: 'site_mvp', plugin_slug: 'npcink-cloud-addon', event_kind: 'runtime_request', error_code: 'provider_timeout', count: 4, last_seen_at: '2026-07-12T11:58:00Z' }],
  recent_errors: [{ site_id: 'site_mvp', plugin_slug: 'npcink-cloud-addon', event_kind: 'runtime_request', error_code: 'provider_timeout', status: 'error', ability_id: 'content_summary', proposal_id: '', route: '/v1/runtime/run', received_at: '2026-07-12T11:58:00Z' }],
  window: { hours: 24, start_at: '2026-07-11T12:00:00Z', end_at: '2026-07-12T12:00:00Z' },
};

async function installPluginObservabilityHarness(page: Page, responseData: typeof pluginObservabilityData & { recent_activity?: Record<string, unknown>[] } = pluginObservabilityData) {
  await installAdminMocks(page);
  let statePostCount = 0;
  const getUrls: string[] = [];
  let failNextGet = false;
  await page.route('**/api/admin/plugin-observability/attention-state', async (route) => {
    statePostCount += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ updated: true })) });
  });
  await page.route('**/api/admin/plugin-observability?*', async (route) => {
    getUrls.push(route.request().url());
    if (failNextGet) {
      failNextGet = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(buildAdminApiErrorEnvelope('temporary plugin telemetry failure')) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope(responseData)) });
  });
  return {
    getStatePostCount: () => statePostCount,
    getUrls: () => getUrls,
    failNextRequest: () => { failNextGet = true; },
  };
}

test('administrator investigates errors and sites, preserves filters and manages alerts on demand', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  const harness = await installPluginObservabilityHarness(page);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/plugin-observability');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-ui="plugin-problems"]')).toContainText(/Model service timed out|模型服务响应超时/);
  await expect(page.locator('[data-ui="plugin-sites"]')).toContainText('site_mvp');
  await page.locator('[data-ui="plugin-problems"]').getByRole('button', {name: /Inspect|排查/}).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText(/not the complete history|并非完整运行历史/);
  await drawer.getByText(/Original identifiers and fields|原始编号与字段/).first().click();
  await expect(drawer).toContainText('provider_timeout');
  await drawer.getByRole('button', {name: /View site records|查看本站记录/}).click();
  await expect(drawer).toContainText(/24 reported records|24 条上报记录/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-ui="plugin-problems"]').getByRole('button')).toBeFocused();
  await page.getByRole('button', {name: /Last 3 days|近 3 天/}).click();
  await expect(page).toHaveURL(/window=72/);
  await page.getByRole('combobox', {name: /^Plugin$|^插件$/}).selectOption('npcink-cloud-addon');
  await expect(page).toHaveURL(/plugin=npcink-cloud-addon/);
  await page.getByRole('combobox', {name: /Filter by site|按站点筛选/}).fill('site_mvp');
  await page.getByRole('button', {name: /^Apply$|^应用$/}).click();
  await expect.poll(() => harness.getUrls().some(url => url.includes('site_id=site_mvp') && url.includes('window_hours=72'))).toBe(true);
  await page.getByRole('button', {name: /Alerts and more records|提醒与更多记录/}).click();
  await page.locator('[data-ui="plugin-attention-item"]').click();
  await expect(page).toHaveURL(/focus=attention-plugin-errors/);
  await page.locator('#plugin-attention-inspector').getByRole('button', {name:/Acknowledge|确认/}).click();
  await expect.poll(() => harness.getStatePostCount()).toBe(1);
  await page.keyboard.press('Escape');
  harness.failNextRequest();
  await page.getByRole('button', {name:/^Refresh$|^刷新$/}).click();
  await expect(page.getByRole('alert').filter({hasText:'temporary plugin telemetry failure'})).toBeVisible();
  await expect(page.locator('[data-ui="plugin-problems"]')).toContainText(/Model service timed out|模型服务响应超时/);
  await page.getByRole('button', {name:/^Refresh$|^刷新$/}).click();
  await expect(page.getByRole('alert').filter({hasText:'temporary plugin telemetry failure'})).toHaveCount(0);
  await writeAdminVisualReceipt({page,testInfo,route:'/admin/plugin-observability',pageModel:'diagnostic',testedStates:['ready','selected','partial_error','disclosure'],humanAcceptance:'pending',dataMode:'mocked',pageTitle:page.getByRole('heading',{name:/^Plugin Observability$|^插件观测$/}),workingSurface:page.locator('[data-ui="plugin-problems"]'),browserEvidence,expectedConsoleErrors:[/^Failed to load resource: the server responded with a status of 503/],routeRuleResults:[{id:'single-primary-action',status:'pass',evidence:'Only resolve is primary inside the selected alert.'},{id:'action-object-proximity',status:'pass',evidence:'Inspect and site records actions are in their rows.'},{id:'distinct-interaction-states',status:'pass',evidence:'Filters expose selected state and alert actions disable while loading.'},{id:'context-stability',status:'pass',evidence:'Refresh failure retains scope data with an error notice.'},{id:'dialog-focus-recovery',status:'pass',evidence:'Escape closes shared inspector and restores the problem trigger.'},{id:'textual-status',status:'pass',evidence:'Error causes and evidence limits are stated in text.'}],interactionResults:[{id:'scope-and-investigation',status:'pass',evidence:'URL filters, issue-to-site records and alert state update exercised.'}]});
});

test('plugin workspace is mobile safe and errors stay inspectable', async ({page}) => {
  await installPluginObservabilityHarness(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/plugin-observability');
  await expect(page.locator('[data-ui="plugin-problems"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('[data-ui="plugin-problems"]').getByRole('button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('zero records keep monitoring alerts accessible and never claim health', async ({page}) => {
  await installPluginObservabilityHarness(page, {...pluginObservabilityData, totals:{...pluginObservabilityData.totals,events_total:0,error_total:0},plugins:[],sites:[],timeline:[],errors:[],recent_errors:[]});
  await page.goto('/admin/plugin-observability');
  await expect(page.getByText(/No records received in this scope|当前范围没有收到记录/)).toBeVisible();
  await page.getByRole('button', {name:/Alerts and more records|提醒与更多记录/}).click();
  await expect(page.locator('[data-ui="plugin-attention-item"]')).toHaveCount(1);
});

test('unknown codes remain inspectable without untranslated homepage labels', async ({page}) => {
  await installPluginObservabilityHarness(page, {...pluginObservabilityData, errors:[{...pluginObservabilityData.errors[0],error_code:'new_vendor_failure',event_kind:'new.event'}],recent_errors:[]});
  await page.goto('/admin/plugin-observability');
  await expect(page.locator('[data-ui="plugin-problems"]')).toContainText(/Runtime error|运行出现错误/);
  await expect(page.locator('[data-ui="plugin-problems"]')).not.toContainText('new_vendor_failure');
  await page.locator('[data-ui="plugin-problems"]').getByRole('button').click();
  await page.getByRole('dialog').getByText(/Original identifiers and fields|原始编号与字段/).click();
  await expect(page.getByRole('dialog')).toContainText('new_vendor_failure');
});

test('failed scope change clears obsolete data and retry loads requested scope', async ({page}) => {
  const harness = await installPluginObservabilityHarness(page);
  await page.goto('/admin/plugin-observability');
  await expect(page.locator('[data-ui="plugin-problems"]')).toBeVisible();
  harness.failNextRequest();
  await page.getByRole('button', {name:/Last 7 days|近 7 天/}).click();
  await expect(page).toHaveURL(/window=168/);
  await expect(page.getByRole('alert').filter({hasText:'temporary plugin telemetry failure'})).toBeVisible();
  await expect(page.locator('[data-ui="plugin-problems"]')).toHaveCount(0);
  await page.getByRole('button', {name:/^Refresh$|^刷新$/}).click();
  await expect(page.locator('[data-ui="plugin-problems"]')).toBeVisible();
});

test('Chinese labels explain known events and retain original identifiers', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('locale','zh-CN'));
  await installPluginObservabilityHarness(page, {...pluginObservabilityData, errors:[{...pluginObservabilityData.errors[0],error_code:'runtimecanceled',event_kind:'addon.media_recognition.failed'}],recent_errors:[]});
  await page.goto('/admin/plugin-observability?window=168');
  await expect(page.getByRole('heading',{name:'插件观测',exact:true})).toBeVisible();
  await expect(page.locator('[data-ui="plugin-problems"]')).toContainText('运行被取消');
  await expect(page.locator('[data-ui="plugin-problems"]')).toContainText('媒体识别失败');
  await expect(page.locator('[data-ui="plugin-problems"]')).toContainText('云端增强插件');
});

test('successful report exposes linked execution separately from receipt time', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installPluginObservabilityHarness(page, { ...pluginObservabilityData,
    recent_activity: [{ event_id: 'evt-linked', site_id: 'site_mvp',
      plugin_slug: 'npcink-cloud-addon', event_kind: 'addon.editor_assist.generation.completed',
      status: 'ok', received_at: '2026-07-12T08:42:53Z',
      run: { run_id: 'run-linked', status: 'succeeded', started_at: '2026-07-12T08:10:06Z',
        finished_at: '2026-07-12T08:10:22Z', error_code: '' } }],
  });
  await page.goto('/admin/plugin-observability');
  const activity = page.locator('[data-ui="plugin-recent-activity"]');
  await expect(activity).toContainText(/Succeeded|成功/);
  await expect(activity.getByText('run-linked', { exact: true })).not.toBeVisible();
  await activity.getByText(/View linked run|查看对应运行/).click();
  await expect(activity.getByText('run-linked', { exact: true })).toBeVisible();
  await expect(activity).toContainText(/Execution started|实际开始/);
  await expect(activity).toContainText(/Report received|收到上报/);
  await page.screenshot({ path: '/tmp/plugin-linked-run-preview.png', fullPage: true });
});
