import { describe, expect, it } from 'vitest';
import { accountCreditEvidenceKeys, normalizeAccountCreditLedger, normalizeAccountQuotaSummary } from '@/features/admin/accounts/account-credit-evidence';
import { ledgerFixture, quotaFixture } from '../fixtures/admin-account-evidence';

describe('account credit evidence query identity', () => {
  it('scopes quota and ledger evidence to the exact account', () => {
    expect(accountCreditEvidenceKeys.quota('acct_primary')).toEqual(['admin', 'accounts', 'credit-evidence', 'acct_primary', 'quota-summary']);
    expect(accountCreditEvidenceKeys.ledger('acct_primary')).toEqual(['admin', 'accounts', 'credit-evidence', 'acct_primary', 'credit-ledger']);
    expect(accountCreditEvidenceKeys.quota('acct_other')).not.toEqual(accountCreditEvidenceKeys.quota('acct_primary'));
  });
});
describe('account credit evidence normalization', () => {
  it('keeps quota components and rejects incomplete evidence', () => {
    expect(() => normalizeAccountQuotaSummary('acct_primary', {})).toThrow();
    const payload = { ...quotaFixture('acct_primary'), breakdown: [{ key: 'runs', quantity: 5, unit: 'run', rate: 25, ai_credits: 125 }] };
    expect(normalizeAccountQuotaSummary('acct_primary', payload)).toMatchObject(payload);
  });
  it('keeps a serializer-shaped empty ledger without inventing entries', () => {
    const payload = ledgerFixture('acct_primary');
    expect(normalizeAccountCreditLedger('acct_primary', payload)).toEqual(payload);
  });
  it('rejects a ledger conclusion when item evidence is absent', () => {
    expect(() => normalizeAccountCreditLedger('acct_primary', { account_id: 'acct_primary', summary: {} } as never)).toThrow();
  });
});
