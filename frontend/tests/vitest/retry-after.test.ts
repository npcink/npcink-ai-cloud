import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/errors';
import { parseRetryAfterSeconds as parse, readPortalRateLimitRetryAfterSeconds as read } from '@/lib/retry-after';

const now = Date.parse('2030-01-01T00:00:00.250Z');
const error = (details: unknown, retryAfterSeconds = 30, statusCode = 429, errorCode = 'portal.login_code_rate_limited') => new ApiError({ statusCode, errorCode, message: 'PRIVATE', details, retryAfterSeconds });
describe('bounded Retry-After evidence', () => {
  it('[F02-01] accepts bounded ASCII delta-seconds', () => {
    for (const [raw, expected] of [['0', 0], [' 0004 ', 4], ['86400', 86400]] as const) expect(parse(raw, now)).toBe(expected);
  });
  it('[F02-02] rejects over-cap, unsafe integers and long values without clamping', () => {
    for (const raw of ['86401', '9007199254740993', '0'.repeat(129)]) expect(parse(raw, now)).toBeUndefined();
  });
  it.each(['-1', '+1', '1.5', '1e3', 'NaN', 'Infinity', '', '4,5', '４', '٤'])('[F02-03] rejects non-grammar %s', (raw) => expect(parse(raw, now)).toBeUndefined());
  it('[F02-04] uses canonical IMF date and ceil against an injected clock', () => {
    expect(parse('Tue, 01 Jan 2030 00:00:10 GMT', now)).toBe(10);
  });
  it('[F02-05] retains past zero and exact future cap', () => {
    const integral = now - 250;
    for (const [offset, expected] of [[-1, 0], [0, 0], [86400, 86400], [86401, undefined]] as const) expect(parse(new Date(integral + offset * 1000).toUTCString(), integral)).toBe(expected);
  });
  it.each(['Mon, 01 Jan 2030 00:00:10 GMT', 'Thu, 31 Feb 2030 00:00:00 GMT', '2030-01-01T00:00:10Z', 'Tue, 01 Jan 2030 00:00:10 +0000', 'Tuesday, 01-Jan-30 00:00:10 GMT', 'Tue Jan  1 00:00:10 2030', 'Tue, 01 Jan 2030 00:00:10 GMT, Tue, 01 Jan 2030 00:00:11 GMT'])('[F02-06] rejects noncanonical date %s', (raw) => expect(parse(raw, now)).toBeUndefined());
  it('[F02-07] preserves body precedence without imposing the new header cap', () => {
    expect(read(error({ retry_after_seconds: 47.2 }, 4))).toBe(48);
    expect(read(error({ retry_after_seconds: 47.2 }, 86400))).toBe(48);
    expect(read(error({ retry_after_seconds: 90000 }, 10))).toBe(90000);
  });
  it.each([undefined, null, -1, NaN, Infinity])('[F02-08] falls back from invalid body %s only with opted-in evidence', (value) => {
    expect(read(error({ retry_after_seconds: value }))).toBe(30);
    expect(read(error({ retry_after_seconds: value }, NaN))).toBe(0);
  });
  it.each([[200, 'portal.login_code_rate_limited'], [503, 'portal.login_code_rate_limited'], [400, 'service.commercial_temporarily_paused'], [429, 'http.429'], [429, 'commercial.quota_exceeded'], [429, 'payment.denied']])('[F02-09] does not create timing policy for %s %s', (status, code) => expect(read(error(undefined, 30, Number(status), String(code)))).toBe(0));
  it.each([NaN, Infinity, -1, 1.5, 86401])('[F02-10] distrusts caller metadata %s', (seconds) => expect(read(error(undefined, seconds))).toBe(0));
});
