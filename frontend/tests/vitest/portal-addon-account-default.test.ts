import { describe, expect, it } from 'vitest';
import { resolveDefaultAddonAccountId } from '@/lib/portal-addon-account-default';

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
