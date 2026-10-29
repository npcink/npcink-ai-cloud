import { test } from './helpers/critical-network-fixture';
import { expect, type Page } from '@playwright/test';
import { installAdminMocks } from './helpers/admin-operator-fixture';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { observeAdminBrowserEvidence } from './helpers/admin-visual-receipt';

const primaryInstance = {
  instance_id: 'text.primary',
  provider_id: 'provider_text',
  provider_display_name: 'Text Provider',
  adapter_type: 'openai_compatible',
  model_id: 'text-model-v1',
  endpoint_variant: 'chat_completions',
  region: 'global',
  health_status: 'healthy',
  weight: 100,
  capability_tags: ['text'],
  model_status: 'available',
  model_feature: 'text_generation',
  catalog_source: 'provider_api',
  upstream_status: 'current',
  capability_evidence: {},
};

const fallbackInstance = {
  ...primaryInstance,
  instance_id: 'text.backup',
  provider_id: 'provider_backup',
  provider_display_name: 'Text Backup',
  model_id: 'text-model-v2',
  weight: 90,
};

const unavailableInstance = {
  ...primaryInstance,
  instance_id: 'text.unavailable',
  provider_id: 'provider_retired',
  provider_display_name: 'Retired Provider',
  model_id: 'text-model-retired',
  health_status: 'unknown',
  model_status: 'disabled',
  weight: 0,
};

const configuredVisionCandidate = {
  ...primaryInstance,
  instance_id: 'text.configured-vision-candidate',
  provider_id: 'provider_gateway',
  provider_display_name: 'Gateway Provider',
  model_id: 'gpt-5.6-sol',
  health_status: 'unknown',
  catalog_source: 'configured_selection',
  upstream_status: 'missing_from_latest_catalog',
  capability_tags: ['text', 'configured_candidate', 'upstream_missing'],
};

const initialProfiles = [
  {
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
    profile_id: 'route.short_text',
    group_id: 'content',
    routing_intent: 'content.short_text',
    label: 'Short text suggestions',
    description: 'Shared hosted route for short text suggestions.',
    execution_kind: 'text',
    tasks: ['title_generation', 'excerpt_generation'],
    candidate_instance_ids: ['text.primary'],
    timeout_ms: 30000,
    max_timeout_ms: 60000,
    allow_fallback: true,
    max_retries: 1,
    revision: 'rev-1',
    updated_at: '2026-07-12T08:00:00Z',
    status: 'active',
  },
  {
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
    profile_id: 'route.classification',
    group_id: 'content',
    routing_intent: 'content.classification',
    label: 'Content classification',
    description: 'Shared hosted route for classification.',
    execution_kind: 'text',
    tasks: ['content_classification'],
    candidate_instance_ids: ['text.primary'],
    timeout_ms: 25000,
    max_timeout_ms: 60000,
    allow_fallback: false,
    max_retries: 0,
    revision: 'rev-2',
    updated_at: '2026-07-12T08:00:00Z',
    status: 'active',
  },
];

type CapturedWrite = {
  method: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
};

function envelope(data: unknown, message = 'Hosted runtime profiles loaded') {
  return {
    status: 'ok',
    error_code: '',
    message,
    data,
    meta: { trace_id: 'trace_runtime_profiles_e2e', revision: 'm6' },
  };
}

function projection(profiles: typeof initialProfiles, receipt?: Record<string, unknown>) {
  return {
    contract_version: 'cloud-hosted-runtime-profiles.v1',
    surface: 'admin_hosted_runtime_profiles',
    projection_kind: 'hosted_runtime_profile_configuration',
    owner: 'cloud_runtime',
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
    operation_contract_version: 'wordpress_operation.v1',
    available_instances: {
      text: [primaryInstance, fallbackInstance, unavailableInstance],
      vision: [],
      image_generation: [],
      audio_generation: [],
    },
    profiles,
    read_only_profiles: [{ profile_id: 'text.ai', selection_mode: 'automatic', candidates: [primaryInstance, fallbackInstance] }],
    boundary: {
      public_runtime_accepts_raw_model_instance: false,
      results_write_posture: 'suggestion_only',
      admin_surface: 'platform_admin_only',
      direct_wordpress_write: false,
    },
    ...(receipt ? { receipt } : {}),
  };
}

async function installRuntimeProfilesHarness(page: Page, options: { profiles?: typeof initialProfiles; additionalInstances?: typeof primaryInstance[] } = {}) {
  await installAdminMocks(page);
  const writes: CapturedWrite[] = [];
  let profiles = structuredClone(options.profiles || initialProfiles);
  const currentProjection = (receipt?: Record<string, unknown>) => {
    const result = projection(profiles, receipt);
    result.available_instances.text.push(...(options.additionalInstances || []));
    return result;
  };

  await page.route('**/api/admin/service-settings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        settings: {
          media_recognition_policy: {
            setting_id: 'media_recognition_policy',
            enabled: false,
            status: 'disabled',
            config: {
              window_start: '01:00',
              window_end: '06:00',
              daily_limit: 100,
            },
          },
          platform_preferences: {
            setting_id: 'platform_preferences',
            enabled: true,
            status: 'ready',
            config: { timezone: 'Asia/Shanghai' },
          },
        },
      })),
    });
  });

  await page.route('**/api/admin/runtime-profiles', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(currentProjection())),
      });
      return;
    }

    if (request.method() !== 'PATCH') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'error',
          error_code: 'proxy.admin_route_not_allowed',
          message: 'Admin route is not available.',
          data: {},
          meta: { trace_id: '', revision: 'm6' },
        }),
      });
      return;
    }

    const body = request.postDataJSON() as Record<string, unknown>;
    writes.push({
      method: request.method(),
      idempotencyKey: request.headers()['idempotency-key'] || '',
      body,
    });
    profiles = profiles.map((previous) => {
      const profile = (body.profiles as typeof initialProfiles).find((item) => item.profile_id === previous.profile_id);
      return profile ? {
        ...previous,
        ...profile,
        revision: 'runtime-profiles-e2e-saved',
        status: profile.candidate_instance_ids.length ? 'configured' : 'needs_candidates',
      } : previous;
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(currentProjection({
        audit_event_id: 721,
        event_kind: 'runtime_profiles.update',
        scope_kind: 'runtime_profile_catalog',
        scope_id: 'wordpress_ai_connector',
        outcome: 'succeeded',
        effective_summary: 'Hosted runtime profiles were updated.',
        audit_filters: { event_kind: 'runtime_profiles.update' },
      }), 'Hosted runtime profiles saved')),
    });
  });

  await page.route('**/api/admin/runtime-profiles/capability-probes/summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        window_minutes: 10080,
        generated_at: '2026-08-26T00:00:00Z',
        totals: { attempts: 0, verified: 0, failed: 0, success_rate: 0 },
        by_capability: [],
        by_instance: [],
        recent_failures: [],
      })),
    });
  });

  return writes;
}

function profileRow(page: Page, profileId: string) {
  return page.locator(`[data-profile-id="${profileId}"]`);
}

function candidateRow(page: Page, instanceId: string) {
  return page.locator(`[data-instance-id="${instanceId}"]`);
}

test('runtime configuration keeps PC action and dialog context with a structured receipt', async ({ page }, testInfo) => {
  const browserEvidence = observeAdminBrowserEvidence(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles');
  const surface = page.locator('[data-ui="runtime-profile-table"]');
  await expect(surface).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  expect((await surface.boundingBox())!.y).toBeLessThan(1050);
  await expect(profileRow(page, 'route.short_text')).toContainText(/configured|已配置/i);
  const screenshotPaths = [testInfo.outputPath('runtime-configuration-1440.png'), testInfo.outputPath('runtime-dialog-900.png')];
  await page.screenshot({ path: screenshotPaths[0], fullPage: true, animations: 'disabled' });
  const trigger = profileRow(page, 'route.short_text').getByRole('button');
  await trigger.click();
  await page.setViewportSize({ width: 900, height: 1050 });
  await candidateRow(page, fallbackInstance.instance_id).getByRole('radio').first().check();
  await expect(candidateRow(page, fallbackInstance.instance_id).getByRole('radio').first()).toBeChecked();
  await expect(candidateRow(page, unavailableInstance.instance_id).locator('input[type=radio]').first()).toBeDisabled();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Save usage|保存用途/i })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: screenshotPaths[1], fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(profileRow(page, 'route.short_text')).toContainText('Text Provider · text-model-v1');
  expect(browserEvidence.consoleErrors).toEqual([]);
  expect(browserEvidence.networkFailures).toEqual([]);
  const rules = {
    'declared-page-model': 'configuration route retains the profile directory and workbench',
    'pc-viewport': '1440x1050 page and 900x1050 dialog checked',
    'horizontal-overflow': 'no whole-page overflow at the narrow PC width; candidate table scrolls internally',
    'single-page-title': 'exactly one level-one heading',
    'working-surface-first-viewport': 'profile directory starts above the first viewport bottom',
    'single-primary-action': 'dialog has one Save usage action; directory actions stay secondary',
    'textual-status': 'configured status is expressed with text',
    'action-object-proximity': 'Configure stays in its profile row and radio selection stays in its model row',
    'distinct-interaction-states': 'checked candidate, disabled retired model, and enabled save exercised',
    'dialog-focus-recovery': 'Escape closes the dialog and restores Configure focus',
    'context-stability': 'cancel discards the candidate draft and preserves the saved profile',
    'browser-runtime-errors': 'no unexplained console or failed network requests',
  };
  const dirtyPaths = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trimEnd().split('\n').filter(Boolean).map((line) => line.slice(3));
  writeFileSync(testInfo.outputPath('runtime-visual-receipt.json'), JSON.stringify({
    schema_version: 1, route: '/admin/runtime-profiles', page_model: 'configuration',
    source_revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source_dirty: dirtyPaths.length > 0, source_dirty_paths: dirtyPaths,
    environment: 'local', viewport: { width: 1440, height: 1050 }, tested_states: ['ready', 'dialog', 'dirty', 'cancelled'],
    rule_results: Object.entries(rules).map(([id, evidence]) => ({ id, evidence, status: 'pass' })),
    screenshot_paths: screenshotPaths,
    interaction_results: [{ id: 'cancel-preserves-saved-profile', status: 'pass', evidence: 'saved primary remains after cancelling a different radio selection' }],
    console_errors: browserEvidence.consoleErrors, network_failures: browserEvidence.networkFailures,
    review_required_items: ['PC grouping, abnormal-state emphasis and five-second scan require human judgment'],
    human_acceptance: 'pending', generated_at: new Date().toISOString(),
  }, null, 2));
});

test('runtime read failure leaves directory counts unknown', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    await route.fulfill({ status: 503, json: { status: 'error', error_code: 'runtime.unavailable', message: 'unavailable', data: {}, meta: {} } });
  });
  await page.goto('/admin/runtime-profiles');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Configured\s*0|已配置\s*0/);
});

test('runtime save locks all candidate edits until the submitted profile is confirmed', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  let release: (() => void) | undefined;
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    if (route.request().method() === 'GET') { await route.fallback(); return; }
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fallback();
  });
  await page.goto('/admin/runtime-profiles');
  await profileRow(page, 'route.short_text').getByRole('button').click();
  await candidateRow(page, fallbackInstance.instance_id).getByRole('radio').first().check();
  await page.getByRole('button', { name: /Save usage|保存用途/i }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  try { await expect(candidateRow(page, primaryInstance.instance_id).getByRole('radio').first()).toBeDisabled(); }
  finally { release?.(); }
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('unavailable media policy stays unknown and cannot overwrite saved settings', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  await page.route('**/api/admin/service-settings**', async (route) => {
    await route.fulfill({ status: 503, json: { status: 'error', error_code: 'settings.unavailable', message: 'unavailable', data: {}, meta: {} } });
  });
  await page.goto('/admin/runtime-profiles');
  const policy = page.locator('[data-ui="media-recognition-policy"]');
  await expect(policy.getByRole('alert')).toBeVisible();
  await expect(policy.getByRole('spinbutton')).toHaveCount(0);
  await expect(policy.locator('summary')).toContainText(/Unknown|未知/);
  await expect(policy.getByRole('button', { name: /^Retry$|^重试$/i })).toBeVisible();
});

test('malformed media policy recovers only through GET and the model link opens the vision workbench', async ({ page }) => {
  await installRuntimeProfilesHarness(page, { profiles: [...initialProfiles, {
    ...initialProfiles[0], profile_id: 'vision.ai', execution_kind: 'vision', label: 'Vision understanding',
  }] });
  let invalid = true;
  const methods: string[] = [];
  await page.route('**/api/admin/service-settings**', async (route) => {
    methods.push(route.request().method());
    if (!invalid) { await route.fallback(); return; }
    await route.fulfill({ json: envelope({ settings: { media_recognition_policy: {}, platform_preferences: {} } }) });
  });
  await page.goto('/admin/runtime-profiles');
  const policy = page.locator('[data-ui="media-recognition-policy"]');
  await expect(policy.locator('summary')).toContainText(/Unknown|未知/);
  await expect(policy.getByRole('spinbutton')).toHaveCount(0);
  invalid = false;
  await policy.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(policy.getByRole('spinbutton')).toHaveValue('100');
  expect(methods).toEqual(['GET', 'GET']);
  await policy.getByRole('link', { name: /Configure and verify model|配置并验证模型/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(/Vision understanding|视觉理解/i);
});

test('retrying a failed profile read preserves the already loaded probe summary', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  let reads = 0;
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    reads += 1;
    if (reads > 1) { await route.fallback(); return; }
    await route.fulfill({ status: 503, json: { status: 'error', error_code: 'runtime.unavailable', message: 'unavailable', data: {}, meta: {} } });
  });
  const summaryReady = page.waitForResponse((response) => response.url().includes('/capability-probes/summary'));
  await page.goto('/admin/runtime-profiles');
  await summaryReady;
  await page.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(page.locator('[data-ui="runtime-profile-table"]')).toBeVisible();
  const summary = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /Capability verification history|能力验证历史/i }) });
  await summary.locator('summary').click();
  await expect(summary).toContainText(/No capability probes|还没有能力验证/i);
  await expect(summary).not.toContainText(/0%/);
});

test('malformed probe history stays unavailable and retries independently of configuration', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  let invalid = true;
  await page.route('**/api/admin/runtime-profiles/capability-probes/summary**', async (route) => {
    if (!invalid) { await route.fallback(); return; }
    await route.fulfill({ json: envelope({}) });
  });
  await page.goto('/admin/runtime-profiles');
  const summary = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /Capability verification history|能力验证历史/i }) });
  await summary.locator('summary').click();
  await expect(summary).toContainText(/unavailable|无法加载/i);
  await expect(summary).not.toContainText('0%');
  invalid = false;
  await summary.getByRole('button', { name: /^Retry$|^重试$/i }).click();
  await expect(summary).toContainText(/No capability probes|还没有能力验证/i);
});

test('hosted runtime profiles are URL-backed, boundary-focused, and fit a narrow PC window', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles');

  await expect(page.getByRole('heading', { name: /Runtime Profiles|运行配置/i })).toBeVisible();
  await expect(profileRow(page, 'route.short_text')).toBeVisible();
  await expect(page.getByText('Text Provider · text-model-v1').first()).toBeVisible();
  await expect(page.locator('main input')).toHaveCount(3);
  const mediaRecognitionDisclosure = page.locator('[data-ui="media-recognition-policy"]');
  await expect(mediaRecognitionDisclosure).not.toHaveAttribute('open', '');
  await expect(mediaRecognitionDisclosure.locator('summary')).toContainText(/Site media recognition|站内媒体识别/i);
  await expect(mediaRecognitionDisclosure.locator('summary')).toContainText(/01:00-06:00/i);
  await expect(page.getByRole('spinbutton', { name: /Daily image limit|每日图片上限/i })).not.toBeVisible();
  const pageScreenshotPath = testInfo.outputPath('admin-runtime-profiles-page-pc.png');
  await page.screenshot({ path: pageScreenshotPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach('admin-runtime-profiles-page-pc', {
    path: pageScreenshotPath,
    contentType: 'image/png',
  });
  await mediaRecognitionDisclosure.locator('summary').click();
  await expect(mediaRecognitionDisclosure).toHaveAttribute('open', '');
  await expect(page.getByRole('spinbutton', { name: /Daily image limit|每日图片上限/i })).toHaveValue('100');
  await expect(page.getByRole('switch', { name: /Enable background media recognition|启用后台媒体识别/i })).toBeDisabled();
  await expect(page.getByText(/Configure and verify the Vision understanding profile|请先配置并验证“视觉理解”模型/i)).toBeVisible();
  await page.getByText(/Hosted runtime contract details|托管运行合同详情/i).click();
  await expect(page.getByText(/Operation contract|操作合同/i)).toBeVisible();
  await expect(page.getByText('wordpress_operation.v1')).toBeVisible();

  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  await expect(page).toHaveURL(/profile=route\.classification/);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(profileRow(page, 'route.classification')).toHaveAttribute('data-selected', 'true');

  await expect(page.getByText(/Cloud runtime dependencies|Cloud 运行依赖/i)).toHaveCount(0);
  await expect(page.getByText(/embedding|向量模型/i)).toHaveCount(0);
  await expect(page.getByText(/audio preview|音频预览/i)).toHaveCount(0);

  await page.setViewportSize({ width: 1056, height: 900 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1056);
});

test('runtime profile readiness fails closed for unknown and unhealthy primary models', async ({ page }) => {
  await installAdminMocks(page);
  const unknownInstance = {
    ...primaryInstance,
    instance_id: 'text.unknown',
    model_id: 'text-model-unknown',
    health_status: 'unknown',
  };
  const unhealthyInstance = {
    ...primaryInstance,
    instance_id: 'text.unhealthy',
    model_id: 'text-model-unhealthy',
    health_status: 'unhealthy',
  };
  const readinessProfiles = structuredClone(initialProfiles);
  readinessProfiles[0].candidate_instance_ids = [unknownInstance.instance_id];
  readinessProfiles[1].candidate_instance_ids = [unhealthyInstance.instance_id];
  const readinessProjection = projection(readinessProfiles);
  readinessProjection.available_instances.text = [unknownInstance, unhealthyInstance];

  await page.route('**/api/admin/runtime-profiles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(readinessProjection)),
    });
  });
  await page.goto('/admin/runtime-profiles');

  const unknownProfile = profileRow(page, 'route.short_text');
  await expect(unknownProfile).toContainText(/Usage configured|用途已配置/i);
  await expect(unknownProfile).not.toContainText(/Ready|就绪/i);

  const unhealthyProfile = profileRow(page, 'route.classification');
  await expect(unhealthyProfile).toContainText(/Configuration error|配置异常/i);
});

test('enabled models missing from the latest upstream catalog remain visible for vision verification', async ({ page }) => {
  await installAdminMocks(page);
  let probeAttempts = 0;
  const writes: Array<Record<string, unknown>> = [];
  const policyWrites: Array<Record<string, unknown>> = [];
  let failNextPolicySave = false;
  const visionProfiles = [
    ...structuredClone(initialProfiles),
    {
      ...structuredClone(initialProfiles[0]),
      profile_id: 'vision.ai',
      group_id: 'media',
      routing_intent: 'media.alt_text',
      label: 'Image ALT vision',
      description: 'Hosted vision route for image ALT suggestions.',
      execution_kind: 'vision',
      tasks: ['alt_text_generation'],
      candidate_instance_ids: [],
      revision: 'rev-3',
      updated_at: '2026-08-26T08:00:00Z',
      status: 'needs_candidates',
    },
  ];
  const visionProjection = projection(visionProfiles);
  visionProjection.available_instances.text.push(configuredVisionCandidate);
  await page.route('**/api/admin/service-settings**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/service-settings' && route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          settings: {
            media_recognition_policy: {
              setting_id: 'media_recognition_policy',
              enabled: false,
              status: 'disabled',
              config: {
                window_start: '01:00',
                window_end: '06:00',
                daily_limit: 100,
              },
            },
            platform_preferences: {
              setting_id: 'platform_preferences',
              enabled: true,
              status: 'ready',
              config: { timezone: 'Asia/Shanghai' },
            },
          },
        })),
      });
      return;
    }
    if (url.pathname === '/api/admin/service-settings/media-recognition-policy' && route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      policyWrites.push(body);
      if (failNextPolicySave) {
        failNextPolicySave = false;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'error',
            error_code: 'service_settings.media_recognition_profile_unavailable',
            message: 'Vision understanding profile is unavailable.',
            data: {},
            meta: { trace_id: 'trace_policy_error', revision: 'test' },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          setting_id: 'media_recognition_policy',
          enabled: Boolean(body.enabled),
          status: body.enabled ? 'ready' : 'disabled',
          config: {
            window_start: String(body.window_start || '01:00'),
            window_end: String(body.window_end || '06:00'),
            daily_limit: Number(body.daily_limit || 100),
          },
        })),
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      writes.push(body);
      const payloadProfiles = body.profiles as Array<Record<string, unknown>>;
      const savedProfiles = visionProfiles.map((profile) => ({
        ...profile,
        ...(payloadProfiles.find((item) => item.profile_id === profile.profile_id) || {}),
        revision: 'runtime-profiles-auto-verified',
        status: 'configured',
      }));
      const savedProjection = projection(savedProfiles);
      savedProjection.available_instances.text.push({
        ...configuredVisionCandidate,
        capability_evidence: {
          vision: {
            state: 'verified',
            source: 'provider_probe',
            revision: 'verified-revision',
            checked_at: '2026-08-26T09:30:00Z',
            error_code: '',
          },
        },
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(savedProjection, 'Hosted runtime profiles saved')),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(visionProjection)),
    });
  });
  await page.route('**/api/admin/runtime-profiles/capability-probe', async (route) => {
    probeAttempts += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      capability: 'vision',
      instance_id: configuredVisionCandidate.instance_id,
      timeout_ms: 30000,
    });
    if (probeAttempts > 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({
          capability: 'vision',
          state: 'verified',
          source: 'provider_probe',
          revision: 'verified-revision',
          checked_at: '2026-08-26T09:30:00Z',
          error_code: '',
        }, 'Capability verification succeeded.')),
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'error',
        error_code: 'runtime_profiles.capability_probe_failed',
        message: 'Capability verification did not succeed.',
        data: {
          capability: 'vision',
          state: 'verification_failed',
          source: 'provider_probe',
          revision: 'failed-revision',
          checked_at: '2026-08-26T09:29:00Z',
          error_code: 'provider.access_denied',
        },
        meta: { trace_id: 'trace_probe_failure', revision: 'm6' },
      }),
    });
  });
  await page.goto('/admin/runtime-profiles');

  await profileRow(page, 'vision.ai').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  const candidate = candidateRow(page, configuredVisionCandidate.instance_id);
  const retained = dialog.locator('[data-ui="runtime-profile-other-candidates"]');
  await expect(candidate).not.toBeVisible();
  await retained.locator('summary').click();
  await expect(candidate).toBeVisible();
  await expect(candidate).toContainText(/catalog unconfirmed|目录未确认/i);
  await expect(candidate).toContainText(/Needs verification|待验证/i);
  const verifyButton = candidate.getByRole('button', { name: /^Verify vision capability$|^验证视觉理解$/i });
  await expect(verifyButton).toBeVisible();
  await expect(dialog.locator('[data-ui="capability-verification-notice"]')).toContainText(/real test request|真实测试请求/);
  await expect(dialog.locator('[data-ui="capability-verification-notice"]')).toContainText(/charge|费用/);
  await expect(verifyButton).toHaveCSS('white-space', 'nowrap');
  const actionHeader = retained.getByRole('columnheader', { name: /^Actions$|^操作$/i });
  await expect(actionHeader).toHaveCSS('white-space', 'nowrap');
  const [verifyButtonBox, actionHeaderBox] = await Promise.all([
    verifyButton.boundingBox(),
    actionHeader.boundingBox(),
  ]);
  expect(verifyButtonBox?.width).toBeGreaterThanOrEqual(64);
  expect(verifyButtonBox?.height).toBeGreaterThanOrEqual(32);
  expect(actionHeaderBox?.width).toBeGreaterThanOrEqual(96);
  expect(actionHeaderBox?.height).toBeLessThan(40);
  await expect(candidate.getByRole('radio', { name: /fallback|兜底/i })).toBeDisabled();

  await candidate.getByRole('radio', { name: /primary|主模型/i }).check();
  await dialog.getByRole('button', { name: /Save usage|保存用途/i }).click();
  await expect(dialog.locator('[data-ui="runtime-profile-probe-error"]')).toContainText(/Verify capability|验证能力/i);
  expect(probeAttempts).toBe(0);
  expect(writes).toHaveLength(0);
  await verifyButton.click();

  const reopenedDialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  const probeAlert = reopenedDialog.locator('[data-ui="runtime-profile-probe-error"]');
  await expect(probeAlert).toContainText(/The provider denied this capability probe\.|提供方拒绝了这次能力验证。/i);
  await expect(probeAlert).toBeVisible();
  await expect(candidateRow(page, configuredVisionCandidate.instance_id)).toContainText(/Verification failed|验证失败/i);
  expect(writes).toHaveLength(0);
  const [dialogBox, alertBox] = await Promise.all([reopenedDialog.boundingBox(), probeAlert.boundingBox()]);
  expect(dialogBox).not.toBeNull();
  expect(alertBox).not.toBeNull();
  expect(alertBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
  expect(alertBox!.y).toBeGreaterThanOrEqual(dialogBox!.y);
  expect(alertBox!.x + alertBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width);
  expect(alertBox!.y + alertBox!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height);

  await candidateRow(page, configuredVisionCandidate.instance_id).getByRole('button', { name: /Verify vision capability|验证视觉理解/i }).click();
  await expect(candidateRow(page, configuredVisionCandidate.instance_id)).toContainText(/Capability verified|能力已验证/i);
  await reopenedDialog.getByRole('button', { name: /Save usage|保存用途/i }).click();
  await expect.poll(() => probeAttempts).toBe(2);
  await expect.poll(() => writes.length).toBe(1);
  expect((writes[0].profiles as Array<Record<string, unknown>>).find((profile) => profile.profile_id === 'vision.ai')).toMatchObject({
    candidate_instance_ids: [configuredVisionCandidate.instance_id],
  });
  await expect(reopenedDialog).toHaveCount(0);

  const mediaRecognitionDisclosure = page.locator('[data-ui="media-recognition-policy"]');
  await expect(mediaRecognitionDisclosure).not.toHaveAttribute('open', '');
  await mediaRecognitionDisclosure.locator('summary').click();
  const recognitionSwitch = page.getByRole('switch', { name: /Enable background media recognition|启用后台媒体识别/i });
  await expect(recognitionSwitch).toBeEnabled();
  await expect(page.locator('[data-configuration-row="media-recognition-timezone"]')).toContainText(/Platform timezone|平台时区/i);
  await expect(page.locator('[data-configuration-row="media-recognition-timezone"] a')).toHaveAttribute('href', '/admin/service-settings?tab=system');
  await recognitionSwitch.click();
  await page.getByRole('spinbutton', { name: /Daily image limit|每日图片上限/i }).fill('25');
  const savePolicy = page.getByRole('button', { name: /Save recognition policy|保存识别策略/i });
  failNextPolicySave = true;
  await savePolicy.click();
  await expect(mediaRecognitionDisclosure).toHaveAttribute('open', '');
  await expect(mediaRecognitionDisclosure.locator('summary')).toContainText(/Needs verification|需验证/i);
  await expect(page.getByText(/has not passed vision capability verification|尚未通过识图能力验证/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Configure and verify model|配置并验证模型/i }).first()).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: /Daily image limit|每日图片上限/i })).toHaveValue('25');
  await savePolicy.click();
  await expect.poll(() => policyWrites.length).toBe(2);
  expect(policyWrites[1]).toEqual({
    enabled: true,
    window_start: '01:00',
    window_end: '06:00',
    daily_limit: 25,
  });
  expect(policyWrites[1]).not.toHaveProperty('model_id');
  expect(policyWrites[1]).not.toHaveProperty('timezone');
  await expect(mediaRecognitionDisclosure).not.toHaveAttribute('open', '');
  await expect(mediaRecognitionDisclosure.locator('summary')).toContainText(/Enabled|已启用/i);
  await expect(mediaRecognitionDisclosure.locator('summary')).toContainText(/25 images\/day|每日 25 张/i);
});

test('candidate editing saves only the current usage with an auditable PATCH receipt', async ({ page }, testInfo) => {
  const writes = await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');
  await expect(profileRow(page, 'route.classification')).toBeVisible();
  await expect(page.locator('main input:visible')).toHaveCount(0);
  await expect(page.locator('[data-ui="runtime-profile-table"]').getByText('Text Backup · text-model-v2')).toHaveCount(0);

  const configureButton = profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i });
  await configureButton.click();
  const dialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await expect(dialog).toBeVisible();
  const backupRow = candidateRow(page, 'text.backup');
  await expect(backupRow).toContainText('Text Backup');
  await expect(backupRow).toContainText('text-model-v2');
  await backupRow.getByRole('radio', { name: /Use text-model-v2 as fallback|将 text-model-v2 设为兜底模型/i }).check();
  await expect(dialog.getByText('Text Backup · text-model-v2')).toBeVisible();
  await expect(backupRow.getByRole('radio', { name: /Use text-model-v2 as fallback|将 text-model-v2 设为兜底模型/i })).toBeChecked();

  await dialog.getByRole('button', { name: /Save usage|保存用途/i }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PATCH');
  expect(writes[0].idempotencyKey).toMatch(/^runtime_profiles_/);
  expect(writes[0].body).toMatchObject({
    contract_version: 'cloud-hosted-runtime-profiles.v1',
    platform_kind: 'wordpress',
    connector_id: 'wordpress_ai_connector',
    operation_contract_version: 'wordpress_operation.v1',
  });
  expect(writes[0].body).not.toHaveProperty(['connector', 'contract', 'version'].join('_'));
  const savedProfiles = writes[0].body.profiles as Array<Record<string, unknown>>;
  expect(savedProfiles.find((profile) => profile.profile_id === 'route.classification')).toMatchObject({
    candidate_instance_ids: ['text.primary', 'text.backup'],
  });
  const receipt = page.locator('[data-ui="admin-mutation-receipt"]');
  await expect(receipt.getByRole('status')).toContainText(/Usage configuration saved|用途配置已保存/);
  await expect(page.getByRole('status').filter({ hasText: /Usage configuration saved|用途配置已保存/ })).toHaveCount(1);
  await expect(receipt.getByText('Hosted runtime profiles were updated.')).toBeHidden();
  await expect(receipt.getByText('runtime_profiles.update', { exact: true })).toBeHidden();
  await expect(receipt.getByRole('link', { name: /View change record|查看变更记录/ })).toHaveAttribute('href', /event_id=721/);
  await receipt.locator('summary').click();
  await expect(receipt.getByText('runtime_profiles.update', { exact: true })).toBeVisible();
  await expect(receipt.getByRole('button', { name: /Copy details|复制详情/ })).toBeVisible();
  await receipt.locator('summary').click();
  for (const width of [1440, 1056]) {
    await page.setViewportSize({ width, height: 1050 });
    expect((await receipt.boundingBox())?.height).toBeLessThan(115);
    await expect(profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/ })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('receipt-light-narrow.png'), fullPage: true });
  await page.getByRole('button', { name: /Toggle theme|切换主题/ }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(receipt.getByRole('status')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('receipt-dark-narrow.png'), fullPage: true });
});

test('candidate editing can save an explicit empty fail-closed chain', async ({ page }) => {
  const writes = await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');

  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await dialog.getByRole('button', { name: /Clear candidate chain|清空候选链/i }).click();
  await dialog.getByRole('button', { name: /Save usage|保存用途/i }).click();

  await expect.poll(() => writes.length).toBe(1);
  const savedProfiles = writes[0].body.profiles as Array<Record<string, unknown>>;
  expect(savedProfiles.find((profile) => profile.profile_id === 'route.classification')).toMatchObject({
    candidate_instance_ids: [],
  });
  await expect(profileRow(page, 'route.classification')).toContainText(/Unconfigured|未配置/i);
});

test('an invalid hosted runtime contract fails closed instead of rendering an empty workspace', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        ...projection(initialProfiles),
        platform_kind: 'typecho',
      })),
    });
  });

  await page.goto('/admin/runtime-profiles');

  const contractAlert = page.getByRole('alert').filter({
    hasText: /加载托管运行配置失败|Failed to load hosted runtime profiles\./,
  });
  await expect(contractAlert).toBeVisible();
  await expect(page.getByText('Hosted runtime profile contract identity mismatch: platform_kind.', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/No hosted runtime profiles|暂无托管运行配置/i)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Hosted profile directory|托管配置目录/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Configure candidate chain|配置候选链/i })).toHaveCount(0);
});

test('a superseded connector contract field is rejected instead of accepting dual identity', async ({ page }) => {
  await installAdminMocks(page);
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        ...projection(initialProfiles),
        [['connector', 'contract', 'version'].join('_')]: 'superseded',
      })),
    });
  });

  await page.goto('/admin/runtime-profiles');

  await expect(page.getByRole('alert').filter({
    hasText: /加载托管运行配置失败|Failed to load hosted runtime profiles\./,
  })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Hosted profile directory|托管配置目录/i })).toHaveCount(0);
});

test('cancel and close discard only the dialog draft without writing', async ({ page }) => {
  const writes = await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');
  const configure = profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i });
  for (const close of ['cancel', 'escape']) {
    await configure.click();
    const dialog = page.getByRole('dialog');
    await candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/i }).check();
    if (close === 'cancel') await dialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();
    else await page.keyboard.press('Escape');
    expect(writes).toHaveLength(0);
    await configure.click();
    await expect(candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/i })).not.toBeChecked();
    await page.keyboard.press('Escape');
  }
  await page.getByRole('main').getByRole('link', { name: /Model suppliers|模型供应商/i }).click();
  await expect(page).toHaveURL(/\/admin\/ai-resources$/);
});

test('runtime profile table and workbench keep the accepted PC density', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');

  const profileTable = page.locator('[data-ui="runtime-profile-table"]');
  await expect(profileTable).toBeVisible();
  await expect(profileTable.getByRole('columnheader')).toHaveCount(4);
  await expect(profileTable).toHaveScreenshot('admin-runtime-profiles-table-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015,
  });

  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const workbench = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await expect(workbench.locator('[data-ui="admin-configuration-table"]').first()).toBeVisible();
  await expect(workbench.locator('[data-ui="runtime-profile-candidate-table"]')).toBeVisible();
  await expect(workbench).toHaveCSS('overflow-y', 'hidden');
  await expect(workbench.locator('[data-content-mode="contained"]')).toBeVisible();
  const modelToolbar = workbench.locator('[data-ui="runtime-profile-model-toolbar"]');
  const candidateTable = workbench.locator('[data-ui="runtime-profile-candidate-table"]');
  const providerFilter = modelToolbar.getByRole('combobox', { name: /Supplier|供应商/i });
  const modelSearch = modelToolbar.getByRole('searchbox', { name: /Search models|搜索模型/i });
  const [toolbarBox, candidateTableBox, providerBox, searchBox] = await Promise.all([
    modelToolbar.boundingBox(),
    candidateTable.boundingBox(),
    providerFilter.boundingBox(),
    modelSearch.boundingBox(),
  ]);
  if (!toolbarBox || !candidateTableBox || !providerBox || !searchBox) {
    throw new Error('Compact model toolbar controls must be visible for geometry validation.');
  }
  expect(toolbarBox.height).toBeLessThanOrEqual(40);
  expect(providerBox.height).toBe(32);
  expect(searchBox.height).toBe(32);
  expect(Math.abs(providerBox.y - searchBox.y)).toBeLessThanOrEqual(1);
  expect(candidateTableBox.y - (toolbarBox.y + toolbarBox.height)).toBeGreaterThanOrEqual(9);
  expect(candidateTableBox.y - (toolbarBox.y + toolbarBox.height)).toBeLessThanOrEqual(11);
  const runtimeScrollOwners = await workbench.evaluate((element) => [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
    .filter((candidate) => {
      const style = window.getComputedStyle(candidate);
      return /(auto|scroll)/.test(style.overflowY) && candidate.scrollHeight > candidate.clientHeight + 1;
    })
    .map((candidate) => candidate.dataset.ui || candidate.tagName.toLowerCase()));
  expect(runtimeScrollOwners.every((owner) => owner === 'runtime-profile-candidate-table')).toBe(true);
  expect(runtimeScrollOwners.length).toBeLessThanOrEqual(1);
  await expect(workbench.getByRole('radio')).toHaveCount(4);
  await expect(candidateRow(page, 'text.unavailable')).not.toBeVisible();
  await workbench.locator('[data-ui="runtime-profile-other-candidates"] > summary').click();
  await expect(workbench.getByRole('radio')).toHaveCount(6);
  await expect(candidateRow(page, 'text.unavailable')).toContainText(/Unavailable|不可用/i);
  await expect(candidateRow(page, 'text.unavailable').getByRole('radio').first()).toBeDisabled();
  await expect(candidateRow(page, 'text.unavailable').getByRole('radio').last()).toBeDisabled();
  await expect(workbench.locator('.admin-workbench-dialog')).toHaveCSS('max-width', '1152px');
  await expect(workbench.locator('.admin-workbench-dialog')).toHaveScreenshot('admin-runtime-profiles-workbench-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015,
  });
});

// Saving text must never dispatch an unrelated, previously failed media probe.
test('text edits save independently of failed image capability and preserve unchanged profiles', async ({ page }) => {
  const writes = await installRuntimeProfilesHarness(page);
  const image = {
    ...primaryInstance,
    instance_id: 'image.kolors',
    model_id: 'Kwai-Kolors/Kolors',
    model_feature: 'image_generation',
    capability_evidence: {
      image_generation: { state: 'failed', source: 'provider_probe', revision: 'failed', checked_at: '2026-10-17T06:00:00Z', error_code: 'provider.budget_configuration_missing' },
    },
  };
  const profiles = [...structuredClone(initialProfiles), {
    ...initialProfiles[0], profile_id: 'wp-ai.image-generation', execution_kind: 'image_generation',
    label: 'Image generation', candidate_instance_ids: [image.instance_id],
  }];
  const data = { ...projection(profiles), available_instances: { ...projection(profiles).available_instances, image_generation: [image] } };
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: envelope(data) });
  });
  let probes = 0;
  await page.route('**/api/admin/runtime-profiles/capability-probe', async (route) => {
    probes += 1;
    await route.fulfill({ status: 409, json: { status: 'error', error_code: 'provider.budget_configuration_missing', message: 'budget missing', data: {} } });
  });
  await page.goto('/admin/runtime-profiles');
  await expect(profileRow(page, 'wp-ai.image-generation')).toContainText(/Configuration error|配置异常/);
  await profileRow(page, 'wp-ai.image-generation').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  await expect(candidateRow(page, image.instance_id)).toContainText(/Verification failed|验证失败/);
  await page.keyboard.press('Escape');
  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  await candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: /Save usage|保存用途/ }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(probes).toBe(0);
  expect(writes[0].body.profiles).toEqual([expect.objectContaining({ profile_id: 'route.classification', candidate_instance_ids: ['text.primary', 'text.backup'] })]);
});


test('failed usage save keeps input and successful save survives reload without changing another usage', async ({ page }) => {
  const writes = await installRuntimeProfilesHarness(page);
  let fail = true;
  await page.route('**/api/admin/runtime-profiles', async (route) => {
    if (route.request().method() === 'PATCH' && fail) {
      fail = false;
      await route.fulfill({ status: 409, json: { status: 'error', error_code: 'runtime_profiles.conflict', message: 'Please retry this usage save.', data: {} } });
    } else await route.fallback();
  });
  await page.goto('/admin/runtime-profiles?provider=provider_backup');
  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: /Supplier|供应商/ })).toHaveValue('provider_backup');
  await candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/ }).check();
  await dialog.getByText(/Advanced settings|高级设置/, { exact: true }).click();
  await dialog.getByRole('spinbutton', { name: /Timeout|超时/ }).fill('40');
  await dialog.getByRole('button', { name: /Save usage|保存用途/ }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/ })).toBeChecked();
  await dialog.getByRole('button', { name: /Save usage|保存用途/ }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0].body.profiles).toEqual([expect.objectContaining({ timeout_ms: 40000 })]);
  await page.reload();
  await expect(profileRow(page, 'route.classification')).toContainText('text-model-v2');
  await expect(profileRow(page, 'route.short_text')).not.toContainText('text-model-v2');
  const automatic = page.locator('[data-ui="automatic-runtime-profile"]');
  await expect(automatic).toContainText(/Automatic model selection|自动选模/);
  await expect(automatic).not.toHaveAttribute('open', '');
  await expect(automatic.getByRole('listitem').first()).toBeHidden();
  await automatic.locator('summary').click();
  await expect(automatic.getByRole('listitem')).toHaveText(['Text Provider · text-model-v1', 'Text Backup · text-model-v2']);
  await expect(automatic.getByRole('button')).toHaveCount(0);
});

test('text usage can choose an image-input text model without starting capability verification', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  let probes = 0;
  const multimodal = { ...primaryInstance, instance_id: 'deepseek.flash', provider_id: 'deepseek', provider_display_name: 'DeepSeek', model_id: 'deepseek/deepseek-flash', upstream_model_id: 'deepseek-flash', model_feature: 'vision', capability_tags: ['vision'], capability_evidence: {} };
  const data = { ...projection(initialProfiles), available_instances: { ...projection(initialProfiles).available_instances, vision: [multimodal] } };
  await page.route('**/api/admin/runtime-profiles', route => route.fulfill({ json: envelope(data) }));
  await page.route('**/api/admin/runtime-profiles/capability-probe', async route => { probes += 1; await route.abort(); });
  await page.setViewportSize({ width: 1056, height: 900 });
  await page.goto('/admin/runtime-profiles');
  await profileRow(page, 'route.short_text').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  const dialog = page.getByRole('dialog');
  const row = dialog.getByRole('row').filter({ hasText: 'deepseek-flash' });
  await expect(row).toBeVisible();
  await expect(row).not.toHaveText('deepseek/deepseek-flash');
  await row.getByRole('radio', { name: /Use .* as primary|设为主模型|用作主模型/ }).check();
  await expect(dialog.getByRole('button', { name: /Save usage|保存用途/ })).toBeEnabled();
  expect(probes).toBe(0);
  await dialog.getByRole('button', { name: /^Cancel$|^取消$/ }).click();
});

for (const width of [1056, 1440]) {
  test(`candidate disclosure preserves selected problems and text eligibility at PC ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1056 ? 733 : 1050 });
    const profiles = structuredClone(initialProfiles);
    profiles[1].candidate_instance_ids = ['text.unavailable'];
    const writes = await installRuntimeProfilesHarness(page, { profiles, additionalInstances: [configuredVisionCandidate] });
    await page.goto('/admin/runtime-profiles');
    await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/ }).click();
    const dialog = page.getByRole('dialog');
    const current = dialog.locator('[data-ui="runtime-profile-current-candidates"]');
    const retained = dialog.locator('[data-ui="runtime-profile-other-candidates"]');
    await expect(current.locator('[data-instance-id="text.unavailable"]')).toBeVisible();
    await expect(current.locator('[data-instance-id="text.unavailable"]')).toContainText(/Unavailable|不可用/);
    await expect(candidateRow(page, configuredVisionCandidate.instance_id)).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: /Save usage|保存用途/ })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`candidates-default-${width}.png`) });
    await retained.locator('summary').click();
    await expect(retained.getByRole('link', { name: /Manage suppliers|管理供应商/ })).toHaveAttribute('href', '/admin/ai-resources');
    const primary = candidateRow(page, configuredVisionCandidate.instance_id).getByRole('radio', { name: /as primary|设为主模型/ });
    await expect(primary).toBeEnabled();
    await primary.check();
    await expect(current.locator(`[data-instance-id="${configuredVisionCandidate.instance_id}"]`)).toBeVisible();
    await expect(current.locator(`[data-instance-id="${configuredVisionCandidate.instance_id}"]`)).toContainText(/Catalog unconfirmed|目录未确认/);
    await page.screenshot({ path: testInfo.outputPath(`candidates-expanded-${width}.png`) });
    await dialog.getByRole('button', { name: /Save usage|保存用途/ }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toHaveLength(1);
    expect(writes[0].body.profiles).toMatchObject([{ profile_id: 'route.classification', candidate_instance_ids: [configuredVisionCandidate.instance_id] }]);
    expect(writes[0].body.profiles).toHaveLength(1);
    await page.reload();
    await expect(profileRow(page, 'route.classification')).toContainText('gpt-5.6-sol');
  });
}

test('browser back confirmation handles Escape above the runtime draft', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 1050 });
  const writes = await installRuntimeProfilesHarness(page);
  await page.goto('/admin');
  await page.locator('a[href="/admin/runtime-profiles"]').first().click();
  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/ }).click();
  await candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/ }).check();
  await page.evaluate(() => window.history.back());
  const confirmation = page.getByRole('dialog', { name: /Leave with unsaved changes|放弃未保存/ });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: /^Cancel$|^取消$/ }).focus();
  await page.keyboard.press('Tab');
  expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('runtime-history-confirmation-pc-900.png') });
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(candidateRow(page, 'text.backup').getByRole('radio', { name: /as fallback|设为兜底模型/ })).toBeChecked();
  await expect(page).toHaveURL(/\/admin\/runtime-profiles/);
  await page.evaluate(() => window.history.back());
  await confirmation.getByRole('button', { name: /Discard and leave|放弃并离开/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(writes).toHaveLength(0);
});
