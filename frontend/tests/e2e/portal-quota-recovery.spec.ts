import { expect, test as base, type Page, type Route } from '@playwright/test';

// Read-only browser evidence for existing recovery destinations, not a purchase flow.
const site = {
  site_id: 'site_quota_recovery', name: 'Quota Recovery Site',
  site_url: 'https://quota.example.test', platform_kind: 'wordpress', status: 'active',
  allowed_actions: ['view_sites', 'view_usage', 'view_billing', 'view_audit'],
};
const startedAt = '2026-10-01T00:00:00Z';
const endsAt = '2026-11-01T00:00:00Z';
const diagnostic = 'INTERNAL_QUOTA_DIAGNOSTIC_DO_NOT_DISPLAY';
type Model = {
  credits: 'ok' | 'limited' | 'near_limit' | 'unlimited';
  free: boolean;
  resources: Array<{ key: string; used: number; limit: number; status: string; unlimited?: boolean }>;
  trial: 'active' | 'used';
  failQuota: boolean;
  holdQuota: Promise<void> | null;
  quotaReads: number;
};

function subscription(model: Model) {
  const tier = model.free ? 'free' : 'plus';
  return {
    subscription_id: `sub_${tier}`, plan_id: tier, plan_version_id: `${tier}_v1`,
    status: 'active', tier_id: tier, plan_kind: model.free ? 'free' : 'paid',
    package_kind: 'subscription', package_alias: model.free ? 'Free' : 'Plus',
    coverage_state: 'covered', current_period_start_at: startedAt, current_period_end_at: endsAt,
    scheduled_plan_id: '', scheduled_plan_version_id: '', scheduled_change_at: '',
  };
}

function entitlements(model: Model) {
  const remaining = model.credits === 'limited' || model.credits === 'unlimited'
    ? 0 : model.credits === 'near_limit' ? 7 : 2400;
  const limit = model.free ? 300 : 3000;
  return {
    current_subscription: subscription(model),
    period_start_at: startedAt, period_end_at: endsAt,
    quota_summary: {
      status: model.credits === 'limited' || model.resources.some((resource) => resource.status === 'limited') ? 'limited' : 'ok',
      period_start_at: startedAt, period_end_at: endsAt, generated_at: startedAt,
      ai_credits: {
        key: 'ai_credits', status: model.credits, used: limit - remaining,
        limit: model.credits === 'unlimited' ? 0 : limit,
        remaining, total_remaining: remaining, package_remaining: remaining,
        package_limit: limit, paid_remaining: 0, unlimited: model.credits === 'unlimited',
      },
      resource_limits: model.resources.map((resource) => ({
        ...resource, remaining: Math.max(0, resource.limit - resource.used),
        usage_ratio: resource.limit ? resource.used / resource.limit : 0,
      })),
    },
  };
}

async function ok(route: Route, data: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    status: 'ok', error_code: '', message: 'ok', data,
    meta: { trace_id: 'quota-recovery-fixture', revision: 'm6' },
  }) });
}

const test = base.extend<{ model: Model }>({
  model: async ({ page, context, baseURL }, runTest, testInfo) => {
    if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('A loopback runner is required');
    const origin = new URL(baseURL).origin;
    const unexpected: string[] = [];
    const pageErrors: string[] = [];
    const reads: string[] = [];
    const prefetched: string[] = [];
    const model: Model = {
      credits: 'ok', free: false, resources: [], trial: 'active',
      failQuota: false, holdQuota: null, quotaReads: 0,
    };
    page.on('pageerror', (error) => pageErrors.push(error.message));
    context.on('page', (popup) => {
      unexpected.push(`Unexpected popup: ${popup.url()}`);
      popup.on('pageerror', (error) => pageErrors.push(error.message));
    });
    await context.addCookies([{ name: 'npcink_portal_session_token', value: 'quota-recovery-fixture', url: baseURL }]);
    await context.addInitScript((siteId) => {
      localStorage.setItem('locale', 'zh-CN');
      // Exclude login telemetry from this read-only recovery slice.
      sessionStorage.setItem(`npcink.portal.journey.sent.v1:${siteId}:login:succeeded`, '1');
    }, site.site_id);
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const reject = async () => {
        unexpected.push(`${request.method()} ${url.origin}${url.pathname}${url.search}`);
        await route.abort('blockedbyclient');
      };
      // Includes order/trial/quota/notification writes and any WordPress/provider traffic.
      if (url.origin !== origin || request.method() !== 'GET') return reject();
      const path = url.pathname;
      if (path.startsWith('/api/portal/')) reads.push(`${path}${url.search}`);
      if (path === '/api/portal/session') return ok(route, {
        email: 'quota-recovery@example.test', sites: model.resources.some((resource) => resource.key === 'active_sites' && resource.used === 2)
          ? [site, { ...site, site_id: 'site_quota_second', name: 'Second Quota Site', site_url: 'https://second.example.test' }]
          : [site],
        selected_context: { site, allowed_actions: site.allowed_actions, current_subscription: subscription(model) },
        auth_mode: 'jwt',
        session: { state: 'active', transport: 'cookie', issued_at: startedAt, expires_at: '2099-11-01T00:00:00Z', revocable: true },
      });
      if (path === '/api/portal/notifications') return ok(route, {
        items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0, unread_only: false, fetched_at: startedAt,
      });
      if (path === '/api/portal/site-relink-policy') return ok(route, { cooldown_days: 7, cross_account_relink_enabled: false });
      if (path === '/api/portal/account/entitlements') {
        model.quotaReads += 1;
        if (model.holdQuota) await model.holdQuota;
        if (model.failQuota) return route.fulfill({
          status: 503, contentType: 'application/json', body: JSON.stringify({
            status: 'error', error_code: 'fixture.unknown_quota', message: diagnostic, data: null,
          }),
        });
        return ok(route, entitlements(model));
      }
      if (path === '/api/portal/account/credit-packs') return ok(route, { commercial_available: true, items: [] });
      if (path === '/api/portal/account/plan-offers') return ok(route, {
        commercial_available: true, items: [], comparison_tiers: [],
        trial: {
          state: model.trial, available: false, status: model.trial === 'active' ? 'active' : 'expired',
          reason_code: model.trial === 'active' ? 'trial_active' : 'trial_already_used',
          tier_id: 'plus', highest_tier_id: 'plus', allowed_tiers: model.trial === 'active' ? ['pro'] : [],
          trial_days: 14,
          trial_started_at: model.trial === 'active' ? '2026-10-23T00:00:00Z' : '2026-09-01T00:00:00Z',
          trial_ends_at: model.trial === 'active' ? '2026-11-06T00:00:00Z' : '2026-09-15T00:00:00Z',
        },
      });
      if (path === '/api/portal/account/payment-orders') return ok(route, {
        items: [], counts: { all: 0, pending: 0, paid: 0, closed: 0 },
        pagination: { limit: 10, offset: 0, total: 0, has_more: false },
      });
      if (path.startsWith('/api/') || path.startsWith('/portal/v1/')) return reject();
      const prefetchPaths = ['/portal', '/portal/login', '/portal/billing', '/portal/account', '/portal/support', '/portal/notifications', '/terms', '/privacy', `/portal/sites/${site.site_id}`, '/portal/sites/site_quota_second'];
      if (request.headers()['next-router-prefetch'] === '1' && prefetchPaths.includes(path)) {
        prefetched.push(`${path}${url.search}`);
        return route.fulfill({ status: 204, body: '' });
      }
      // Only actual home/billing navigation and local static assets reach Next.
      if (path === '/portal' || path === '/portal/billing' || path.startsWith('/_next/static/') || path === '/favicon.ico' || path === '/icon.svg') return route.continue();
      return reject();
    });
    try {
      await runTest(model);
      await page.waitForLoadState('networkidle');
    } finally {
      await testInfo.attach('quota-recovery-network', {
        body: JSON.stringify({ unexpected, pageErrors, reads, prefetched }, null, 2), contentType: 'application/json',
      });
      expect.soft(unexpected, 'All unexpected requests, writes and popups are forbidden').toEqual([]);
      expect.soft(pageErrors, 'Recovery must not crash the page').toEqual([]);
    }
  },
});
test.use({ serviceWorkers: 'block' });

async function home(page: Page) {
  await page.goto('/portal');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('[data-portal-home="sites-workspace"]')).toContainText(site.name);
}

async function packageDestination(page: Page) {
  const dialog = page.getByRole('dialog', { name: '选择套餐', exact: true });
  await expect(page).toHaveURL(/\/portal\/billing\?action=upgrade$/);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-portal-billing="entitlements"]')).toBeVisible();
  await expect(page.locator('#site-usage')).toContainText(site.name);
}

for (const free of [true, false]) {
  test(`zh-CN: server-limited ${free ? 'Free credits open usage' : 'paid credits open package review'} without writes`, async ({ page, model }) => {
    model.free = free;
    model.credits = 'limited';
    await home(page);
    const attention = page.locator('[data-portal-home="attention-focus"]');
    await expect(attention).toContainText('AI 积分需要处理');
    const action = attention.getByRole('link', { name: free ? '查看用量' : '查看套餐', exact: true });
    await expect(action).toHaveAttribute('href', free ? '/portal/billing#usage' : '/portal/billing?action=upgrade');
    if (free) await expect(attention).toContainText('本周期 Free 额度已用完');
    await action.click();
    if (free) {
      await expect(page).toHaveURL(/\/portal\/billing#usage$/);
      await expect(page.locator('#site-usage')).toBeInViewport();
      await expect(page.locator('#site-usage')).toContainText(site.name);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } else await packageDestination(page);
  });
}

for (const credits of ['near_limit', 'unlimited'] as const) {
  test(`zh-CN: server ${credits} credits do not invent an exhausted-credit recovery`, async ({ page, model }) => {
    model.credits = credits;
    if (credits === 'unlimited') model.resources = [
      { key: 'vector_documents', used: 150, limit: 0, status: 'ok', unlimited: true },
      { key: 'media_images', used: 150, limit: 0, status: 'ok', unlimited: true },
    ];
    await home(page);
    await expect.poll(() => model.quotaReads).toBe(1);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-portal-home="attention-focus"]')).toHaveCount(0);
    await expect(page.locator('[data-portal-sites="capacity-alerts"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '查看套餐', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-portal-home="operation-overview"]')).toContainText(credits === 'near_limit' ? '7' : '0');
  });
}

test('zh-CN: full text and over-capacity image knowledge recover to existing package review', async ({ page, model }) => {
  model.resources = [
    { key: 'vector_documents', used: 100, limit: 100, status: 'limited' },
    { key: 'media_images', used: 125, limit: 100, status: 'limited' },
  ];
  await home(page);
  const capacity = page.locator('[data-portal-sites="capacity-alerts"]');
  await expect(capacity).toContainText('文字知识库已使用 100 / 100');
  await expect(capacity).toContainText('图片知识库已使用 125 / 100');
  await expect(capacity).toContainText('已有内容仍可使用和更新');
  await expect(capacity).toContainText('已有图片仍可使用和更新');
  await expect(page.locator('[data-portal-home="attention-focus"]')).toHaveCount(0);
  await capacity.getByRole('link', { name: '查看套餐', exact: true }).click();
  await packageDestination(page);
  const attention = page.locator('[data-portal-billing="attention"]');
  await expect(attention).toContainText('100 / 100');
  await expect(attention).toContainText('125 / 100');
});

test('zh-CN: site capacity exceeded opens package review without changing site lifecycle', async ({ page, model }) => {
  model.resources = [{ key: 'active_sites', used: 2, limit: 1, status: 'limited' }];
  await home(page);
  const capacity = page.locator('[data-portal-sites="capacity-alerts"]');
  await expect(capacity).toContainText('活动站点容量已使用 2 / 1');
  await capacity.getByRole('link', { name: '查看套餐', exact: true }).click();
  await packageDestination(page);
  await expect(page.locator('[data-portal-billing="attention"]')).toContainText('2');
  await expect(page.locator('[data-portal-billing="attention"]')).toContainText('1');
});

test('zh-CN: unknown quota stays unavailable through Retry until fresh evidence arrives', async ({ page, model }) => {
  model.failQuota = true;
  await home(page);
  const attention = page.locator('[data-portal-home="attention-focus"]');
  await expect(attention).toContainText('套餐用量暂不可用');
  await expect(attention.getByRole('link')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(diagnostic);
  const retry = page.getByRole('button', { name: /暂不可用.*重新获取/ });
  await expect(retry).toBeVisible();
  expect(model.quotaReads).toBe(1);
  let release: () => void = () => {};
  model.holdQuota = new Promise<void>((resolve) => { release = resolve; });
  model.failQuota = false;
  try {
    await retry.click();
    await expect.poll(() => model.quotaReads).toBe(2);
    await expect(page.locator('[data-portal-home="operation-overview"]')).toContainText('正在获取额度');
    await expect(page.locator('[data-portal-home="operation-overview"]')).not.toContainText('2,400');
    release();
    await expect(page.locator('[data-portal-home="operation-overview"]')).toContainText('2,400');
    await expect(attention).toHaveCount(0);
    expect(model.quotaReads).toBe(2);
  } finally { release(); }
});

test('zh-CN: active and previously used trial descriptions do not claim a new expiry', async ({ page, model }) => {
  for (const state of ['active', 'used'] as const) {
    model.trial = state;
    // Full navigation resets client catalogs between independent server snapshots.
    await page.goto('/portal/billing?action=upgrade');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    const packages = page.getByRole('dialog', { name: '选择套餐', exact: true });
    await expect(packages).toBeVisible();
    await packages.getByRole('button', { name: '查看试用资格', exact: true }).click();
    const trial = page.getByRole('dialog', { name: '试用资格', exact: true });
    await expect(trial).toBeVisible();
    if (state === 'active') {
      await expect(trial).toContainText('Plus 试用中');
      await expect(trial).toContainText(/Plus 试用将于 .*2026.*11.*6.* 结束/);
      await expect(trial).toContainText('升级到更高套餐不会延长结束时间');
    } else {
      await expect(trial).toContainText('试用资格已使用');
      await expect(trial).toContainText('该账号已经使用过付费套餐试用');
      await expect(trial.getByRole('button', { name: /开始.*试用|将试用升级/ })).toHaveCount(0);
    }
    await expect(trial).not.toContainText(/刚刚.*[到过]期|今日.*[到过]期|试用已到期|试用已过期/);
    await trial.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(trial).toHaveCount(0);
  }
});
