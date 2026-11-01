'use client';

import { useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import { generateIdempotencyKey, isValidIdempotencyKey } from '@/lib/idempotency';
import { isSiteRecord, normalizeSiteUtc, readSiteConfirmation, readSiteWrite, type SiteAction, type SiteIntent, type SiteOperationResult } from './site-operation-model';

const client = createApiClient({ idempotencyPrefix: 'admin_site_operation' });
const storageKey = (siteId: string) => `admin.site-operation.v1:${siteId}`;
const actions = new Set(['activate', 'set', 'clear', 'reset']);

export function toDatetimeLocalValue(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function restoreIntent(value: unknown, siteId: string): SiteIntent {
  if (!isSiteRecord(value) || value.site_id !== siteId || typeof value.account_id !== 'string'
    || typeof value.operation_id !== 'string' || !isValidIdempotencyKey(value.operation_id)
    || typeof value.action !== 'string' || !actions.has(value.action)) throw new Error('Invalid site intent');
  if (value.input_utc !== null) normalizeSiteUtc(value.input_utc);
  if (value.action !== 'activate') normalizeSiteUtc(value.ownership_released_at);
  if (value.action === 'set') normalizeSiteUtc(value.cooldown_until);
  else if (value.cooldown_until !== null) throw new Error('Invalid site intent time');
  return value as SiteIntent;
}

function clearIntent(submitted: SiteIntent) {
  const saved = sessionStorage.getItem(storageKey(submitted.site_id));
  if (saved && JSON.parse(saved).operation_id === submitted.operation_id) sessionStorage.removeItem(storageKey(submitted.site_id));
}

type SiteSnapshot = { site_id: string; account_id: string; status: string; site_relink_policy?: { ownership_released_at?: string; cooldown_until?: string } };
type Options = {
  siteId: string;
  site: SiteSnapshot | null;
  writeFailure: string;
  readFailure: string;
  invalidTime: string;
  onConfirmed: (result: SiteOperationResult, action: SiteAction) => void;
};

export function useSiteOperations({ siteId, site, writeFailure, readFailure, invalidTime, onConfirmed }: Options) {
  const [intent, setIntent] = useState<SiteIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState('');
  const [input, setInputState] = useState('');
  const [baseline, setBaseline] = useState('');
  const inputRef = useRef('');
  const baselineRef = useRef('');
  const operationRef = useRef<SiteIntent | null>(null);
  const busyRef = useRef(false);
  const revisionRef = useRef(0);
  const callbackRef = useRef(onConfirmed);
  useEffect(() => { callbackRef.current = onConfirmed; }, [onConfirmed]);
  useEffect(() => {
    revisionRef.current += 1; operationRef.current = null; busyRef.current = false;
    setIntent(null); setBusy(false); setReady(false); setError(''); setStorageBlocked(false); setInputState('');
    inputRef.current = ''; baselineRef.current = ''; setBaseline('');
    try {
      const saved = sessionStorage.getItem(storageKey(siteId));
      if (saved) {
        const restored = restoreIntent(JSON.parse(saved), siteId);
        operationRef.current = restored; setIntent(restored);
        if (restored.input_utc) { inputRef.current = toDatetimeLocalValue(restored.input_utc); setInputState(inputRef.current); }
      }
    } catch { setStorageBlocked(true); }
    setReady(true);
    return () => { revisionRef.current += 1; };
  }, [siteId]);
  useEffect(() => {
    if (!operationRef.current && site?.site_id === siteId && inputRef.current === baselineRef.current) {
      const saved = toDatetimeLocalValue(site.site_relink_policy?.cooldown_until || '');
      inputRef.current = saved; baselineRef.current = saved; setInputState(saved); setBaseline(saved);
    }
  }, [siteId, site?.site_id, site?.site_relink_policy?.cooldown_until]);

  const current = (submitted: SiteIntent, revision: number) => revisionRef.current === revision && operationRef.current?.operation_id === submitted.operation_id;
  function complete(result: SiteOperationResult, submitted: SiteIntent, revision: number) {
    clearIntent(submitted);
    if (!current(submitted, revision)) return;
    operationRef.current = null; setIntent(null); setError('');
    if (result.policy) {
      const saved = toDatetimeLocalValue(result.policy.cooldown_until);
      inputRef.current = saved; baselineRef.current = saved; setInputState(saved); setBaseline(saved);
    }
    callbackRef.current(result, submitted.action);
  }
  async function confirm() {
    const submitted = operationRef.current;
    if (!submitted || busyRef.current) return;
    const revision = revisionRef.current;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const response = await client.request<unknown>(`/api/admin/sites/${encodeURIComponent(submitted.site_id)}/operations/${encodeURIComponent(submitted.operation_id)}?${new URLSearchParams({ action: submitted.action })}`);
      const result = readSiteConfirmation(response.data, submitted);
      if (result) complete(result, submitted, revision);
    } catch { if (current(submitted, revision)) setError(readFailure); }
    finally { if (current(submitted, revision) || (revisionRef.current === revision && !operationRef.current)) { busyRef.current = false; setBusy(false); } }
  }
  async function submit(action: SiteAction) {
    if (!site || site.site_id !== siteId || !ready || storageBlocked || operationRef.current || busyRef.current) return;
    let until: string | null = null;
    try { if (action === 'set') { until = new Date(input).toISOString(); normalizeSiteUtc(until); } }
    catch { setError(invalidTime); return; }
    let inputUtc: string | null = null;
    if (action !== 'activate' && input && Number.isFinite(new Date(input).getTime())) inputUtc = new Date(input).toISOString();
    const submitted: SiteIntent = {
      site_id: site.site_id, account_id: site.account_id, operation_id: generateIdempotencyKey('admin_site_operation'),
      action, cooldown_until: until, input_utc: inputUtc, ownership_released_at: site.site_relink_policy?.ownership_released_at || null,
    };
    try { restoreIntent(submitted, siteId); sessionStorage.setItem(storageKey(siteId), JSON.stringify(submitted)); }
    catch { setStorageBlocked(true); return; }
    const revision = revisionRef.current;
    operationRef.current = submitted; setIntent(submitted); busyRef.current = true; setBusy(true); setError('');
    let needsConfirmation = false;
    try {
      const response = await client.request<unknown>(`/api/admin/sites/${encodeURIComponent(siteId)}/${action === 'activate' ? 'activate' : 'relink-cooldown'}`, {
        method: action === 'activate' ? 'POST' : 'PATCH', idempotencyKey: submitted.operation_id,
        body: action === 'activate' ? {} : { action, ...(until ? { cooldown_until: until } : {}) },
      });
      complete(readSiteWrite(response.data, submitted), submitted, revision);
    } catch (failure) {
      const codes = action === 'activate'
        ? ['service.site_not_found', 'service.account_not_found', 'service.site_limit_exceeded']
        : ['service.site_not_found', 'service.site_relink_not_released', 'service.site_relink_cooldown_until_required', 'service.site_relink_cooldown_action_invalid'];
      if (failure instanceof ApiError && failure.statusCode >= 400 && failure.statusCode < 500
        && [...codes, 'request.validation_error', 'service.validation_error'].includes(failure.errorCode)) {
        const ownsResult = current(submitted, revision);
        try { clearIntent(submitted); if (ownsResult) { operationRef.current = null; setIntent(null); } }
        catch { /* Keep a possibly persisted operation frozen. */ }
        if (ownsResult) setError(resolveUiErrorMessage(failure, writeFailure));
      } else needsConfirmation = true;
    } finally {
      if (current(submitted, revision) || (revisionRef.current === revision && !operationRef.current)) { busyRef.current = false; setBusy(false); }
    }
    if (needsConfirmation && current(submitted, revision)) await confirm();
  }
  function setInput(value: string) { if (!operationRef.current && !busyRef.current) { inputRef.current = value; setInputState(value); } }
  return { intent, busy, storageBlocked, error, input, setInput, submit, confirm,
    inputDirty: Boolean(ready && !intent && site?.site_id === siteId
      && input !== baseline),
    locked: !ready || !site || site.site_id !== siteId || storageBlocked || busy || Boolean(intent) };
}

export type SiteOperationsController = ReturnType<typeof useSiteOperations>;
