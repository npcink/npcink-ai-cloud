import { describe, expect, it } from 'vitest';
import { resolveCurrentAddonAccountId, resolveDefaultAddonAccountId } from '@/lib/portal-addon-account-default';

const a = { account_id: 'acct_a', name: 'A', site_count: 1 };
const b = { account_id: 'acct_b', name: 'B', site_count: 0 };

describe('resolveDefaultAddonAccountId', () => {
  it('preselects the only eligible account', () => {
    expect(resolveDefaultAddonAccountId([a])).toBe('acct_a');
    expect(resolveDefaultAddonAccountId([a], 'acct_other')).toBe('acct_a');
  });
  it('does not preselect among several accounts when current is unknown', () => {
    expect(resolveDefaultAddonAccountId([a, b])).toBe('');
    expect(resolveDefaultAddonAccountId([a, b], '')).toBe('');
    expect(resolveDefaultAddonAccountId([a, b], 'acct_missing')).toBe('');
  });
  it('preselects the current account among several when it is eligible', () => {
    expect(resolveDefaultAddonAccountId([a, b], 'acct_b')).toBe('acct_b');
  });
  it('returns empty for no accounts', () => {
    expect(resolveDefaultAddonAccountId([])).toBe('');
  });
});

describe('resolveCurrentAddonAccountId', () => {
  it('returns the account the API marks as current', () => {
    expect(resolveCurrentAddonAccountId([a, { ...b, is_current: true }])).toBe('acct_b');
  });
  it('returns empty when no account (or an ambiguous set) is marked current', () => {
    expect(resolveCurrentAddonAccountId([a, b])).toBe('');
    expect(resolveCurrentAddonAccountId([{ ...a, is_current: false }, b])).toBe('');
    expect(
      resolveCurrentAddonAccountId([{ ...a, is_current: true }, { ...b, is_current: true }])
    ).toBe('');
  });
  it('preselects the current account among several end-to-end', () => {
    const accounts = [a, { ...b, is_current: true }];
    expect(resolveDefaultAddonAccountId(accounts, resolveCurrentAddonAccountId(accounts))).toBe(
      'acct_b'
    );
    expect(resolveDefaultAddonAccountId([a, b], resolveCurrentAddonAccountId([a, b]))).toBe('');
  });
});
