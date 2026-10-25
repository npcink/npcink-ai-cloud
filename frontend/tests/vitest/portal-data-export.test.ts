import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import * as codeRoute from '@/app/api/portal/account/data-export/code/route';
import * as confirmRoute from '@/app/api/portal/account/data-export/confirm/route';
import { portalClient } from '@/lib/portal-client';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['code', 'confirm'] as const)('[F03-07] %s body reset never creates a Blob or retains partial data', async (operation) => {
  const cause = new Error('PRIVATE-SENTINEL');
  const response = new Response(null);
  vi.spyOn(response, operation === 'code' ? 'json' : 'text').mockRejectedValue(cause);
  const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
  const blob = vi.spyOn(globalThis, 'Blob');
  const pending = operation === 'code'
    ? portalClient.requestDataExportCode('en')
    : portalClient.downloadPersonalData('challenge', '123456');
  const error = await pending.catch((e) => e);
  expect(error).toBe(cause); expect(error.rawBody).toBeUndefined(); expect(error.details).toBeUndefined();
  expect(blob).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(new Headers(fetchMock.mock.calls[0][1].headers).has('idempotency-key')).toBe(false);
});

it.each(['code', 'confirm'] as const)('private cache covers %s success, auth/error, network and parse failures', async (operation) => {
  for (const mode of ['success', 'auth', 'error', 'network', 'parse', 'html']) {
    const fetchMock = vi.fn().mockImplementation(async () => {
      if (mode === 'network') throw new Error('PRIVATE-SENTINEL');
      if (mode === 'html') return new Response('PRIVATE-SENTINEL', { headers: { 'Content-Type': 'text/html' } });
      if (mode === 'parse') return new Response('{PRIVATE-SENTINEL', { headers: { 'Content-Type': 'application/json' } });
      return Response.json({ data: {}, schema: 'cloud-principal-copy.v1' }, { status: mode === 'auth' ? 401 : mode === 'error' ? 413 : 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const handler = operation === 'code' ? codeRoute.POST : confirmRoute.POST;
    const response = await handler(new NextRequest('http://localhost/api/portal/account/data-export/' + operation, {
      method: 'POST', headers: { cookie: 'private-cookie', 'content-type': 'application/json' }, body: '{}',
    }));
    expect(response.status).toBe(mode === 'auth' ? 401 : mode === 'error' ? 413 : ['parse', 'network', 'html'].includes(mode) ? 502 : 200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('vary')).toContain('Authorization');
    expect(await response.text()).not.toContain('PRIVATE-SENTINEL');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/portal/v1/account/data-export/${operation}`);
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('cookie')).toBe('private-cookie');
  }
});

it('uses transient requests without idempotency storage and returns a bounded JSON Blob', async () => {
  const copy = { schema: 'cloud-principal-copy.v1', data: { profile: { principal_id: 'own' } } };
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: { challenge_id: 'challenge', expires_in_seconds: 300 } }))
    .mockResolvedValueOnce(Response.json(copy));
  vi.stubGlobal('fetch', fetchMock);
  expect((await portalClient.requestDataExportCode('en')).challenge_id).toBe('challenge');
  const blob = await portalClient.downloadPersonalData('challenge', '123456');
  expect(JSON.parse(await blob.text())).toEqual(copy);
  for (const [, init] of fetchMock.mock.calls) {
    expect(new Headers((init as RequestInit).headers).has('idempotency-key')).toBe(false);
    expect((init as RequestInit).cache).toBe('no-store');
  }
});

it('does not retain private error bodies', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ body: 'PRIVATE-SENTINEL' }, { status: 400 })));
  try { await portalClient.downloadPersonalData('challenge', '123456'); throw new Error('expected rejection'); }
  catch (error) { expect(JSON.stringify(error)).not.toContain('PRIVATE-SENTINEL'); }
});


it.each(['code', 'confirm'] as const)('%s rejects unsupported methods locally and preserves private OPTIONS semantics', async (operation) => {
  const fetchMock = vi.fn(() => { throw new Error('backend/OTP must not be called'); });
  vi.stubGlobal('fetch', fetchMock);
  const route = operation === 'code' ? codeRoute : confirmRoute;
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
    const response = route[method]();
    expect(response.status).toBe(method === 'OPTIONS' ? 204 : 405);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe('');
    expect(response.headers.get('allow')).toBe('OPTIONS, POST');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
  }
  expect(fetchMock).not.toHaveBeenCalled();
});
