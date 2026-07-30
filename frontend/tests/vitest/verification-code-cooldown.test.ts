import { describe, expect, it } from 'vitest';

import { readVerificationCodeRetryAfterSeconds } from '@/hooks/useVerificationCodeCooldown';
import { ApiError } from '@/lib/errors';

describe('verification code cooldown', () => {
  it('reads the exact backend retry-after value from an API error', () => {
    const error = new ApiError({
      statusCode: 429,
      errorCode: 'portal.login_code_rate_limited',
      message: 'rate limited',
      details: { retry_after_seconds: 47.2 },
    });

    expect(readVerificationCodeRetryAfterSeconds(error)).toBe(48);
  });

  it('fails open when retry-after evidence is missing or invalid', () => {
    expect(readVerificationCodeRetryAfterSeconds(new Error('network failed'))).toBe(0);
    expect(readVerificationCodeRetryAfterSeconds(new ApiError({
      statusCode: 429,
      errorCode: 'portal.login_code_rate_limited',
      message: 'rate limited',
      details: { retry_after_seconds: -1 },
    }))).toBe(0);
  });
});
