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

type AccountOperatorProfilePayload = {
  account_id: string;
  name: string;
  status: string;
  metadata: Record<string, unknown>;
  bind_default_free: false;
};

export type SavedAccountOperatorProfile = AccountOperatorProfileValues & {
  metadata: Record<string, unknown>;
};

export function buildAccountOperatorProfilePayload(
  account: AccountOperatorProfileAccount,
  values: AccountOperatorProfileValues
): AccountOperatorProfilePayload {
  const operatorDisplayName = values.operator_display_name.trim();
  const operatorNote = values.operator_note.trim();
  const metadata = { ...account.metadata };

  if (operatorDisplayName) {
    metadata.operator_display_name = operatorDisplayName;
  } else {
    delete metadata.operator_display_name;
  }

  if (operatorNote) {
    metadata.operator_note = operatorNote;
  } else {
    delete metadata.operator_note;
  }

  return {
    account_id: account.account_id,
    name: account.name || account.account_id,
    status: account.status || 'active',
    metadata,
    bind_default_free: false,
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
      const payload = buildAccountOperatorProfilePayload(account, values);
      await accountDetailClient.request<Record<string, unknown>>(
        '/api/admin/accounts',
        { method: 'POST', body: payload }
      );
      const savedProfile = {
        metadata: payload.metadata,
        operator_display_name: String(
          payload.metadata.operator_display_name || ''
        ),
        operator_note: String(payload.metadata.operator_note || ''),
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
