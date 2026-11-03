import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import {
  generateIdempotencyKey,
  IdempotencyKeys,
  isValidIdempotencyKey,
} from '@/lib/idempotency';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { ...init, headers });
}

function successEnvelope<T>(data: T) {
  return {
    status: 'ok' as const,
    error_code: '',
    message: 'loaded',
    data,
    meta: {
      trace_id: 'trace-success',
      revision: 'm6',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ApiClient', () => {
  it('[F03-01] normalizes body failure after headers without retaining private bytes', async () => {
    const cause = new Error('PRIVATE body reset');
    const response = new Response(null, { status: 200, headers: { 'x-request-id': 'body-ref' } });
    vi.spyOn(response, 'text').mockRejectedValue(cause);
    const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
    const error = await new ApiClient().request('/api/portal/session').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ statusCode: 0, responseStatusCode: 200, errorCode: 'client.network_error', requestId: 'body-ref', traceId: 'body-ref' });
    expect(error.rawBody).toBeUndefined(); expect(error.details).toBeUndefined(); expect(error.cause).toBe(cause);
    expect(error.message).not.toContain('PRIVATE'); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([200, 401, 503])('[F03-02] records observed HTTP %s while timeout interrupts its body', async (status) => {
    const timeout = new AbortController(); vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const response = new Response(null, { status, headers: { 'x-request-id': 'timeout-ref' } });
    vi.spyOn(response, 'text').mockImplementation(async () => { timeout.abort(); throw new Error('PRIVATE'); });
    const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient().request('/api/portal/session')).rejects.toMatchObject({
      statusCode: 0, responseStatusCode: status, errorCode: 'client.request_timeout', rawBody: undefined, requestId: 'timeout-ref',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('[F03-03] caller abort keeps cancellation semantics even with timeout=%s', async (alsoTimeout) => {
    const caller = new AbortController(); const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const response = new Response(null, { status: 503 });
    vi.spyOn(response, 'text').mockImplementation(async () => { caller.abort(); if (alsoTimeout) timeout.abort(); throw new Error('PRIVATE'); });
    const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
    await expect(new ApiClient().request('/api/portal/session', { signal: caller.signal })).rejects.toMatchObject({
      statusCode: 0, responseStatusCode: 503, errorCode: 'client.network_error', rawBody: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('[F03-04] drops partial ReadableStream bytes on reset', async () => {
    const cause = new Error('PRIVATE stream');
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('PRIVATE partial body')); controller.error(cause);
    } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'application/json' } })));
    const error = await new ApiClient().request('/api/portal/session').catch((e) => e);
    expect(error).toMatchObject({ statusCode: 0, responseStatusCode: 200, errorCode: 'client.network_error' });
    expect(error.rawBody).toBeUndefined(); expect(error.details).toBeUndefined(); expect(error.message).not.toContain('PRIVATE');
  });

  it('returns a validated success envelope and forwards cookie, headers, and signal', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(successEnvelope({ account_id: 'acct_1' }))
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient({
      baseUrl: '/api/portal',
      headers: { 'X-Client': 'portal' },
    });
    const response = await client.request<{ account_id: string }>('/session', {
      headers: { 'X-Request': 'session' },
      signal,
    });

    expect(response.data.account_id).toBe('acct_1');
    expect(response.meta.trace_id).toBe('trace-success');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('/api/portal/session');
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal).not.toBe(signal);
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
    expect(headers.get('x-client')).toBe('portal');
    expect(headers.get('x-request')).toBe('session');
  });

  it('throws one evidence-rich ApiError for an HTTP error envelope', async () => {
    const body = {
      status: 'error',
      error_code: 'service.principal_access_required',
      message: 'principal access is required',
      data: { account_id: 'acct_denied' },
      meta: { trace_id: 'trace-denied', revision: 'm6' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, { status: 403 })));

    const client = new ApiClient();
    await expect(client.request('/api/portal/sites')).rejects.toMatchObject({
      name: 'ApiError',
      statusCode: 403,
      errorCode: 'service.principal_access_required',
      message: 'principal access is required',
      details: { account_id: 'acct_denied' },
      traceId: 'trace-denied',
      revision: 'm6',
      rawBody: body,
    });
  });

  it('fails closed when HTTP 200 carries status:error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'error',
          error_code: 'commercial.quota_exceeded',
          message: 'quota exceeded',
          data: { limit: 10 },
          meta: { trace_id: 'trace-quota', revision: 'm6' },
        })
      )
    );

    await expect(new ApiClient().request('/api/portal/usage')).rejects.toMatchObject({
      statusCode: 200,
      errorCode: 'commercial.quota_exceeded',
      traceId: 'trace-quota',
    });
  });

  it.each([
    ['error envelope', () => jsonResponse({ status: 'error', error_code: 'proxy.portal_backend_timeout', message: 'private', data: {}, meta: { trace_id: '', revision: 'm6' } }, { status: 504, headers: { 'X-Request-ID': 'proxy-reference' } })],
    ['non-JSON', () => new Response('private', { status: 502, headers: { 'content-type': 'text/html', 'X-Request-ID': 'proxy-reference' } })],
    ['invalid JSON', () => new Response('{', { status: 502, headers: { 'content-type': 'application/json', 'X-Request-ID': 'proxy-reference' } })],
    ['invalid envelope', () => jsonResponse({}, { status: 502, headers: { 'X-Request-ID': 'proxy-reference' } })],
  ])('preserves the real response header reference for %s', async (_name, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
    await expect(new ApiClient().request('/api/portal/account/audit-events')).rejects.toMatchObject({ traceId: 'proxy-reference', requestId: 'proxy-reference' });
  });

  it('preserves backend trace evidence separately from the proxy request reference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      status: 'error', error_code: 'auth.portal_session_required', message: 'denied', data: {},
      meta: { trace_id: 'backend-reference', revision: 'm6' },
    }, { status: 401, headers: { 'X-Request-ID': 'proxy-reference' } })));
    await expect(new ApiClient().request('/api/portal/account/audit-summary')).rejects.toMatchObject({
      statusCode: 401, traceId: 'backend-reference', requestId: 'proxy-reference',
    });
  });

  it('fails closed for non-JSON responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>bad gateway</html>', {
          status: 502,
          headers: { 'content-type': 'text/html' },
        })
      )
    );

    await expect(new ApiClient().request('/api/admin/overview')).rejects.toMatchObject({
      statusCode: 502,
      errorCode: 'client.non_json_response',
      rawBody: '<html>bad gateway</html>',
    });
  });

  it('fails closed for an invalid Cloud envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          status: 'ok',
          message: 'missing required evidence',
          data: {},
        })
      )
    );

    await expect(new ApiClient().request('/api/admin/overview')).rejects.toMatchObject({
      statusCode: 200,
      errorCode: 'client.invalid_envelope',
      message: 'missing required evidence',
    });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'automatically sends one valid idempotency key for %s writes',
    async (method) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successEnvelope({ saved: true })));
      vi.stubGlobal('fetch', fetchMock);
      const client = new ApiClient({
        idempotencyPrefix: 'admin_write',
        idempotencyKeyFactory: (prefix) => `${prefix}.${method.toLowerCase()}:fixed`,
      });

      await client.request('/api/admin/accounts', { method });

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get('idempotency-key')).toBe(
        `admin_write.${method.toLowerCase()}:fixed`
      );
      expect(headers.get('idempotency-key')).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    }
  );

  it('serializes write bodies without changing the generated idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successEnvelope({ saved: true })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient({
      idempotencyPrefix: 'admin_write',
      idempotencyKeyFactory: (prefix) => `${prefix}_fixed`,
    });

    await client.request('/api/admin/accounts', {
      method: 'POST',
      body: { name: 'Example' },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('idempotency-key')).toBe('admin_write_fixed');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Example' }));
  });

  it('reuses an explicit idempotency key byte-for-byte across caller retries', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(successEnvelope({ saved: true })))
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient({
      idempotencyKeyFactory: () => 'must_not_be_used',
    });
    const retryKey = 'Portal.retry:ABC-001';

    await client.request('/api/portal/support-requests', {
      method: 'POST',
      idempotencyKey: retryKey,
    });
    await client.request('/api/portal/support-requests', {
      method: 'POST',
      idempotencyKey: retryKey,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(new Headers(init.headers).get('idempotency-key')).toBe(retryKey);
    }
  });

  it.each([
    '',
    ' leading-space',
    'trailing-space ',
    'contains spaces',
    'contains/slash',
    '非-ascii',
    'x'.repeat(129),
  ])('fails closed before fetch for an invalid explicit idempotency key: %j', async (key) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new ApiClient().request('/api/admin/accounts', {
        method: 'PATCH',
        idempotencyKey: key,
      })
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when an idempotency key factory returns an invalid key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new ApiClient({ idempotencyKeyFactory: () => 'invalid factory key' }).request(
        '/api/admin/accounts',
        { method: 'DELETE' }
      )
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed for an explicitly empty Idempotency-Key header', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new ApiClient().request('/api/admin/accounts', {
        method: 'POST',
        headers: { 'Idempotency-Key': '' },
      })
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'] as const)(
    'rejects Idempotency-Key from request options for %s reads',
    async (method) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        new ApiClient().request('/api/portal/session', {
          method,
          idempotencyKey: 'read_key',
        })
      ).rejects.toBeInstanceOf(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each(['GET', 'HEAD'] as const)(
    'rejects Idempotency-Key from headers for %s reads',
    async (method) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        new ApiClient().request('/api/portal/session', {
          method,
          headers: { 'Idempotency-Key': 'read_key' },
        })
      ).rejects.toBeInstanceOf(TypeError);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('generates a bounded safe key from an unsafe oversized prefix', () => {
    const key = generateIdempotencyKey(` portal/write:${'x'.repeat(200)}/unsafe `);

    expect(key.length).toBeLessThanOrEqual(128);
    expect(isValidIdempotencyKey(key)).toBe(true);
    expect(isValidIdempotencyKey('safe.key:with_all-allowed_chars')).toBe(true);
    expect(isValidIdempotencyKey('x'.repeat(129))).toBe(false);
  });

  it('normalizes adversarial long underscore runs before invoking the key factory', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successEnvelope({ saved: true })));
    const idempotencyKeyFactory = vi.fn((prefix: string) => `${prefix}_fixed`);
    vi.stubGlobal('fetch', fetchMock);
    const client = new ApiClient({
      idempotencyPrefix: `${'_'.repeat(100_000)}admin_write${'_'.repeat(100_000)}`,
      idempotencyKeyFactory,
    });

    await client.request('/api/admin/accounts', { method: 'POST' });

    expect(idempotencyKeyFactory).toHaveBeenCalledOnce();
    expect(idempotencyKeyFactory).toHaveBeenCalledWith('admin_write');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('idempotency-key')).toBe('admin_write_fixed');
  });

  it('handles adversarial long hyphen runs with bounded key validation', () => {
    const hyphenRun = '-'.repeat(100_000);
    const key = generateIdempotencyKey(`${hyphenRun}portal_write${hyphenRun}`);

    expect(key).toMatch(/^portal_write_/);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(isValidIdempotencyKey(key)).toBe(true);
    expect(isValidIdempotencyKey(hyphenRun)).toBe(false);
  });

  it('does not expose a session token in the logout idempotency key', () => {
    const sessionToken = 'session-token-must-remain-secret';
    const key = IdempotencyKeys.logout(sessionToken);

    expect(isValidIdempotencyKey(key)).toBe(true);
    expect(key).not.toContain(sessionToken);
  });

  it('wraps network failures in the same ApiError model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const error = await new ApiClient().request('/api/portal/session').catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      statusCode: 0,
      errorCode: 'client.network_error',
      message: 'connection refused',
    });
  });
});

it.each(['envelope', 'html', 'json', 'shape', 'body'])('[F02-14] retains timing evidence across %s failures without scheduling a retry', async (kind) => {
  const payload = { ...successEnvelope({ retry_after_seconds: 7 }), status: 'error', error_code: 'portal.login_code_rate_limited' };
  const response = kind === 'envelope' ? jsonResponse(payload, { status: 429 }) : new Response(kind === 'shape' ? '{}' : 'PRIVATE', { status: 503, headers: { 'content-type': kind === 'html' ? 'text/html' : 'application/json' } });
  response.headers.set('Retry-After', '4');
  if (kind === 'body') vi.spyOn(response, 'text').mockRejectedValue(new Error('PRIVATE'));
  const fetchMock = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetchMock);
  const error = await new ApiClient().request('/api/portal/login/code', { method: 'POST', body: {} }).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError); expect(error.retryAfterSeconds).toBe(4);
  expect(error.statusCode).toBe(kind === 'body' ? 0 : kind === 'envelope' ? 429 : 503);
  expect(error.errorCode).toBe({ envelope: 'portal.login_code_rate_limited', html: 'client.non_json_response', json: 'client.invalid_json_response', shape: 'client.invalid_envelope', body: 'client.network_error' }[kind]);
  if (kind === 'envelope') { expect(error.details).toEqual(payload.data); expect(error.rawBody).toEqual(payload); }
  if (kind === 'html' || kind === 'json') { expect(error.details).toBe('PRIVATE'); expect(error.rawBody).toBe('PRIVATE'); }
  if (kind === 'body') { expect(error.rawBody).toBeUndefined(); expect(error.details).toBeUndefined(); }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
