'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createApiClient } from '@/lib/api-client';
import { useLocale } from '@/contexts/LocaleContext';
import { ApiError, resolveUiErrorMessage } from '@/lib/errors';
import {
  draftSchema,
  freshNotice,
  historySchema,
  readDetail,
  type NoticeDetail,
  type NoticeDraft,
  type NoticeHistory,
  type NoticeValues,
} from './contracts';

const client = createApiClient({ idempotencyPrefix: 'admin_notice' });
const endpoint = '/api/admin/customer-notifications';
export function useNotices(accountId: string) {
  const { t } = useLocale();
  const [draft, setDraft] = useState<NoticeDraft | null>(null);
  const [detail, setDetail] = useState<NoticeDetail | null>(null);
  const [history, setHistory] = useState<NoticeHistory | null>(null);
  const [offset, setOffset] = useState(0),
    [historyError, setHistoryError] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false);
  const [actor, setActor] = useState('');
  const key = useRef(''),
    busyRef = useRef(false),
    generation = useRef(0),
    historyGeneration = useRef(0);
  const draftRef = useRef<NoticeDraft | null>(null);
  const persist = (next: NoticeDraft) => {
    try {
      sessionStorage.setItem(key.current, JSON.stringify(next));
    } catch {
      const retained = { ...next, pending: draftRef.current?.pending || '' } as NoticeDraft;
      draftRef.current = retained;
      setDraft(retained);
      setBlocked(true);
      return false;
    }
    draftRef.current = next;
    setDraft(next);
    return true;
  };
  const loadHistory = useCallback(async () => {
    const version = generation.current, request = ++historyGeneration.current;
    setHistoryError('');
    setHistory(null);
    try {
      const result = await client.request<unknown>(`${endpoint}?limit=20&offset=${offset}`);
      if (version === generation.current && request === historyGeneration.current) {
        const parsed = historySchema.parse(result.data);
        if (parsed.offset !== offset || parsed.limit !== 20 || parsed.items.length !== Math.min(20, Math.max(0, parsed.total_count - offset))) {
          throw new Error('History does not match the requested page');
        }
        setHistory(parsed);
      }
    } catch (failure) {
      if (version === generation.current && request === historyGeneration.current)
        setHistoryError(resolveUiErrorMessage(failure, 'Unable to load history'));
    }
  }, [offset]);
  useEffect(() => {
    const version = ++generation.current;
    void client
      .request<{
        principal_id?: string;
        identity_type?: string;
        capabilities?: { can_manage_accounts?: boolean };
      }>('/admin/session')
      .then((response) => {
        if (version !== generation.current) return;
        const session = response.data;
        if (
          !session.principal_id ||
          session.identity_type !== 'platform_admin' ||
          !session.capabilities?.can_manage_accounts
        )
          throw new Error('Admin permission unavailable');
        setActor(session.principal_id);
        key.current = `admin.customer-notice.v1:${session.principal_id}:${accountId}`;
        try {
          const raw = sessionStorage.getItem(key.current);
          const initial = raw
            ? draftSchema.parse(JSON.parse(raw))
            : { values: freshNotice(accountId), pending: '' as const };
          draftRef.current = initial;
          setDraft(initial);
        } catch {
          setBlocked(true);
        }
      })
      .catch((failure) => {
        if (version === generation.current)
          setError(resolveUiErrorMessage(failure, 'Admin permission unavailable'));
      });
    return () => {
      generation.current += 1;
    };
  }, [accountId]);
  useEffect(() => {
    if (actor) void loadHistory();
  }, [actor, loadHistory]);
  const edit = (patch: Partial<NoticeValues>) => {
    const current = draftRef.current;
    if (!current || current.pending || busyRef.current) return;
    const values = { ...current.values, ...patch, dispatch_id: freshNotice(accountId).dispatch_id };
    persist({ values, pending: '' });
    setDetail(null);
    setError('');
  };
  const recover = async () => {
    const current = draftRef.current;
    if (!current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const version = generation.current;
    try {
      const response = await client.request<unknown>(`${endpoint}/${current.values.dispatch_id}`);
      const result = readDetail(response.data, current.values, actor);
      if (version !== generation.current) return;
      setDetail(result);
      // A read of preview cannot prove an in-flight send failed; retain its identity.
      persist({
        values: current.values,
        pending: result.status === 'sent' ? '' : current.pending === 'send' ? 'send' : '',
      });
      void loadHistory();
    } catch (failure) {
      if (version !== generation.current) return;
      if (failure instanceof ApiError && failure.statusCode === 404 && current.pending !== 'send') {
        persist({ ...current, pending: '' });
      }
      setError(resolveUiErrorMessage(failure, 'Unable to confirm notice'));
    } finally {
      if (version === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const submit = async (action: 'preview' | 'send') => {
    const current = draftRef.current;
    if (!current || blocked || busyRef.current || (action === 'preview' && current.pending)) return;
    if (
      action === 'send' &&
      (!detail ||
        detail.dispatch_id !== current.values.dispatch_id ||
        detail.status !== 'preview' ||
        detail.actor_ref !== actor ||
        detail.actor_kind !== 'platform_admin')
    )
      return;
    const next: NoticeDraft = {
      values: {
        ...current.values,
        title: current.values.title.trim(),
        body: current.values.body.trim(),
      },
      pending: action,
    };
    if (!persist(next)) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const version = generation.current;
    try {
      const response = await client.request<unknown>(
        action === 'preview' ? endpoint : `${endpoint}/${next.values.dispatch_id}/send`,
        {
          method: 'POST',
          body: action === 'preview' ? next.values : undefined,
          idempotencyKey: `${next.values.dispatch_id}:${action}`,
        },
      );
      const result = readDetail(response.data, next.values, actor);
      if (action === 'send' && result.status !== 'sent') throw new Error('Delivery unconfirmed');
      if (version !== generation.current) return;
      setDetail(result);
      persist({ values: next.values, pending: '' });
      void loadHistory();
    } catch (failure) {
      if (version === generation.current) {
        // These server responses prove this operation did not commit. Unknown
        // network/server outcomes must keep the original dispatch identity.
        if (failure instanceof ApiError && (
          (action === 'send' && failure.errorCode === 'service.notification_preview_expired') ||
          (action === 'preview' && ['service.notification_invalid', 'service.notification_audience_limit'].includes(failure.errorCode))
        )) {
          persist({ values: { ...next.values, dispatch_id: freshNotice(accountId).dispatch_id }, pending: '' });
          setDetail(null);
        }
        setError(
          failure instanceof ApiError && failure.errorCode === 'service.notification_preview_expired'
            ? t('admin.notices.expired')
            : resolveUiErrorMessage(failure, t('admin.notices.unknown')),
        );
      }
    } finally {
      if (version === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const inspect = async (id: string) => {
    if (draftRef.current?.pending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const version = generation.current;
    try {
      const result = readDetail((await client.request<unknown>(`${endpoint}/${id}`)).data);
      if (result.dispatch_id !== id) throw new Error('Notice does not match the requested batch');
      if (version !== generation.current) return;
      setDetail(result);
    } catch (failure) {
      if (version === generation.current)
        setError(resolveUiErrorMessage(failure, 'Unable to read notice'));
    } finally {
      if (version === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const reset = () => {
    if (draftRef.current?.pending || busyRef.current) return;
    if (persist({ values: freshNotice(accountId), pending: '' })) {
      setDetail(null);
      setError('');
    }
  };
  const discardCorrupt = () => {
    try {
      sessionStorage.removeItem(key.current);
      setBlocked(false);
      const next = { values: freshNotice(accountId), pending: '' as const };
      draftRef.current = next;
      setDraft(next);
    } catch {
      setBlocked(true);
    }
  };
  return {
    draft,
    detail,
    history,
    offset,
    setOffset,
    historyError,
    loadHistory,
    error,
    busy,
    blocked,
    actor,
    edit,
    submit,
    recover,
    inspect,
    reset,
    discardCorrupt,
  };
}
