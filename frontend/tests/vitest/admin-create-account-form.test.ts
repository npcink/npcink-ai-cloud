import { describe, expect, it } from 'vitest';
import {
  buildCreateAccountPayload,
  validateCreateAccountForm,
} from '@/features/admin/accounts/create-account-form-model';

describe('Create account form model', () => {
  it('rejects whitespace-only required fields before an API request', () => {
    const result = validateCreateAccountForm({
      name: '\t',
      primary_email: '',
      operator_display_name: '',
      operator_note: '',
      bind_default_free: true,
    });

    expect(result).toEqual({
      success: false,
      errors: {
        name: 'required',
        primary_email: 'required',
      },
    });
  });

  it('trims submitted strings and keeps the explicit Free-package choice', () => {
    const result = validateCreateAccountForm({
      name: '  New Customer  ',
      primary_email: '  Owner@Example.COM  ',
      operator_display_name: '  Customer Display  ',
      operator_note: '  Internal launch note  ',
      bind_default_free: false,
    });

    expect(result).toEqual({
      success: true,
      data: {
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
      name: 'Free Customer',
      primary_email: 'owner@example.com',
      operator_display_name: '   ',
      operator_note: '',
      bind_default_free: true,
    });

    if (!result.success) throw new Error('Expected valid form values');
    expect(buildCreateAccountPayload(result.data)).toEqual({
      name: 'Free Customer',
      primary_email: 'owner@example.com',
      metadata: {},
      bind_default_free: true,
    });
  });
});
