import { describe, expect, it } from 'vitest';
import {
  buildCreateAccountPayload,
  validateCreateAccountForm,
} from '@/features/admin/accounts/create-account-form-model';

describe('Create account form model', () => {
  it('rejects whitespace-only required fields before an API request', () => {
    const result = validateCreateAccountForm({
      account_id: '   ',
      name: '\t',
      primary_email: '',
      operator_display_name: '',
      operator_note: '',
      bind_default_free: true,
    });

    expect(result).toEqual({
      success: false,
      errors: {
        account_id: 'required',
        name: 'required',
        primary_email: 'required',
      },
    });
  });

  it('trims submitted strings and keeps the explicit Free-package choice', () => {
    const result = validateCreateAccountForm({
      account_id: '  acct_new_customer  ',
      name: '  New Customer  ',
      primary_email: '  Owner@Example.COM  ',
      operator_display_name: '  Customer Display  ',
      operator_note: '  Internal launch note  ',
      bind_default_free: false,
    });

    expect(result).toEqual({
      success: true,
      data: {
        account_id: 'acct_new_customer',
        name: 'New Customer',
        primary_email: 'owner@example.com',
        operator_display_name: 'Customer Display',
        operator_note: 'Internal launch note',
        bind_default_free: false,
      },
    });
  });

  it('omits blank optional metadata and preserves the bounded API payload', () => {
    const result = validateCreateAccountForm({
      account_id: 'acct_free',
      name: 'Free Customer',
      primary_email: 'owner@example.com',
      operator_display_name: '   ',
      operator_note: '',
      bind_default_free: true,
    });

    if (!result.success) throw new Error('Expected valid form values');
    expect(buildCreateAccountPayload(result.data)).toEqual({
      account_id: 'acct_free',
      name: 'Free Customer',
      primary_email: 'owner@example.com',
      metadata: {},
      bind_default_free: true,
    });
  });
});
