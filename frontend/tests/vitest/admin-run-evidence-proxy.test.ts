import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, POST } from '@/app/api/admin/[...path]/route';

afterEach(() => vi.unstubAllGlobals());

function installBackend(canReview: boolean) {
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({
    status: 'ok', data: url.endsWith('/admin/session') ? {
      principal_id: 'admin-test', identity_type: 'platform_admin', role: 'platform_admin',
      auth_mode: 'session', capabilities: { can_review_diagnostics: canReview },
    } : { items: [{ run_id: 'bounded-run', status: 'failed' }], boundary: { contains_prompt_or_result_payloads: false } },
  }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('forwards an authorized bounded run read with exact time and object filters', async () => {
  const backend = installBackend(true);
  const query = '?recent_minutes=43200&site_id=site-a&capability=text&limit=25';
  const response = await GET(new NextRequest(`https://cloud.test/api/admin/runtime-telemetry/runs${query}`), { params: Promise.resolve({ path: ['runtime-telemetry', 'runs'] }) });
  expect(response.status).toBe(200);
  expect(backend).toHaveBeenCalledTimes(2);
  expect(backend).toHaveBeenLastCalledWith(`http://api:8000/internal/service/admin/runtime-telemetry/runs${query}`, expect.objectContaining({ method: 'GET', cache: 'no-store' }));
  expect(await response.json()).toMatchObject({ data: { items: [{ run_id: 'bounded-run' }] } });
});

it('rejects reads without diagnostics capability before calling the evidence endpoint', async () => {
  const backend = installBackend(false);
  const response = await GET(new NextRequest('https://cloud.test/api/admin/runtime-telemetry/runs'), { params: Promise.resolve({ path: ['runtime-telemetry', 'runs'] }) });
  expect(response.status).toBe(403);
  expect(backend).toHaveBeenCalledOnce();
});

it.each(['runs', 'runs/raw'])('does not expose run writes or raw subpaths: %s', async path => {
  const backend = installBackend(true);
  const context = { params: Promise.resolve({ path: ['runtime-telemetry', ...path.split('/')] }) };
  const request = new NextRequest(`https://cloud.test/api/admin/runtime-telemetry/${path}`, { method: path === 'runs' ? 'POST' : 'GET' });
  const response = path === 'runs' ? await POST(request, context) : await GET(request, context);
  expect(response.status).toBe(404);
  expect(backend).toHaveBeenCalledOnce();
});
