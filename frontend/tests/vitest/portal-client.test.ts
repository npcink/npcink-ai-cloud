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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const supportIntent = {
  topic: 'general', title: 'Recovery', description: 'Explicit user intent',
  site_id: '', source_path: '/portal/support', context: { source: 'test' },
};
function writeResponse(status = 200, code = ''): Response {
  return new Response(JSON.stringify({
    status: code ? 'error' : 'ok', error_code: code, message: 'PRIVATE backend detail',
    data: { request: { request_id: 'support_1' } },
    meta: { trace_id: 'write-ref', revision: 'r1' },
  }), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'request-ref' } });
}
function writeFixture() {
  vi.stubGlobal('crypto', undefined);
  const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>();
  vi.stubGlobal('fetch', fetchMock);
  const client = new PortalClient('/api/portal');
  return {
    client, fetchMock,
    write: (title = supportIntent.title) => client.createSupportRequest({ ...supportIntent, title }),
    keys: () => fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('idempotency-key')),
  };
}
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('bounded Portal write intentions', () => {
  it('[F03-05] keeps a write key when HTTP 200 arrives but its body resets', async () => {
    const f = writeFixture(); const response = new Response(null, { status: 200 });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('PRIVATE partial response'));
    f.fetchMock.mockResolvedValueOnce(response).mockResolvedValueOnce(writeResponse());
    await expect(f.write()).rejects.toMatchObject({ statusCode: 0, responseStatusCode: 200, errorCode: 'client.network_error' });
    await f.write(); expect(f.keys()[1]).toBe(f.keys()[0]); expect(f.fetchMock).toHaveBeenCalledTimes(2);
  });
  it('[F01-01] retains a lost-response key until success, then starts an independent intent', async () => {
    const f = writeFixture();
    f.fetchMock.mockRejectedValueOnce(new Error('lost')).mockImplementation(async () => writeResponse());
    await expect(f.write()).rejects.toMatchObject({ errorCode: 'client.network_error' });
    await f.write(); await f.write();
    expect(f.keys()[1]).toBe(f.keys()[0]); expect(f.keys()[2]).not.toBe(f.keys()[0]);
    expect(f.fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [502, 'proxy.upstream_unreachable'], [504, 'proxy.upstream_timeout'],
    [503, 'portal.idempotency_persist_failed'], [503, 'portal.idempotency_receipt_unavailable'],
    [500, 'portal.idempotency_response_invalid'], [500, 'portal.idempotency_response_too_large'],
    [408, 'http.408'], [425, 'http.425'], [200, 'service.error'],
    [409, 'portal.idempotency_in_progress'], [409, 'portal.idempotency_indeterminate'],
    [409, 'portal.idempotency_conflict'],
  ])('[F01-02 F01-04 F01-09] preserves %s/%s and its key without scheduled requests', async (status, code) => {
    vi.useFakeTimers();
    const f = writeFixture(); f.fetchMock.mockImplementation(async () => writeResponse(status, code));
    await expect(f.write()).rejects.toMatchObject({ statusCode: status, errorCode: code, traceId: 'write-ref', requestId: 'request-ref' });
    await vi.advanceTimersByTimeAsync(7 * 86_400_000);
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
    await expect(f.write()).rejects.toMatchObject({ errorCode: code });
    expect(f.keys()[1]).toBe(f.keys()[0]); expect(f.fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 429])('[F01-06] releases an initially definite %s rejection', async (status) => {
    const f = writeFixture(); f.fetchMock.mockImplementation(async () => writeResponse(status, 'service.rejected'));
    await expect(f.write()).rejects.toMatchObject({ statusCode: status });
    await expect(f.write()).rejects.toMatchObject({ statusCode: status });
    expect(f.keys()[1]).not.toBe(f.keys()[0]); expect(f.fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 429])('[F01-07] keeps uncertainty sticky after later %s', async (status) => {
    const f = writeFixture();
    f.fetchMock.mockResolvedValueOnce(writeResponse(503, 'portal.idempotency_persist_failed'))
      .mockImplementation(async () => writeResponse(status, 'auth.membership_denied'));
    await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    await expect(f.write()).rejects.toMatchObject({ statusCode: status, writeDisposition: 'outcome_unknown', cause: { statusCode: status } });
    await expect(f.write()).rejects.toMatchObject({ statusCode: status, writeDisposition: 'outcome_unknown' });
    expect(new Set(f.keys()).size).toBe(1); expect(f.fetchMock).toHaveBeenCalledTimes(3);
  });

  it('[F01-10] retains a key while any same-intent attempt remains pending', async () => {
    const f = writeFixture(); const first = deferredResponse(); const second = deferredResponse();
    f.fetchMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockImplementation(async () => writeResponse(403, 'auth.denied'));
    const a = f.write().catch((error) => error); const b = f.write().catch((error) => error);
    await vi.waitFor(() => expect(f.fetchMock).toHaveBeenCalledTimes(2));
    first.resolve(writeResponse(400, 'service.rejected')); await a;
    await expect(f.write()).rejects.toMatchObject({ statusCode: 403 });
    second.resolve(writeResponse(403, 'auth.denied')); await b;
    await expect(f.write()).rejects.toMatchObject({ statusCode: 403 });
    expect(new Set(f.keys().slice(0, 3)).size).toBe(1); expect(f.keys()[3]).not.toBe(f.keys()[0]);
  });

  it('[F01-11] late failure cannot restore a successful old entry or remove its replacement', async () => {
    const f = writeFixture(); const a = deferredResponse(); const b = deferredResponse();
    f.fetchMock.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
      .mockResolvedValueOnce(writeResponse(503, 'service.busy')).mockResolvedValueOnce(writeResponse());
    const first = f.write(); const late = f.write().catch((error) => error);
    await vi.waitFor(() => expect(f.fetchMock).toHaveBeenCalledTimes(2));
    a.resolve(writeResponse()); await first;
    await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    b.resolve(writeResponse(403, 'auth.denied')); await late;
    await f.write();
    expect(f.keys()[0]).toBe(f.keys()[1]); expect(f.keys()[2]).not.toBe(f.keys()[0]); expect(f.keys()[3]).toBe(f.keys()[2]);
  });

  it.each([true, false])('[F01-12] preserves uncertainty in either settlement order (%s)', async (unknownFirst) => {
    const f = writeFixture(); const a = deferredResponse(); const b = deferredResponse();
    f.fetchMock.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise).mockResolvedValueOnce(writeResponse());
    const p = f.write().catch((e) => e); const q = f.write().catch((e) => e);
    await vi.waitFor(() => expect(f.fetchMock).toHaveBeenCalledTimes(2));
    a.resolve(writeResponse(unknownFirst ? 503 : 403, 'service.first')); await p;
    b.resolve(writeResponse(unknownFirst ? 403 : 503, 'service.second')); await q;
    await f.write(); expect(new Set(f.keys()).size).toBe(1);
  });

  it('[F01-13 F01-14] keeps site A intentions across B and ordinary same-context reads', async () => {
    const f = writeFixture();
    f.fetchMock.mockImplementation(async (url) => String(url).endsWith('/session') ? writeResponse() : writeResponse(503, 'service.busy'));
    f.client.setWriteIntentContext('A'); await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    f.client.setWriteIntentContext('B'); await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    f.client.setWriteIntentContext('A'); f.client.setWriteIntentContext('A');
    await f.client.getSession(); await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    expect(f.keys()[0]).not.toBe(f.keys()[1]); expect(f.keys()[3]).toBe(f.keys()[0]); expect(f.keys()[2]).toBeNull();
    await expect(f.write('Different payload')).rejects.toMatchObject({ statusCode: 503 });
    expect(f.keys()[4]).not.toBe(f.keys()[0]); expect(f.fetchMock).toHaveBeenCalledTimes(5);
  });

  it.each([200, 403])('[F01-15] old epoch settlement %s cannot delete the new epoch intent', async (status) => {
    const f = writeFixture(); const old = deferredResponse();
    f.fetchMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(writeResponse(503, 'service.busy')).mockResolvedValueOnce(writeResponse());
    const pending = f.write().catch((e) => e); await vi.waitFor(() => expect(f.fetchMock).toHaveBeenCalledTimes(1));
    f.client.resetWriteIntentScope(); expect(f.fetchMock).toHaveBeenCalledTimes(1);
    await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    old.resolve(writeResponse(status, status === 200 ? '' : 'auth.denied')); await pending; await f.write();
    expect(f.keys()[1]).not.toBe(f.keys()[0]); expect(f.keys()[2]).toBe(f.keys()[1]);
  });

  it('[F01-14] separates method, path and exact JSON serialization without dropping older intentions', async () => {
    const f = writeFixture(); f.fetchMock.mockImplementation(async () => writeResponse(503, 'service.busy'));
    const { context, ...fields } = supportIntent;
    await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    await expect(f.client.createSupportRequest({ context, ...fields })).rejects.toMatchObject({ statusCode: 503 });
    await expect(f.client.deleteSupportRequestAttachment('one', 'attachment')).rejects.toMatchObject({ statusCode: 503 });
    await expect(f.client.deleteSupportRequestAttachment('two', 'attachment')).rejects.toMatchObject({ statusCode: 503 });
    await expect(f.write()).rejects.toMatchObject({ statusCode: 503 });
    expect(new Set(f.keys().slice(0, 4)).size).toBe(4); expect(f.keys()[4]).toBe(f.keys()[0]);
  });

  it.each(['epoch', 'context'])('[F01-16] refuses before fetch when %s changes during digest', async (scope) => {
    const f = writeFixture(); let release!: (buffer: ArrayBuffer) => void;
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(() => new Promise<ArrayBuffer>((resolve) => { release = resolve; })) } });
    const pending = f.write().catch((e) => e);
    if (scope === 'epoch') f.client.resetWriteIntentScope(); else f.client.setWriteIntentContext('B');
    release(new ArrayBuffer(32));
    await expect(pending).resolves.toMatchObject({ reason: 'scope_changed', errorCode: 'client.portal_write_scope_changed' });
    expect(f.fetchMock).not.toHaveBeenCalled();
    vi.stubGlobal('crypto', undefined); f.fetchMock.mockResolvedValueOnce(writeResponse()); await f.write();
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('[F01-17] protects all 64 unresolved intentions and refuses new work before fetch', async () => {
    const f = writeFixture(); f.fetchMock.mockImplementation(async () => writeResponse(503, 'service.busy'));
    for (let i = 0; i < 64; i += 1) await expect(f.write(`Intent ${i}`)).rejects.toMatchObject({ statusCode: 503 });
    const original = f.keys();
    await expect(f.write('Intent 64')).rejects.toMatchObject({ reason: 'capacity' });
    expect(f.fetchMock).toHaveBeenCalledTimes(64);
    for (let i = 0; i < 64; i += 1) await expect(f.write(`Intent ${i}`)).rejects.toMatchObject({ statusCode: 503 });
    expect(f.keys().slice(64, 128)).toEqual(original);
    f.client.resetWriteIntentScope(); await expect(f.write('Intent 64')).rejects.toMatchObject({ statusCode: 503 });
    expect(f.fetchMock).toHaveBeenCalledTimes(129);
  });
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
