import type { Page } from '@playwright/test';
import { buildAdminApiEnvelope } from './admin-operator-fixture';

export async function installRouteAcceptanceMocks(page: Page, routePattern: string) {
  // Route-owned fixtures use the current default window and projection contract.
  // Missing endpoints still fail through installAdminMocks' strict fallback.
  if (routePattern === '/admin/media-observability' || routePattern === '/admin/vector-observability') {
    const media = routePattern === '/admin/media-observability';
    await page.route(`**/api${routePattern}?*`, async (route) => {
      const hours = Number(new URL(route.request().url()).searchParams.get('window_hours') || 336);
      await route.fulfill({ json: buildAdminApiEnvelope({
        ...(media ? { contract_version: 'magick-media-observability-summary-v2', workflow_metadata: {} } : {}),
        generated_at: '2026-10-07T06:00:00Z',
        window: { hours, start_at: new Date(Date.parse('2026-10-07T06:00:00Z') - hours * 3600000).toISOString(), end_at: '2026-10-07T06:00:00Z' },
        totals: media
          ? { jobs_total: 0, succeeded_total: 0, failed_total: 0, success_rate: 0 }
          : { index_jobs_total: 0, index_failed_total: 0, search_queries_total: 0, search_failed_total: 0 },
        health: { status: 'inactive', score: 0, summary: 'No reports in this window.' },
        timeline: [], sites: [], errors: [],
        ...(media ? { formats: [], recent_failures: [] } : { intents: [], index_snapshots: [] }),
      }) });
    });
  }

  if (routePattern === '/admin/runtime-profiles') {
    await page.route('**/api/admin/runtime-profiles', route => route.fulfill({ json: buildAdminApiEnvelope({
      contract_version: 'cloud-hosted-runtime-profiles.v1',
      surface: 'admin_hosted_runtime_profiles',
      projection_kind: 'hosted_runtime_profile_configuration',
      owner: 'cloud_runtime', platform_kind: 'wordpress', connector_id: 'wordpress_ai_connector',
      operation_contract_version: 'wordpress_operation.v1',
      available_instances: { text: [], vision: [], image_generation: [], audio_generation: [] },
      profiles: [],
      boundary: { public_runtime_accepts_raw_model_instance: false, results_write_posture: 'suggestion_only', admin_surface: 'platform_admin_only', direct_wordpress_write: false },
    }) }));

  }

  if (routePattern === '/admin/vector-settings') {
    await page.route('**/api/admin/site-knowledge-vector-profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({
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
            last_tested_at: '2026-08-15T02:00:00Z',
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
            last_tested_at: '',
          },
          validation: {
            connection: { status: 'not_ready', provider_verified: true, vector_store_verified: false },
            index: {
              status: 'empty',
              reason: 'no_source_chunks',
              embedding_space_id: 'siliconflow:BAAI/bge-m3',
              source_document_count: 0,
              source_chunk_count: 0,
              indexed_chunk_count: 0,
              roundtrip_status: 'not_applicable',
              last_reindexed_at: '',
              last_error_code: '',
            },
            retrieval: {
              status: 'pending',
              last_verified_at: '',
              result_count: 0,
              top1_score: 0,
              evidence_source: 'site_knowledge_search_metric',
            },
          },
        })),
      });
    });
  }

  if (routePattern === '/admin/site-compliance') {
    const payload = {
      schema_version: 'site_compliance.v1',
      brand_name: 'Npcink AI',
      operator: {
        entity_name: 'Npcink AI Demo',
        entity_type: 'company',
        public_name: 'Npcink AI',
        registration_or_filing: '',
        service_region: 'China',
      },
      contact: {
        support_email: 'support@example.com',
        support_channel: 'support_request',
        service_hours: '09:00-18:00',
      },
      refund: {
        auto_renewal: false,
        refund_window_days: 14,
        processing_business_days: 5,
        refund_channel: 'original_payment_method',
        request_path: '/support',
        conditions: 'Unused credits may be refunded.',
      },
      retention: [],
      third_parties: [],
      review: {
        operator_confirmed: false,
        legal_review_status: 'reviewing',
        review_note: '',
      },
    };
    const version = {
      version_id: 'compliance_draft_v1',
      version_number: 1,
      updated_at: '2026-08-15T02:00:00Z',
      payload,
      validation: {
        ready_to_publish: false,
        blockers: [],
        warnings: [],
        checked_at: '2026-08-15T02:00:00Z',
      },
    };

    await page.route('**/api/admin/site-compliance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildAdminApiEnvelope({
          draft: version,
          published: null,
          history: [],
          third_party_candidates: [],
          qq_review: { status: 'pending', items: [], manual_external_steps: [] },
        })),
      });
    });
  }
}
