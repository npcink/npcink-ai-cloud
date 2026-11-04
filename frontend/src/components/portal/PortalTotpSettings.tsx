'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { useLocale } from '@/contexts/LocaleContext';
import { ApiError } from '@/lib/errors';
import { portalTotpClient, type TotpPurpose } from '@/lib/portal-totp-client';
import { clearTotpView, dismissTotpCodes, isCurrentTotpOperation, type TotpView } from '@/lib/portal-totp-state';
import type { PortalSecondFactorMethod } from '@/lib/portal-auth-wire';

export function PortalTotpSettings() {
  const { t } = useLocale();
  const router = useRouter();
  const { session, isAuthenticated, getAuthenticationEpoch, acceptManagementSession, clearSession } = useSession();
  const [view, setView] = useState<TotpView>({ kind: 'loading_status' });
  const [proof, setProof] = useState('');
  const [method, setMethod] = useState<PortalSecondFactorMethod>('totp');
  const [notice, setNotice] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const root = useRef<HTMLDivElement>(null);
  const operation = useRef(0);
  const busy = useRef(false);
  const pendingWrite = useRef(false);
  const readAfterWrite = useRef(false);
  const [writePending, setWritePending] = useState(false);
  const alive = useRef(true);
  const expectedEpoch = useRef(getAuthenticationEpoch());
  const viewRef = useRef(view);
  const show = useCallback((next: TotpView) => { viewRef.current = next; setView(next); }, []);
  // React updates alone cannot erase a frozen bfcache DOM. Scrub synchronously.
  const erase = useCallback((kind: 'loading_status' | 'unavailable' | 'reauthenticate' | 'outcome_unknown' = 'loading_status') => {
    operation.current += 1;
    busy.current = false;
    root.current?.querySelectorAll<HTMLElement>('[data-totp-secret]').forEach((node) => { node.textContent = ''; });
    root.current?.querySelectorAll<HTMLInputElement>('input').forEach((node) => { node.value = ''; });
    setProof(''); setNotice(''); setMethod('totp');
    show(clearTotpView(kind));
  }, [show]);
  const current = (id: number, epoch: number) => alive.current
    && isCurrentTotpOperation(id, operation.current, epoch, getAuthenticationEpoch());

  const inspect = useCallback(async () => {
    if (pendingWrite.current) { readAfterWrite.current = true; erase('outcome_unknown'); return; }
    erase();
    const id = operation.current, epoch = getAuthenticationEpoch();
    expectedEpoch.current = epoch;
    busy.current = true;
    try {
      // Read the browser's current cookie state before permitting another write.
      const nextSession = await portalTotpClient.getSession();
      const status = await portalTotpClient.getStatus();
      if (!alive.current || !isCurrentTotpOperation(id, operation.current, epoch, getAuthenticationEpoch())) return;
      if (!acceptManagementSession(nextSession, epoch)) { erase('reauthenticate'); return; }
      expectedEpoch.current = getAuthenticationEpoch();
      show({ kind: 'ready', status });
    } catch (error) {
      if (!alive.current || !isCurrentTotpOperation(id, operation.current, epoch, getAuthenticationEpoch())) return;
      erase(error instanceof ApiError && error.statusCode === 401 ? 'reauthenticate' : 'unavailable');
    } finally { if (id === operation.current) busy.current = false; }
  }, [erase, show, getAuthenticationEpoch, acceptManagementSession]);

  useEffect(() => {
    alive.current = true;
    void inspect();
    const pagehide = () => { readAfterWrite.current = false; erase(); };
    const restore = () => { void inspect(); };
    const focus = () => { void inspect(); };
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('pageshow', restore);
    window.addEventListener('focus', focus);
    return () => {
      alive.current = false; erase();
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('focus', focus);
    };
  }, [erase, inspect]);
  useEffect(() => {
    if (!isAuthenticated || expectedEpoch.current !== getAuthenticationEpoch()) {
      erase('reauthenticate'); expectedEpoch.current = getAuthenticationEpoch();
    }
  }, [session, isAuthenticated, erase, getAuthenticationEpoch]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = Date.now(); setNow(time);
      const active = viewRef.current;
      if ((active.kind === 'proof' || active.kind === 'confirming') && Date.parse(active.start.expiresAt) <= time) {
        erase(active.kind === 'confirming' ? 'outcome_unknown' : 'unavailable');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [erase]);

  const failure = (error: unknown, retry?: TotpView) => {
    setProof('');
    if (error instanceof ApiError) {
      if (error.errorCode === 'auth.portal_primary_reauthentication_required') { erase('reauthenticate'); return; }
      if (error.errorCode === 'auth.portal_session_revoked' || error.errorCode === 'auth.portal_session_required') {
        erase('outcome_unknown'); return;
      }
      const details = error.details as { challenge_status?: string; attempts_remaining?: number } | undefined;
      if (error.statusCode === 429) {
        erase('unavailable'); setWaitUntil(Date.now() + (error.retryAfterSeconds || 60) * 1000); return;
      }
      if (retry && (details?.challenge_status === 'retryable' || details?.challenge_status === 'active')
        && error.statusCode < 500) { show(retry); setNotice(t('portal.totp.invalid')); return; }
      if (error.errorCode === 'auth.portal_factor_invalid' || ['expired', 'consumed', 'attempt_limit', 'missing', 'terminal'].includes(details?.challenge_status || '')) {
        erase('unavailable'); return;
      }
    }
    erase('outcome_unknown');
  };
  const start = async (purpose: TotpPurpose) => {
    if (pendingWrite.current || busy.current || viewRef.current.kind !== 'ready' || now < waitUntil) return;
    const id = ++operation.current, epoch = getAuthenticationEpoch();
    expectedEpoch.current = epoch; busy.current = true; pendingWrite.current = true; setWritePending(true); setNotice(''); setProof(''); setMethod('totp'); show({ kind: 'starting' });
    let responseKnown = false;
    try {
      const result = await (purpose === 'setup' ? portalTotpClient.startSetup()
        : purpose === 'disable' ? portalTotpClient.startDisable() : portalTotpClient.startRecoveryReset());
      responseKnown = true;
      if (current(id, epoch)) show({ kind: 'proof', start: result });
    } catch (error) { if (current(id, epoch)) failure(error); }
    finally {
      pendingWrite.current = false;
      if (alive.current) setWritePending(false);
      if (id === operation.current) busy.current = false;
      const reread = readAfterWrite.current; readAfterWrite.current = false;
      if (reread && responseKnown && alive.current && epoch === getAuthenticationEpoch()) void inspect();
    }
  };
  const confirm = async () => {
    const active = viewRef.current;
    if (pendingWrite.current || busy.current || active.kind !== 'proof' || Date.parse(active.start.expiresAt) <= Date.now()) return;
    if ((active.start.purpose === 'setup' || method === 'totp') && !/^[0-9]{6}$/.test(proof)) return;
    if (!proof.trim()) return;
    const id = ++operation.current, epoch = getAuthenticationEpoch();
    busy.current = true; pendingWrite.current = true; setWritePending(true); show({ kind: 'confirming', start: active.start }); setNotice('');
    const submitted = proof; setProof('');
    let responseKnown = false;
    try {
      const result = await (active.start.purpose === 'setup'
        ? portalTotpClient.confirmSetup({ setup_id: active.start.setupId, code: submitted })
        : active.start.purpose === 'disable' ? portalTotpClient.confirmDisable({ code: submitted, method })
          : portalTotpClient.confirmRecoveryReset({ code: submitted, method }));
      responseKnown = true;
      if (!current(id, epoch)) return;
      if (!acceptManagementSession(result.session, epoch)) { erase('outcome_unknown'); return; }
      expectedEpoch.current = getAuthenticationEpoch();
      show(active.start.purpose === 'disable' ? { kind: 'ready', status: { enabled: false, recovery_codes_remaining: 0 } }
        : { kind: 'codes_visible', codes: result.recoveryCodes });
    } catch (error) { if (current(id, epoch)) failure(error, active); }
    finally {
      pendingWrite.current = false;
      if (alive.current) setWritePending(false);
      if (id === operation.current) busy.current = false;
      const reread = readAfterWrite.current; readAfterWrite.current = false;
      if (reread && responseKnown && alive.current && epoch === getAuthenticationEpoch()) void inspect();
    }
  };
  const active = view.kind === 'proof' || view.kind === 'confirming' ? view.start : null;
  return <div ref={root} className="border-t border-slate-200 pt-4 dark:border-slate-800" data-totp-settings>
    <div className="flex items-center justify-between gap-4">
      <h3 className="text-sm font-medium">{t('portal.totp.title')}</h3>
      {view.kind === 'ready' && <span className="text-xs text-slate-500">{t(view.status.enabled ? 'portal.totp.enabled' : 'portal.totp.disabled')}</span>}
    </div>
    {view.kind === 'ready' && <div className="mt-3 flex items-center gap-4 text-sm">
      {view.status.enabled ? <><span className="text-slate-500">{t('portal.totp.remaining', { count: String(view.status.recovery_codes_remaining) })}</span>
        <button type="button" className="text-blue-700 dark:text-blue-300" onClick={() => void start('recovery_reset')}>{t('portal.totp.reset')}</button>
        <button type="button" className="text-rose-700 dark:text-rose-300" onClick={() => void start('disable')}>{t('portal.totp.disable')}</button></>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => void start('setup')}>{t('portal.totp.enable')}</button>}
    </div>}
    {(view.kind === 'loading_status' || view.kind === 'starting') && <p role="status" className="mt-3 text-sm text-slate-500">{t('portal.totp.wait')}</p>}
    {active && <form className="mt-4 max-w-lg space-y-3" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
      <p className="text-sm text-slate-600 dark:text-slate-400">{t(active.purpose === 'setup' ? 'portal.totp.provision' : active.purpose === 'disable' ? 'portal.totp.disable_warning' : 'portal.totp.reset_warning')}</p>
      {active.purpose === 'setup' && <div className="space-y-1"><p className="text-xs text-slate-500">{t('portal.totp.secret')}</p>
        <code data-totp-secret className="block select-all break-all rounded bg-slate-50 p-3 font-mono text-sm dark:bg-slate-900">{active.secret}</code></div>}
      {active.purpose !== 'setup' && <label className="block text-sm">{t('portal.totp.method')}<select className="input mt-1" value={method} disabled={view.kind === 'confirming'} onChange={(event) => { setProof(''); setMethod(event.target.value as PortalSecondFactorMethod); }}>
        <option value="totp">{t('portal.totp.code')}</option><option value="recovery_code">{t('portal.totp.recovery')}</option></select></label>}
      <label className="block text-sm">{t(method === 'totp' ? 'portal.totp.code' : 'portal.totp.recovery')}
        <input className="input mt-1" autoComplete="off" inputMode={method === 'totp' ? 'numeric' : 'text'} maxLength={method === 'totp' ? 6 : 160}
          value={proof} disabled={view.kind === 'confirming'} onChange={(event) => setProof(event.target.value)} /></label>
      <p className="text-xs text-slate-500">{t('portal.totp.expiry', { seconds: String(Math.max(0, Math.ceil((Date.parse(active.expiresAt) - now) / 1000))) })}</p>
      <div className="flex gap-3"><button type="submit" className="btn btn-primary btn-sm" disabled={view.kind === 'confirming' || !proof.trim() || (method === 'totp' && !/^[0-9]{6}$/.test(proof))}>{t(view.kind === 'confirming' ? 'portal.totp.wait' : 'portal.totp.confirm')}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { erase(); void inspect(); }}>{t('portal.totp.cancel')}</button></div>
    </form>}
    {view.kind === 'codes_visible' && <div className="mt-4 max-w-lg space-y-3">
      <p className="text-sm">{t('portal.totp.once')}</p>
      <ul className="grid grid-cols-2 gap-2 rounded bg-slate-50 p-3 font-mono text-sm dark:bg-slate-900" aria-label={t('portal.totp.codes')}>
        {view.codes.map((code, index) => <li data-totp-secret key={index}>{code}</li>)}</ul>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { show(dismissTotpCodes(viewRef.current)); }}>{t('portal.totp.saved')}</button>
    </div>}
    {['unavailable', 'outcome_unknown', 'reauthenticate'].includes(view.kind) && <div className="mt-3 max-w-lg space-y-3 text-sm">
      <p role="status">{t(view.kind === 'outcome_unknown' ? 'portal.totp.unknown' : view.kind === 'reauthenticate' ? 'portal.totp.fresh' : 'portal.totp.unavailable')}</p>
      {view.kind !== 'reauthenticate' && <button type="button" className="btn btn-secondary btn-sm" disabled={writePending || now < waitUntil} onClick={() => void inspect()}>{t('portal.totp.check')}</button>}
      <button type="button" className="ml-3 text-blue-700 dark:text-blue-300" onClick={() => { erase(); clearSession(); router.push('/portal/login?redirect=%2Fportal%2Faccount'); }}>{t('portal.totp.login')}</button>
    </div>}
    {notice && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{notice}</p>}
  </div>;
}
