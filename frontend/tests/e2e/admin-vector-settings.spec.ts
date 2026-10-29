import { expect, test } from '@playwright/test';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

const baseVectorProfile = {
  runtime: {
    environment: 'development', provider_id: 'ollama-m4-embedding',
    model_id: 'npcink-qwen3-vl-embedding:8b-q4_k_m-mmproj-q8',
    dimensions: 4096, backend: 'postgres_json', index_status: 'ready'
  },
  profile_id: 'site-knowledge.zh.v1',
  model_id: 'BAAI/bge-m3',
  dimensions: 1024,
  metric: 'COSINE',
  production_backend: 'zilliz_cloud',
  local_test_backend: 'postgres_json',
  active_backend: 'postgres_json',
  status: 'ready',
  editable_fields: ['credential', 'zilliz_endpoint', 'zilliz_token'],
  reindex_policy: 'profile_change_requires_reindex',
  provider: {
    provider_id: 'siliconflow', display_name: 'SiliconFlow', connection_id: 'site_knowledge_vector_siliconflow',
    configured: true, verified: true, status: 'ready', last_tested_at: '2026-07-13T10:00:00Z'
  },
  vector_store: {
    provider_id: 'zilliz', display_name: 'Zilliz Cloud', connection_id: 'site_knowledge_vector_zilliz',
    configured: false, verified: false, status: 'not_configured', settings_owner: 'cloud_admin', endpoint: '',
    token_configured: false, collection: 'site_knowledge_zh_v1', last_tested_at: ''
  },
  validation: {
    connection: { status: 'not_ready', provider_verified: true, vector_store_verified: false },
    index: {
      status: 'empty', reason: 'no_source_chunks', embedding_space_id: 'siliconflow:BAAI/bge-m3',
      source_document_count: 0, source_chunk_count: 0, indexed_chunk_count: 0,
      roundtrip_status: 'not_applicable', last_reindexed_at: '', last_error_code: ''
    },
    retrieval: { status: 'pending', last_verified_at: '', result_count: 0, top1_score: 0, evidence_source: 'site_knowledge_search_metric' }
  }
};

test('vector settings keeps the fixed PC profile and saves the continuous configuration table', async ({
  page
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);

  let savedPayload: Record<string, unknown> | null = null;
  let profile = structuredClone(baseVectorProfile);

  await page.route('**/api/admin/site-knowledge-vector-profile**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/admin/site-knowledge-vector-profile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(profile))
      });
      return;
    }
    if (request.method() === 'PUT' && pathname === '/api/admin/site-knowledge-vector-profile') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(profile))
      });
      return;
    }
    if (
      request.method() === 'PUT' &&
      pathname === '/api/admin/site-knowledge-vector-profile/vector-store'
    ) {
      savedPayload = request.postDataJSON() as Record<string, unknown>;
      profile = {
        ...profile,
        vector_store: {
          ...profile.vector_store,
          configured: true,
          verified: true,
          status: 'ready',
          endpoint: String(savedPayload.endpoint || ''),
          token_configured: true,
          last_tested_at: '2026-07-13T10:05:00Z'
        },
        validation: {
          ...profile.validation,
          connection: {
            status: 'ready',
            provider_verified: true,
            vector_store_verified: true
          }
        }
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope(profile))
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/admin/vector-settings');
  await expect(page.getByTestId('vector-runtime-profile')).toContainText('4096D');
  await expect(page.getByTestId('vector-runtime-profile')).toContainText('8b-q4_k_m');
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 1050 });
  await expect(
    page.getByRole('heading', { name: /Site vector service|站点向量服务/i })
  ).toBeVisible();

  const configurationSection = page.locator('[data-vector-section="configuration"]');
  await expect(
    configurationSection.getByRole('heading', {
      name: /Vector configuration|向量配置/i
    })
  ).toBeVisible();
  await expect(configurationSection).toContainText('BAAI/bge-m3');
  await expect(configurationSection).toContainText('1024');
  await expect(configurationSection).toContainText('COSINE');
  await expect(configurationSection.locator('[data-ui="admin-configuration-table"]')).toHaveCount(
    1
  );
  await expect(configurationSection.locator('[data-ui="admin-credential-field"]')).toHaveCount(2);

  const validationSection = page.locator('[data-vector-section="validation"]');
  await expect(validationSection).toContainText(/Connection check|连接检测/i);
  await expect(validationSection).toContainText(/Index check|索引检测/i);
  await expect(validationSection).toContainText(/Live retrieval|真实检索/i);

  await expect(configurationSection).toContainText('site_knowledge_zh_v1');
  await expect(page.getByText(/Result reranking|结果重排/i)).toHaveCount(0);
  const pageScreenshotPath = testInfo.outputPath('admin-vector-settings-page-pc.png');
  await page.screenshot({ path: pageScreenshotPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach('admin-vector-settings-page-pc', {
    path: pageScreenshotPath,
    contentType: 'image/png'
  });

  await configurationSection
    .getByLabel('Zilliz Endpoint')
    .fill('https://in03-example.cn-beijing.vectordb.zilliz.com.cn:19530');
  await configurationSection.getByLabel('Zilliz Token').fill('zilliz-secret');
  await configurationSection.getByRole('button', { name: /Save configuration|保存配置/i }).click();

  await expect.poll(() => savedPayload).not.toBeNull();
  expect(savedPayload).toEqual({
    endpoint: 'https://in03-example.cn-beijing.vectordb.zilliz.com.cn:19530',
    token: 'zilliz-secret'
  });
  expect(savedPayload).not.toHaveProperty('collection');
  expect(savedPayload).not.toHaveProperty('database');
  expect(savedPayload).not.toHaveProperty('dimensions');
  expect(savedPayload).not.toHaveProperty('metric');
  expect(savedPayload).not.toHaveProperty('priority');
  expect(savedPayload).not.toHaveProperty('note');
  await expect(page.getByRole('status')).toContainText(/Configuration saved|配置已保存/i);
  await expect(
    page.getByRole('link', { name: /Open vector diagnostics|查看向量诊断/i })
  ).toHaveAttribute('href', '/admin/vector-observability');
  await expect(page.locator('[data-ui="vector-settings-technical-details"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});

test('vector settings reports each failed step and retries only from that step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);
  const profile = structuredClone(baseVectorProfile);
  let embeddingRequests = 0;
  let vectorStoreRequests = 0;

  await page.route('**/api/admin/site-knowledge-vector-profile**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope(profile)) });
      return;
    }
    if (pathname.endsWith('/vector-store')) {
      vectorStoreRequests += 1;
      if (vectorStoreRequests === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'error', error_code: 'vector_store.unavailable', message: 'vector store unavailable' }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope({ ...profile, vector_store: { ...profile.vector_store, endpoint: 'https://example.zilliz.com', token_configured: true } })) });
      return;
    }
    embeddingRequests += 1;
    if (embeddingRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ status: 'error', error_code: 'embedding.unavailable', message: 'embedding unavailable' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildAdminApiEnvelope(profile)) });
  });

  await page.goto('/admin/vector-settings');
  await page.getByLabel('Zilliz Endpoint').fill('https://example.zilliz.com');
  await page.getByLabel('Zilliz Token').fill('zilliz-secret');
  await page.getByRole('button', { name: /Save configuration|保存配置/i }).click();
  const receipt = page.locator('[data-ui="vector-configuration-save-receipt"]');
  await expect(receipt).toContainText(/Embedding configuration:\s+(?:Failed|失败)|Embedding 配置:\s+(?:Failed|失败)/i);
  await expect(receipt).toContainText(/Vector store configuration:\s+(?:Not started|未开始)|Vector store 配置:\s+(?:Not started|未开始)/i);
  expect(vectorStoreRequests).toBe(0);

  await page.getByRole('button', { name: /Retry embedding and continue|重试 Embedding 并继续/i }).click();
  await expect(receipt).toContainText(/Vector store configuration:\s+(?:Failed|失败)|Vector store 配置:\s+(?:Failed|失败)/i);
  expect(embeddingRequests).toBe(2);
  expect(vectorStoreRequests).toBe(1);

  await page.getByRole('button', { name: /Retry vector store only|仅重试 Vector store/i }).click();
  await expect(receipt).toContainText(/Embedding configuration:\s+(?:Completed|已完成)|Embedding 配置:\s+(?:Completed|已完成)/i);
  await expect(receipt).toContainText(/Vector store configuration:\s+(?:Completed|已完成)|Vector store 配置:\s+(?:Completed|已完成)/i);
  expect(embeddingRequests).toBe(2);
  expect(vectorStoreRequests).toBe(2);
});

for (const responseKind of ['unavailable', 'malformed'] as const) {
test(`initial ${responseKind} profile read stays unknown and cannot submit configuration`, async ({ page }) => {
  await installAdminMocks(page);
  let failed = true;
  let writes = 0;
  await page.route('**/api/admin/site-knowledge-vector-profile**', async route => {
    if (route.request().method() !== 'GET') writes += 1;
    await route.fulfill({ status: failed && responseKind === 'unavailable' ? 503 : 200, json: failed
      ? responseKind === 'malformed' ? buildAdminApiEnvelope({}) : { status: 'error', error_code: 'profile.unavailable', message: 'unavailable' }
      : buildAdminApiEnvelope(baseVectorProfile) });
  });
  await page.goto('/admin/vector-settings');
  await expect(page.getByRole('button', { name: /Retry|重试/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Save configuration|保存配置/ })).toHaveCount(0);
  await expect(page.locator('[data-vector-section="validation"]')).toHaveCount(0);
  expect(writes).toBe(0);
  failed = false;
  await page.getByRole('button', { name: /Retry|重试/ }).click();
  await expect(page.locator('[data-vector-section="configuration"]')).toBeVisible();
});
}

test('background index polling preserves endpoint and token drafts and follows nested lifecycle', async ({ page }) => {
  await page.clock.install();
  await installAdminMocks(page);
  const profile = structuredClone(baseVectorProfile);
  // Older servers can still return ready at the top level during site sync.
  profile.status = 'ready';
  profile.validation.index.status = 'awaiting_site_sync';
  profile.vector_store.endpoint = 'https://saved.example.zilliz.com';
  let reads = 0;
  await page.route('**/api/admin/site-knowledge-vector-profile', async route => {
    reads += 1;
    await route.fulfill({ json: buildAdminApiEnvelope(profile) });
  });
  await page.goto('/admin/vector-settings');
  await page.getByLabel('Zilliz Endpoint').fill('https://draft.example.zilliz.com');
  await page.getByLabel('Zilliz Token').fill('draft-test-token');
  const initialReads = reads;
  await page.clock.runFor(15050);
  await expect.poll(() => reads).toBe(initialReads + 1);
  await expect(page.getByLabel('Zilliz Endpoint')).toHaveValue('https://draft.example.zilliz.com');
  await expect(page.getByLabel('Zilliz Token')).toHaveValue('draft-test-token');
  await page.clock.runFor(15050);
  await expect.poll(() => reads).toBe(initialReads + 2);
  await expect(page.getByLabel('Zilliz Endpoint')).toHaveValue('https://draft.example.zilliz.com');
  await expect(page.getByRole('button', { name: /Save configuration|保存配置/ })).toBeDisabled();
  profile.validation.index.status = 'ready';
  await page.clock.runFor(15050);
  await expect.poll(() => reads).toBe(initialReads + 3);
  await expect(page.getByRole('button', { name: /Save configuration|保存配置/ })).toBeEnabled();
  await page.clock.runFor(30050);
  expect(reads).toBe(initialReads + 3);
});

test('saving locks the submitted draft and excludes concurrent index rebuilds', async ({ page }) => {
  await installAdminMocks(page);
  const profile = structuredClone(baseVectorProfile);
  profile.provider.configured = false;
  profile.validation.connection.status = 'ready';
  profile.validation.index.status = 'reindex_required';
  profile.vector_store.endpoint = 'https://saved.example.zilliz.com';
  const writes: string[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/admin/site-knowledge-vector-profile**', async route => {
    const request = route.request();
    if (request.method() !== 'GET') {
      writes.push(new URL(request.url()).pathname);
      if (writes.length === 1) {
        expect(request.postDataJSON()).toEqual({ credential: 'submitted-test-key' });
        await held;
      }
    }
    await route.fulfill({ json: buildAdminApiEnvelope(profile) });
  });
  await page.goto('/admin/vector-settings');
  await page.getByLabel('SiliconFlow API Key').fill('submitted-test-key');
  await page.getByLabel('Zilliz Token').fill('submitted-test-token');
  await page.getByRole('button', { name: /Save configuration|保存配置/ }).click();
  await expect.poll(() => writes.length).toBe(1);
  await expect(page.getByLabel('SiliconFlow API Key')).toBeDisabled();
  await expect(page.getByLabel('Zilliz Endpoint')).toBeDisabled();
  await expect(page.getByLabel('Zilliz Token')).toBeDisabled();
  await expect(page.getByRole('button', { name: /Rebuild vector index|重建向量索引/ })).toBeDisabled();
  release();
  await expect(page.locator('[data-ui="vector-configuration-save-receipt"]')).toContainText(/Configuration saved|配置已保存/);
  expect(writes).toEqual(['/api/admin/site-knowledge-vector-profile', '/api/admin/site-knowledge-vector-profile/vector-store']);
});

test('connection prerequisites and no-hit retrieval evidence have distinct actionable states', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await installAdminMocks(page);
  const profile = structuredClone(baseVectorProfile);
  profile.validation.index.status = 'not_ready';
  profile.validation.retrieval.status = 'no_hit';
  profile.validation.retrieval.last_verified_at = '2026-10-29T03:00:00Z';
  await page.route('**/api/admin/site-knowledge-vector-profile', async route => {
    await route.fulfill({ json: buildAdminApiEnvelope(profile) });
  });
  await page.goto('/admin/vector-settings');
  const validation = page.locator('[data-vector-section="validation"]');
  await expect(validation).toContainText(/Awaiting connection configuration|等待连接配置/);
  await expect(validation).not.toContainText(/Rebuild needed|需要重建/);
  await expect(validation).toContainText(/Searched, no hits|已检索，零命中/);
  await expect(validation).toContainText('2026-10-29T03:00:00Z');
  await expect(validation).toContainText(/0 results|0 条结果/);
  await expect(page.getByRole('button', { name: /Rebuild vector index|重建向量索引/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('vector-evidence-900.png'), fullPage: true });
});

test('failed background reads retain a labelled snapshot and disable writes until read recovery', async ({ page }) => {
  await page.clock.install();
  await installAdminMocks(page);
  const profile = structuredClone(baseVectorProfile);
  profile.validation.index.status = 'awaiting_site_sync';
  let failRead = false;
  await page.route('**/api/admin/site-knowledge-vector-profile', async route => {
    await route.fulfill({ status: failRead ? 503 : 200, json: failRead
      ? { status: 'error', error_code: 'profile.unavailable', message: 'unavailable' }
      : buildAdminApiEnvelope(profile) });
  });
  await page.goto('/admin/vector-settings');
  await page.getByLabel('Zilliz Endpoint').fill('https://draft.example.zilliz.com');
  failRead = true;
  await page.clock.runFor(15050);
  await expect(page.getByText(/The last read snapshot|以下为上次读取的快照/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Save configuration|保存配置/ })).toBeDisabled();
  await expect(page.getByLabel('Zilliz Endpoint')).toHaveValue('https://draft.example.zilliz.com');
  failRead = false;
  profile.validation.index.status = 'ready';
  await page.getByRole('button', { name: /Retry|重试/ }).click();
  await expect(page.getByText(/The last read snapshot|以下为上次读取的快照/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Save configuration|保存配置/ })).toBeEnabled();
  await expect(page.getByLabel('Zilliz Endpoint')).toHaveValue('https://draft.example.zilliz.com');
});
