import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyPortalBackendPath } from '@/app/api/portal/_shared';
import { proxy } from '@/proxy';
import { readInstallationState } from '@/lib/installation-state';

vi.mock('@/lib/installation-state', () => ({ readInstallationState: vi.fn() }));
const options = { unreachableCode: 'proxy.portal_get_unreachable', unreachableMessage: 'Portal unavailable' };
const paths = ['totp/challenge/status', 'totp/challenge/complete'];
const request = (path: string, method = 'GET') => new NextRequest(`http://localhost/api/portal/${path}`, {
  method, headers: { cookie: 'portal_totp_challenge=synthetic', origin: 'http://localhost' },
});
function assertPrivate(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  const vary = response.headers.get('vary')?.toLowerCase().split(',').map((part) => part.trim());
  expect(vary).toContain('cookie');
  expect(vary).toContain('authorization');
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each(paths.flatMap((path) => [200, 401, 403, 503].map((status) => ({ path, status }))))(
  'keeps $path backend $status private without changing the wire or clearing cookies', async ({ path, status }) => {
    const body = { status: status === 200 ? 'ok' : 'error', data: { challenge_status: 'missing' } };
    const headers = new Headers({ vary: 'Accept-Language', 'set-cookie': 'portal_totp_challenge=; Path=/; Max-Age=0; HttpOnly' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status, headers })));
    const response = await proxyPortalBackendPath(request(path), `/portal/v1/${path}`, options);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(response.headers.get('vary')).toContain('Accept-Language');
    assertPrivate(response);
  }
);

it.each([
  ['network', () => Promise.reject(new Error('PRIVATE upstream details')), 502],
  ['timeout', () => Promise.reject(new DOMException('PRIVATE timeout', 'TimeoutError')), 504],
  ['invalid JSON', () => Promise.resolve(new Response('{PRIVATE', { headers: { 'content-type': 'application/json', 'set-cookie': 'portal_totp_challenge=; Max-Age=0' } })), 502],
  ['HTML', () => Promise.resolve(new Response('<html>PRIVATE</html>')), 502],
] as const)('keeps a TOTP %s proxy error private and bounded', async (kind, result, status) => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(result));
  const response = await proxyPortalBackendPath(request(paths[1], 'POST'), `/portal/v1/${paths[1]}`, options);
  expect(response.status).toBe(status);
  assertPrivate(response);
  expect(JSON.stringify(await response.json())).not.toContain('PRIVATE');
  if (kind === 'invalid JSON') expect(response.headers.getSetCookie()).toHaveLength(1);
});

it.each(['HEAD', 'OPTIONS', 'PATCH'])('covers TOTP %s framework pass-through and installation rejection', async (method) => {
  vi.mocked(readInstallationState).mockResolvedValue({ ok: true, installationState: 'complete', setupRevision: 'v1', retryAllowed: false });
  assertPrivate(await proxy(request(paths[0], method)));
  vi.mocked(readInstallationState).mockResolvedValue({ ok: false });
  const response = await proxy(request(paths[0], method));
  expect(response.status).toBe(503);
  assertPrivate(response);
});

it('does not classify a TOTP lookalike as a sensitive route', async () => {
  vi.mocked(readInstallationState).mockResolvedValue({ ok: true, installationState: 'complete', setupRevision: 'v1', retryAllowed: false });
  expect((await proxy(request('totp-other'))).headers.has('pragma')).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })));
  expect((await proxyPortalBackendPath(request('totp-other'), '/portal/v1/totp-other', options)).headers.has('pragma')).toBe(false);
});
