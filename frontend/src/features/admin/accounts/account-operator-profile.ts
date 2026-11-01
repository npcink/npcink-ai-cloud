'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { generateIdempotencyKey, isValidIdempotencyKey } from '@/lib/idempotency';
import { requireAccount, requireAccountDetail, isAccountRecord } from './account-projection';
import { clearCustomerIntent, customerWriteRejected } from './account-pending-intent';

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
  account_id: string;
  name: string;
  status: string;
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
  readFailure: string;
  onSaved: (profile: SavedAccountOperatorProfile) => void;
};

type ProfileIntent = { account_id: string; operation_id: string; values: AccountOperatorProfileValues };
const profileStorageKey = (id: string) => `admin.customer-profile.v1:${id}`;
function readProfileIntent(value: unknown, accountId: string): ProfileIntent {
  if (!isAccountRecord(value) || value.account_id !== accountId
    || typeof value.operation_id !== 'string' || !isValidIdempotencyKey(value.operation_id)
    || !isAccountRecord(value.values) || typeof value.values.operator_display_name !== 'string'
    || typeof value.values.operator_note !== 'string') throw new Error('Invalid profile intent');
  return value as ProfileIntent;
}

export function readSavedProfile(value: unknown, submitted: { account_id: string; values: AccountOperatorProfileValues }): SavedAccountOperatorProfile {
  const account = requireAccount(value, submitted.account_id);
  const metadata = account.metadata as Record<string, unknown>;
  const displayName = metadata.operator_display_name === undefined ? '' : metadata.operator_display_name;
  const note = metadata.operator_note === undefined ? '' : metadata.operator_note;
  if (displayName !== submitted.values.operator_display_name || note !== submitted.values.operator_note) {
    throw new Error('Profile is not confirmed');
  }
  return { account_id: String(account.account_id), name: String(account.name), status: String(account.status), metadata, operator_display_name: String(displayName), operator_note: String(note) };
}

export function useAccountOperatorProfile({ account, errorFallback, savedNotice, readFailure, onSaved }: UseAccountOperatorProfileOptions) {
  const accountId = account?.account_id || '';
  const [values, setValues] = useState<AccountOperatorProfileValues>({ operator_display_name: '', operator_note: '' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [intent, setIntent] = useState<ProfileIntent | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const operationRef = useRef<ProfileIntent | null>(null);
  const busyRef = useRef(false);
  const contextRef = useRef(0);
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; }, [onSaved]);
  useEffect(() => {
    contextRef.current += 1;
    operationRef.current = null;
    busyRef.current = false;
    setIsSaving(false); setIntent(null); setNotice(null); setError(null);
    setReady(false); setStorageBlocked(false);
    try {
      const saved = sessionStorage.getItem(profileStorageKey(accountId));
      if (saved) {
        const restored = readProfileIntent(JSON.parse(saved), accountId);
        operationRef.current = restored; setIntent(restored); setValues(restored.values);
      }
    } catch { setStorageBlocked(true); }
    setReady(true);
    return () => { contextRef.current += 1; };
  }, [accountId]);
  useEffect(() => {
    if (!operationRef.current) setValues({
      operator_display_name: account?.operator_display_name || '', operator_note: account?.operator_note || '',
    });
  }, [accountId, account?.operator_display_name, account?.operator_note]);

  const setField = useCallback((field: keyof AccountOperatorProfileValues, value: string) => {
    if (!busyRef.current && !operationRef.current) setValues(current => ({ ...current, [field]: value }));
  }, []);

  function complete(profile: SavedAccountOperatorProfile, submitted: ProfileIntent, revision: number) {
    clearCustomerIntent(profileStorageKey(submitted.account_id), submitted.operation_id);
    if (contextRef.current !== revision || operationRef.current?.operation_id !== submitted.operation_id) return;
    operationRef.current = null; setIntent(null); setError(null); setValues(profile);
    onSavedRef.current(profile); setNotice(savedNotice);
  }

  async function confirm() {
    const submitted = operationRef.current;
    if (!submitted || busyRef.current) return;
    const revision = contextRef.current;
    busyRef.current = true; setIsSaving(true); setError(null);
    try {
      const response = await accountDetailClient.request<unknown>(`/api/admin/accounts/${encodeURIComponent(submitted.account_id)}`);
      complete(readSavedProfile(requireAccountDetail(response.data, submitted.account_id), submitted), submitted, revision);
    } catch {
      if (contextRef.current === revision) setError(readFailure);
    } finally {
      if (contextRef.current === revision) { busyRef.current = false; setIsSaving(false); }
    }
  }

  async function submit() {
    if (!account || !ready || storageBlocked || busyRef.current || operationRef.current) return;
    const submitted: ProfileIntent = { account_id: account.account_id,
      operation_id: generateIdempotencyKey('admin_customer_profile'), values: buildAccountOperatorProfilePayload(values) };
    try { sessionStorage.setItem(profileStorageKey(submitted.account_id), JSON.stringify(submitted)); }
    catch { setStorageBlocked(true); return; }
    const revision = contextRef.current;
    operationRef.current = submitted; setIntent(submitted);
    busyRef.current = true; setIsSaving(true); setNotice(null); setError(null);
    let needsConfirmation = false;
    try {
      const response = await accountDetailClient.request<unknown>(
        `/api/admin/accounts/${encodeURIComponent(submitted.account_id)}/operator-profile`,
        { method: 'PATCH', body: submitted.values, idempotencyKey: submitted.operation_id },
      );
      complete(readSavedProfile(response.data, submitted), submitted, revision);
    } catch (failure) {
      if (customerWriteRejected(failure, ['service.account_not_found', 'service.validation_error', 'request.validation_error'])) {
        try {
          clearCustomerIntent(profileStorageKey(submitted.account_id), submitted.operation_id);
          if (contextRef.current === revision) { operationRef.current = null; setIntent(null); }
        } catch { /* Keep recovery state when storage cannot be cleared. */ }
        if (contextRef.current === revision) setError(resolveUiErrorMessage(failure, errorFallback));
      } else needsConfirmation = true;
    } finally {
      if (contextRef.current === revision) { busyRef.current = false; setIsSaving(false); }
    }
    if (needsConfirmation && contextRef.current === revision) await confirm();
  }

  return { values, notice, error, isSaving, intent, storageBlocked, setField, submit, confirm,
    dirty: Boolean(account && !intent
      && JSON.stringify(buildAccountOperatorProfilePayload(values))
        !== JSON.stringify(buildAccountOperatorProfilePayload({
          operator_display_name: account.operator_display_name,
          operator_note: account.operator_note,
        }))),
    locked: !ready || !account || storageBlocked || isSaving || Boolean(intent) };
}

export type AccountOperatorProfileController = ReturnType<typeof useAccountOperatorProfile>;
