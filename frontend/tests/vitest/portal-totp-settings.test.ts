import { expect, it } from 'vitest';
import { clearTotpView, dismissTotpCodes, isCurrentTotpOperation, type TotpView } from '@/lib/portal-totp-state';

it('every terminal cleanup drops secret-bearing fields rather than merging them', () => {
  for (const kind of ['loading_status', 'unavailable', 'reauthenticate', 'outcome_unknown'] as const) {
    expect(Object.keys(clearTotpView(kind))).toEqual(['kind']);
  }
});
it('one-time dismissal has no retained codes and cannot reopen a previous batch', () => {
  const visible: TotpView = { kind: 'codes_visible', codes: Array(8).fill('synthetic') };
  const dismissed = dismissTotpCodes(visible);
  expect(dismissed).toEqual({ kind: 'ready', status: { enabled: true, recovery_codes_remaining: 8 } });
  expect(dismissTotpCodes(dismissed)).toBe(dismissed);
});
it('retired operations and authentication epochs cannot resurrect a late secret response', () => {
  expect(isCurrentTotpOperation(4, 4, 2, 2)).toBe(true);
  expect(isCurrentTotpOperation(4, 5, 2, 2)).toBe(false);
  expect(isCurrentTotpOperation(4, 4, 2, 3)).toBe(false);
});

it('renders dynamic recovery counts and expiry in both supported locales', async () => {
  const { translate } = await import('@/lib/i18n');
  for (const locale of ['en', 'zh-CN'] as const) {
    for (const [key, params, number] of [
      ['portal.totp.remaining', { count: '8' }, '8'],
      ['portal.totp.expiry', { seconds: '120' }, '120'],
    ] as const) {
      const result = translate(locale, key, params);
      expect(result.includes(number) && !/[{}]/.test(result)).toBe(true);
    }
  }
});
