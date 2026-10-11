import { expect, test } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  installAdminMocks,
} from './helpers/admin-operator-fixture';

const advisorBranch = {
  generation: { mode: 'rule', cache_status: 'miss' },
  scope: 'operations_analysis',
  headline: 'Provider reliability needs review',
  operator_summary: 'Provider errors or fallback pressure are present in recent traffic.',
  operator_next_step: 'inspect_provider_errors_latency_and_fallbacks',
  severity: 'warning',
  status: 'attention',
  source_context: {
    advisor: {
      scope: 'operations_analysis',
      status: 'attention',
      severity: 'warning',
      summary: 'Provider errors or fallback pressure are present in recent traffic.',
      confidence: 'high',
      evidence: [
        { kind: 'admin_overview', ref: '/internal/service/admin/overview', label: 'commercial coverage and usage summary' },
        { kind: 'runtime_diagnostics', ref: '/internal/service/runtime/diagnostics/summary', label: 'runtime queue, callback, and guard summary' },
        { kind: 'site_knowledge_observability', ref: '/internal/service/site-knowledge/observability/summary', label: 'knowledge search and index health summary' },
        { kind: 'provider_call_records', ref: 'provider_call_records', label: 'provider call metrics aggregated from run telemetry' },
      ],
      recommended_actions: [
        { action: 'inspect_provider_errors_latency_and_fallbacks', requires_operator: true },
      ],
      signals: [
        { code: 'ops.runtime_quality', total_runs: 370, failed_runs: 43, run_failure_rate: 0.116, guard_events: 2 },
        { code: 'ops.provider_quality', provider_calls: 460, provider_errors: 83, provider_error_rate: 0.18 },
        { code: 'ops.knowledge_quality', knowledge_searches: 23, knowledge_no_hits: 0, knowledge_no_hit_rate: 0 },
        { code: 'ops.usage_cost', usage_events: 2829, provider_cost: 0 },
      ],
      drilldown: {},
    },
  },
};

async function installAdvisorMocks(page: Parameters<typeof installAdminMocks>[0]) {
  const requestedPaths: string[] = [];
  await installAdminMocks(page);
  await page.route('**/api/admin/advisor/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    requestedPaths.push(pathname);
    const data = pathname.endsWith('/ops-summary-preview')
      ? {
          preview_version: 'v1',
          baseline: advisorBranch,
          ai: advisorBranch,
          comparison: { baseline_mode: 'rule', ai_mode: 'rule', ai_used: false, ai_called: false, cache_hit: false, tokens_in: 0, tokens_out: 0, request_cost: 0 },
          safety: { wordpress_write_allowed: false, requires_operator_review: true },
        }
      : pathname.endsWith('/ops-summary-value')
        ? { window: { days: 7 }, totals: {}, rates: {}, value_signal: {}, recent_events: [] }
        : { items: [] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope(data)),
    });
  });
  return requestedPaths;
}

test('Operations Advisor keeps the current PC diagnosis primary and technical AI metrics advanced', async ({ page }, testInfo) => {
  const requestedPaths = await installAdvisorMocks(page);
  await page.goto('/admin/ai-advisor');

  const diagnosis = page.locator('[data-ui="advisor-current-diagnosis"]');
  await expect(diagnosis.getByRole('heading', { name: /提供方可靠性需要检查|Provider reliability needs review/i })).toBeVisible();
  await expect(diagnosis.getByText(/近期流量中存在提供方错误或回退压力|Provider errors or fallback pressure/i)).toBeVisible();
  await expect(diagnosis.getByText(/商业覆盖与用量摘要|Commercial coverage and usage summary/i)).toBeVisible();
  await expect(diagnosis.getByText(/运行队列、回调与防护摘要|Runtime queue, callback, and guard summary/i)).toBeVisible();

  const advanced = page.locator('details').filter({ hasText: /高级评估参数|Advanced evaluation parameters/i });
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(advanced.getByText(/^AI 参与$|^AI participation$/i).first()).toBeHidden();
  await expect(advanced.getByText(/^请求成本$|^Request cost$/i).first()).toBeHidden();
  await expect(page.getByRole('button', { name: /运行诊断|Run diagnosis/i })).toBeVisible();

  expect(requestedPaths).toEqual(['/api/admin/advisor/ops-summary-preview']);

  const evaluationDetails = page.locator('details').filter({
    hasText: /AI evaluation details|AI 评估详情/i,
  });
  await evaluationDetails.locator('summary').click();
  await expect.poll(() => requestedPaths.sort()).toEqual([
    '/api/admin/advisor/ops-summary-history',
    '/api/admin/advisor/ops-summary-preview',
    '/api/admin/advisor/ops-summary-value',
  ]);
  await testInfo.attach('p4-e03-admin-advisor-readonly', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('advisor scope metrics, site deep links and evidence destinations survive reload', async ({ page }, testInfo) => {
  await installAdminMocks(page);
  // The destination snapshot must agree with the Advisor's three failed runs.
  // The general fixture is healthy and would correctly fall back to its first issue.
  await page.route('**/api/admin/runtime-telemetry?*', route => route.fulfill({ json: buildAdminApiEnvelope({
    generated_at: '2026-04-08T10:00:00Z',
    totals: { runs: 20, provider_calls: 20, usage_meter_events: 20, provider_call_run_coverage_rate: 1, metered_run_coverage_rate: 1 },
    usage_statistics: { runs: 20, succeeded: 17, failed: 3, timeline: [] },
    capability_groups: [{ group_id: 'text', runs_total: 20, failed: 3 }],
    alert_summary: { status: 'warning', alerts: [{
      code: 'hosted_model.failed_runs', severity: 'warning', count: 3, capabilities: ['text'],
    }] },
  }) }));
  const requests: string[] = [];
  const cases = {
    operations: { scope: 'operations_analysis', headline: 'Runtime failures need operations review', summary: 'Recent run failures are visible in the selected operations window.', signals: [{ code: 'ops.runtime_quality', failed_runs: 3, total_runs: 20 }], action: 'inspect_failed_runs_by_site_and_ability', label: /^失败运行$|^Failed runs$/i, value: '3' },
    runtime: { scope: 'runtime_operations', headline: 'Runtime queue needs operator review', summary: 'Queued or backlogged runs are present in the selected window.', signals: [{ code: 'runtime.queue_pressure', queued_runs: 4 }], action: 'inspect_runtime_queue_and_worker', label: /排队运行数|Queued runs/i, value: '4' },
    commercial: { scope: 'commercial_operations', headline: 'Subscriptions are expiring soon', summary: 'One or more active subscriptions expire within 7 days.', signals: [{ code: 'commercial.subscription_expiring_soon', within_7_days: 2 }], action: 'review_expiring_subscription_coverage', label: /7 天内到期订阅|Expiring within 7 days/i, value: '2' },
    routing: { scope: 'routing_operations', headline: 'Routing profile candidates are available', summary: 'Provider usage evidence maps to one or more hosted routing profiles.', signals: [{ code: 'routing.profile_candidates', recommended_profile_ids: ['profile-a', 'profile-b'] }], action: 'review_hosted_routing_profile_candidates', label: /配置候选数|Profile candidates/i, value: '2' },
  };
  await page.route('**/api/admin/advisor/ops-summary-preview?*', route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(route.request().url());
    const selected = cases[(params.get('scope') || 'operations') as keyof typeof cases];
    const branch = { ...advisorBranch, scope: selected.scope, headline: selected.headline, source_context: { advisor: { ...advisorBranch.source_context.advisor, scope: selected.scope, summary: selected.summary, signals: selected.signals, recommended_actions: [{ action: selected.action, requires_operator: true }] } } };
    return route.fulfill({ json: buildAdminApiEnvelope({ baseline: branch, ai: branch, comparison: { ai_used: false, ai_called: false } }) });
  });
  for (const [scope, selected] of Object.entries(cases)) {
    await page.goto(`/admin/ai-advisor?scope=${scope}&site=site_mvp`);
    const diagnosis = page.locator('[data-ui="advisor-current-diagnosis"]');
    await expect(diagnosis).toBeVisible();
    await expect(diagnosis.getByText(selected.label, { exact: true })).toBeVisible();
    await expect(diagnosis).toContainText(selected.value);
    if (scope === 'routing') {
      const value = diagnosis.getByText(selected.label, { exact: true }).locator('..').locator('..').getByText('2', { exact: true });
      await expect(value).not.toHaveClass(/text-amber/);
    }
    await expect(diagnosis).toContainText(/此摘要未提供|Not provided/);
    await expect(page.getByRole('textbox', { name: /^站点 ID$|^Site ID$/i })).toHaveValue('site_mvp');
    await expect.poll(() => requests.some(url => url.includes(`scope=${scope}`) && url.includes('site_id=site_mvp'))).toBe(true);
    const evidence = diagnosis.getByRole('link', { name: /打开证据|Open evidence/i }).first();
    if (scope === 'operations') {
      await expect(evidence).toHaveAttribute('href', '/admin/troubleshooting?focus=hosted_model.failed_runs&window=336&site=site_mvp');
      await evidence.click();
      await expect(page).toHaveURL(/troubleshooting\?focus=hosted_model.failed_runs&window=336&site=site_mvp/);
      await expect(page.locator('[data-ui="runtime-inspector-header"]')).toContainText(/运行任务失败|Run failures/i);
      await page.goBack();
      await expect(page).toHaveURL(/ai-advisor\?scope=operations&site=site_mvp/);
    }
    if (scope === 'runtime') {
      await expect(evidence).toHaveAttribute('href', '/admin#runtime-attention');
      await evidence.click();
      await expect(page.locator('details').filter({ has: page.locator('#runtime-attention') })).toHaveAttribute('open', '');
      await page.goBack();
    }
    if (scope === 'commercial') await expect(page.getByText(/商业摘要覆盖整个平台|Commercial summaries cover/)).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-ui="ai-advisor-scope-workbench"] button[aria-pressed="true"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`advisor-${scope}-1440.png`), fullPage: true });
  }
  const historyLength = await page.evaluate(() => window.history.length);
  await page.locator('[data-ui="ai-advisor-scope-workbench"]').getByRole('button', { name: /^商业状态$|^Commercial$/ }).click();
  await expect(page).toHaveURL(/scope=commercial&site=site_mvp/);
  await expect(page.locator('[data-ui="advisor-current-diagnosis"]')).toContainText('2');
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  await expect(page.getByRole('textbox', { name: /^站点 ID$|^Site ID$/i })).toHaveValue('site_mvp');
  expect(requests.some(url => url.includes('provider_id=') || url.includes('model_id='))).toBe(false);
});
