import { describe, expect, it } from 'vitest';
import {
  buildAccountOperatorProfilePayload,
  type AccountOperatorProfileAccount,
} from '@/features/admin/accounts/account-operator-profile';

const account: AccountOperatorProfileAccount = {
  account_id: 'acct_customer',
  name: 'Customer',
  status: 'active',
  metadata: {
    source: 'operator',
    operator_display_name: 'Existing display',
    operator_note: 'Existing note',
  },
  operator_display_name: 'Existing display',
  operator_note: 'Existing note',
};

describe('Account operator profile model', () => {
  it('trims editable values and preserves unrelated account metadata', () => {
    expect(
      buildAccountOperatorProfilePayload(account, {
        operator_display_name: '  Customer display  ',
        operator_note: '  Internal note  ',
      })
    ).toEqual({
      account_id: 'acct_customer',
      name: 'Customer',
      status: 'active',
      metadata: {
        source: 'operator',
        operator_display_name: 'Customer display',
        operator_note: 'Internal note',
      },
      bind_default_free: false,
    });
  });

  it('removes blank optional profile fields without changing other metadata', () => {
    const payload = buildAccountOperatorProfilePayload(account, {
      operator_display_name: ' ',
      operator_note: '',
    });

    expect(payload.metadata).toEqual({ source: 'operator' });
  });
});
