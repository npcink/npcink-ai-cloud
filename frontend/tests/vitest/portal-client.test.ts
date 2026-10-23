import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/errors';
import { PortalClient } from '@/lib/portal-client';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PortalClient shared transport', () => {
  it('reuses one write key after an unconfirmed failure and releases it after success', async () => {
    vi.stubGlobal('crypto', undefined);
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          error_code: '',
          message: 'created',
          data: { request: { request_id: 'support_1' } },
          meta: { trace_id: 'trace-support-1', revision: 'm6' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          error_code: '',
          message: 'created',
          data: { request: { request_id: 'support_2' } },
          meta: { trace_id: 'trace-support-2', revision: 'm6' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new PortalClient('/api/portal');
    const payload = {
      topic: 'general',
      title: 'Unable to confirm the change',
      description: 'The first response was lost after submission.',
      site_id: '',
      source_path: '/portal/support',
      context: { source: 'test' },
    };

    await expect(client.createSupportRequest(payload)).rejects.toMatchObject({
      errorCode: 'client.network_error',
    });
    await client.createSupportRequest(payload);
    await client.createSupportRequest(payload);

    const firstKey = new Headers(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).headers
    ).get('idempotency-key');
    const retryKey = new Headers(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).headers
    ).get('idempotency-key');
    const nextIntentKey = new Headers(
      (fetchMock.mock.calls[2]?.[1] as RequestInit).headers
    ).get('idempotency-key');
    expect(retryKey).toBe(firstKey);
    expect(nextIntentKey).not.toBe(retryKey);
  });

  it('uses the canonical ApiClient transport for cookie session reads and writes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          error_code: '',
          message: 'loaded',
          data: { site_id: 'site_1', sites: [] },
          meta: { trace_id: 'trace-session', revision: 'm6' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          error_code: '',
          message: 'logged out',
          data: {},
          meta: { trace_id: 'trace-logout', revision: 'm6' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          error_code: '',
          message: 'selected',
          data: { site_id: 'site_1', sites: [] },
          meta: { trace_id: 'trace-select', revision: 'm6' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'ok',
          error_code: '',
          message: 'cancelled',
          data: {},
          meta: { trace_id: 'trace-cancel', revision: 'm6' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new PortalClient('/api/portal');
    const session = await client.getSession();
    await client.logout();
    await client.selectSite('site_1');
    await client.cancelSubscriptionOrder('order_1');

    expect(session.meta.trace_id).toBe('trace-session');
    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(sessionUrl).toBe('/api/portal/session');
    expect(sessionInit.credentials).toBe('include');
    expect(new Headers(sessionInit.headers).has('idempotency-key')).toBe(false);

    const [logoutUrl, logoutInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(logoutUrl).toBe('/api/portal/logout');
    expect(new Headers(logoutInit.headers).get('idempotency-key')).toMatch(
      /^[A-Za-z0-9._:-]{1,128}$/
    );

    const [selectUrl, selectInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(selectUrl).toBe('/api/portal/session/site');
    expect(selectInit.method).toBe('POST');
    expect(new Headers(selectInit.headers).get('idempotency-key')).toMatch(
      /^[A-Za-z0-9._:-]{1,128}$/
    );

    const [cancelUrl, cancelInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect(cancelUrl).toBe('/api/portal/account/subscription-orders/order_1');
    expect(cancelInit.method).toBe('DELETE');
    expect(new Headers(cancelInit.headers).get('idempotency-key')).toMatch(
      /^[A-Za-z0-9._:-]{1,128}$/
    );
  });

  it('throws ApiError when HTTP 200 carries a canonical error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'error',
          error_code: 'auth.portal_session_required',
          message: 'session required',
          data: {},
          meta: { trace_id: 'trace-auth', revision: 'm6' },
        })
      )
    );

    const error = await new PortalClient('/api/portal').getSession().catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 200,
      errorCode: 'auth.portal_session_required',
      traceId: 'trace-auth',
    });
  });
});

const ownSession = { session_id: 'sid_current', is_current: true, created_at: '2026-10-24T00:00:00Z', expires_at: '2026-10-25T00:00:00Z', auth_method: 'email_code', client_hint: null };
const pageData = () => ({ items: [{ ...ownSession }], pagination: { limit: 10, offset: 0, total: 1 } });
const ok = (data: unknown) => jsonResponse({ status: 'ok', error_code: '', message: 'ok', data, meta: { trace_id: '', revision: 'm7' } });

describe('own Portal session registry client', () => {
  it('reads the own active projection without site context or a write key and drops extra fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ ...pageData(), items: [{ ...ownSession, private_body: 'not projected' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new PortalClient('/api/portal').listOwnSessions();
    expect(result.data).toEqual(pageData());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/portal/sessions?limit=10&offset=0');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
    expect(new Headers(init.headers).has('idempotency-key')).toBe(false);
  });

  it('encodes a target, uses the actual per-intent key, and keeps fresh actions distinct after lost responses', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('response lost')).mockImplementation(() => Promise.resolve(ok({ revoked_count: 0 })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new PortalClient('/api/portal');
    await expect(client.revokeOtherSessions('intent_one')).rejects.toMatchObject({ errorCode: 'client.network_error' });
    await client.revokeOtherSessions('intent_one');
    await client.revokeOtherSessions('intent_two');
    await client.revokeOwnSession('sid/with?#', 'target_key');
    expect(fetchMock.mock.calls.map((call) => new Headers(call[1].headers).get('idempotency-key'))).toEqual(['intent_one', 'intent_one', 'intent_two', 'target_key']);
    expect(fetchMock.mock.calls[3][0]).toBe('/api/portal/sessions/sid%2Fwith%3F%23/revoke');
    for (const [, init] of fetchMock.mock.calls) expect(init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store', body: undefined });
  });

  it.each([401, 403, 404, 503])('preserves the real %s error for UI readback decisions', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', error_code: 'portal.session_not_found', message: 'unavailable', data: {}, meta: { trace_id: 'ref', revision: 'm7' } }), { status, headers: { 'content-type': 'application/json' } })));
    await expect(new PortalClient('/api/portal').revokeOwnSession('sid', 'key')).rejects.toMatchObject({ statusCode: status, traceId: 'ref' });
  });

  it('rejects an empty explicit key instead of silently manufacturing another key', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(new PortalClient('/api/portal').revokeOtherSessions('')).rejects.toThrow('Idempotency-Key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([[0, 0], [51, 0], [10, -1], [10, 0.5]])('rejects invalid pagination %s/%s before fetch', async (limit, offset) => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(new PortalClient('/api/portal').listOwnSessions(limit, offset)).rejects.toThrow('Invalid session pagination');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { items: [], pagination: { limit: 10, offset: 0, total: 1 } },
    { ...pageData(), pagination: { limit: 10, offset: 1, total: 1 } },
    { ...pageData(), pagination: { limit: 10, offset: 0, total: -1 } },
    ...[{ session_id: '' }, { is_current: 'true' }, { auth_method: 'totp' }, { client_hint: '' }, { client_hint: 'x'.repeat(121) }, { client_hint: undefined }, { created_at: 'invalid' }, { expires_at: ownSession.created_at }].map((patch) => ({ ...pageData(), items: [{ ...ownSession, ...patch }] })),
    { items: [{ ...ownSession }, { ...ownSession }], pagination: { limit: 10, offset: 0, total: 2 } },
  ])('rejects malformed projections rather than rendering empty/authorized rows', async (data) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(data)));
    await expect(new PortalClient('/api/portal').listOwnSessions()).rejects.toMatchObject({ errorCode: 'client.invalid_session_projection' });
  });

  it.each([-1, 0.5, '1', undefined])('does not accept an invalid revoke count %s as confirmation', async (revoked_count) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ revoked_count })));
    await expect(new PortalClient('/api/portal').revokeOtherSessions('key')).rejects.toMatchObject({ errorCode: 'client.invalid_session_projection' });
  });
});
