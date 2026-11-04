import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, POST } from '@/app/api/admin/[...path]/route';
afterEach(() => vi.unstubAllGlobals());
function backend(allowed: boolean) {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify({ status: 'ok', data: url.endsWith('/admin/session') ? { principal_id: 'admin', identity_type: 'platform_admin', role: 'platform_admin', auth_mode: 'session', capabilities: { can_manage_billing: allowed } } : { month: '2026-10' } }), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch); return fetch;
}
it.each(['usage-by-family', 'revenue'])('permits only authorized economics read: %s', async endpoint => {
  const fetch = backend(true);
  const response = await GET(new NextRequest(`https://cloud.test/api/admin/economics/${endpoint}?month=2026-10`), { params: Promise.resolve({ path: ['economics', endpoint] }) });
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenLastCalledWith(`http://api:8000/internal/service/admin/economics/${endpoint}?month=2026-10`, expect.objectContaining({ method: 'GET', cache: 'no-store' }));
});
it('denies missing billing capability before querying economics', async () => {
  const fetch = backend(false);
  const response = await GET(new NextRequest('https://cloud.test/api/admin/economics/revenue'), { params: Promise.resolve({ path: ['economics', 'revenue'] }) });
  expect(response.status).toBe(403); expect(fetch).toHaveBeenCalledOnce();
});
it.each(['revenue', 'bills', 'usage-by-family/raw'])('rejects write/unknown subpaths: %s', async endpoint => {
  const fetch = backend(true);
  const path = ['economics', ...endpoint.split('/')];
  const context = { params: Promise.resolve({ path }) };
  const response = endpoint === 'revenue' ? await POST(new NextRequest('https://cloud.test/api/admin/economics/revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), context) : await GET(new NextRequest(`https://cloud.test/api/admin/${path.join('/')}`), context);
  expect(response.status).toBe(404); expect(fetch).toHaveBeenCalledOnce();
});
