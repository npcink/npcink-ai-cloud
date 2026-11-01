'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { buildForm, formItem, readConfirmation, readIntent, requireCatalog, requireWrite,
  type CreditPackCatalogPayload, type CreditPackItem, type PackForm, type PackIntent } from './catalog-projection';

const client = createApiClient({ idempotencyPrefix: 'admin_credit_packs' });
const storageKey = 'admin.credit-pack-catalog.v1';
function clearIntent(submitted: PackIntent) {
  const saved = sessionStorage.getItem(storageKey);
  if (!saved || readIntent(JSON.parse(saved)).operation_id !== submitted.operation_id) throw new Error('Pending operation changed');
  sessionStorage.removeItem(storageKey);
}
function rejected(error: unknown) {
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500 && [
    'service.credit_pack_catalog_revision_conflict', 'service.credit_pack_catalog_revision_required',
    'service.credit_pack_unknown', 'service.credit_pack_duplicate', 'service.payment_amount_invalid',
    'service.credit_pack_ai_credits_invalid', 'service.credit_pack_validity_days_invalid', 'request.validation_error',
  ].includes(error.errorCode);
}
type Messages = { load: string; save: string; unknown: string; invalid: string; conflict: string };
export function useCreditPackEditor(messages: Messages, onSaved: () => void) {
  const [catalog, setCatalog] = useState<CreditPackCatalogPayload | null>(null);
  const [draft, setDraft] = useState<PackForm | null>(null);
  const [draftBase, setDraftBase] = useState<CreditPackCatalogPayload | null>(null);
  const [draftConflict, setDraftConflict] = useState(false);
  const [conflictRead, setConflictRead] = useState<CreditPackCatalogPayload | null>(null);
  const [intent, setIntent] = useState<PackIntent | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [catalogFresh, setCatalogFresh] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<number | null>(null);
  const inflightRead = useRef<Promise<CreditPackCatalogPayload> | null>(null);
  const pending = useRef<PackIntent | null>(null), busy = useRef(false), generation = useRef(0);
  const requestActiveRef = useRef(false), requestSequenceRef = useRef(0), hasLoadedRef = useRef(false);
  const messagesRef = useRef(messages), onSavedRef = useRef(onSaved);
  useEffect(() => { messagesRef.current = messages; onSavedRef.current = onSaved; }, [messages, onSaved]);
  const items = catalog?.items ?? [];
  const savedItem = draftBase?.items.find(item => item.pack_id === draft?.pack_id);
  const isDraftDirty = Boolean(draft && savedItem && JSON.stringify(draft) !== JSON.stringify(buildForm(savedItem)));
  const blocked = Boolean(intent) || storageBlocked;
  const loadCatalog = useCallback(async (refresh = false, preserveDraft = false) => {
    if (requestActiveRef.current || busy.current) return;
    requestActiveRef.current = true;
    const context = generation.current, sequence = ++requestSequenceRef.current;
    if (!preserveDraft) setCatalogFresh(false);
    if (refresh || hasLoadedRef.current) setIsRefreshing(true); else setIsLoading(true);
    if (!preserveDraft) setError(null);
    if (preserveDraft) setConflictRead(null);
    const flight = inflightRead.current ?? client.request<unknown>('/api/admin/credit-packs').then(response => requireCatalog(response.data));
    inflightRead.current = flight;
    try {
      const payload = await flight;
      if (context !== generation.current || sequence !== requestSequenceRef.current) return;
      if (preserveDraft) setConflictRead(payload);
      else { setCatalog(payload); setCatalogFresh(true); setLoadedAt(new Date()); hasLoadedRef.current = true; }
    } catch (failure) {
      if (context === generation.current && sequence === requestSequenceRef.current) setError(resolveUiErrorMessage(failure, messagesRef.current.load));
    } finally {
      if (inflightRead.current === flight) inflightRead.current = null;
      if (context === generation.current && sequence === requestSequenceRef.current) {
        requestActiveRef.current = false; setIsLoading(false); setIsRefreshing(false);
      }
    }
  }, []);
  useEffect(() => {
    generation.current += 1; requestActiveRef.current = false;
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const restored = readIntent(JSON.parse(stored));
        pending.current = restored; setIntent(restored); setDraft(restored.form);
      }
    } catch { setStorageBlocked(true); }
    void loadCatalog();
    return () => { generation.current += 1; requestSequenceRef.current += 1; };
  }, [loadCatalog]);
  function openEditor(item: CreditPackItem) {
    if (busy.current || pending.current || storageBlocked || !catalogFresh || !catalog) return;
    setDraft(buildForm(item)); setDraftBase(catalog); setDraftConflict(false); setConflictRead(null); setEditorError(null);
  }
  function closeEditor() {
    if (busy.current) return;
    setDraft(null); setDraftBase(null); setDraftConflict(false); setConflictRead(null); setEditorError(null);
  }
  function updateField<K extends keyof PackForm>(key: K, value: PackForm[K]) {
    if (busy.current || pending.current || storageBlocked) return;
    setDraft(current => current ? { ...current, [key]: value } : current);
  }
  async function confirmOperation(submitted: PackIntent, context: number) {
    const evidence = readConfirmation((await client.request<unknown>(
      `/api/admin/credit-packs/operations/${encodeURIComponent(submitted.operation_id)}?${new URLSearchParams({ expected_revision: submitted.expected_revision })}`,
    )).data, submitted);
    if (context !== generation.current || pending.current?.operation_id !== submitted.operation_id) return;
    if (!evidence) { setEditorError(messagesRef.current.unknown); return; }
    try { clearIntent(submitted); } catch { setStorageBlocked(true); return; }
    // A directory retry can overlap this exact operation confirmation. Its
    // older catalog (or failure) must not replace the confirmed snapshot.
    requestSequenceRef.current += 1; requestActiveRef.current = false; inflightRead.current = null;
    setIsLoading(false); setIsRefreshing(false);
    pending.current = null; setIntent(null); setCatalog(evidence.catalog); setCatalogFresh(true);
    setLoadedAt(new Date()); setError(null); setEditorError(null); setReceiptId(evidence.audit_event_id);
    setDraft(null); setDraftBase(null); onSavedRef.current();
  }
  async function confirm() {
    const submitted = pending.current;
    if (!submitted || busy.current || storageBlocked) return;
    const context = generation.current;
    busy.current = true; setIsSaving(true); setEditorError(null);
    try { await confirmOperation(submitted, context); }
    catch { if (context === generation.current) setEditorError(messagesRef.current.unknown); }
    finally { if (context === generation.current) { busy.current = false; setIsSaving(false); } }
  }
  async function handleSaveDraft() {
    if (!draft || !draftBase || !isDraftDirty || draftConflict || !catalogFresh || blocked || busy.current || requestActiveRef.current) return;
    let submitted: PackIntent;
    try {
      const target = formItem(draft);
      submitted = readIntent({ operation_id: generateIdempotencyKey('admin_credit_pack_catalog'),
        expected_revision: draftBase.revision, target: draft.pack_id, form: { ...draft },
        items: draftBase.items.map(item => item.pack_id === target.pack_id ? target : item) });
    } catch { setEditorError(messagesRef.current.invalid); return; }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(submitted));
      if (sessionStorage.getItem(storageKey) !== JSON.stringify(submitted)) throw new Error('Recovery storage did not persist');
    }
    catch { setStorageBlocked(true); return; }
    const context = generation.current;
    pending.current = submitted; setIntent(submitted); busy.current = true; setIsSaving(true); setEditorError(null); setReceiptId(null);
    try {
      let value: unknown;
      // A confirmation GET failure (including 409/422) cannot reject the PATCH.
      try {
        value = (await client.request<unknown>('/api/admin/credit-packs', {
          method: 'PATCH', idempotencyKey: submitted.operation_id,
          body: { expected_revision: submitted.expected_revision, items: submitted.items },
        })).data;
      } catch (failure) {
        if (context !== generation.current || pending.current?.operation_id !== submitted.operation_id) return;
        if (!rejected(failure)) throw failure;
        try { clearIntent(submitted); } catch { setStorageBlocked(true); return; }
        pending.current = null; setIntent(null);
        if (failure instanceof ApiError && failure.statusCode === 409) {
          setDraftConflict(true); setCatalogFresh(false); setConflictRead(null); setError(messagesRef.current.conflict);
        } else setEditorError(resolveUiErrorMessage(failure, messagesRef.current.save));
        return;
      }
      if (context !== generation.current || pending.current?.operation_id !== submitted.operation_id) return;
      requireWrite(value, submitted);
      await confirmOperation(submitted, context);
    } catch {
      if (context === generation.current && pending.current?.operation_id === submitted.operation_id) setEditorError(messagesRef.current.unknown);
    } finally { if (context === generation.current) { busy.current = false; setIsSaving(false); } }
  }
  function adoptLatest() {
    if (!conflictRead || pending.current || busy.current || storageBlocked || !draft) return;
    const target = conflictRead.items.find(item => item.pack_id === draft.pack_id);
    if (!target) { setEditorError(messagesRef.current.load); return; }
    setCatalog(conflictRead); setDraftBase(conflictRead); setDraft(buildForm(target)); setLoadedAt(new Date());
    setCatalogFresh(true); setDraftConflict(false); setConflictRead(null); setEditorError(null); setError(null);
  }
  return { catalog, items, draft, draftBase, draftConflict, conflictRead, intent, storageBlocked, blocked,
    isLoading, isRefreshing, isSaving, catalogFresh, loadedAt, error, editorError, receiptId, isDraftDirty,
    loadCatalog, openEditor, closeEditor, updateField, handleSaveDraft, confirm, adoptLatest };
}
