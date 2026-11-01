'use client';

import { useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import { generateIdempotencyKey, isValidIdempotencyKey } from '@/lib/idempotency';
import { isAccountRecord, requireAccount } from './account-projection';
import { clearCustomerIntent, customerWriteRejected } from './account-pending-intent';
import { buildCreateAccountPayload, validateCreateAccountForm, type CreateAccountFormValues } from './create-account-form-model';

const client = createApiClient({ idempotencyPrefix: 'admin_customer_create' });
const storageKey = 'admin.customer-create.v1';
const emptyValues = (): CreateAccountFormValues => ({ name: '', primary_email: '', operator_display_name: '', operator_note: '', bind_default_free: true });
type CreationIntent = { operation_id: string; values: CreateAccountFormValues };

function readIntent(value: unknown): CreationIntent {
  if (!isAccountRecord(value) || typeof value.operation_id !== 'string' || !isValidIdempotencyKey(value.operation_id)
    || !isAccountRecord(value.values) || typeof value.values.name !== 'string' || typeof value.values.primary_email !== 'string'
    || typeof value.values.operator_display_name !== 'string' || typeof value.values.operator_note !== 'string'
    || typeof value.values.bind_default_free !== 'boolean') throw new Error('Invalid creation intent');
  const validated = validateCreateAccountForm(value.values as CreateAccountFormValues);
  if (!validated.success || JSON.stringify(validated.data) !== JSON.stringify(value.values)) throw new Error('Invalid creation values');
  return value as CreationIntent;
}

const nonEmptyId = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());

export function readCreatedAccount(value: unknown, intent: CreationIntent): string {
  const account = requireAccount(value);
  if (account.status !== 'active' || account.creation_operation_id !== intent.operation_id || account.name !== intent.values.name
    || !isAccountRecord(account.primary_identity) || !nonEmptyId(account.primary_identity.principal_id)
    || account.primary_identity.email !== intent.values.primary_email || account.primary_identity.status !== 'active'
    || !isAccountRecord(account.membership) || !nonEmptyId(account.membership.membership_id)
    || account.membership.role !== 'owner' || account.membership.status !== 'active'
    || (account.metadata as Record<string, unknown>).operator_display_name !== (intent.values.operator_display_name || undefined)
    || (account.metadata as Record<string, unknown>).operator_note !== (intent.values.operator_note || undefined)
    || (intent.values.bind_default_free && (!isAccountRecord(account.current_subscription)
      || !nonEmptyId(account.current_subscription.subscription_id)))) throw new Error('Invalid customer creation receipt');
  readCreationConfirmation({ operation_id: intent.operation_id, state: 'confirmed', account_id: account.account_id, receipt: account.creation_receipt }, intent.operation_id);
  return String(account.account_id);
}

export function readCreationConfirmation(value: unknown, operationId: string): string | null {
  if (!isAccountRecord(value) || value.operation_id !== operationId) throw new Error('Invalid creation confirmation');
  if (value.state === 'unconfirmed' && value.account_id === null && value.receipt === null) return null;
  if (value.state !== 'confirmed' || typeof value.account_id !== 'string' || !value.account_id.trim()
    || !isAccountRecord(value.receipt) || value.receipt.operation_id !== operationId
    || value.receipt.account_id !== value.account_id || typeof value.receipt.audit_event_id !== 'number'
    || !Number.isSafeInteger(value.receipt.audit_event_id) || value.receipt.audit_event_id <= 0) throw new Error('Invalid creation receipt');
  return value.account_id;
}

export function useAccountCreation({ onCreated, failureMessage, readFailureMessage, emailConflictMessage = failureMessage, identityUnavailableMessage = failureMessage }: {
  onCreated: (accountId: string, values: CreateAccountFormValues) => void;
  failureMessage: string;
  readFailureMessage: string;
  emailConflictMessage?: string;
  identityUnavailableMessage?: string;
}) {
  const [values, setValues] = useState(emptyValues);
  const [intent, setIntent] = useState<CreationIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState('');
  const [confirmedId, setConfirmedId] = useState('');
  const operationRef = useRef<CreationIntent | null>(null);
  const busyRef = useRef(false);
  const revisionRef = useRef(0);
  const onCreatedRef = useRef(onCreated);
  useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);
  useEffect(() => {
    revisionRef.current += 1;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) { const restored = readIntent(JSON.parse(saved)); operationRef.current = restored; setIntent(restored); setValues(restored.values); }
    } catch { setStorageBlocked(true); }
    setReady(true);
    return () => { revisionRef.current += 1; };
  }, []);

  function complete(accountId: string, submitted: CreationIntent, revision: number) {
    clearCustomerIntent(storageKey, submitted.operation_id);
    if (revisionRef.current !== revision || operationRef.current?.operation_id !== submitted.operation_id) return;
    operationRef.current = null; setIntent(null); setError(''); setConfirmedId(accountId);
    onCreatedRef.current(accountId, submitted.values);
  }
  async function confirm() {
    const submitted = operationRef.current;
    if (!submitted || busyRef.current) return;
    const revision = revisionRef.current;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await client.request<unknown>(`/api/admin/accounts/creation-operations/${encodeURIComponent(submitted.operation_id)}?${new URLSearchParams({ primary_email: submitted.values.primary_email })}`);
      const accountId = readCreationConfirmation(response.data, submitted.operation_id);
      if (accountId) complete(accountId, submitted, revision);
    } catch { if (revisionRef.current === revision) setError(readFailureMessage); }
    finally { if (revisionRef.current === revision) { busyRef.current = false; setBusy(false); } }
  }
  async function submit(normalized: CreateAccountFormValues) {
    if (!ready || storageBlocked || operationRef.current || busyRef.current || confirmedId) return;
    const submitted = { operation_id: generateIdempotencyKey('admin_customer_create'), values: normalized };
    try { sessionStorage.setItem(storageKey, JSON.stringify(submitted)); }
    catch { setStorageBlocked(true); return; }
    const revision = revisionRef.current;
    operationRef.current = submitted; setIntent(submitted); setValues(normalized);
    busyRef.current = true; setBusy(true); setError('');
    let needsConfirmation = false;
    try {
      const response = await client.request<unknown>('/api/admin/accounts', {
        method: 'POST', body: buildCreateAccountPayload(normalized), idempotencyKey: submitted.operation_id,
      });
      complete(readCreatedAccount(response.data, submitted), submitted, revision);
    } catch (failure) {
      if (customerWriteRejected(failure, ['service.single_account_membership_limit', 'service.principal_access_required', 'service.validation_error', 'request.validation_error', 'service.primary_email_invalid'])) {
        try {
          clearCustomerIntent(storageKey, submitted.operation_id);
          if (revisionRef.current === revision) { operationRef.current = null; setIntent(null); }
        } catch { /* Preserve recovery rather than release a possibly persisted intent. */ }
        if (revisionRef.current === revision) setError(failure instanceof ApiError && failure.errorCode === 'service.single_account_membership_limit'
          ? emailConflictMessage : failure instanceof ApiError && failure.errorCode === 'service.principal_access_required'
            ? identityUnavailableMessage : failureMessage);
      } else needsConfirmation = true;
    } finally { if (revisionRef.current === revision) { busyRef.current = false; setBusy(false); } }
    if (needsConfirmation && revisionRef.current === revision) await confirm();
  }
  function setField<K extends keyof CreateAccountFormValues>(key: K, value: CreateAccountFormValues[K]) {
    if (!operationRef.current && !busyRef.current) setValues(current => ({ ...current, [key]: value }));
  }
  function reset() { if (!operationRef.current && !busyRef.current) { setValues(emptyValues()); setError(''); } }
  return { values, setField, reset, submit, confirm, intent, busy, storageBlocked, error, confirmedId,
    locked: !ready || storageBlocked || Boolean(intent) || busy || Boolean(confirmedId) };
}
