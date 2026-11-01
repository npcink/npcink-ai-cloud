'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import type { AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { generateIdempotencyKey, isValidIdempotencyKey } from '@/lib/idempotency';
import {
  applyPlanParameters, buildInitialForm, formParameters, parameterFields, readPlanConfirmation,
  record, requirePlanDetail, requirePlanWrite, sameParameters, validRevision,
  type PlanConfirmation, type PlanDetailPayload, type PlanIntent, type PlanVersionFormState,
} from './plan-projection';

const client = createApiClient({ idempotencyPrefix: 'admin_plan_management' });
const storageKey = (plan: string) => `admin.plan-parameters.v1:${plan}`;
export function readPlanIntent(value: unknown, plan: string): PlanIntent {
  if (!record(value) || value.plan_id !== plan || typeof value.operation_id !== 'string' || !isValidIdempotencyKey(value.operation_id)
    || typeof value.plan_version_id !== 'string' || !value.plan_version_id.trim() || !validRevision(value.revision) || !record(value.form) || !parameterFields.every(key => typeof (value.form as Record<string, unknown>)[key] === 'string')
    || !sameParameters(value.values, formParameters(value.form as PlanVersionFormState))) throw new Error('Invalid stored plan intent');
  return value as PlanIntent;
}
function clearIntent(intent: PlanIntent) {
  const saved = sessionStorage.getItem(storageKey(intent.plan_id));
  if (!saved || readPlanIntent(JSON.parse(saved), intent.plan_id).operation_id !== intent.operation_id) throw new Error('Pending operation changed');
  sessionStorage.removeItem(storageKey(intent.plan_id));
}
function explicitlyRejected(error: unknown) {
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500
    && ['service.admin_plan_revision_conflict', 'service.plan_offer_amount_invalid', 'request.validation_error', 'service.validation_error'].includes(error.errorCode);
}

type Messages = { load: string; save: string; unknown: string; confirmed: string };
export function usePlanEditor(planId: string, open: boolean, messages: Messages, onConfirmed: (current: PlanConfirmation) => void) {
  const [lastReceipt, setLastReceipt] = useState<AdminMutationReceiptPayload | null>(null);
  const [detail, setDetail] = useState<PlanDetailPayload | null>(null);
  const [form, setForm] = useState(() => buildInitialForm(null));
  const [intent, setIntent] = useState<PlanIntent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [salesReadRequired, setSalesReadRequired] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revisionConflict, setRevisionConflict] = useState(false);
  const [conflictRead, setConflictRead] = useState<PlanDetailPayload | null>(null);
  const context = useRef(0), readSequence = useRef(0), busy = useRef(false);
  const pending = useRef<PlanIntent | null>(null);
  const detailRef = useRef(detail), formRef = useRef(form);
  const messagesRef = useRef(messages), confirmedRef = useRef(onConfirmed);
  useEffect(() => { detailRef.current = detail; formRef.current = form; }, [detail, form]);
  useEffect(() => { messagesRef.current = messages; confirmedRef.current = onConfirmed; }, [messages, onConfirmed]);
  const dirty = Boolean(detail && parameterFields.some(key => form[key] !== buildInitialForm(detail)[key]));

  const loadDetail = useCallback(async (showLoading = true, preserveDraft = false) => {
    const generation = context.current, sequence = ++readSequence.current;
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const value = requirePlanDetail((await client.request<unknown>(`/api/admin/plans/${encodeURIComponent(planId)}`)).data, planId);
      if (generation !== context.current || sequence !== readSequence.current) return;
      setSalesReadRequired(false);
      if (preserveDraft) setConflictRead(value);
      else {
        const old = detailRef.current;
        const keepDraft = pending.current || (old && parameterFields.some(key => formRef.current[key] !== buildInitialForm(old)[key]));
        if (!old || !keepDraft) setDetail(value);
        if (!keepDraft) setForm(buildInitialForm(value));
      }
    } catch (failure) {
      if (generation === context.current && sequence === readSequence.current) setError(resolveUiErrorMessage(failure, messagesRef.current.load));
    } finally { if (generation === context.current && sequence === readSequence.current) setIsLoading(false); }
  }, [planId]);

  useEffect(() => {
    context.current += 1; readSequence.current += 1; busy.current = false; pending.current = null;
    detailRef.current = null; formRef.current = buildInitialForm(null);
    setSalesReadRequired(false); setLastReceipt(null); setReady(false); setDetail(null); setForm(buildInitialForm(null)); setIntent(null); setStorageBlocked(false);
    setIsSaving(false); setIsLoading(false); setRevisionConflict(false); setConflictRead(null); setError(null); setNotice(null);
    if (open && planId) {
      try {
        const saved = sessionStorage.getItem(storageKey(planId));
        if (saved) {
          const restored = readPlanIntent(JSON.parse(saved), planId);
          pending.current = restored; setIntent(restored); setForm(restored.form);
        }
      } catch { setStorageBlocked(true); }
      setReady(true);
      void loadDetail();
    }
    return () => { context.current += 1; readSequence.current += 1; };
  }, [planId, open, loadDetail]);

  async function confirmOperation(submitted: PlanIntent, generation: number) {
    const value = readPlanConfirmation((await client.request<unknown>(
      `/api/admin/plans/${encodeURIComponent(submitted.plan_id)}/parameter-operations/${encodeURIComponent(submitted.operation_id)}?${new URLSearchParams({ source_revision: submitted.revision })}`,
    )).data, submitted);
    if (generation !== context.current || pending.current?.operation_id !== submitted.operation_id) return;
    if (!value) { setError(messagesRef.current.unknown); return; }
    // Clear only after validated durable evidence and current values. A storage
    // error keeps the operation frozen and visible, even if the server confirmed.
    try { clearIntent(submitted); } catch { setStorageBlocked(true); return; }
    pending.current = null; setIntent(null); setError(null); setNotice(messagesRef.current.confirmed);
    const old = detailRef.current;
    if (old?.latest_version) {
      const next = applyPlanParameters(old, value);
      setDetail(next);
      if (parameterFields.every(key => formRef.current[key] === submitted.form[key])) setForm(buildInitialForm(next));
    }
    setLastReceipt({ audit_event_id: value.audit_event_id, audit_state: 'persisted', event_kind: 'plan_version.publish',
      scope_kind: 'plan_version', scope_id: value.plan_version_id, outcome: 'succeeded', effective_summary: messagesRef.current.confirmed });
    confirmedRef.current(value); // Local projection callback, never an invalidation/refetch.
  }
  async function confirm() {
    const submitted = pending.current;
    if (!submitted || busy.current || storageBlocked) return;
    const generation = context.current;
    busy.current = true; setIsSaving(true); setError(null);
    try { await confirmOperation(submitted, generation); }
    catch { if (generation === context.current) setError(messagesRef.current.unknown); }
    finally { if (generation === context.current) { busy.current = false; setIsSaving(false); } }
  }
  async function handleSave() {
    const current = detailRef.current;
    if (!ready || storageBlocked || salesReadRequired || !current?.latest_version || busy.current || pending.current || revisionConflict || isLoading || isSaving) return;
    const submitted: PlanIntent = { operation_id: generateIdempotencyKey('admin_plan_parameters'), plan_id: planId,
      revision: current.revision, plan_version_id: current.latest_version.plan_version_id, values: formParameters(formRef.current), form: { ...formRef.current } };
    try {
      readPlanIntent(submitted, planId);
      sessionStorage.setItem(storageKey(planId), JSON.stringify(submitted));
    } catch { setStorageBlocked(true); return; }
    const generation = context.current;
    setLastReceipt(null); pending.current = submitted; setIntent(submitted); busy.current = true; setIsSaving(true); setError(null); setNotice(null);
    try {
      let value: unknown;
      // Only an error from the original PATCH can prove a nonexecuting rejection.
      // Projection validation and confirmation failures leave the sent intent intact.
      try {
        value = (await client.request<unknown>(`/api/admin/plans/${encodeURIComponent(planId)}`, {
          method: 'PATCH', idempotencyKey: submitted.operation_id, body: { ...submitted.values, revision: submitted.revision },
        })).data;
      } catch (failure) {
        if (generation !== context.current || pending.current?.operation_id !== submitted.operation_id) return;
        if (!explicitlyRejected(failure)) throw failure;
        try { clearIntent(submitted); pending.current = null; setIntent(null); }
        catch { setStorageBlocked(true); return; }
        if (failure instanceof ApiError && failure.errorCode === 'service.admin_plan_revision_conflict') {
          setRevisionConflict(true); setConflictRead(null); setError(null);
        } else setError(resolveUiErrorMessage(failure, messagesRef.current.save));
        return;
      }
      if (generation !== context.current || pending.current?.operation_id !== submitted.operation_id) return;
      requirePlanWrite(value, submitted);
      await confirmOperation(submitted, generation);
    } catch {
      if (generation === context.current && pending.current?.operation_id === submitted.operation_id) setError(messagesRef.current.unknown);
    } finally { if (generation === context.current) { busy.current = false; setIsSaving(false); } }
  }
  function updateField(field: keyof PlanVersionFormState, value: string) {
    if (pending.current || busy.current || storageBlocked) return;
    setNotice(null); setForm(current => ({ ...current, [field]: value }));
  }
  function adoptLatest() {
    if (!conflictRead || pending.current || busy.current) return;
    setDetail(conflictRead); setForm(buildInitialForm(conflictRead)); setRevisionConflict(false); setConflictRead(null); setError(null);
  }
  return { lastReceipt, setIsSaving, salesReadRequired, setSalesReadRequired, detail, setDetail, form, setForm, dirty, intent, isLoading, isSaving, storageBlocked, ready,
    error, setError, notice, setNotice, revisionConflict, conflictRead, loadDetail, handleSave, confirm, updateField, adoptLatest };
}
