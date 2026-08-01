import { expect, test, type Page } from '@playwright/test';
import { installAdminMocks } from './helpers/admin-operator-fixture';

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
    boundary: {
      public_runtime_accepts_raw_model_instance: false,
      results_write_posture: 'suggestion_only',
      admin_surface: 'platform_admin_only',
      direct_wordpress_write: false,
    },
    ...(receipt ? { receipt } : {}),
  };
}

async function installRuntimeProfilesHarness(page: Page) {
  await installAdminMocks(page);
  const writes: CapturedWrite[] = [];
  let profiles = structuredClone(initialProfiles);

  await page.route('**/api/admin/runtime-profiles', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(projection(profiles))),
      });
      return;
    }

    if (request.method() !== 'PUT') {
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
    profiles = (body.profiles as typeof initialProfiles).map((profile) => {
      const previous = profiles.find((item) => item.profile_id === profile.profile_id);
      return {
        ...(previous || initialProfiles[0]),
        ...profile,
        platform_kind: 'wordpress',
        connector_id: 'wordpress_ai_connector',
        revision: 'runtime-profiles-e2e-saved',
        status: profile.candidate_instance_ids.length ? 'configured' : 'needs_candidates',
      };
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(projection(profiles, {
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

  return writes;
}

function profileRow(page: Page, profileId: string) {
  return page.locator(`[data-profile-id="${profileId}"]`);
}

function candidateRow(page: Page, instanceId: string) {
  return page.locator(`[data-instance-id="${instanceId}"]`);
}

test('hosted runtime profiles are URL-backed, boundary-focused, and mobile safe', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles');

  await expect(page.getByRole('heading', { name: /Runtime Profiles|运行配置/i })).toBeVisible();
  await expect(profileRow(page, 'route.short_text')).toBeVisible();
  await expect(page.getByText('Text Provider / text-model-v1').first()).toBeVisible();
  await expect(page.locator('main input')).toHaveCount(0);
  const pageScreenshotPath = testInfo.outputPath('admin-runtime-profiles-page-pc.png');
  await page.screenshot({ path: pageScreenshotPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach('admin-runtime-profiles-page-pc', {
    path: pageScreenshotPath,
    contentType: 'image/png',
  });
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
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
  await expect(unknownProfile).toContainText(/Needs config|待配置/i);
  await expect(unknownProfile).not.toContainText(/Ready|就绪/i);

  const unhealthyProfile = profileRow(page, 'route.classification');
  await expect(unhealthyProfile).toContainText(/Blocked|已阻断/i);
});

test('candidate editing is dialog-bounded and PUT saves an auditable receipt', async ({ page }) => {
  const writes = await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');
  await expect(page.locator('main input')).toHaveCount(0);
  await expect(page.getByText('Text Backup / text-model-v2')).toHaveCount(0);

  const configureButton = profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i });
  await configureButton.click();
  const dialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await expect(dialog).toBeVisible();
  const backupRow = candidateRow(page, 'text.backup');
  await expect(backupRow).toContainText('Text Backup');
  await expect(backupRow).toContainText('text-model-v2');
  await backupRow.getByRole('radio', { name: /Use text-model-v2 as fallback|将 text-model-v2 设为兜底模型/i }).check();
  await expect(dialog.getByText('Text Backup / text-model-v2')).toBeVisible();
  await expect(backupRow.getByRole('radio', { name: /Use text-model-v2 as fallback|将 text-model-v2 设为兜底模型/i })).toBeChecked();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(configureButton).toBeFocused();

  await page.getByRole('button', { name: /Save profiles|保存配置/i }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('PUT');
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
  await expect(page.getByText('Hosted runtime profiles were updated.')).toBeVisible();
  await expect(page.getByText('runtime_profiles.update')).toBeVisible();
});

test('candidate editing can save an explicit empty fail-closed chain', async ({ page }) => {
  const writes = await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');

  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const dialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await dialog.getByRole('button', { name: /Clear candidate chain|清空候选链/i }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Save profiles|保存配置/i }).click();

  await expect.poll(() => writes.length).toBe(1);
  const savedProfiles = writes[0].body.profiles as Array<Record<string, unknown>>;
  expect(savedProfiles.find((profile) => profile.profile_id === 'route.classification')).toMatchObject({
    candidate_instance_ids: [],
  });
  await expect(page.getByText(/Needs config|待配置/i).first()).toBeVisible();
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
    hasText: 'Hosted runtime profile contract identity mismatch: platform_kind.',
  });
  await expect(contractAlert).toBeVisible();
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
    hasText: 'Hosted runtime profile contract contains superseded connector contract identity.',
  })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Hosted profile directory|托管配置目录/i })).toHaveCount(0);
});

test('dirty profile drafts require confirmation before leaving for model suppliers', async ({ page }) => {
  await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');

  const configureButton = profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i });
  await configureButton.click();
  let profileDialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  const backupRow = candidateRow(page, 'text.backup');
  await backupRow.getByRole('radio', { name: /Use text-model-v2 as fallback|将 text-model-v2 设为兜底模型/i }).check();
  await page.keyboard.press('Escape');

  const suppliersLink = page.getByRole('main').getByRole('link', { name: /Model suppliers|模型供应商/i });
  await suppliersLink.click();
  let leaveDialog = page.getByRole('dialog', { name: /Leave with unsaved changes|放弃未保存的更改并离开/i });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: /^Cancel$|^取消$/i }).click();

  await expect(page).toHaveURL(/\/admin\/runtime-profiles\?profile=route\.classification/);
  await expect(leaveDialog).toHaveCount(0);
  await configureButton.click();
  profileDialog = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await expect(profileDialog.getByText('Text Backup / text-model-v2')).toBeVisible();
  await expect(candidateRow(page, 'text.backup').getByRole('radio', { name: /Use text-model-v2 as fallback|将 text-model-v2 设为兜底模型/i })).toBeChecked();
  await page.keyboard.press('Escape');

  await suppliersLink.click();
  leaveDialog = page.getByRole('dialog', { name: /Leave with unsaved changes|放弃未保存的更改并离开/i });
  await leaveDialog.getByRole('button', { name: /Discard and leave|放弃并离开/i }).click();
  await expect(page).toHaveURL(/\/admin\/ai-resources$/);
});

test('runtime profile table and workbench keep the accepted PC density', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installRuntimeProfilesHarness(page);
  await page.goto('/admin/runtime-profiles?profile=route.classification');

  const profileTable = page.locator('[data-ui="runtime-profile-table"]');
  await expect(profileTable).toBeVisible();
  await expect(profileTable.getByRole('columnheader')).toHaveCount(7);
  await expect(profileTable).toHaveScreenshot('admin-runtime-profiles-table-pc.png', {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.015,
  });

  await profileRow(page, 'route.classification').getByRole('button', { name: /^Configure$|^配置$/i }).click();
  const workbench = page.getByRole('dialog', { name: /Configure candidate chain|配置候选链/i });
  await expect(workbench.locator('[data-ui="admin-configuration-table"]')).toBeVisible();
  await expect(workbench.locator('[data-ui="runtime-profile-candidate-table"]')).toBeVisible();
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
