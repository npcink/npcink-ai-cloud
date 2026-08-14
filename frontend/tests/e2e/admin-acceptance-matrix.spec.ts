import { expect, test, type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test';
import acceptanceMatrix from '../../admin-acceptance-matrix.json' with { type: 'json' };
import { buildAdminApiEnvelope, installAdminMocks } from './helpers/admin-operator-fixture';

type RouteAcceptance = (typeof acceptanceMatrix.routes)[number];

function installBrowserFailureCapture(page: Page) {
  const failures: string[] = [];

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request: Request) => {
    const reason = request.failure()?.errorText || 'unknown request failure';
    const requestUrl = new URL(request.url());
    const isExpectedAbort = reason === 'net::ERR_ABORTED' && (
      request.resourceType() === 'document' || requestUrl.searchParams.has('_rsc')
    );
    if (!isExpectedAbort) failures.push(`requestfailed: ${request.method()} ${request.url()} (${reason})`);
  });
  page.on('response', (response: Response) => {
    if (response.status() >= 500) failures.push(`response: ${response.status()} ${response.url()}`);
  });

  return failures;
}

async function installRouteAcceptanceMocks(page: Page, routePattern: string) {
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

async function expectDesktopRouteBaseline(page: Page, route: RouteAcceptance) {
  await expect(page.locator('main')).toBeVisible();
  await expect.poll(async () => page.locator('h1:visible').count()).toBe(1);

  if ('expectedLandingPath' in route) {
    await expect(page).toHaveURL(new RegExp(`${route.expectedLandingPath.replaceAll('/', '\\/')}/?$`));
  } else {
    await expect(page).toHaveURL(new RegExp(`${route.smokePath.split('?')[0].replaceAll('/', '\\/')}(?:\\?|$)`));
  }

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.documentWidth, `${route.routePattern} must not overflow the desktop viewport`).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1
  );
}

test.describe('current-master Admin route acceptance matrix', () => {
  test.use({ viewport: acceptanceMatrix.viewport });

  for (const route of acceptanceMatrix.routes) {
    test(`${route.routePattern} is reachable with one page title and no desktop overflow`, async ({ page }) => {
      const browserFailures = installBrowserFailureCapture(page);
      await installAdminMocks(page);
      await installRouteAcceptanceMocks(page, route.routePattern);

      await page.goto(route.smokePath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await expectDesktopRouteBaseline(page, route);

      expect(browserFailures, `${route.routePattern} emitted unexplained browser failures`).toEqual([]);
    });
  }
});
