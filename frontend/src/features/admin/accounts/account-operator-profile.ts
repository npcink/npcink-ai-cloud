'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';

export type AccountOperatorProfileValues = {
  operator_display_name: string;
  operator_note: string;
};

export type AccountOperatorProfileAccount = AccountOperatorProfileValues & {
  account_id: string;
  name: string;
  status: string;
  metadata: Record<string, unknown>;
};

type AccountOperatorProfilePayload = AccountOperatorProfileValues;

export type SavedAccountOperatorProfile = AccountOperatorProfileValues & {
  metadata: Record<string, unknown>;
};

export function buildAccountOperatorProfilePayload(
  values: AccountOperatorProfileValues
): AccountOperatorProfilePayload {
  return {
    operator_display_name: values.operator_display_name.trim(),
    operator_note: values.operator_note.trim(),
  };
}

export const accountDetailClient = createApiClient({
  idempotencyPrefix: 'admin_account_detail',
});

type UseAccountOperatorProfileOptions = {
  account: AccountOperatorProfileAccount | null;
  errorFallback: string;
  savedNotice: string;
  onSaved: (profile: SavedAccountOperatorProfile) => void;
};

function buildProfileKey(
  accountId: string,
  values: AccountOperatorProfileValues
): string {
  return [
    accountId,
    values.operator_display_name,
    values.operator_note,
  ].join('\u0000');
}

export function useAccountOperatorProfile({
  account,
  errorFallback,
  savedNotice,
  onSaved,
}: UseAccountOperatorProfileOptions) {
  const accountId = account?.account_id || '';
  const operatorDisplayName = account?.operator_display_name || '';
  const operatorNote = account?.operator_note || '';
  const [values, setValues] = useState<AccountOperatorProfileValues>({
    operator_display_name: operatorDisplayName,
    operator_note: operatorNote,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savedProfileKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const nextValues = {
      operator_display_name: operatorDisplayName,
      operator_note: operatorNote,
    };
    setValues(nextValues);
    if (savedProfileKeyRef.current === buildProfileKey(accountId, nextValues)) {
      savedProfileKeyRef.current = null;
      return;
    }
    setNotice(null);
    setError(null);
  }, [accountId, operatorDisplayName, operatorNote]);

  const setField = useCallback(
    (field: keyof AccountOperatorProfileValues, value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
    },
    []
  );

  const submit = useCallback(async () => {
    if (!account) return;

    setIsSaving(true);
    setNotice(null);
    setError(null);
    try {
      const payload = buildAccountOperatorProfilePayload(values);
      await accountDetailClient.request<Record<string, unknown>>(
        `/api/admin/accounts/${encodeURIComponent(account.account_id)}/operator-profile`,
        { method: 'PATCH', body: payload }
      );
      const savedProfile = {
        metadata: { ...account.metadata, ...payload },
        operator_display_name: payload.operator_display_name,
        operator_note: payload.operator_note,
      };
      savedProfileKeyRef.current = buildProfileKey(
        account.account_id,
        savedProfile
      );
      onSaved(savedProfile);
      setNotice(savedNotice);
    } catch (caughtError) {
      setError(resolveUiErrorMessage(caughtError, errorFallback));
    } finally {
      setIsSaving(false);
    }
  }, [account, errorFallback, onSaved, savedNotice, values]);

  return { values, notice, error, isSaving, setField, submit };
}

export type AccountOperatorProfileController = ReturnType<
  typeof useAccountOperatorProfile
>;
