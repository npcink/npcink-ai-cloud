import type { ApiError } from './errors';

/**
 * The T2 backend is intentionally consumed through this small adapter.  The
 * backend implementation is not part of this local batch, so endpoint and
 * field mapping stays here until B03 freezes the wire contract.
 */
export const PORTAL_SECOND_FACTOR_VERIFY_PATH = '/totp/challenge/complete';
export const PORTAL_SECOND_FACTOR_STATUS_PATH = '/totp/challenge/status';

export type PortalSecondFactorMethod = 'totp' | 'recovery_code';

export type PortalSecondFactorChallengeStatus =
  | 'active'
  | 'retryable'
  | 'expired'
  | 'consumed'
  | 'attempt_limit'
  | 'missing';

export type PortalSecondFactorFailureDisposition = 'retryable' | 'terminal' | 'unknown';

export interface PortalSecondFactorRequired {
  status: 'second_factor_required';
  methods: PortalSecondFactorMethod[];
  expires_at: string | null;
  expires_in_seconds: number | null;
  challenge_id: string | null;
  primary_method: string | null;
}

export interface PortalSecondFactorSubmission {
  method: PortalSecondFactorMethod;
  code: string;
}

export interface PortalSecondFactorStatusResult {
  challenge: PortalSecondFactorRequired | null;
  challenge_status: PortalSecondFactorChallengeStatus | null;
}

export interface PortalSecondFactorFailure {
  challenge: PortalSecondFactorRequired | null;
  challenge_status: PortalSecondFactorChallengeStatus | null;
  disposition: PortalSecondFactorFailureDisposition;
}

export type PortalAuthResult<TSession> = TSession | PortalSecondFactorRequired;

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullablePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function normalizeMethods(value: unknown): PortalSecondFactorMethod[] {
  const raw = Array.isArray(value) ? value : [];
  const methods = raw.filter((method): method is PortalSecondFactorMethod =>
    method === 'totp' || method === 'recovery_code'
  );
  return [...new Set(methods)];
}

function normalizeChallengeStatus(value: unknown): PortalSecondFactorChallengeStatus | null {
  if (value === 'active' || value === 'retryable' || value === 'expired'
    || value === 'consumed' || value === 'attempt_limit' || value === 'missing') {
    return value;
  }
  if (value === 'attempts_exhausted') return 'attempt_limit';
  return null;
}

/**
 * Parse the discriminated restricted-auth response without retaining a
 * challenge credential.  The credential belongs to an HttpOnly cookie and is
 * deliberately absent from this type.
 */
export function parsePortalSecondFactorRequired(value: unknown): PortalSecondFactorRequired | null {
  const record = asRecord(value);
  if (!record || record.status !== 'second_factor_required') return null;

  // B03's current projection intentionally omits methods. The proof route
  // accepts both RFC6238 TOTP and a recovery code, so the client presents both
  // choices until a later wire revision narrows the projection.
  const hasMethods = Object.prototype.hasOwnProperty.call(record, 'methods');
  const methods = normalizeMethods(record.methods);
  if (hasMethods && methods.length === 0) return null;

  return {
    status: 'second_factor_required',
    methods: methods.length > 0 ? methods : ['totp', 'recovery_code'],
    expires_at: nullableString(record.expires_at),
    expires_in_seconds: nullablePositiveInteger(record.expires_in_seconds),
    challenge_id: nullableString(record.challenge_id),
    primary_method: nullableString(record.primary_method),
  };
}

export function isPortalSecondFactorRequired(value: unknown): value is PortalSecondFactorRequired {
  return parsePortalSecondFactorRequired(value) !== null;
}

/**
 * Parse the cookie-bound status bootstrap. The status endpoint may return the
 * current challenge projection directly or wrap it in `challenge`; neither
 * form may carry a secret or bearer token to the browser.
 */
export function parsePortalSecondFactorStatus(value: unknown): PortalSecondFactorStatusResult {
  const record = asRecord(value);
  const challengeRecord = asRecord(record?.challenge);
  const parsedChallenge = parsePortalSecondFactorRequired(challengeRecord ?? record);
  const challengeStatus = normalizeChallengeStatus(
    record?.challenge_status ?? challengeRecord?.challenge_status
  ) || (parsedChallenge ? 'active' : null);
  const terminal = challengeStatus === 'expired' || challengeStatus === 'consumed'
    || challengeStatus === 'attempt_limit' || challengeStatus === 'missing';
  return { challenge: terminal ? null : parsedChallenge, challenge_status: challengeStatus };
}

/**
 * Some error responses put the same discriminated data under `details` or
 * `data`.  This is only metadata; it is never treated as a session.
 */
export function parsePortalSecondFactorFromError(error: unknown): PortalSecondFactorRequired | null {
  const apiError = error as Partial<ApiError> | null;
  const candidates = [apiError?.details, apiError?.rawBody];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    const parsed = parsePortalSecondFactorRequired(record?.data ?? record?.details ?? candidate);
    if (parsed) return parsed;
  }
  return null;
}

function parseChallengeStatusFromError(error: unknown): PortalSecondFactorChallengeStatus | null {
  const apiError = error as Partial<ApiError> | null;
  const candidates = [apiError?.details, apiError?.rawBody];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    const data = asRecord(record?.data) ?? record;
    const status = normalizeChallengeStatus(data?.challenge_status ?? record?.challenge_status);
    if (status) return status;
    const attemptsRemaining = data?.attempts_remaining ?? record?.attempts_remaining;
    if (Number.isSafeInteger(attemptsRemaining) && Number(attemptsRemaining) >= 0) {
      return Number(attemptsRemaining) === 0 ? 'attempt_limit' : 'retryable';
    }
  }
  return null;
}

/**
 * Classify a failed completion without turning a transport failure into a
 * logout. A factor-invalid 401 is authoritative: absent lifecycle metadata it
 * is terminal, while network/client failures remain unknown and preserve the
 * current cookie-bound challenge for a later retry or status bootstrap.
 */
export function parsePortalSecondFactorFailure(error: unknown): PortalSecondFactorFailure {
  const apiError = error as Partial<ApiError> | null;
  const challenge = parsePortalSecondFactorFromError(error);
  const challengeStatus = parseChallengeStatusFromError(error);
  const isFactorInvalid = apiError?.errorCode === 'auth.portal_factor_invalid';
  if (challengeStatus === 'retryable' || challengeStatus === 'active') {
    return { challenge, challenge_status: challengeStatus, disposition: 'retryable' };
  }
  if (challengeStatus === 'expired' || challengeStatus === 'consumed'
    || challengeStatus === 'attempt_limit' || challengeStatus === 'missing'
    || isFactorInvalid) {
    return { challenge: null, challenge_status: challengeStatus, disposition: 'terminal' };
  }
  return { challenge, challenge_status: null, disposition: 'unknown' };
}

/**
 * Keep the submission mapping in one place until B03's final field names are
 * merged.  No challenge token is accepted or serialized by this adapter.
 */
export function buildPortalSecondFactorSubmission(
  submission: PortalSecondFactorSubmission
): Record<string, string> {
  return { method: submission.method, code: submission.code.trim() };
}
