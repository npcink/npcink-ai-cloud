'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { generateIdempotencyKey, isValidIdempotencyKey } from '@/lib/idempotency';
import { accountDetailClient } from './account-operator-profile';

export type CreditAdjustmentForm = {
  event_type: string;
  ai_credit_delta: string;
  reason: string;
  note: string;
};
type CreditAdjustmentIntent = {
  account_id: string;
  operation_id: string;
  body: { event_type: string; ai_credit_delta: number; reason: string; note: string };
};
export type CreditAdjustmentResult = Record<string, unknown>;
const emptyForm = (): CreditAdjustmentForm => ({ event_type: 'grant', ai_credit_delta: '', reason: '', note: '' });
const storageKey = (accountId: string) => `admin.credit-adjustment.v1:${accountId}`;
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function readIntent(value: unknown, accountId: string): CreditAdjustmentIntent {
  if (!record(value) || value.account_id !== accountId || typeof value.operation_id !== 'string'
    || !isValidIdempotencyKey(value.operation_id) || !record(value.body)
    || !['grant', 'adjustment'].includes(String(value.body.event_type))
    || typeof value.body.ai_credit_delta !== 'number' || !Number.isFinite(value.body.ai_credit_delta)
    || value.body.ai_credit_delta === 0 || typeof value.body.reason !== 'string' || typeof value.body.note !== 'string') {
    throw new Error('Invalid pending credit adjustment');
  }
  return value as CreditAdjustmentIntent;
}

function readAppliedResult(value: unknown, intent: CreditAdjustmentIntent): CreditAdjustmentResult {
  const sourceId = `account_credit_adjustment:${intent.account_id}:${intent.operation_id}`;
  if (!record(value) || value.account_id !== intent.account_id || !record(value.entry)
    || value.entry.account_id !== intent.account_id || typeof value.entry.ledger_entry_id !== 'string'
    || !value.entry.ledger_entry_id || value.entry.source_type !== 'operator_credit_adjustment'
    || value.entry.source_id !== sourceId || value.entry.event_type !== intent.body.event_type
    || value.entry.ai_credit_delta !== Math.round(intent.body.ai_credit_delta * 1e6) / 1e6
    || !record(value.entry.metadata) || value.entry.metadata.reason !== intent.body.reason
    || value.entry.metadata.note !== intent.body.note) {
    throw new Error('Invalid credit adjustment receipt');
  }
  return value;
}

function clearStoredIntent(submitted: CreditAdjustmentIntent) {
  const key = storageKey(submitted.account_id);
  const saved = window.sessionStorage.getItem(key);
  if (saved && readIntent(JSON.parse(saved), submitted.account_id).operation_id === submitted.operation_id) {
    window.sessionStorage.removeItem(key);
  }
}

function clearlyRejected(error: unknown): boolean {
  const codes = [
    'service.credit_adjustment_event_type_invalid', 'service.credit_adjustment_reason_required',
    'service.credit_adjustment_delta_required', 'service.credit_grant_delta_invalid',
    'service.credit_adjustment_subscription_required', 'service.account_not_found',
  ];
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500
    && codes.includes(error.errorCode);
}

export function useAccountCreditAdjustment({ accountId, failureMessage, readFailureMessage, deltaMessage, reasonMessage, onApplied }: {
  accountId: string;
  failureMessage: string;
  readFailureMessage: string;
  deltaMessage: string;
  reasonMessage: string;
  onApplied: (data: CreditAdjustmentResult) => void;
}) {
  const [form, setForm] = useState<CreditAdjustmentForm>(emptyForm);
  const [intent, setIntent] = useState<CreditAdjustmentIntent | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState('');
  const operationRef = useRef<CreditAdjustmentIntent | null>(null);
  const busyRef = useRef(false);
  const contextRevisionRef = useRef(0);
  const activeAccountRef = useRef(accountId);
  const onAppliedRef = useRef(onApplied);
  useEffect(() => { onAppliedRef.current = onApplied; }, [onApplied]);

  useEffect(() => {
    activeAccountRef.current = accountId;
    contextRevisionRef.current += 1;
    busyRef.current = false;
    setPending(false);
    setReady(false);
    setStorageBlocked(false);
    setError('');
    setForm(emptyForm());
    setIntent(null);
    operationRef.current = null;
    try {
      const saved = window.sessionStorage.getItem(storageKey(accountId));
      if (saved) {
        const restored = readIntent(JSON.parse(saved), accountId);
        operationRef.current = restored;
        setIntent(restored);
        setForm({ ...restored.body, ai_credit_delta: String(restored.body.ai_credit_delta) });
      }
    } catch {
      // No write is safe if an earlier intent cannot be retained or recovered.
      setStorageBlocked(true);
    }
    setReady(true);
    return () => { contextRevisionRef.current += 1; };
  }, [accountId]);

  function complete(data: CreditAdjustmentResult, submitted: CreditAdjustmentIntent, revision: number) {
    // A delayed response may outlive a confirmed intent and a newer submission.
    clearStoredIntent(submitted);
    if (activeAccountRef.current !== submitted.account_id || contextRevisionRef.current !== revision) return;
    operationRef.current = null;
    setIntent(null);
    setForm(emptyForm());
    setError('');
    onAppliedRef.current(data);
  }

  async function confirm() {
    const submitted = operationRef.current;
    if (!submitted || busyRef.current) return;
    const revision = contextRevisionRef.current;
    const isCurrent = () => activeAccountRef.current === submitted.account_id && contextRevisionRef.current === revision;
    busyRef.current = true;
    setPending(true);
    setError('');
    try {
      const response = await accountDetailClient.request<unknown>(
        `/api/admin/accounts/${encodeURIComponent(submitted.account_id)}/credit-ledger/adjustments/${encodeURIComponent(submitted.operation_id)}`,
      );
      const data = response.data;
      if (!record(data) || data.account_id !== submitted.account_id || data.operation_id !== submitted.operation_id) {
        throw new Error('Invalid credit adjustment confirmation');
      }
      if (data.state === 'unconfirmed' && data.entry === null) return;
      if (data.state !== 'applied') throw new Error('Invalid credit adjustment state');
      complete(readAppliedResult(data, submitted), submitted, revision);
    } catch (failure) {
      if (isCurrent()) setError(resolveUiErrorMessage(failure, readFailureMessage));
    } finally {
      if (isCurrent()) { busyRef.current = false; setPending(false); }
    }
  }

  async function submit() {
    if (!ready || storageBlocked || operationRef.current || busyRef.current) return;
    const delta = Number(form.ai_credit_delta);
    if (!Number.isFinite(delta) || delta === 0) { setError(deltaMessage); return; }
    if (!form.reason.trim()) { setError(reasonMessage); return; }
    const submitted: CreditAdjustmentIntent = {
      account_id: accountId,
      operation_id: generateIdempotencyKey('admin_credit_adjustment'),
      body: { event_type: form.event_type, ai_credit_delta: delta, reason: form.reason.trim(), note: form.note.trim() },
    };
    try {
      // Persist before dispatch, including a refresh/close during the request.
      window.sessionStorage.setItem(storageKey(accountId), JSON.stringify(submitted));
    } catch {
      setStorageBlocked(true);
      return;
    }
    operationRef.current = submitted;
    setIntent(submitted);
    const revision = contextRevisionRef.current;
    const isCurrent = () => activeAccountRef.current === submitted.account_id && contextRevisionRef.current === revision;
    busyRef.current = true;
    setPending(true);
    setError('');
    let needsConfirmation = false;
    try {
      const response = await accountDetailClient.request<unknown>(
        `/api/admin/accounts/${encodeURIComponent(accountId)}/credit-ledger/adjustments`,
        { method: 'POST', body: submitted.body, idempotencyKey: submitted.operation_id },
      );
      complete(readAppliedResult(response.data, submitted), submitted, revision);
    } catch (failure) {
      if (clearlyRejected(failure)) {
        try {
          clearStoredIntent(submitted);
          if (isCurrent()) { operationRef.current = null; setIntent(null); }
        } catch { /* Retain the intent if its persisted state could not be cleared. */ }
        if (isCurrent()) setError(resolveUiErrorMessage(failure, failureMessage));
      } else {
        needsConfirmation = true;
      }
    } finally {
      if (isCurrent()) { busyRef.current = false; setPending(false); }
    }
    if (needsConfirmation && isCurrent()) await confirm();
  }

  return {
    form, setForm, submit, confirm, intent, pending, ready, storageBlocked, error,
    locked: !ready || storageBlocked || Boolean(intent) || pending,
  };
}
