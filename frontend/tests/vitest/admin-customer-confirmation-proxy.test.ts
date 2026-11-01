import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/env', () => ({ getApiBaseUrl: () => 'http://api:8000' }));
vi.mock('@/lib/server-env', () => ({ getInternalAuthToken: () => 'test-internal-token' }));
import { GET, POST } from '@/app/api/admin/[...path]/route';
afterEach(() => vi.unstubAllGlobals());
it('creation confirmation requires account capability and forwards only to the exact admin resource', async () => {
  for (const allowed of [false, true]) {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ status: 'ok', data: url.endsWith('/admin/session') ? {
      principal_id: 'admin', identity_type: 'platform_admin', role: 'platform_admin', auth_mode: 'session', capabilities: { can_manage_accounts: allowed, can_manage_audit: true },
    } : {} }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const path = ['accounts', 'creation-operations', 'op_123'];
    const response = await GET(new NextRequest('https://cloud.test/api/admin/accounts/creation-operations/op_123?primary_email=owner%40example.com', { headers: { cookie: 'npcink_admin_session_token=test' } }), { params: Promise.resolve({ path }) });
    expect(response.status).toBe(allowed ? 200 : 403);
    expect(fetchMock).toHaveBeenCalledTimes(allowed ? 2 : 1);
    if (allowed) expect(fetchMock).toHaveBeenLastCalledWith('http://api:8000/internal/service/admin/accounts/creation-operations/op_123?primary_email=owner%40example.com', expect.objectContaining({ method: 'GET' }));
    const write = await POST(new NextRequest('https://cloud.test/api/admin/accounts/creation-operations/op_123', { method: 'POST', headers: { cookie: 'npcink_admin_session_token=test' }, body: '{}' }), { params: Promise.resolve({ path }) });
    expect(write.status).toBe(404);
  }
});
