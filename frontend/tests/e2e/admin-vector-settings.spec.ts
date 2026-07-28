import { expect, test } from '@playwright/test';
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

test('vector settings keeps the fixed PC profile and saves the continuous configuration table', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await installAdminMocks(page);

  let savedPayload: Record<string, unknown> | null = null;
  let profile = {
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
      provider_id: 'siliconflow',
      display_name: 'SiliconFlow',
      connection_id: 'site_knowledge_vector_siliconflow',
      configured: true,
      verified: true,
      status: 'ready',
      last_tested_at: '2026-07-13T10:00:00Z'
    },
    vector_store: {
      provider_id: 'zilliz',
      display_name: 'Zilliz Cloud',
      connection_id: 'site_knowledge_vector_zilliz',
      configured: false,
      verified: false,
      status: 'not_configured',
      settings_owner: 'cloud_admin',
      endpoint: '',
      token_configured: false,
      collection: 'site_knowledge_zh_v1',
      last_tested_at: ''
    },
    validation: {
      connection: {
        status: 'not_ready',
        provider_verified: true,
        vector_store_verified: false
      },
      index: {
        status: 'empty',
        reason: 'no_source_chunks',
        embedding_space_id: 'siliconflow:BAAI/bge-m3',
        source_document_count: 0,
        source_chunk_count: 0,
        indexed_chunk_count: 0,
        roundtrip_status: 'not_applicable',
        last_reindexed_at: '',
        last_error_code: ''
      },
      retrieval: {
        status: 'pending',
        last_verified_at: '',
        result_count: 0,
        top1_score: 0,
        evidence_source: 'site_knowledge_search_metric'
      }
    }
  };

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
