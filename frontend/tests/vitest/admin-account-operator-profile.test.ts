import { describe, expect, it } from 'vitest';
import {
  buildAccountOperatorProfilePayload,
} from '@/features/admin/accounts/account-operator-profile';

describe('Account operator profile model', () => {
  it('sends only editable operator fields, excluding stale account state and metadata', () => {
    expect(buildAccountOperatorProfilePayload({
      operator_display_name: '  Customer display  ', operator_note: '  Internal note  ',
    })).toEqual({ operator_display_name: 'Customer display', operator_note: 'Internal note' });
  });

  it('sends explicit empty values to clear only the optional operator fields', () => {
    expect(buildAccountOperatorProfilePayload({
      operator_display_name: ' ', operator_note: '',
    })).toEqual({ operator_display_name: '', operator_note: '' });
  });
});
