'use client';

import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { ApiError } from '@/lib/errors';
import { portalClient, publishPortalNotificationCount } from '@/lib/portal-client';

type Outcome = 'failed' | 'unknown' | 'unavailable' | 'ended' | null;

export function PortalRevokeSessions() {
  const { t } = useLocale();
  const { clearSession } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const pending = useRef(false);
  const outcomeMessages = {
    failed: t('portal.account.revoke_failed'),
    unknown: t('portal.account.revoke_unknown'),
    unavailable: t('portal.account.revoke_unavailable'),
    ended: t('portal.account.revoke_ended'),
  };

  const returnToLogin = () => {
    publishPortalNotificationCount(0);
    clearSession();
    // A new document also discards cached account/notification component state.
    window.location.replace('/portal/login');
  };

  const revoke = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setOutcome(null);
    try {
      await portalClient.revokeSession();
    } catch (error) {
      // A lost response or server failure can follow a committed revocation.
      // Read directly: refresh() can also write an automatic site selection.
      try {
        await portalClient.getSession();
        const rejected = error instanceof ApiError
          && error.statusCode >= 400 && error.statusCode < 500
          && error.statusCode !== 408 && !error.errorCode.startsWith('client.');
        setOutcome(rejected ? 'failed' : 'unknown');
      } catch (readError) {
        // A 401 establishes only this browser's status, not global success.
        setOutcome(readError instanceof ApiError && readError.statusCode === 401
          ? 'ended' : 'unavailable');
      }
      pending.current = false;
      setBusy(false);
      return;
    }
    returnToLogin();
  };

  return (
    <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800" data-portal-account="revoke-sessions">
      <h3 className="text-base font-semibold">{t('portal.account.revoke_title')}</h3>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{t('portal.account.revoke_impact')}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOutcome(null); setOpen(true); }}>
        {t('portal.account.revoke_title')}
      </button>
      <Modal
        isOpen={open}
        title={t('portal.account.revoke_title')}
        description={t('portal.account.revoke_impact')}
        closeLabel={t('common.close')}
        showCloseButton={!busy && outcome !== 'ended'}
        closeOnOverlay={!busy && outcome !== 'ended'}
        onClose={() => { if (!pending.current && outcome !== 'ended') setOpen(false); }}
        footer={(
          <>
            {outcome !== 'ended' ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</button>
            ) : null}
            {outcome === 'ended' ? (
              <button type="button" className="btn btn-primary" onClick={returnToLogin}>{t('portal.account.revoke_login')}</button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void revoke()}>
                {t(busy ? 'portal.account.revoke_busy' : 'portal.account.revoke_confirm')}
              </button>
            )}
          </>
        )}
      >
        <div aria-busy={busy}>
          {outcome ? <p role="alert" className="text-sm leading-6">{outcomeMessages[outcome]}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
