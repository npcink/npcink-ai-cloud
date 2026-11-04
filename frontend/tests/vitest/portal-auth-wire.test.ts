import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors';
import {
  buildPortalSecondFactorSubmission,
  isPortalSecondFactorRequired,
  parsePortalSecondFactorFailure,
  parsePortalSecondFactorFromError,
  parsePortalSecondFactorRequired,
  parsePortalSecondFactorStatus,
  PORTAL_SECOND_FACTOR_STATUS_PATH,
  PORTAL_SECOND_FACTOR_VERIFY_PATH,
} from '@/lib/portal-auth-wire';
import { PortalClient } from '@/lib/portal-client';

afterEach(() => vi.restoreAllMocks());

describe('portal second-factor wire adapter', () => {
  it('accepts only the discriminated restricted state and drops unknown fields', () => {
    const result = parsePortalSecondFactorRequired({
      status: 'second_factor_required',
      methods: ['totp', 'recovery_code', 'totp', 'sms'],
      expires_in_seconds: 300,
      challenge_id: 'challenge-id',
      challenge_secret: 'PRIVATE-SENTINEL',
      token: 'PRIVATE-SENTINEL',
    });

    expect(result).toEqual({
      status: 'second_factor_required',
      methods: ['totp', 'recovery_code'],
      expires_at: null,
      expires_in_seconds: 300,
      challenge_id: 'challenge-id',
      primary_method: null,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE-SENTINEL');
    expect(isPortalSecondFactorRequired(result)).toBe(true);
  });

  it('maps the current B03 projection without inventing a credential', () => {
    expect(parsePortalSecondFactorRequired({
      status: 'second_factor_required',
      expires_at: '2026-10-24T12:00:00+00:00',
    })).toMatchObject({
      status: 'second_factor_required',
      methods: ['totp', 'recovery_code'],
      expires_at: '2026-10-24T12:00:00+00:00',
      challenge_id: null,
    });
  });

  it('recovers the cookie-bound projection from the status bootstrap', () => {
    expect(parsePortalSecondFactorStatus({
      challenge_status: 'active',
      challenge: {
        status: 'second_factor_required',
        methods: ['totp', 'recovery_code'],
        expires_at: '2026-10-24T12:00:00Z',
        token: 'PRIVATE-SENTINEL',
      },
    })).toMatchObject({
      challenge_status: 'active',
      challenge: {
        status: 'second_factor_required',
        methods: ['totp', 'recovery_code'],
        expires_at: '2026-10-24T12:00:00Z',
      },
    });
    expect(JSON.stringify(parsePortalSecondFactorStatus({
      challenge: { status: 'second_factor_required', token: 'PRIVATE-SENTINEL' },
    }))).not.toContain('PRIVATE-SENTINEL');
    expect(parsePortalSecondFactorStatus({
      challenge_status: 'consumed',
      challenge: { status: 'second_factor_required', expires_at: '2026-10-24T12:00:00Z' },
    }).challenge).toBeNull();
  });

  it.each([
    undefined,
    null,
    {},
    { status: 'authenticated', methods: ['totp'] },
    { status: 'second_factor_required', methods: [] },
    { status: 'second_factor_required', methods: ['sms'] },
  ])('rejects a non-challenge payload: %j', (payload) => {
    expect(parsePortalSecondFactorRequired(payload)).toBeNull();
  });

  it('finds challenge metadata in an ApiError details envelope', () => {
    expect(parsePortalSecondFactorFromError({
      details: {
        status: 'second_factor_required',
        methods: ['totp'],
        expires_at: '2026-10-24T12:00:00Z',
      },
    })).toMatchObject({
      status: 'second_factor_required',
      methods: ['totp'],
      expires_at: '2026-10-24T12:00:00Z',
    });
  });

  it('classifies authoritative factor failures without retaining a dead challenge', () => {
    for (const challenge_status of ['expired', 'consumed', 'attempt_limit'] as const) {
      expect(parsePortalSecondFactorFailure(new ApiError({
        statusCode: 401,
        errorCode: 'auth.portal_factor_invalid',
        message: 'factor invalid',
        details: { challenge_status },
      })).disposition).toBe('terminal');
    }
    expect(parsePortalSecondFactorFailure(new ApiError({
      statusCode: 401,
      errorCode: 'auth.portal_factor_invalid',
      message: 'factor invalid',
      details: { challenge_status: 'retryable' },
    })).disposition).toBe('retryable');
    expect(parsePortalSecondFactorFailure(new ApiError({
      statusCode: 401,
      errorCode: 'auth.portal_factor_invalid',
      message: 'factor invalid',
    })).disposition).toBe('terminal');
  });

  it('maps remaining-attempt evidence to retryable or terminal lifecycle state', () => {
    expect(parsePortalSecondFactorFailure(new ApiError({
      statusCode: 401,
      errorCode: 'auth.portal_factor_invalid',
      message: 'factor invalid',
      details: { attempts_remaining: 2 },
    })).disposition).toBe('retryable');
    expect(parsePortalSecondFactorFailure(new ApiError({
      statusCode: 401,
      errorCode: 'auth.portal_factor_invalid',
      message: 'factor invalid',
      details: { attempts_remaining: 0 },
    })).challenge_status).toBe('attempt_limit');
    expect(parsePortalSecondFactorFailure(new ApiError({
      statusCode: 401,
      errorCode: 'auth.portal_factor_invalid',
      message: 'factor invalid',
      details: { attempts_remaining: 0 },
    })).disposition).toBe('terminal');
  });

  it('keeps a network failure uncertain so a still-valid cookie can be retried', () => {
    expect(parsePortalSecondFactorFailure(new ApiError({
      statusCode: 0,
      errorCode: 'client.network_error',
      message: 'network unavailable',
    })).disposition).toBe('unknown');
  });

  it('serializes only the method and code for a cookie-bound challenge', () => {
    expect(buildPortalSecondFactorSubmission({ method: 'totp', code: ' 123456 ' })).toEqual({
      method: 'totp',
      code: '123456',
    });
  });

  it('keeps the candidate endpoint mapping isolated and never sends a challenge token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      status: 'ok',
      error_code: '',
      message: '',
      data: { status: 'second_factor_required', methods: ['totp'] },
      meta: { trace_id: 'trace', revision: 'test' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await new PortalClient('/api/portal').verifySecondFactor({ method: 'totp', code: '123456' });
    expect(isPortalSecondFactorRequired(response.data)).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain(PORTAL_SECOND_FACTOR_VERIFY_PATH);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ method: 'totp', code: '123456' });
    expect(String(init.body)).not.toContain('challenge');
    expect(String(init.body)).not.toContain('token');
  });

  it('uses the cookie-bound status bootstrap without a request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      status: 'ok',
      error_code: '',
      message: '',
      data: { status: 'second_factor_required', expires_at: '2026-10-24T12:00:00Z' },
      meta: { trace_id: 'trace', revision: 'test' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await new PortalClient('/api/portal').getSecondFactorStatus();
    expect(parsePortalSecondFactorStatus(response.data).challenge).toMatchObject({
      status: 'second_factor_required',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(PORTAL_SECOND_FACTOR_STATUS_PATH);
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(String(url)).not.toContain('token');
  });
});
