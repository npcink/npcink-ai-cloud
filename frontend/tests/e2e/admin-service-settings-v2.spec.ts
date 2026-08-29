import { expect, test, type Page } from '@playwright/test';
import {
  buildAdminApiEnvelope,
  buildAdminApiErrorEnvelope,
} from './helpers/admin-operator-fixture';
import {
  observeAdminBrowserEvidence,
  writeAdminVisualReceipt,
} from './helpers/admin-visual-receipt';

const BASE_URL =
  process.env.NPCINK_CLOUD_FRONTEND_BASE_URL ||
  `http://127.0.0.1:${process.env.NPCINK_CLOUD_FRONTEND_PORT || '3301'}`;

function setting(
  settingId: string,
  status: 'ready' | 'disabled' | 'missing_config',
  config: Record<string, unknown>,
  secrets: Record<string, { configured: boolean; display: string }> = {}
) {
  return {
    setting_id: settingId,
    enabled: status !== 'disabled',
    configured: status === 'ready',
    status,
    config,
    secrets,
    last_tested_at: status === 'ready' ? '2026-07-12T06:00:00Z' : '',
    last_error_code: '',
    last_error_message: '',
  };
}

async function hideNextDevelopmentPortal(page: Page) {
  await page.locator('nextjs-portal').evaluateAll((portals) => {
    portals.forEach((portal) => {
      (portal as HTMLElement).style.display = 'none';
    });
  });
}

test('service settings v2 preserves dirty input, guards navigation, validates, saves, and keeps one active form', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let publicBaseUrl = 'https://cloud.example.test';
  let settingsReadCount = 0;
  let failNextPortalSave = false;
  let platformTimezone = 'Asia/Shanghai';
  let mediaRecognitionConfig = {
    window_start: '01:00',
    window_end: '06:00',
    daily_limit: 100,
  };

  await page.context().addCookies([
    { name: 'npcink_admin_session_token', value: 'e2e-admin-session', url: BASE_URL },
  ]);
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        principal_id: 'platform:operator-e2e',
        identity_type: 'platform_admin',
      })),
    });
  });
  await page.route('**/api/admin/service-settings**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/service-settings' && route.request().method() === 'GET') {
      settingsReadCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({
          settings: {
            portal_public: setting('portal_public', 'ready', { public_base_url: publicBaseUrl }),
            qq_login: setting('portal_qq_login', 'disabled', { client_id: '', redirect_uri: '' }, {
              client_secret: { configured: false, display: '' },
            }),
            portal_email: setting('portal_email', 'ready', {
              smtp_host: 'smtp.example.test',
              smtp_port: 465,
              smtp_username: 'mail@example.test',
              smtp_use_ssl: true,
              smtp_use_starttls: false,
              smtp_timeout_seconds: 20,
              from_email: 'mail@example.test',
              from_name: 'Npcink AI Cloud',
              reply_to: '',
            }, { smtp_password: { configured: true, display: '••••••••' } }),
            alipay_payment: setting('payment_alipay', 'disabled', {
              app_id: '', notify_url: '', return_url: '',
            }, {
              private_key: { configured: false, display: '' },
              public_key: { configured: false, display: '' },
            }),
            accounting_fx: setting('commercial_accounting_fx', 'ready', {
              usd_cny_rate: '7.200000',
              effective_at: '2026-07-01T00:00:00Z',
              source: 'operator-approved test rate',
              note: '',
              rate_version: 'usd-cny-20260701T000000Z-7_200000',
              is_fallback: false,
            }),
            site_relink_policy: setting('site_relink_policy', 'ready', {
              cooldown_days: 90,
            }),
            platform_preferences: setting('platform_preferences', 'ready', {
              timezone: platformTimezone,
            }),
            media_recognition_policy: setting(
              'media_recognition_policy',
              'disabled',
              mediaRecognitionConfig
            ),
          },
        })),
      });
      return;
    }
    if (url.pathname === '/api/admin/service-settings/portal-public' && route.request().method() === 'PATCH') {
      if (failNextPortalSave) {
        failNextPortalSave = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify(buildAdminApiErrorEnvelope('temporary service settings failure')),
        });
        return;
      }
      const payload = route.request().postDataJSON() as { public_base_url?: string };
      publicBaseUrl = String(payload.public_base_url || publicBaseUrl);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(setting('portal_public', 'ready', { public_base_url: publicBaseUrl }))),
      });
      return;
    }
    if (url.pathname === '/api/admin/service-settings/platform-preferences' && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as { timezone?: string };
      platformTimezone = String(payload.timezone || platformTimezone);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(setting(
          'platform_preferences',
          'ready',
          { timezone: platformTimezone }
        ))),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({})) });
  });

  await page.goto('/admin/service-settings');
  await expect(page.getByRole('heading', { name: /^Service Settings$|^服务配置$/i })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(7);
  await expect(page.locator('form:visible')).toHaveCount(1);
  expect(settingsReadCount).toBe(1);
  const compactGeometry = await page.evaluate(() => {
    const workbench = document.querySelector<HTMLElement>('[data-ui="admin-settings-workbench"]');
    const directory = workbench?.querySelector<HTMLElement>('[role="tablist"]');
    const input = workbench?.querySelector<HTMLElement>('.input');
    const firstRow = workbench?.querySelector<HTMLElement>('[data-configuration-row]');
    return {
      workbenchDensity: workbench?.dataset.density,
      directoryWidth: Math.round(directory?.getBoundingClientRect().width || 0),
      inputHeight: Math.round(input?.getBoundingClientRect().height || 0),
      rowHeight: Math.round(firstRow?.getBoundingClientRect().height || 0),
    };
  });
  expect(compactGeometry).toEqual({
    workbenchDensity: 'compact',
    directoryWidth: 192,
    inputHeight: 32,
    rowHeight: 49,
  });
  await hideNextDevelopmentPortal(page);
  await expect(page).toHaveScreenshot('admin-service-settings-workbench-pc.png', {
    animations: 'disabled',
    fullPage: true,
  });

  const baseUrlInput = page.getByRole('textbox', { name: /Base URL|基础 URL/i });
  const saveBaseUrl = page.getByRole('button', { name: /Save base URL|保存基础地址/i });
  await baseUrlInput.fill('not-a-url');
  await expect(page.getByText(/valid HTTP or HTTPS|有效的 HTTP 或 HTTPS/i)).toBeVisible();
  await expect(saveBaseUrl).toBeDisabled();

  await baseUrlInput.fill('https://new.example.test');
  await expect(page.getByText(/Unsaved changes|存在未保存更改/i)).toBeVisible();
  const portalPanel = page.locator('#service-settings-portal');
  await expect(portalPanel.locator('[data-ui="service-settings-active-state"]')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Portal URL.*Unsaved|门户地址.*未保存/i })).toBeVisible();
  await expect(saveBaseUrl).toBeEnabled();

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  const discardDialog = page.getByRole('dialog');
  await expect(discardDialog).toContainText(/Discard unsaved changes|放弃未保存更改/i);
  await discardDialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(baseUrlInput).toHaveValue('https://new.example.test');
  await expect(page.getByRole('tab', { name: /Portal URL|门户地址/i })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('link', { name: /^Customers$|^客户$/i }).click();
  const leaveDialog = page.getByRole('dialog');
  await expect(leaveDialog).toContainText(/Leave with unsaved changes|放弃更改并离开/i);
  await leaveDialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
  await expect(page).toHaveURL(/\/admin\/service-settings$/);

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Discard and switch|放弃并切换/i }).click();
  await expect(page.getByRole('tab', { name: /QQ login|QQ 登录/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('form:visible')).toHaveCount(1);
  await page.getByRole('tab', { name: /Portal URL|门户地址/i }).click();
  await expect(baseUrlInput).toHaveValue('https://cloud.example.test');

  await baseUrlInput.fill('https://saved.example.test');
  failNextPortalSave = true;
  await saveBaseUrl.click();
  await expect(page.getByText(/configuration action failed|配置操作失败/i)).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://saved.example.test');
  await expect(saveBaseUrl).toBeEnabled();

  await saveBaseUrl.click();
  await expect(page.getByText(/Service setting updated|服务配置已更新/i)).toBeVisible();
  await expect(baseUrlInput).toHaveValue('https://saved.example.test');
  await expect(saveBaseUrl).toBeDisabled();
  expect(settingsReadCount).toBe(2);
  await page.getByRole('button', { name: 'Close notification' }).click();

  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();
  await page.getByRole('switch', { name: /Enable QQ quick login|启用 QQ 快捷登录/i }).click();
  await page.getByRole('textbox', { name: 'App ID' }).fill('qq-app-e2e');
  await expect(page.getByRole('button', { name: /Check QQ settings|检查 QQ 配置/i })).toBeDisabled();
  await expect(page.getByText(/Enter the QQ App Secret|请输入 QQ App Secret/i)).toBeVisible();
  await page.getByRole('button', { name: /Restore saved values|恢复已保存值/i }).click();

  await page.getByRole('tab', { name: /Payment settings|支付配置/i }).click();
  await expect(page.locator('#service-settings-payment [data-ui="service-settings-high-risk"]')).toContainText(/High-risk payment configuration|高风险支付配置/i);
  await page.getByRole('tab', { name: /QQ login|QQ 登录/i }).click();

  await page.getByRole('tab', { name: /System settings|系统设置/i }).click();
  const timezoneSelect = page.locator('[data-configuration-row="platform-timezone"] select');
  await expect(timezoneSelect).toHaveValue('Asia/Shanghai');
  await timezoneSelect.selectOption('UTC');
  const saveSystemSettings = page.getByRole('button', { name: /Save system settings|保存系统设置/i });
  await expect(saveSystemSettings).toBeEnabled();
  await saveSystemSettings.click();
  await expect(page.getByText(/Service setting updated|服务配置已更新/i)).toBeVisible();
  await expect(timezoneSelect).toHaveValue('UTC');
  await page.getByRole('button', { name: 'Close notification' }).click();

  await page.getByRole('tab', { name: /Email settings|邮件配置/i }).click();
  const previewButton = page.getByRole('button', { name: /Preview email templates|预览邮件模板/i });
  await previewButton.click();
  const previewDialog = page.getByRole('dialog', { name: /Preview email|预览邮件效果/i });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog).toHaveCSS('overflow-y', 'hidden');
  await expect(previewDialog.locator('[data-content-mode="contained"]')).toBeVisible();
  const previewScrollOwners = await previewDialog.evaluate((element) => [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
    .filter((candidate) => {
      const style = window.getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) && candidate.scrollHeight > candidate.clientHeight + 1;
    })
    .map((candidate) => candidate.dataset.ui || candidate.tagName.toLowerCase()));
  expect(previewScrollOwners.every((owner) => owner === 'email-preview-settings-scroll' || owner === 'email-preview-content-scroll')).toBe(true);
  expect(previewScrollOwners.length).toBeLessThanOrEqual(1);
  const emailPreviewScreenshotPath = testInfo.outputPath('admin-email-preview-contained-pc.png');
  await previewDialog.locator('.admin-workbench-dialog').screenshot({
    path: emailPreviewScreenshotPath,
    animations: 'disabled',
  });
  await testInfo.attach('admin-email-preview-contained-pc', {
    path: emailPreviewScreenshotPath,
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePreviewScrollOwners = await previewDialog.evaluate((element) => [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
    .filter((candidate) => {
      const style = window.getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) && candidate.scrollHeight > candidate.clientHeight + 1;
    })
    .map((candidate) => candidate.dataset.ui || candidate.tagName.toLowerCase()));
  expect(mobilePreviewScrollOwners).toEqual(['email-preview-workspace-scroll']);
  const mobilePreviewLayout = await previewDialog.evaluate((dialogElement) => ({
    dialogWidth: dialogElement.clientWidth,
    scrollWidth: dialogElement.scrollWidth,
    offenders: [...dialogElement.querySelectorAll<HTMLElement>('*')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          ui: element.dataset.ui || element.tagName,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.left < -1 || item.right > dialogElement.clientWidth + 1)
      .slice(0, 8),
  }));
  expect(mobilePreviewLayout).toEqual({ dialogWidth: 390, scrollWidth: 390, offenders: [] });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.keyboard.press('Escape');
  await expect(previewDialog).toHaveCount(0);
  await expect(previewButton).toBeFocused();

  mediaRecognitionConfig = {
    window_start: '01:00',
    window_end: '06:00',
    daily_limit: 100,
  };
  platformTimezone = 'Asia/Shanghai';
  await page.reload();
  await page.getByRole('tab', { name: /System settings|系统设置/i }).click();
  await expect(page.locator('[data-configuration-row="platform-timezone"]')).toContainText(/UTC/i);
  await expect(page.locator('[data-configuration-row="platform-timezone"] select')).toHaveValue('Asia/Shanghai');
  const systemSettingsScreenshotPath = testInfo.outputPath('admin-system-settings-pc.png');
  await page.locator('#service-settings-system').screenshot({
    path: systemSettingsScreenshotPath,
    animations: 'disabled',
  });
  await testInfo.attach('admin-system-settings-pc', {
    path: systemSettingsScreenshotPath,
    contentType: 'image/png',
  });

  await writeAdminVisualReceipt({
    page,
    testInfo,
    route: '/admin/service-settings',
    pageModel: 'configuration',
    testedStates: ['ready', 'invalid', 'dirty', 'save_error', 'saved', 'dialog', 'empty'],
    humanAcceptance: 'not_required',
    pageTitle: page.getByRole('heading', { name: /^Service Settings$|^服务配置$/i }),
    workingSurface: page.locator('[data-ui="admin-settings-workbench"]'),
    browserEvidence,
    expectedConsoleErrors: [/^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/],
    routeRuleResults: [
      { id: 'single-primary-action', status: 'pass', evidence: 'only one active form and its save action are visible' },
      { id: 'textual-status', status: 'pass', evidence: 'settings directory exposes Ready, Disabled, and dirty text states' },
      { id: 'action-object-proximity', status: 'pass', evidence: 'save and validation feedback remain in the active settings panel' },
      { id: 'distinct-interaction-states', status: 'pass', evidence: 'selected tab, dirty tab, enabled save, and disabled save states were exercised' },
      { id: 'dialog-focus-recovery', status: 'pass', evidence: 'email preview closes with Escape and restores focus to its trigger' },
      { id: 'context-stability', status: 'pass', evidence: 'failed save preserves the draft and guarded navigation preserves the active form' },
    ],
    interactionResults: [
      { id: 'validation-and-dirty-state', status: 'pass', evidence: 'invalid and dirty values produce distinct feedback and action state' },
      { id: 'save-failure-recovery', status: 'pass', evidence: 'failed save retains the draft before a successful retry' },
      { id: 'preview-dialog-keyboard-recovery', status: 'pass', evidence: 'Escape closes preview and restores focus' },
      { id: 'platform-timezone-ownership', status: 'pass', evidence: 'system settings owns the global timezone and explains that timestamps remain in UTC' },
    ],
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('form:visible')).toHaveCount(1);
  // Let responsive transitions settle before measuring the final mobile layout.
  await page.waitForTimeout(250);
  const mobileLayout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return {
      viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            text: String(element.textContent || '').trim().slice(0, 50),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((item) => item.left < -1 || item.right > viewportWidth + 1)
        .slice(0, 8),
    };
  });
  expect(mobileLayout).toEqual({ viewportWidth: 390, scrollWidth: 390, offenders: [] });
});

test('service settings initial failure preserves the PC shell and bounded retry', async ({ page }) => {
  let attempts = 0;
  await page.context().addCookies([
    { name: 'npcink_admin_session_token', value: 'e2e-admin-session', url: BASE_URL },
  ]);
  await page.route('**/admin/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiEnvelope({
        principal_id: 'platform:operator-e2e',
        identity_type: 'platform_admin',
      })),
    });
  });
  await page.route('**/api/admin/service-settings', async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(buildAdminApiErrorEnvelope('service settings unavailable')),
    });
  });

  await page.goto('/admin/service-settings');
  await expect(page.getByRole('heading', { name: /^Service Settings$|^服务配置$/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /service settings unavailable|服务配置/i })).toBeVisible();
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page).toHaveURL(/\/admin\/service-settings$/);
});
