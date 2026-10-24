'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { ApiError } from '@/lib/errors';
import { portalClient } from '@/lib/portal-client';

export function PortalDataExport() {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [ended, setEnded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (challenge) input.current?.focus(); }, [challenge]);
  const pending = useRef(false);
  const resendAt = useRef(0);

  const close = () => {
    if (pending.current) return;
    setOpen(false); setChallenge(''); setCode(''); setMessage(''); setEnded(false);
  };
  const failure = (error: unknown) => {
    const status = error instanceof ApiError ? error.statusCode : 0;
    setEnded(status === 401);
    setMessage(status === 401 ? t('portal.account.export_session')
      : status === 413 ? t('portal.account.export_large')
      : status === 429 ? t('portal.account.export_rate')
      : status === 503 ? t('portal.account.export_unavailable')
      : status === 400 ? t('portal.account.export_invalid') : t('portal.account.export_failed'));
  };
  const send = async () => {
    if (pending.current) return;
    if (Date.now() < resendAt.current) { setMessage(t('portal.account.export_rate')); return; }
    pending.current = true; setBusy(true); setMessage('');
    try {
      const result = await portalClient.requestDataExportCode(locale);
      setChallenge(result.challenge_id); setCode('');
      resendAt.current = Date.now() + 60_000;
      setMessage(t('portal.account.export_sent'));
    } catch (error) { failure(error); }
    finally { pending.current = false; setBusy(false); }
  };
  const download = async () => {
    if (pending.current || !challenge || !/^[0-9]{6}$/.test(code)) return;
    pending.current = true; setBusy(true); setMessage('');
    try {
      const blob = await portalClient.downloadPersonalData(challenge, code);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      try {
        link.href = url; link.download = 'cloud-personal-data.json';
        document.body.appendChild(link); link.click();
      } finally {
        link.remove(); URL.revokeObjectURL(url);
      }
      setChallenge(''); setCode(''); setMessage(t('portal.account.export_done'));
    } catch (error) { setCode(''); failure(error); }
    finally { pending.current = false; setBusy(false); }
  };
  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800" data-portal-account="data-export">
      <h3 className="text-base font-semibold">{t('portal.account.export_title')}</h3>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{t('portal.account.export_scope')}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>{t('portal.account.export_title')}</button>
      <Modal isOpen={open} title={t('portal.account.export_title')} description={t('portal.account.export_scope')}
        closeLabel={t('common.close')} onClose={close} showCloseButton={!busy} closeOnOverlay={!busy}
        footer={<>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={close}>{t('common.close')}</button>
          {ended ? <a className="btn btn-primary" href="/portal/login">{t('portal.account.revoke_login')}</a>
            : challenge ? <button type="button" className="btn btn-primary" disabled={busy || !/^[0-9]{6}$/.test(code)} onClick={() => void download()}>{busy ? t('portal.account.export_busy') : t('portal.account.export_download')}</button>
              : <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>{busy ? t('portal.account.export_busy') : t('portal.account.export_send')}</button>}
        </>}>
        <div className="space-y-3" aria-busy={busy}>
          <p className="text-sm leading-6">{t('portal.account.export_email')}</p>
          {challenge && !ended ? <>
            <label className="block text-sm" htmlFor="personal-data-code">{t('portal.account.export_code')}</label>
            <input ref={input} id="personal-data-code" className="input w-full" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ''))} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void send()}>{t('portal.account.export_resend')}</button>
          </> : null}
          {message ? <p role="status" className="text-sm leading-6">{message}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
