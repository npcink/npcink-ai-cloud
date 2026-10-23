import { expect, test, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

const diagnostic = 'INTERNAL_UPSTREAM_DIAGNOSTIC_DO_NOT_DISPLAY';
const ticketTitle = 'Support recovery fixture';
const site = {
  site_id: 'site_support_recovery',
  name: 'Recovery Site',
  site_url: 'https://recovery.example.test',
  platform_kind: 'wordpress',
  status: 'active',
  allowed_actions: ['view_sites', 'view_usage'],
};

async function ok(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok', error_code: '', message: 'ok', data,
      meta: { trace_id: 'support-recovery-fixture', revision: 'm6' },
    }),
  });
}

// Status-only 503 deliberately makes no claim about a support-specific busy code.
const failures = [
  { name: '502 HTML', status: 502, contentType: 'text/html', body: `<h1>Bad Gateway</h1><p>${diagnostic}</p>` },
  { name: '502 malformed JSON', status: 502, contentType: 'application/json', body: `{"message":"${diagnostic}"` },
  { name: '503 unavailable', status: 503, contentType: 'text/plain', body: `Service Unavailable: ${diagnostic}` },
] as const;

const locales = [
  { locale: 'en', title: 'Tickets', open: 'Open', error: 'Failed to load data.', retry: 'Retry' },
  { locale: 'zh-CN', title: '工单', open: '待处理', error: '加载数据失败。', retry: '重试' },
] as const;

for (const copy of locales) {
  for (const failure of failures) {
    test(`${copy.locale}: support ${failure.name} retains context and recovers on Retry`, async ({ page, context, baseURL }, testInfo) => {
      if (!baseURL) throw new Error('A loopback baseURL is required');
      const origin = new URL(baseURL);
      expect(origin.hostname).toBe('127.0.0.1');
      const unexpected: string[] = [];
      const pageErrors: string[] = [];
      const filteredRequests: string[] = [];
      const prefetched: string[] = [];
      let recovering = false;
      let releaseRecovery: () => void = () => {};
      const recoveryGate = new Promise<void>((resolve) => { releaseRecovery = resolve; });
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await context.addCookies([{ name: 'npcink_portal_session_token', value: 'support-recovery-fixture', url: baseURL }]);
      await context.addInitScript(({ locale, siteId }) => {
        localStorage.setItem('locale', locale);
        // Login telemetry is outside this read-only list slice; mark it already sent.
        sessionStorage.setItem(`npcink.portal.journey.sent.v1:${siteId}:login:succeeded`, '1');
      }, { locale: copy.locale, siteId: site.site_id });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const reject = async () => {
          unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
          await route.abort('blockedbyclient');
        };
        if (url.origin !== origin.origin || request.method() !== 'GET') return reject();
        if (url.pathname === '/api/portal/session') {
          return ok(route, {
            email: 'support-recovery@example.test', sites: [site],
            selected_context: { site, allowed_actions: site.allowed_actions, current_subscription: null },
            auth_mode: 'jwt',
            session: { state: 'active', transport: 'cookie', issued_at: '2026-10-23T00:00:00Z', expires_at: '2099-10-23T00:00:00Z', revocable: true },
          });
        }
        if (url.pathname === '/api/portal/notifications') {
          return ok(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0, unread_only: false, fetched_at: '2026-10-23T00:00:00Z' });
        }
        if (url.pathname === '/api/portal/support-requests') {
          if (url.searchParams.get('status') === 'open') {
            filteredRequests.push(url.search);
            if (!recovering) return route.fulfill(failure);
            await recoveryGate;
          }
          return ok(route, {
            summary: { open: 1, in_progress: 0, resolved: 0, closed: 0 },
            pagination: { limit: 10, offset: 0, total: 1, has_more: false },
            items: [{ request_id: 'ticket_recovery', topic: 'site', status: 'open', title: ticketTitle, description: 'Synthetic read-only fixture', created_at: '2026-10-23T01:00:00Z', updated_at: '2026-10-23T01:00:00Z' }],
          });
        }
        if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/portal/v1/')) return reject();
        const prefetchPaths = ['/portal', '/portal/login', '/portal/billing', '/portal/account', '/portal/notifications', '/portal/support/ticket_recovery'];
        if (request.headers()['next-router-prefetch'] === '1' && prefetchPaths.includes(url.pathname)) {
          prefetched.push(url.pathname);
          return route.fulfill({ status: 204, body: '' });
        }
        // Only the page document and its local static resources can reach the runner.
        if (url.pathname === '/portal/support' || url.pathname.startsWith('/_next/static/') || url.pathname === '/favicon.ico' || url.pathname === '/icon.svg') {
          return route.continue();
        }
        return reject();
      });

      try {
        await page.goto('/portal/support');
        await expect(page.locator('html')).toHaveAttribute('lang', copy.locale);
        const heading = page.getByRole('heading', { name: copy.title, exact: true });
        const table = page.locator('[data-portal-support="tickets-table"]');
        await expect(heading).toBeVisible();
        await expect(table).toContainText(ticketTitle);
        const openTab = page.getByRole('tab', { name: copy.open, exact: true });
        await openTab.click();
        const error = page.locator('[data-portal-page-state="error"]');
        await expect(error).toBeVisible();
        await expect(error.getByRole('heading')).toHaveText(copy.error);
        await expect(error.locator('p').first()).toHaveText(copy.error);
        await expect(error.getByRole('button', { name: copy.retry, exact: true })).toBeVisible();
        await expect(openTab).toHaveAttribute('aria-selected', 'true');
        await expect(heading).toBeVisible();
        await expect(page.locator('[data-ui="portal-primary-nav"] a[aria-current="page"]')).toHaveText(copy.title);
        await expect(page.locator('[data-portal-page-state="empty"]')).toHaveCount(0);
        await expect(table).toHaveCount(0);
        await expect(page.locator('body')).not.toContainText(diagnostic);
        await expect(page.locator('body')).not.toContainText(/Bad Gateway|Service Unavailable|client\.(?:non_json|invalid_json)_response/);
        expect(filteredRequests).toHaveLength(1);

        recovering = true;
        await error.getByRole('button', { name: copy.retry, exact: true }).click();
        await expect.poll(() => filteredRequests.length).toBe(2);
        await expect(page.locator('[data-portal-page-state="loading"]')).toBeVisible();
        await expect(page.locator('[data-portal-page-state="empty"]')).toHaveCount(0);
        releaseRecovery();
        await expect(table).toContainText(ticketTitle);
        await expect(error).toHaveCount(0);
        await expect(openTab).toHaveAttribute('aria-selected', 'true');
        await expect(heading).toBeVisible();
        await expect(page).toHaveURL(`${origin.origin}/portal/support`);
        expect(filteredRequests).toHaveLength(2);
        for (const query of filteredRequests) {
          const params = new URLSearchParams(query);
          // The client omits a zero offset from the query string.
          expect(Object.fromEntries(params)).toEqual({ status: 'open', limit: '10' });
        }
      } finally {
        releaseRecovery();
        await testInfo.attach('support-recovery-network', {
          body: JSON.stringify({ unexpected, pageErrors, filteredRequests, prefetched }, null, 2), contentType: 'application/json',
        });
        expect.soft(unexpected, 'Unexpected network requests must be blocked and fail the test').toEqual([]);
        expect.soft(pageErrors, 'Recovery must not crash the page').toEqual([]);
      }
    });
  }
}
