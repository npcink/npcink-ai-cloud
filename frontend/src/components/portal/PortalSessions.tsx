'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { PortalInfoHint } from '@/components/portal/PortalScaffold';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { ApiError } from '@/lib/errors';
import { generateIdempotencyKey } from '@/lib/idempotency';
import { portalClient, publishPortalNotificationCount, type PortalOwnSession, type PortalOwnSessionPage } from '@/lib/portal-client';

type Intent = { key: string; target: PortalOwnSession | null };
type ReadOutcome = 'ready' | 'unavailable' | 'ended' | 'obsolete';
const PAGE_SIZE = 10;
const methodLabels = {
  email_code: 'portal.sessions.method_email',
  registration: 'portal.sessions.method_registration',
  qq: 'portal.sessions.method_qq',
};

function isInvalidSession(error: unknown): boolean {
  return error instanceof ApiError && (error.statusCode === 401 || [
    'auth.portal_session_required', 'auth.portal_session_expired', 'auth.portal_session_revoked',
    'auth.portal_token_required',
  ].includes(error.errorCode));
}

export function PortalSessions() {
  const { t, locale } = useLocale();
  const { clearSession } = useSession();
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PortalOwnSessionPage | null>(null);
  const [reading, setReading] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [writing, setWriting] = useState(false);
  const mounted = useRef(true);
  const expanded = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const ending = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; expanded.current = false; generation.current += 1; };
  }, []);

  const returnToLogin = () => {
    if (ending.current) return;
    ending.current = true;
    generation.current += 1;
    expanded.current = false;
    publishPortalNotificationCount(0);
    clearSession();
    window.location.replace('/portal/login');
  };

  const load = async (offset: number): Promise<ReadOutcome> => {
    const version = ++generation.current;
    const current = () => mounted.current && expanded.current && !ending.current && generation.current === version;
    setReading(true);
    setFresh(false);
    setReadFailed(false);
    try {
      let result = (await portalClient.listOwnSessions(PAGE_SIZE, offset)).data;
      if (!current()) return 'obsolete';
      const lastOffset = Math.max(0, Math.floor((result.pagination.total - 1) / PAGE_SIZE) * PAGE_SIZE);
      if (offset > lastOffset) {
        // A shrinking list requires a real read of the corrected page, once.
        result = (await portalClient.listOwnSessions(PAGE_SIZE, lastOffset)).data;
        if (!current()) return 'obsolete';
        const latestLast = Math.max(0, Math.floor((result.pagination.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        if (lastOffset > latestLast) throw new Error('Session page changed again');
      }
      setPage(result);
      setFresh(true);
      return 'ready';
    } catch (error) {
      if (!current()) return 'obsolete';
      if (isInvalidSession(error)) { returnToLogin(); return 'ended'; }
      setReadFailed(true);
      return 'unavailable';
    } finally {
      if (current()) setReading(false);
    }
  };

  const toggle = () => {
    if (pending.current) return;
    expanded.current = !expanded.current;
    setOpen(expanded.current);
    setIntent(null);
    setNotice('');
    if (expanded.current) void load(0);
    else { generation.current += 1; setReading(false); setFresh(false); }
  };

  const choose = (target: PortalOwnSession | null) => {
    if (!fresh || reading || pending.current || intent) return;
    setNotice('');
    setIntent({ target, key: generateIdempotencyKey('portal_sessions') });
  };

  const revoke = async () => {
    if (!intent || pending.current || !fresh) return;
    pending.current = true;
    generation.current += 1;
    setWriting(true);
    setFresh(false);
    setNotice('');
    try {
      const response = intent.target
        ? await portalClient.revokeOwnSession(intent.target.session_id, intent.key)
        : await portalClient.revokeOtherSessions(intent.key);
      if (!mounted.current || ending.current) return;
      if (intent.target?.is_current) { returnToLogin(); return; }
      setNotice(t('portal.sessions.revoked', { count: String(response.data.revoked_count) }));
      setIntent(null);
      await load(page?.pagination.offset || 0);
    } catch (error) {
      if (!mounted.current || ending.current) return;
      if (isInvalidSession(error)) { returnToLogin(); return; }
      const message = error instanceof ApiError && error.statusCode === 404
        ? 'portal.sessions.target_missing'
        : error instanceof ApiError && error.statusCode === 403
          ? 'portal.sessions.rejected' : 'portal.sessions.unconfirmed';
      // A 503 or lost response can follow a committed revoke. Never retry POST
      // automatically or use refresh(), which may also select a site.
      const outcome = await load(page?.pagination.offset || 0);
      if (outcome === 'ended' || outcome === 'obsolete') return;
      setNotice(outcome === 'ready' ? `${t(message)} ${t('portal.sessions.readback_ready')}` : t(message));
      setIntent(null);
    } finally {
      pending.current = false;
      if (mounted.current && !ending.current) setWriting(false);
    }
  };

  const blocked = reading || writing || !fresh;
  const pagination = page?.pagination;
  const date = (value: string) => new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800" data-portal-account="sessions">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{t('portal.sessions.title')}</h3>
          <PortalInfoHint detail={t('portal.sessions.hint_note')} />
        </div>
        <button type="button" className="btn btn-secondary btn-sm" aria-expanded={open} aria-controls={contentId} disabled={writing} onClick={toggle}>
          {t(open ? 'portal.sessions.hide' : 'portal.sessions.show')}
        </button>
      </div>
      {open ? (
        <div id={contentId} className="space-y-3" aria-busy={reading || writing}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{t('portal.sessions.active_only')}</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={reading || writing || Boolean(intent)} onClick={() => void load(pagination?.offset || 0)}>{t('portal.sessions.refresh')}</button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={blocked || !pagination || pagination.total <= 1} onClick={() => choose(null)}>{t('portal.sessions.others')}</button>
            </div>
          </div>
          {notice ? <p role="status" className="text-sm leading-6">{notice}</p> : null}
          {readFailed ? (
            <p role="alert" className="text-sm leading-6 text-amber-800 dark:text-amber-200">
              {t(page ? 'portal.sessions.refresh_failed' : 'portal.sessions.read_failed')}
            </p>
          ) : null}
          {!page && reading ? <p role="status" className="py-4 text-sm text-slate-500">{t('common.loading')}</p> : null}
          {page ? (
            <>
              <table className={`w-full table-fixed text-left text-sm ${!fresh ? 'opacity-60' : ''}`} aria-label={t('portal.sessions.title')}>
                <colgroup><col className="w-[34%]" /><col className="w-[18%]" /><col className="w-[32%]" /><col className="w-[16%]" /></colgroup>
                <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                  <tr><th scope="col" className="px-2 py-3 font-medium">{t('portal.sessions.browser')}</th><th scope="col" className="px-2 py-3 font-medium">{t('portal.sessions.method')}</th><th scope="col" className="px-2 py-3 font-medium">{t('portal.sessions.time')}</th><th scope="col" className="px-2 py-3 text-right font-medium">{t('portal.sessions.action')}</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {page.items.map((item) => (
                    <tr key={item.session_id} data-session-row={item.session_id}>
                      <td className="break-words px-2 py-3 align-top">
                        <span>{item.client_hint ?? t('portal.sessions.unknown')}</span>
                        {item.is_current ? <span className="mt-1 block text-xs font-medium text-blue-700 dark:text-blue-300">{t('portal.sessions.current')}</span> : null}
                        {item.client_hint ? <span className="mt-1 block text-xs text-slate-500">{t('portal.sessions.unverified')}</span> : null}
                      </td>
                      <td className="px-2 py-3 align-top">{t(methodLabels[item.auth_method])}</td>
                      <td className="px-2 py-3 align-top text-xs leading-6 text-slate-500"><span className="block">{t('portal.sessions.created')} {date(item.created_at)}</span><span className="block">{t('portal.sessions.expires')} {date(item.expires_at)}</span></td>
                      <td className="px-2 py-3 text-right align-top"><button type="button" className="btn btn-secondary btn-sm" disabled={blocked} onClick={() => choose(item)}>{t('portal.sessions.sign_out')}</button></td>
                    </tr>
                  ))}
                  {!page.items.length ? <tr><td colSpan={4} className="px-2 py-5 text-slate-500">{t('portal.sessions.empty')}</td></tr> : null}
                </tbody>
              </table>
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
                <span>{t('portal.sessions.range', { start: String(page.items.length ? page.pagination.offset + 1 : 0), end: String(page.pagination.offset + page.items.length), total: String(page.pagination.total) })}</span>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={blocked || page.pagination.offset === 0} onClick={() => void load(Math.max(0, page.pagination.offset - PAGE_SIZE))}>{t('portal.sessions.previous')}</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={blocked || page.pagination.offset + PAGE_SIZE >= page.pagination.total} onClick={() => void load(page.pagination.offset + PAGE_SIZE)}>{t('portal.sessions.next')}</button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <Modal isOpen={Boolean(intent)} size="md" title={t(intent?.target ? 'portal.sessions.confirm_one' : 'portal.sessions.confirm_others')} closeLabel={t('common.close')} showCloseButton={!writing} closeOnOverlay={!writing} onClose={() => { if (!pending.current) setIntent(null); }} footer={(
        <><button type="button" className="btn btn-secondary" disabled={writing} onClick={() => setIntent(null)}>{t('common.cancel')}</button><button type="button" className="btn btn-primary" disabled={writing} onClick={() => void revoke()}>{t(writing ? 'portal.sessions.busy' : 'portal.sessions.sign_out')}</button></>
      )}>
        <p className="text-sm leading-6">{t(intent?.target?.is_current ? 'portal.sessions.impact_current' : intent?.target ? 'portal.sessions.impact_one' : 'portal.sessions.impact_others')}</p>
      </Modal>
    </div>
  );
}
