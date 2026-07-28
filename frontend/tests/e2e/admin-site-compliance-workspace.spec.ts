import { expect, test, type Page } from '@playwright/test';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

const initialPayload = {
  schema_version: 'site_compliance.v1',
  brand_name: 'Npcink AI',
  operator: {
    entity_name: 'Npcink AI Demo',
    entity_type: '企业',
    public_name: 'Npcink AI',
    registration_or_filing: '',
    service_region: '中国',
  },
  contact: {
    support_email: 'support@example.com',
    support_channel: '工单',
    service_hours: '工作日 09:00–18:00',
  },
  refund: {
    auto_renewal: false,
    refund_window_days: 14,
    processing_business_days: 5,
    refund_channel: '原支付渠道',
    request_path: '/support',
    conditions: '未消耗额度可申请退款。',
  },
  retention: [
    {
      record_id: 'runtime_results',
      label: '运行结果',
      public_description: '运行结果保留 30 天。',
      enforcement: 'scheduled_cleanup',
      confirmed: true,
      source: 'runtime',
    },
  ],
  third_parties: [
    {
      service_id: 'provider_primary',
      service_name: 'Model provider',
      operator_name: 'Provider Inc.',
      category: 'model',
      purpose: '生成内容',
      data_categories: '提示词',
      privacy_url: 'https://example.com/privacy',
      processing_region: '中国',
      disclosed: true,
    },
  ],
  review: {
    operator_confirmed: true,
    legal_review_status: 'reviewing',
    review_note: '等待最终复核。',
  },
};

function clonePayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildVersion(
  versionId: string,
  versionNumber: number,
  payload: typeof initialPayload,
  ready: boolean
) {
  return {
    version_id: versionId,
    version_number: versionNumber,
    updated_at: '2026-07-28T04:00:00Z',
    effective_at: versionNumber === 1 ? '2026-07-27T04:00:00Z' : undefined,
    payload: clonePayload(payload),
    validation: {
      ready_to_publish: ready,
      blockers: ready ? [] : [{ code: 'operator.registration_required', field: 'operator.registration_or_filing', message: '请确认备案号或登记信息。' }],
      warnings: ready ? [] : [{ code: 'review.pending', field: 'review.legal_review_status', message: '法律审核仍在进行。' }],
      checked_at: '2026-07-28T04:00:00Z',
    },
  };
}

async function installSiteComplianceHarness(page: Page) {
  await installAdminMocks(page);
  let payload = clonePayload(initialPayload);
  let draft = buildVersion('compliance_draft_v2', 2, payload, false);
  const published = buildVersion('compliance_v1', 1, payload, true);
  let putCount = 0;
  let publishCount = 0;
  let lastSavedPayload = clonePayload(payload);

  const buildWorkspace = () => ({
    draft,
    published,
    history: [published],
    third_party_candidates: [
      {
        service_id: 'provider_primary',
        service_name: 'Model provider',
        category: 'model',
        purpose: '生成内容',
        data_categories: '提示词',
        in_use: true,
        default_disclosed: true,
        source: 'runtime',
      },
    ],
    qq_review: {
      status: 'blocked',
      items: [
        { code: 'privacy_page', label: '隐私政策页面', ready: true, detail: '/privacy' },
        { code: 'legal_entity', label: '主体资料', ready: false, detail: '仍需在 QQ 互联控制台提交。' },
      ],
      manual_external_steps: ['提交主体资质。', '确认回调域名。'],
    },
  });

  await page.route('**/api/admin/site-compliance**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/admin/site-compliance/draft' && request.method() === 'PUT') {
      putCount += 1;
      const body = request.postDataJSON() as { payload: typeof initialPayload };
      payload = clonePayload(body.payload);
      lastSavedPayload = clonePayload(body.payload);
      draft = buildVersion('compliance_draft_v2', 2, payload, true);
    } else if (pathname === '/api/admin/site-compliance/publish' && request.method() === 'POST') {
      publishCount += 1;
    } else if (pathname !== '/api/admin/site-compliance' || request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope(buildWorkspace())),
    });
  });

  return {
    getPutCount: () => putCount,
    getPublishCount: () => publishCount,
    getLastSavedPayload: () => lastSavedPayload,
  };
}

test('site compliance keeps one active editor, preserves draft state, and separates save from publish', async ({ page }) => {
  const harness = await installSiteComplianceHarness(page);
  await page.goto('/admin/site-compliance');

  await expect(page.locator('[data-ui="site-compliance-directory"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /运营主体与联系方式|Operator and contact/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /退款说明|Refund disclosure/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /保存草稿|Save draft/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /发布到公开页面|Publish/i })).toHaveCount(0);

  await page.getByRole('button', { name: /发布检查|Publish checks/i }).click();
  await expect(page.locator('[data-ui="site-compliance-validation-table"]')).toContainText(/请确认备案号或登记信息|registration/i);
  await expect(page.locator('[data-ui="site-compliance-qq-review-table"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /发布到公开页面|Publish/i })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);

  await page.getByRole('button', { name: /退款说明|Refund disclosure/i }).click();
  const refundWindow = page.getByLabel(/退款申请窗口|Refund window/i);
  await refundWindow.fill('30');
  await expect(page.getByRole('button', { name: /保存草稿|Save draft/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /发布到公开页面|Publish/i })).toHaveCount(0);

  await page.getByRole('button', { name: /主体与联系方式|Operator and contact/i }).click();
  await expect(refundWindow).toHaveCount(0);
  await page.getByRole('button', { name: /退款说明|Refund disclosure/i }).click();
  await expect(page.getByLabel(/退款申请窗口|Refund window/i)).toHaveValue('30');

  await page.getByRole('button', { name: /保存草稿|Save draft/i }).click();
  await expect(page.getByText(/草稿已保存并重新检查|Draft saved and revalidated/i)).toBeVisible();
  await page.getByRole('button', { name: /发布检查|Publish checks/i }).click();
  await expect(page.getByRole('button', { name: /发布到公开页面|Publish/i })).toBeEnabled();
  expect(harness.getPutCount()).toBe(1);
  expect(harness.getPublishCount()).toBe(0);
  expect(harness.getLastSavedPayload().refund.refund_window_days).toBe(30);

  await page.getByRole('button', { name: /版本记录|Version history/i }).click();
  await expect(page.locator('[data-ui="site-compliance-version-table"]')).toContainText('v1');
});

test('site compliance section selector and tables remain mobile safe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installSiteComplianceHarness(page);
  await page.goto('/admin/site-compliance');

  await page.getByLabel(/当前设置区|Current section/i).selectOption('checks');
  await expect(page.locator('[data-ui="site-compliance-validation-table"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(await page.locator('[data-ui="site-compliance-active-panel"]').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(720);
});
