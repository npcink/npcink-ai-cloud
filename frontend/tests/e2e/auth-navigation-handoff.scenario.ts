import { expect, test, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';

const backend = `http://127.0.0.1:${Number(process.env.NPCINK_NAVIGATION_BACKEND_PORT || 4317)}`;
const adminKey = 'nca_admin_navigation_test_only';
const email = 'navigation@example.test';

async function screenshot(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(name, { path, contentType: 'image/png' });
}

async function control(request: APIRequestContext, action: Record<string, unknown> = {}) {
  const response = await request.post(`${backend}/__test`, { data: action });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as { held: boolean; calls: string[]; installs: number };
}

async function markDocument(page: Page) {
  await page.evaluate(() => { document.documentElement.dataset.navigationDocument = 'same-document'; });
}

async function expectSameDocument(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-navigation-document', 'same-document');
}

// Installation completion is terminal in the real proxy cache. Keep this tiny
// suite serial: pending -> complete once, followed by the two Portal outcomes.
test.describe.configure({ mode: 'serial' });

test('saved-key handoff rechecks completion, tears down the wizard and discovers admin auth', async ({ page, request }, info) => {
  await page.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
  await page.goto('/api/health'); // The replaced wizard must not return on Back.
  await page.goto('/setup');
  await page.getByLabel(/安装码|Setup code/i).fill('nca_setup_navigation_test_only');
  await page.getByRole('button', { name: /验证安装码|Verify setup code/i }).click();
  await page.getByLabel(/Cloud 名称|Cloud name/i).fill('Navigation Test');
  await page.getByLabel(/Cloud 公网地址|Public Cloud URL/i).fill('https://cloud.example.test');
  await page.getByRole('button', { name: /下一步|Next/i }).click();
  await page.getByLabel(/RDS 私网地址|Private RDS host/i).fill('db.example.test');
  await page.getByLabel(/^数据库$|^Database$/i).fill('navigation');
  await page.getByLabel(/^用户名$|^Username$/i).fill('navigation');
  await page.getByLabel(/^密码$|^Password$/i).fill('database-navigation-test-only');
  await page.getByLabel(/RDS CA 证书|RDS CA certificate/i).fill('TEST-ONLY');
  await page.getByRole('button', { name: /测试数据库|Test database/i }).click();
  await expect(page.getByText(/数据库验证通过|Database validation passed/i)).toBeVisible();
  await page.getByRole('button', { name: /下一步|Next/i }).click();
  await page.getByRole('button', { name: /初始化 Cloud|Initialize Cloud/i }).click();
  const key = page.locator('#generated_admin_key');
  await expect(key).toHaveValue(adminKey);
  const open = page.getByRole('button', { name: /打开后台登录|Open admin login/i });
  await expect(open).toBeDisabled();
  await page.getByLabel(/我已经把管理员密钥|I saved this admin key/i).check();
  await control(request, { failNextState: true });
  await open.click();
  await expect(page.locator('[data-setup-error="setup.state_unavailable"]')).toBeVisible();
  await expect(key).toHaveValue(adminKey); // Uncertain handoff must not lose the only copy.
  await expect(page).toHaveURL(/\/setup$/);
  await screenshot(page, info, 'setup-confirmed-key');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await screenshot(page, info, 'setup-confirmed-key-1280');
  await page.setViewportSize({ width: 1440, height: 1200 });
  await markDocument(page);
  const stateRead = page.waitForResponse(r => new URL(r.url()).pathname === '/api/setup/state');
  await open.dblclick(); // Busy/ref guard admits one transition.
  expect((await stateRead).headers()['cache-control']).toContain('no-store');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expectSameDocument(page);
  await expect(key).toHaveCount(0);
  await expect(page.getByLabel(/管理员密钥|Admin key/i)).toHaveValue('');
  await expect.poll(async () => (await control(request)).calls.filter(c => c === 'GET /admin/session').length).toBeGreaterThan(0);
  await screenshot(page, info, 'admin-login-fresh');
  const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage, location.href, document.body.innerHTML]));
  expect(storage).not.toContain(adminKey);
  expect(storage).not.toContain('database-navigation-test-only');
  await page.reload();
  await expect(page.getByLabel(/管理员密钥|Admin key/i)).toHaveValue('');
  await page.goBack();
  await expect(page).not.toHaveURL(/\/setup$/);
  const closed = await page.goto('/setup');
  expect(closed?.status()).toBe(404);
  expect(await page.content()).not.toContain(adminKey);
  expect((await control(request)).installs).toBe(1);
});

for (const late of ['session', 'unauthorized'] as const) {
  test(`QQ revoke retires the shared session and late ${late} probe before client login`, async ({ page, request, context }, info) => {
    await control(request, { resetPortal: true });
    if (late === 'unauthorized') await page.setViewportSize({ width: 1280, height: 1000 });
    await context.addCookies([{ name: 'npcink_portal_session_token', value: 'navigation-old', url: String(test.info().project.use.baseURL) }]);
    await page.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto('/portal/account');
    const unlink = page.getByRole('button', { name: /解绑 QQ|Unbind QQ/i });
    await expect(unlink).toBeEnabled();
    await screenshot(page, info, `account-${late}-before-unbind`);
    await control(request, { holdNextSession: true });
    // The real Account bound-result effect starts useSession.refresh(). The
    // provider remains mounted through the subsequent Next client transition.
    await page.evaluate(() => history.pushState(null, '', '/portal/account?qq=bound'));
    await expect.poll(async () => (await control(request)).held).toBe(true);
    // A slow route load must not turn a confirmed revoke into a misleading
    // "session has not been signed out" failure while login is still pending.
    await page.route('**/portal/login?reason=qq_unbound*', async route => {
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.continue();
    });
    await page.evaluate(() => {
      Reflect.set(window, 'navigationFailureObserved', false);
      new MutationObserver(() => {
        if (Array.from(document.querySelectorAll('h1')).some(node => /服务中心暂时不可用|Portal is temporarily unavailable/.test(node.textContent || ''))) {
          Reflect.set(window, 'navigationFailureObserved', true);
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await markDocument(page);
    await unlink.click();
    await expect(page).toHaveURL(/\/portal\/login\?reason=qq_unbound$/);
    await expectSameDocument(page);
    expect(await page.evaluate(() => Reflect.get(window, 'navigationFailureObserved'))).toBe(false);
    await expect(page.locator('[data-portal-nav="logout"]')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText(/QQ.*解绑|QQ.*unbound/i);
    const lateResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/portal/session');
    await control(request, { releaseSession: late });
    await lateResponse;
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/reason=qq_unbound/);
    await expect(page.getByRole('status')).toContainText(/QQ.*解绑|QQ.*unbound/i);
    const calls = (await control(request)).calls;
    expect(calls).not.toContain('POST /portal/v1/session/site');
    expect(calls).not.toContain('GET /portal/v1/totp/challenge/status');
    expect(calls).not.toContain('POST /portal/v1/logout');
    const protectedRead = await page.request.get('/api/portal/session');
    expect(protectedRead.status()).toBe(401);
    await screenshot(page, info, `qq-${late}-signed-out`);
    await page.getByLabel(/^邮箱地址$|^Email Address$/i).fill(email);
    await page.getByRole('button', { name: /发送验证码|Send verification code/i }).click();
    await page.getByRole('button', { name: /验证并继续|Verify and continue/i }).click();
    await expect(page).toHaveURL(/\/portal$/);
    expect((await page.request.get('/api/portal/session')).status()).toBe(200);
    expect(pageErrors).toEqual([]);
  });
}

test('failed QQ unbind keeps the current session usable and does not navigate', async ({ page, request, context }, info) => {
  await control(request, { resetPortal: true, failUnbind: true });
  await context.addCookies([{ name: 'npcink_portal_session_token', value: 'navigation-old', url: String(test.info().project.use.baseURL) }]);
  await page.addInitScript(() => localStorage.setItem('locale', 'zh-CN'));
  await page.goto('/portal/account');
  await page.getByRole('button', { name: /解绑 QQ|Unbind QQ/i }).click();
  await expect(page).toHaveURL(/\/portal\/account$/);
  await expect(page.getByRole('button', { name: /解绑 QQ|Unbind QQ/i })).toBeEnabled();
  await expect(page.locator('[data-portal-nav="logout"]')).toBeVisible();
  expect((await page.request.get('/api/portal/session')).status()).toBe(200);
  expect((await control(request)).calls).not.toContain('POST /portal/v1/logout');
  await screenshot(page, info, 'qq-unbind-failure');
  await control(request, { failUnbind: false });
  await page.getByRole('button', { name: /解绑 QQ|Unbind QQ/i }).click();
  await expect(page).toHaveURL(/\/portal\/login\?reason=qq_unbound$/);
  expect((await page.request.get('/api/portal/session')).status()).toBe(401);
});
