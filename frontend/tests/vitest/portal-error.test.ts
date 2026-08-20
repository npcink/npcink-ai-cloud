import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/errors';
import {
  formatPortalErrorMessage,
  formatPortalErrorReference,
} from '@/lib/portal-error';

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
