import { expect, test, type Page, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const site = { site_id: 'site_attachment_fixture', name: 'Fixture Site', site_url: 'https://fixture.example.test', platform_kind: 'wordpress', status: 'active', allowed_actions: ['view_sites', 'view_usage'] };
const ticket = { request_id: 'attachment_fixture', title: 'Attachment fixture', description: 'Synthetic support conversation.', topic: 'general', status: 'open' };
const api = '/api/portal/support-requests/attachment_fixture';
const file = (index: number) => ({ name: `note-${index}.txt`, mimeType: 'text/plain', buffer: Buffer.from('fixture') });
const chips = (page: Page) => page.locator('[data-portal-support="attachment-chip"]');
const input = (page: Page) => page.locator('[data-portal-support="composer-attach-input"]');
async function ok(route: Route, data: unknown) {
  await route.fulfill({ json: { status: 'ok', error_code: '', message: 'ok', data, meta: { trace_id: 'attachment-fixture', revision: 'm6' } } });
}
async function fail(route: Route) {
  await route.fulfill({ status: 400, json: { status: 'error', error_code: 'service.fixture_rejected', message: 'Fixture rejected', data: {}, meta: { trace_id: 'attachment-fixture', revision: 'm6' } } });
}

for (const locale of ['zh-CN', 'en'] as const) {
  test.describe(locale, () => {
    const copy = locale === 'zh-CN'
      ? { send: '发送回复', remove: '移除附件', limit: '草稿最多保留 10 个附件，超出的文件未添加；仍受整张工单附件总数上限约束。' }
      : { send: 'Send reply', remove: 'Remove attachment', limit: 'Up to 10 attachments per draft. Extra files were not added. The ticket total limit also applies.' };
    const send = (page: Page) => page.getByRole('button', { name: copy.send, exact: true });
    const requests: string[] = [];
    const unexpected: string[] = [];
    const pageErrors: string[] = [];

    test.beforeEach(async ({ page, context, baseURL }) => {
      if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Loopback preview required');
      requests.length = 0; unexpected.length = 0; pageErrors.length = 0;
      page.on('pageerror', (error) => pageErrors.push(error.message));
      await context.addCookies([
        { name: 'npcink_portal_session_token', value: 'attachment-fixture', url: baseURL },
        { name: 'npcink_locale', value: 'zh-CN', url: baseURL },
      ]);
      await context.addInitScript(({ language, siteId }) => {
        localStorage.setItem('locale', language);
        sessionStorage.setItem(`npcink.portal.journey.sent.v1:${siteId}:login:succeeded`, '1');
      }, { language: 'zh-CN', siteId: site.site_id });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method();
        if (url.origin === new URL(baseURL).origin) {
          if (url.pathname === '/api/portal/session' && method === 'GET') return ok(route, {
            email: 'attachment@example.test', sites: [site], selected_context: { site, allowed_actions: site.allowed_actions, current_subscription: null }, auth_mode: 'jwt',
            session: { state: 'active', transport: 'cookie', issued_at: '2026-10-23T00:00:00Z', expires_at: '2099-10-23T00:00:00Z', revocable: true },
          });
          if (url.pathname === '/api/portal/notifications' && method === 'GET') return ok(route, { items: [], total_count: 0, unread_count: 0, limit: 1, offset: 0 });
          if (url.pathname === api && method === 'GET') return ok(route, { request: ticket, messages: [{ message_id: 'operator_intro', author_kind: 'operator', body: 'Please attach your diagnostic notes.' }], attachments: [], feedback: null });
          if (url.pathname.startsWith(`${api}/`)) {
            requests.push(`${method} ${url.pathname}`);
            // A missing per-test mock is a failure, never a real API fallback.
          } else if (method === 'GET' && request.headers()['next-router-prefetch'] === '1' && url.pathname.startsWith('/portal')) {
            return route.fulfill({ status: 204, body: '' });
          } else if (method === 'GET' && (url.pathname === '/portal/support/attachment_fixture' || url.pathname.startsWith('/_next/') || ['/favicon.ico', '/icon.svg'].includes(url.pathname))) {
            return route.continue();
          }
        }
        unexpected.push(`${method} ${url.pathname}`);
        await route.abort('blockedbyclient');
      });
    });
    test.afterEach(async ({}, testInfo) => {
      await testInfo.attach('isolated-network', { body: JSON.stringify({ requests, unexpected, pageErrors }), contentType: 'application/json' });
      expect(unexpected).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
    async function open(page: Page) {
      await page.goto('/portal/support/attachment_fixture');
      await expect(input(page)).toBeAttached();
      // Initial persisted-English hydration also fails on master b4af1a41.
      // Cover English attachment behavior through the real language control,
      // retaining strict pageerror checks rather than masking that baseline bug.
      if (locale === 'en') {
        await page.getByRole('button', { name: '语言', exact: true }).click();
        await Promise.all([
          page.waitForResponse((response) => new URL(response.url()).pathname === api),
          page.getByRole('option', { name: 'English' }).click(),
        ]);
      }
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('textarea')).toBeVisible();
    }

    test('single and cumulative selection stays local, caps at ten and removes without DELETE', async ({ page }, testInfo) => {
      await open(page);
      await input(page).setInputFiles(Array.from({ length: 11 }, (_, index) => file(index)));
      await expect(chips(page)).toHaveCount(10);
      await expect(page.locator('[data-portal-support="draft-limit-notice"]')).toHaveText(copy.limit);
      await chips(page).first().getByRole('button', { name: copy.remove }).click();
      await expect(chips(page)).toHaveCount(9);
      await input(page).setInputFiles([file(11), file(12)]);
      await expect(chips(page)).toHaveCount(10);
      await expect(chips(page).last()).toContainText('note-11.txt');
      await expect(page.locator('.portal-content [role="alert"]')).toHaveCount(0);
      expect(requests).toEqual([]);
      const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, content: document.querySelector('.portal-content')?.getBoundingClientRect().width }));
      expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);
      expect(geometry.content).toBeLessThanOrEqual(896);
      await page.screenshot({ path: testInfo.outputPath('draft-limit.png'), fullPage: true });
    });

    test('partial upload and message failure retry reuse IDs; sent attachments download under the bubble', async ({ page }, testInfo) => {
      const uploads: string[] = [];
      const bodies: { body: string; attachment_ids: string[] }[] = [];
      await page.route(`**${api}/attachments`, async (route) => {
        const payload = route.request().postDataJSON();
        uploads.push(payload.filename);
        if (uploads.length === 2) return fail(route);
        return ok(route, { attachment: { attachment_id: payload.filename, request_id: ticket.request_id, ...payload, byte_size: 7 } });
      });
      await page.route(`**${api}/messages`, async (route) => {
        const body = route.request().postDataJSON(); bodies.push(body);
        if (bodies.length === 1) return fail(route);
        return ok(route, { request: ticket, message: { message_id: 'sent', author_kind: 'customer', body: body.body }, attachments: body.attachment_ids.map((id: string) => ({ attachment_id: id, message_id: 'sent', filename: id, byte_size: 7 })) });
      });
      await page.route(`**${api}/attachments/note-0.txt`, (route) => ok(route, { attachment: { filename: 'note-0.txt', content_type: 'text/plain', content_base64: 'Zml4dHVyZQ==' } }));
      await open(page);
      await input(page).setInputFiles([file(0), file(1)]);
      await page.locator('textarea').fill('Here are my notes.');
      await send(page).click();
      await expect(page.locator('[data-draft-local="false"]')).toHaveCount(1);
      await expect(send(page)).toBeEnabled();
      await send(page).click();
      await expect(page.locator('[data-draft-local="false"]')).toHaveCount(2);
      await expect(send(page)).toBeEnabled();
      await send(page).click();
      await expect(chips(page)).toHaveCount(0);
      expect(uploads).toEqual(['note-0.txt', 'note-1.txt', 'note-1.txt']);
      expect(bodies.map((body) => body.attachment_ids)).toEqual([['note-0.txt', 'note-1.txt'], ['note-0.txt', 'note-1.txt']]);
      const bubble = page.locator('[data-portal-support="bubble-customer"]');
      await expect(bubble.locator('[data-portal-support="bubble-attachments"]')).toContainText('note-0.txt');
      const download = page.waitForEvent('download');
      await bubble.getByRole('button', { name: /note-0.txt/ }).click();
      expect((await download).suggestedFilename()).toBe('note-0.txt');
      await page.screenshot({ path: testInfo.outputPath('linked-bubble.png'), fullPage: true });
    });

    test('pending orphan delete reserves capacity; failure restores, retry deletes, unknown outcome stays quiet', async ({ page }) => {
      let releaseDelete: () => void = () => {};
      const gate = new Promise<void>((resolve) => { releaseDelete = resolve; });
      let deletes = 0;
      await page.route(`**${api}/attachments`, (route) => {
        const payload = route.request().postDataJSON();
        return ok(route, { attachment: { attachment_id: payload.filename, ...payload, byte_size: 7 } });
      });
      await page.route(`**${api}/messages`, fail);
      await page.route(`**${api}/attachments/*`, async (route) => {
        if (route.request().method() === 'GET') return ok(route, { attachment: { filename: 'note-0.txt', content_type: 'text/plain', content_base64: 'Zml4dHVyZQ==' } });
        deletes += 1;
        if (deletes === 1) { await gate; return fail(route); }
        if (deletes === 3) return route.abort('failed');
        return ok(route, { request: ticket });
      });
      await open(page);
      await input(page).setInputFiles(Array.from({ length: 10 }, (_, index) => file(index)));
      await expect(chips(page)).toHaveCount(10);
      await page.locator('textarea').fill('Keep this reply after failure.');
      await send(page).click();
      await expect(page.locator('[data-draft-local="false"]')).toHaveCount(10);
      await expect(send(page)).toBeEnabled();
      const download = page.waitForEvent('download');
      await chips(page).first().getByRole('button', { name: /note-0.txt/ }).click();
      expect((await download).suggestedFilename()).toBe('note-0.txt');
      try {
        await chips(page).first().getByRole('button', { name: copy.remove }).click();
        await expect(chips(page)).toHaveCount(9);
        await input(page).setInputFiles([file(11)]);
        await expect(chips(page)).toHaveCount(9);
        await expect(page.locator('[data-portal-support="draft-limit-notice"]')).toHaveText(copy.limit);
      } finally { releaseDelete(); }
      await expect(chips(page)).toHaveCount(10);
      await chips(page).last().getByRole('button', { name: copy.remove }).click();
      await expect(chips(page)).toHaveCount(9);
      await chips(page).first().getByRole('button', { name: copy.remove }).click();
      await expect(chips(page)).toHaveCount(8);
      await expect(page.locator('.portal-content [role="alert"]')).toHaveCount(0);
      await expect(page.locator('textarea')).toHaveValue('Keep this reply after failure.');
      expect(deletes).toBe(3);
    });

    test('type and size validation still rejects invalid files before any upload', async ({ page }) => {
      await open(page);
      await input(page).setInputFiles([{ name: 'movie.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fixture') }]);
      await expect(chips(page)).toHaveCount(0);
      await expect(page.locator('.portal-content [role="alert"]')).toBeVisible();
      await input(page).setInputFiles([{ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }]);
      await expect(chips(page)).toHaveCount(0);
      await expect(page.locator('.portal-content [role="alert"]')).toContainText('5 MB');
      await input(page).setInputFiles([file(0)]);
      await expect(chips(page)).toHaveCount(1);
      await expect(page.locator('.portal-content [role="alert"]')).toHaveCount(0);
      expect(requests).toEqual([]);
    });
  });
}

// API tests prove filtering/404. This consumer replay proves the filtered payload
// still renders and downloads linked customer and legacy operator attachments.
test('Admin consumes sent customer and unlinked public/internal operator attachments', async ({ page, context, baseURL }, testInfo) => {
  if (!baseURL || new URL(baseURL).hostname !== '127.0.0.1') throw new Error('Loopback preview required');
  const unexpected: string[] = [];
  const pageErrors: string[] = [];
  const downloads: string[] = [];
  const items = [
    { attachment_id: 'sent_customer', uploader_kind: 'customer', message_id: 'sent', visibility: 'public' },
    { attachment_id: 'legacy_public', uploader_kind: 'operator', message_id: '', visibility: 'public' },
    { attachment_id: 'legacy_internal', uploader_kind: 'operator', message_id: '', visibility: 'internal' },
  ].map((item) => ({ ...item, filename: `${item.attachment_id}.txt`, byte_size: 7, content_type: 'text/plain' }));
  await context.addCookies([{ name: 'npcink_admin_session_token', value: 'attachment-admin-fixture', url: baseURL }]);
  await context.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.origin === new URL(baseURL).origin && route.request().method() === 'GET') {
      if (path === '/admin/session') return ok(route, { principal_id: 'platform:fixture', identity_type: 'platform_admin', role: 'platform_admin' });
      if (path === '/api/admin/support-requests/attachment_fixture') return ok(route, {
        request: { ...ticket, account_id: 'acct_fixture', email: 'attachment@example.test', priority: 'normal', admin_note: '' },
        messages: [{ message_id: 'sent', author_kind: 'customer', visibility: 'public', body: 'Sent customer note.' }], attachments: items, feedback: null,
      });
      const prefetchPaths = new Set(['/admin', '/admin/accounts', '/admin/subscriptions', '/admin/usage-statistics', '/admin/troubleshooting', '/admin/ai-resources', '/admin/runtime-profiles', '/admin/service-settings', '/portal', '/admin/support-requests', '/admin/accounts/acct_fixture']);
      if (route.request().headers()['next-router-prefetch'] === '1' && prefetchPaths.has(path)) return route.fulfill({ status: 204, body: '' });
      const item = items.find((attachment) => path === `/api/admin/support-requests/attachment_fixture/attachments/${attachment.attachment_id}`);
      if (item) { downloads.push(item.attachment_id); return ok(route, { attachment: { ...item, content_base64: 'Zml4dHVyZQ==' } }); }
      if (path === '/admin/support-requests/attachment_fixture' || path.startsWith('/_next/') || ['/favicon.ico', '/icon.svg'].includes(path)) return route.continue();
    }
    unexpected.push(`${route.request().method()} ${path}`);
    await route.abort('blockedbyclient');
  });
  await page.goto('/admin/support-requests/attachment_fixture');
  for (const item of items) {
    const filename = page.getByText(item.filename, { exact: true });
    await expect(filename).toBeVisible();
    const download = page.waitForEvent('download');
    await filename.locator('xpath=../../..').getByRole('button', { name: '下载', exact: true }).click();
    expect((await download).suggestedFilename()).toBe(item.filename);
  }
  expect(downloads).toEqual(items.map((item) => item.attachment_id));
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('admin-attachment-compatibility.png'), fullPage: true });
});
