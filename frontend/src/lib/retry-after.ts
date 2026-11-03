import { ApiError } from './errors';

const MAX_HEADER_SECONDS = 86_400;
const RATE_LIMIT_CODES = new Set([
  'portal.login_code_rate_limited',
  'portal.oauth_state_rate_limited',
  'portal.subscription_order_rate_limited',
  'portal.email_change_rate_limited',
]);

/** Parse only bounded delta-seconds or canonical IMF-fixdate response headers. */
export function parseRetryAfterSeconds(raw: string | null | undefined, nowMs: number): number | undefined {
  if (raw == null) return undefined;
  const value = raw.trim();
  if (!value || value.length > 128) return undefined;
  if (/^[0-9]+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds <= MAX_HEADER_SECONDS ? seconds : undefined;
  }
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toUTCString() !== value || !Number.isFinite(nowMs)) return undefined;
  const seconds = Math.max(0, Math.ceil((timestamp - nowMs) / 1_000));
  return seconds <= MAX_HEADER_SECONDS ? seconds : undefined;
}

/** Preserve the existing body policy; opt in to header timing only for known 429s. */
export function readPortalRateLimitRetryAfterSeconds(error: unknown): number {
  if (!(error instanceof ApiError)) return 0;
  if (error.details && typeof error.details === 'object' && !Array.isArray(error.details)) {
    const seconds = Number((error.details as Record<string, unknown>).retry_after_seconds);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  }
  const seconds = error.retryAfterSeconds;
  return error.statusCode === 429 && RATE_LIMIT_CODES.has(error.errorCode)
    && typeof seconds === 'number' && Number.isSafeInteger(seconds)
    && seconds >= 0 && seconds <= MAX_HEADER_SECONDS ? seconds : 0;
}
