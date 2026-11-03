import { describe, expect, it } from 'vitest';
import { requireAccountDetail, validateAccountDirectory } from '@/features/admin/accounts/account-projection';
import { readSavedProfile } from '@/features/admin/accounts/account-operator-profile';
import { readCreatedAccount, readCreationConfirmation } from '@/features/admin/accounts/account-create-confirmation';
const account = { account_id: 'acct_test', name: '', status: 'active', metadata: {} };

describe('required customer projections', () => {
  it('accepts a real empty directory and legitimate blank names', () => {
    expect(() => validateAccountDirectory({ items: [], total: 0 })).not.toThrow();
    expect(requireAccountDetail({ account }, 'acct_test')).toEqual(account);
  });
  it.each([{}, null, { items: null, total: 0 }, { items: [], total: '0' }, { items: [], total: -1 }, { items: [{}], total: 1 }])('rejects malformed directory %j', value => {
    expect(() => validateAccountDirectory(value)).toThrow();
  });
  it.each([{}, { account: null }, { account: { ...account, account_id: 'other' } }, { account: { ...account, status: null } }, { account: { ...account, metadata: [] } }])('rejects unsafe primary object %j', value => {
    expect(() => requireAccountDetail(value, 'acct_test')).toThrow();
  });
  it('uses actual server metadata and requires both normalized operator fields', () => {
    const submitted = { account_id: 'acct_test', values: { operator_display_name: '', operator_note: 'note' } };
    expect(readSavedProfile({ ...account, metadata: { operator_note: 'note', other: 'new' } }, submitted).metadata).toEqual({ operator_note: 'note', other: 'new' });
    expect(() => readSavedProfile({ ...account, metadata: { operator_note: 'different' } }, submitted)).toThrow();
    expect(() => readSavedProfile({}, submitted)).toThrow();
  });
});

describe('creation receipt identity', () => {
  const intent = { operation_id: 'op_123', values: { name: 'Customer', primary_email: 'owner@example.com', operator_display_name: '', operator_note: '', bind_default_free: true } };
  const result = { ...account, name: 'Customer', creation_operation_id: 'op_123', creation_receipt: { operation_id: 'op_123', account_id: 'acct_test', audit_event_id: 1 }, primary_identity: { principal_id: 'p1', email: 'owner@example.com', status: 'active' }, membership: { membership_id: 'm1', role: 'owner', status: 'active' }, current_subscription: { subscription_id: 'sub_free' } };
  it('accepts the exact operation and real owner response', () => expect(readCreatedAccount(result, intent)).toBe('acct_test'));
  it.each([{}, { ...result, creation_operation_id: 'other' }, { ...result, primary_identity: { ...result.primary_identity, email: 'other@example.com' } }, { ...result, membership: {} }, { ...result, current_subscription: null }])('does not manufacture a creation receipt %j', value => {
    expect(() => readCreatedAccount(value, intent)).toThrow();
  });
  it('absence remains unconfirmed, and a confirmed result binds key, generated ID and persisted audit', () => {
    expect(readCreationConfirmation({ operation_id: 'op_123', state: 'unconfirmed', account_id: null, receipt: null }, 'op_123')).toBeNull();
    const confirmed = { operation_id: 'op_123', state: 'confirmed', account_id: 'acct_generated', receipt: { operation_id: 'op_123', account_id: 'acct_generated', audit_event_id: 12 } };
    expect(readCreationConfirmation(confirmed, 'op_123')).toBe('acct_generated');
    expect(() => readCreationConfirmation(confirmed, 'other')).toThrow();
    expect(() => readCreationConfirmation({ ...confirmed, receipt: { ...confirmed.receipt, account_id: 'other' } }, 'op_123')).toThrow();
  });
});

for (const badId of [{}, [], 1, '', '  ']) {
  it(`rejects non-string or blank core creation IDs ${JSON.stringify(badId)}`, () => {
    const intent = { operation_id: 'op_123', values: { name: 'Customer', primary_email: 'owner@example.com', operator_display_name: '', operator_note: '', bind_default_free: true } };
    const valid = { account_id: 'acct_test', name: 'Customer', status: 'active', metadata: {}, creation_operation_id: 'op_123', creation_receipt: { operation_id: 'op_123', account_id: 'acct_test', audit_event_id: 1 }, primary_identity: { principal_id: 'p1', email: 'owner@example.com', status: 'active' }, membership: { membership_id: 'm1', role: 'owner', status: 'active' }, current_subscription: { subscription_id: 'sub_free' } };
    expect(() => readCreatedAccount({ ...valid, primary_identity: { ...valid.primary_identity, principal_id: badId } }, intent)).toThrow();
    expect(() => readCreatedAccount({ ...valid, membership: { ...valid.membership, membership_id: badId } }, intent)).toThrow();
    expect(() => readCreatedAccount({ ...valid, current_subscription: { subscription_id: badId } }, intent)).toThrow();
  });
}
