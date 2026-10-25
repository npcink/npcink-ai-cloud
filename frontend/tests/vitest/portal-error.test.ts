import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/errors';
import {
  formatPortalErrorMessage,
  formatPortalErrorReference,
  formatPortalWriteErrorMessage,
} from '@/lib/portal-error';
import { translate as localize, type Locale } from '@/lib/i18n';
import {
  classifyPortalWriteFailure, PortalWriteNotDispatchedError, PortalWriteOutcomeError,
} from '@/lib/portal-write-outcome';

const translate = (
  _key: string,
  _params?: Record<string, string>,
  fallback = ''
) => fallback;

function apiError(errorCode: string, message: string, traceId = ''): ApiError {
  return new ApiError({
    statusCode: 400,
    errorCode,
    message,
    traceId,
  });
}

describe('Portal customer-safe errors', () => {
  it('explains paused sales and order throttling without exposing backend text', () => {
    expect(formatPortalErrorMessage(
      apiError('service.commercial_temporarily_paused', 'internal flag detail'), translate, 'Try again.'
    )).toContain('Existing orders and benefits remain available');
    const error = new ApiError({
      statusCode: 429, errorCode: 'portal.subscription_order_rate_limited',
      message: 'internal limit detail', details: { retry_after_seconds: 42 },
    });
    expect(formatPortalErrorMessage(error, translate, 'Try again.')).toBe(
      'Too many requests. Try again in 42 seconds.'
    );
  });

  it('keeps internal codes out of the primary customer message', () => {
    const error = apiError('auth.portal_login_code_invalid', 'internal auth detail', 'trace-login');

    expect(formatPortalErrorMessage(error, translate, 'Try again.')).toBe(
      'The verification code is invalid or expired. Request a new code and try again.'
    );
    expect(formatPortalErrorReference(error)).toBe('trace-login');
  });

  it('uses the safe fallback for an unmapped backend error', () => {
    const error = apiError('service.unmapped_internal_failure', 'database host failed');

    expect(formatPortalErrorMessage(error, translate, 'Please retry this action.')).toBe(
      'Please retry this action.'
    );
    expect(formatPortalErrorReference(error)).toBe('service.unmapped_internal_failure');
  });

  it('distinguishes unbound, inactive, and suspended site recovery messages', () => {
    expect(formatPortalErrorMessage(
      apiError('auth.site_not_found', 'site is not found'),
      translate,
      'Try again.'
    )).toContain('not connected');
    expect(formatPortalErrorMessage(
      apiError('auth.site_inactive', 'site is bound but Cloud service is inactive'),
      translate,
      'Try again.'
    )).toContain('currently inactive');
    expect(formatPortalErrorMessage(
      apiError('auth.site_suspended', 'site is suspended by an operator'),
      translate,
      'Try again.'
    )).toContain('is suspended');
  });

  it('keeps connector, quota, and transient service faults actionable', () => {
    expect(formatPortalErrorMessage(
      apiError('provider_connection.auth_failed', 'provider rejected credential'),
      translate,
      'Try again.'
    )).toContain('credential was rejected');
    expect(formatPortalErrorMessage(
      apiError('commercial.quota_exceeded', 'account quota exceeded'),
      translate,
      'Try again.'
    )).toContain('account has reached');
    expect(formatPortalErrorMessage(
      apiError('service.entitlements_temporarily_unavailable', 'database unavailable'),
      translate,
      'Try again.'
    )).toContain('temporarily unavailable');
  });

  it.each([
    ['auth.site_not_found', 'foreign account site exists', 'not connected'],
    ['auth.site_inactive', 'internal lifecycle detail', 'currently inactive'],
    ['auth.site_suspended', 'suspension operator note', 'is suspended'],
    ['provider_connection.auth_failed', 'provider credential value', 'credential was rejected'],
    ['commercial.quota_exceeded', 'internal entitlement ledger', 'account has reached'],
    ['media_recognition.media_capacity_exhausted', 'internal capacity admission detail', 'Existing indexed images remain usable and refreshable'],
    [
      'service.entitlements_temporarily_unavailable',
      'database host failed',
      'temporarily unavailable',
    ],
  ])(
    'maps %s to actionable customer copy without backend disclosure',
    (errorCode, backendMessage, expectedCopy) => {
      const message = formatPortalErrorMessage(
        apiError(errorCode, backendMessage),
        translate,
        'Try again.'
      );

      expect(message).toContain(expectedCopy);
      expect(message).not.toContain(backendMessage);
      expect(message).not.toContain(errorCode);
    }
  );
});

it('uses the translated Portal fallback for uncoded English transport failures', () => {
  expect(formatPortalErrorMessage(new Error('fetch failed'), translate, '加载失败，请稍后重试。')).toBe('加载失败，请稍后重试。');
});

const translator = (locale: Locale) => (key: string, params?: Record<string, string>, fallback?: string) => localize(locale, key, params, fallback);
describe('write outcome evidence and localized recovery', () => {
  it.each([
    [502, 'proxy.upstream_unreachable'], [504, 'proxy.upstream_timeout'],
    [503, 'portal.idempotency_persist_failed'], [503, 'portal.idempotency_receipt_unavailable'],
    [500, 'portal.idempotency_response_invalid'], [500, 'portal.idempotency_response_too_large'],
    [400, 'portal.idempotency_persist_failed'], [0, 'client.network_error'],
    [400, 'client.arbitrary'], [408, 'http.408'], [425, 'http.425'], [200, 'service.error'],
  ])('[F01-03] treats %s/%s as unknown without exposing backend prose', (statusCode, errorCode) => {
    const error = new ApiError({ statusCode, errorCode, message: 'PRIVATE <html>cause</html>' });
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(formatPortalWriteErrorMessage(error, translator(locale), 'fallback')).toBe(localize(locale, 'error.portal_write_outcome_unknown'));
    }
    expect(error.statusCode).toBe(statusCode); expect(error.errorCode).toBe(errorCode);
    expect(classifyPortalWriteFailure(new TypeError('PRIVATE raw error'))).toBe('outcome_unknown');
  });

  it.each(['portal.idempotency_in_progress', 'portal.idempotency_indeterminate', 'portal.idempotency_conflict'])(
    '[F01-05] recognizes reconciliation code %s before HTTP status', (errorCode) => {
      for (const statusCode of [200, 409, 503]) {
        const error = new ApiError({ statusCode, errorCode, message: 'PRIVATE' });
        expect(classifyPortalWriteFailure(error)).toBe('reconciliation_required');
        expect(formatPortalWriteErrorMessage(error, translator('zh-CN'), 'fallback')).toBe(localize('zh-CN', 'error.portal_write_outcome_unknown'));
        expect(error.statusCode).toBe(statusCode);
      }
    }
  );

  it('[F01-08] preserves every 403 response field while presenting the prior unknown honestly', () => {
    const details = { reason: 'PRIVATE membership' }; const rawBody = { data: details };
    const original = new ApiError({ statusCode: 403, errorCode: 'auth.membership_denied', message: 'PRIVATE',
      details, traceId: 'trace', requestId: 'request', revision: 'revision', rawBody,
      responseStatusCode: 403, retryAfterSeconds: 7 });
    const wrapped = new PortalWriteOutcomeError(original, 'outcome_unknown');
    for (const field of ['statusCode', 'errorCode', 'message', 'details', 'traceId', 'requestId', 'revision', 'rawBody', 'responseStatusCode', 'retryAfterSeconds'] as const) {
      expect(wrapped[field]).toBe(original[field]);
    }
    expect(wrapped.cause).toBe(original); expect(wrapped.details).toBe(details); expect(wrapped.rawBody).toBe(rawBody);
    expect(details).toEqual({ reason: 'PRIVATE membership' });
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(formatPortalWriteErrorMessage(wrapped, translator(locale), 'fallback')).toBe(localize(locale, 'error.portal_write_outcome_unknown'));
    }
  });

  it.each(['capacity', 'scope_changed'] as const)('[F01-18] only a local not-dispatched subclass proves %s', (reason) => {
    const local = new PortalWriteNotDispatchedError(reason);
    expect(classifyPortalWriteFailure(local)).toBe('not_dispatched');
    const forged = new ApiError({ statusCode: 400, errorCode: local.errorCode, message: 'PRIVATE backend' });
    expect(classifyPortalWriteFailure(forged)).toBe('outcome_unknown');
    for (const locale of ['en', 'zh-CN'] as const) {
      expect(formatPortalWriteErrorMessage(local, translator(locale), 'fallback')).toBe(localize(locale,
        reason === 'capacity' ? 'error.portal_write_not_started' : 'error.portal_write_scope_changed'));
      expect(formatPortalWriteErrorMessage(forged, translator(locale), 'fallback')).toBe(localize(locale, 'error.portal_write_outcome_unknown'));
    }
  });
});
