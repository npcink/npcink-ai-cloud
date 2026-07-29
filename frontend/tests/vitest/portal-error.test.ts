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
});
