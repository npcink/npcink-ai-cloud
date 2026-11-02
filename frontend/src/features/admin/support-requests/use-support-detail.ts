'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { hasSupportMessage, normalizeSupportMessage, normalizeSupportFilename, normalizeSupportContentType } from './support-text';
import { readSupportConfirmation, readSupportDetail, readSupportIntent, readSupportWrite,
  operationPath, sha256, supportDigest, type SupportAction, type SupportDetail, type SupportIntent, type SupportValues } from './detail-evidence';

export const supportDetailClient = createApiClient({ idempotencyPrefix: 'admin_support_detail' });
const storageKey = (id: string) => `admin.support-intent.v1:${id}`;
type Draft = { publicReply: string; internalNote: string; status: string; file: File | null; visibility: 'public' | 'internal'; statusDirty: boolean };
const emptyDraft = (): Draft => ({ publicReply: '', internalNote: '', status: 'open', file: null, visibility: 'public', statusDirty: false });
async function currentActor(): Promise<string> {
  const response = await supportDetailClient.request<{ principal_id?: string; identity_type?: string; capabilities?: { can_manage_accounts?: boolean } }>('/admin/session');
  const actor = response.data;
  if (!actor.principal_id || actor.identity_type !== 'platform_admin' || actor.capabilities?.can_manage_accounts !== true) throw new Error('Support write identity is unavailable');
  return actor.principal_id;
}
// Explicit domain/request rejections only. An HTTP503 or replay-blocked alone
// cannot prove a previously sent write did not commit.
function rejected(error: unknown) {
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500 && [
    'request.validation_error', 'service.support_request_not_found', 'service.support_request_message_required',
    'service.support_request_message_not_found', 'service.support_request_attachment_limit_reached',
    'service.support_request_attachment_filename_required', 'service.support_request_attachment_content_type_invalid',
    'service.support_request_attachment_invalid', 'service.support_request_attachment_empty', 'service.support_request_attachment_too_large',
    'service.support_reply_notification_failed',
  ].includes(error.errorCode);
}
export function useSupportDetail(requestId: string) {
  const [detail, setDetail] = useState<SupportDetail | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const drafts = useRef(new Map<string, Draft>());
  const draftRef = useRef(draft);
  const [intent, setIntent] = useState<SupportIntent | null>(null);
  const intentRef = useRef<SupportIntent | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReturnType<typeof readSupportWrite>['receipt'] | null>(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [loading, setLoading] = useState(true), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false), [readError, setReadError] = useState(false);
  const [error, setError] = useState<'write' | 'unknown' | ''>(''), [notice, setNotice] = useState('');
  const actorRef = useRef(''), contextRef = useRef(0), busyRef = useRef(false), readRef = useRef(0);
  const targetRef = useRef(requestId);
  const detailRef = useRef<SupportDetail | null>(null);
  function setDraftValue(next: Draft) { draftRef.current = next; setDraft(next); drafts.current.set(requestId, next); }
  const updateDraft = (change: Partial<Draft>) => {
    if (!busyRef.current && !intentRef.current) setDraftValue({ ...draftRef.current, ...change });
  };
  const load = useCallback(async () => {
    const epoch = contextRef.current, read = ++readRef.current;
    setLoading(true); setReadError(false); setReady(false);
    try {
      const response = await supportDetailClient.request<unknown>(operationPath(requestId, 'status'));
      const parsed = readSupportDetail(response.data, requestId);
      if (epoch !== contextRef.current || read !== readRef.current || targetRef.current !== requestId) return;
      detailRef.current = parsed; setDetail(parsed); setReady(true);
      if (!draftRef.current.statusDirty && !intentRef.current) {
        const next = { ...draftRef.current, status: parsed.request.status };
        draftRef.current = next; setDraft(next); drafts.current.set(requestId, next);
      }
    } catch {
      if (epoch === contextRef.current && read === readRef.current && targetRef.current === requestId) setReadError(true);
    } finally {
      if (epoch === contextRef.current && read === readRef.current && targetRef.current === requestId) setLoading(false);
    }
  }, [requestId]);

  useLayoutEffect(() => {
    targetRef.current = requestId;
    const epoch = ++contextRef.current;
    busyRef.current = false; intentRef.current = null; actorRef.current = ''; setIdentityReady(false); detailRef.current = null;
    setDetail(null); setReady(false); setBusy(false); setIntent(null); setLastReceipt(null); setStorageBlocked(false); setError(''); setNotice('');
    const initial = drafts.current.get(requestId) || emptyDraft(); draftRef.current = initial; setDraft(initial);
    void (async () => {
      try {
        const actor = await currentActor();
        if (epoch !== contextRef.current || targetRef.current !== requestId) return;
        const saved = sessionStorage.getItem(storageKey(requestId));
        if (saved) {
          const restored = readSupportIntent(JSON.parse(saved), requestId, actor);
          if (await supportDigest(restored.action, restored.values) !== restored.digest) throw new Error('Damaged intent');
          if (epoch !== contextRef.current || targetRef.current !== requestId) return;
          intentRef.current = restored; setIntent(restored); setError('unknown');
          // Restore only the submitted field; preserve unrelated ordinary drafts.
          const field = restored.action === 'message' ? restored.values.visibility === 'public' ? 'publicReply' : 'internalNote' : 'status';
          if (restored.action !== 'attachment') {
            const next = { ...draftRef.current, [field]: restored.action === 'message' ? restored.values.body : restored.values.status };
            draftRef.current = next; setDraft(next); drafts.current.set(requestId, next);
          }
        }
        if (epoch !== contextRef.current || targetRef.current !== requestId) return;
        // Keep both handler and button gates closed while digest verification
        // is awaiting crypto; storage may contain an already-sent operation.
        actorRef.current = actor; setIdentityReady(true);
      } catch { if (epoch === contextRef.current) setStorageBlocked(true); }
    })();
    void load();
    return () => { contextRef.current += 1; };
  }, [requestId, load]);

  function active(submitted: SupportIntent, epoch: number) {
    return contextRef.current === epoch && targetRef.current === submitted.request_id && intentRef.current?.operation_id === submitted.operation_id;
  }
  function clear(submitted: SupportIntent) {
    const raw = sessionStorage.getItem(storageKey(submitted.request_id));
    if (!raw || raw !== JSON.stringify(submitted)) throw new Error('Stored operation changed');
    sessionStorage.removeItem(storageKey(submitted.request_id));
    if (sessionStorage.getItem(storageKey(submitted.request_id)) !== null) throw new Error('Operation not cleared');
  }
  function finish(result: ReturnType<typeof readSupportWrite>, submitted: SupportIntent, epoch: number) {
    if (!active(submitted, epoch)) return;
    try { clear(submitted); } catch { setStorageBlocked(true); return; }
    intentRef.current = null; setIntent(null); setError(''); setLastReceipt(result.receipt); setNotice(submitted.action === 'message' && submitted.values.visibility === 'public' && result.delivered !== null ? result.delivered ? 'public_sent' : 'public_saved' : submitted.action);
    const next = { ...draftRef.current };
    if (submitted.action === 'message') {
      const field = submitted.values.visibility === 'public' ? 'publicReply' : 'internalNote';
      if (normalizeSupportMessage(next[field]) === submitted.values.body) next[field] = '';
    } else if (submitted.action === 'attachment') next.file = null;
    else next.statusDirty = false;
    setDraftValue(next);
    // Read current state after historical proof; never apply an old request
    // snapshot over another operator's later state or over a newer draft.
    setReady(false); void load();
  }
  async function confirm() {
    const submitted = intentRef.current, epoch = contextRef.current;
    if (!submitted || busyRef.current || storageBlocked) return;
    busyRef.current = true; setBusy(true);
    try {
      if (await currentActor() !== submitted.actor_ref) { if (active(submitted, epoch)) setStorageBlocked(true); return; }
      if (!active(submitted, epoch)) return;
      const params = new URLSearchParams({ action: submitted.action, digest: submitted.digest });
      const response = await supportDetailClient.request<unknown>(`${operationPath(submitted.request_id, 'status')}/operations/${encodeURIComponent(submitted.operation_id)}?${params}`);
      const result = readSupportConfirmation(response.data, submitted);
      if (result) finish(result, submitted, epoch);
      else if (active(submitted, epoch)) setError('unknown');
    } catch { if (active(submitted, epoch)) setError('unknown'); }
    finally { if (contextRef.current === epoch) { busyRef.current = false; setBusy(false); } }
  }
  async function submit(action: SupportAction, visibility?: 'public' | 'internal') {
    const current = detailRef.current;
    if (!ready || !current || current.request.request_id !== requestId || storageBlocked || !actorRef.current || busyRef.current || intentRef.current) return;
    const epoch = contextRef.current, snapshot = { ...draftRef.current };
    busyRef.current = true; setBusy(true); setNotice(''); setError('');
    let submitted: SupportIntent | null = null;
    try {
      const actor = await currentActor();
      if (contextRef.current !== epoch || targetRef.current !== requestId) return;
      if (actor !== actorRef.current) { setStorageBlocked(true); return; }
      let body: SupportValues, values: SupportValues, content = '';
      if (action === 'message') {
        const text = normalizeSupportMessage(visibility === 'public' ? snapshot.publicReply : snapshot.internalNote);
        if (!hasSupportMessage(text)) return;
        values = body = { body: text, visibility: visibility || 'public' };
      } else if (action === 'status') values = body = { status: snapshot.status, admin_note: '' };
      else {
        const file = snapshot.file;
        if (!file) return;
        if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('Invalid attachment size');
        const bytes = new Uint8Array(await file.arrayBuffer());
        // Persist the byte hash and metadata, not several MB of base64. Unknown
        // attachments are confirmed by GET; this hook never resends them.
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        content = btoa(binary);
        body = { filename: normalizeSupportFilename(file.name),
          content_type: normalizeSupportContentType(file.type || 'application/octet-stream'), visibility: snapshot.visibility, message_id: '' };
        values = { ...body, content_sha256: await sha256(bytes) };
      }
      const digest = await supportDigest(action, values);
      if (contextRef.current !== epoch || targetRef.current !== requestId) return;
      submitted = { request_id: requestId, account_id: current.request.account_id, actor_kind: 'platform_admin', actor_ref: actorRef.current,
        operation_id: generateIdempotencyKey('admin_support'), action, values, body, digest,
        method: action === 'status' ? 'PATCH' : 'POST', path: operationPath(requestId, action), created_at: new Date().toISOString(), revision: epoch,
        ...(action === 'attachment' ? { byte_size: snapshot.file!.size } : {}) };
      try {
        const saved = JSON.stringify(submitted); sessionStorage.setItem(storageKey(requestId), saved);
        if (sessionStorage.getItem(storageKey(requestId)) !== saved) throw new Error('Intent not retained');
      } catch { setStorageBlocked(true); return; }
      intentRef.current = submitted; setIntent(submitted);
      const response = await supportDetailClient.request<unknown>(submitted.path, { method: submitted.method,
        body: action === 'attachment' ? { ...body, content_base64: content } : body, idempotencyKey: submitted.operation_id });
      finish(readSupportWrite(response.data, submitted), submitted, epoch);
    } catch (failure) {
      if (submitted && active(submitted, epoch)) {
        if (rejected(failure)) {
          try { clear(submitted); intentRef.current = null; setIntent(null); setError('write'); }
          catch { setStorageBlocked(true); }
        } else setError('unknown');
      } else if (contextRef.current === epoch) setError('write');
    } finally { if (contextRef.current === epoch) { busyRef.current = false; setBusy(false); } }
  }
  return { detail: detail?.request.request_id === requestId ? detail : null, draft, updateDraft, intent, lastReceipt,
    loading, busy, ready, readError, storageBlocked, error, notice, load, submit, confirm,
    locked: !ready || !identityReady || detail?.request.request_id !== requestId || storageBlocked || busy || Boolean(intent) };
}
