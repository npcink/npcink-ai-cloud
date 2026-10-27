'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { NavigationHandoff } from '@/components/ui/NavigationHandoff';
import { PortalAuthShell } from '@/components/portal/PortalAuthShell';
import { PortalCard } from '@/components/portal/PortalScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import {
  isPortalSecondFactorRequired,
  parsePortalSecondFactorFailure,
} from '@/lib/portal-auth-wire';

function resolvePortalRedirect(value: string | null): string {
  const redirect = String(value || '').trim();
  if (
    redirect === '/portal'
    || redirect.startsWith('/portal/')
    || redirect.startsWith('/portal?')
    || redirect.startsWith('/portal#')
  ) return redirect;
  return '/portal';
}

function SecondFactorContent() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    secondFactor,
    secondFactorResolution,
    isAuthenticated,
    isLoading,
    verifySecondFactor,
    refresh,
  } = useSession();
  const redirectTo = resolvePortalRedirect(searchParams.get('redirect'));
  const methods = secondFactor?.methods || ['totp'];
  const [method, setMethod] = useState<'totp' | 'recovery_code'>(methods.includes('totp') ? 'totp' : 'recovery_code');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace(redirectTo);
  }, [isAuthenticated, redirectTo, router]);

  useEffect(() => {
    if (secondFactor?.methods.includes(method)) return;
    const next = secondFactor?.methods.includes('totp') ? 'totp' : 'recovery_code';
    setMethod(next);
    setCode('');
  }, [method, secondFactor]);

  const expiredText = useMemo(() => t(
    'portal.auth.second_factor_expired',
    undefined,
    'This verification step is no longer available. Start sign-in again.'
  ), [t]);
  const unknownText = useMemo(() => t(
    'portal.auth.second_factor_status_unknown',
    undefined,
    'We could not confirm whether this verification step is still available. Try again or reload the page; do not submit another code until the status is confirmed.'
  ), [t]);

  if (isAuthenticated) return <NavigationHandoff href={redirectTo} />;
  if (isLoading) return <LoadingFallback />;

  if (!secondFactor) {
    const statusUnknown = secondFactorResolution === 'unknown';
    return (
      <PortalAuthShell
        eyebrow={t('portal.auth.second_factor_eyebrow', undefined, 'Additional verification')}
        title={statusUnknown
          ? t('portal.auth.second_factor_status_unknown_title', undefined, 'Verification status unavailable')
          : t('portal.auth.second_factor_unavailable_title', undefined, 'Verification step unavailable')}
        description={statusUnknown ? unknownText : expiredText}
        aside={(
          <PortalCard className="bg-white/70 dark:bg-slate-950/35">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              {statusUnknown
                ? t('portal.auth.second_factor_status_unknown_desc', undefined, 'The browser kept the verification cookie. Recheck its status before starting a new sign-in.')
                : t('portal.auth.second_factor_restart_desc', undefined, 'Return to sign in and request a new verification step.')}
            </p>
            {statusUnknown ? (
              <button type="button" className="btn btn-secondary mt-4 w-full justify-center" onClick={() => {
                // The session hook records the refreshed challenge/error state.
                // A retry can recover a challenge while the session request rejects.
                void refresh().catch(() => undefined);
              }}>
                {t('common.retry', undefined, 'Try again')}
              </button>
            ) : null}
            <Link href="/portal/login" className="btn btn-secondary mt-4 w-full justify-center">
              {t('nav.sign_in', undefined, 'Sign in')}
            </Link>
          </PortalCard>
        )}
      >
        {null}
      </PortalAuthShell>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedCode = code.trim();
    const validCode = method === 'totp' ? /^\d{6}$/.test(normalizedCode) : normalizedCode.length >= 8;
    if (!validCode) {
      setError(true);
      setMessage(t(
        method === 'totp' ? 'portal.auth.second_factor_code_invalid' : 'portal.auth.recovery_code_invalid',
        undefined,
        method === 'totp' ? 'Enter the six-digit code from your authenticator.' : 'Enter a valid recovery code.'
      ));
      return;
    }
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const result = await verifySecondFactor({ method, code: normalizedCode });
      if (isPortalSecondFactorRequired(result)) {
        setError(true);
        setMessage(t('portal.auth.second_factor_still_required', undefined, 'The code was not accepted. Try again or use a recovery code.'));
        return;
      }
      router.replace(redirectTo);
    } catch (verificationError) {
      setError(true);
      const failure = parsePortalSecondFactorFailure(verificationError);
      setMessage(formatPortalErrorMessage(
        verificationError,
        t,
        failure.disposition === 'unknown'
          ? t(
            'portal.auth.second_factor_result_unknown',
            undefined,
            'The result is unknown. We could not confirm whether the code was accepted or consumed. Wait, then retry or reload the status; do not submit repeatedly.'
          )
          : t('portal.auth.second_factor_failed', undefined, 'The code could not be verified. Check it and try again.')
      ));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalAuthShell
      eyebrow={t('portal.auth.second_factor_eyebrow', undefined, 'Additional verification')}
      title={t('portal.auth.second_factor_title', undefined, 'Confirm it is you')}
      description={t('portal.auth.second_factor_desc', undefined, 'Your first sign-in step is complete. Finish with your authenticator code or one unused recovery code.')}
      aside={(
        <PortalCard className="bg-white/70 dark:bg-slate-950/35">
          <h2 className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">
            {t('portal.auth.second_factor_security_title', undefined, 'Keep this step private')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {t('portal.auth.second_factor_security_desc', undefined, 'The verification cookie is short-lived and stays in this browser. Never share a code or recovery code.')}
          </p>
        </PortalCard>
      )}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {methods.length > 1 ? (
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2 text-sm dark:border-slate-800 dark:bg-slate-950/45">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 font-semibold ${method === 'totp' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              onClick={() => { setMethod('totp'); setCode(''); setMessage(''); setError(false); }}
              disabled={busy || !methods.includes('totp')}
            >
              {t('portal.auth.totp_method', undefined, 'Authenticator code')}
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 font-semibold ${method === 'recovery_code' ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              onClick={() => { setMethod('recovery_code'); setCode(''); setMessage(''); setError(false); }}
              disabled={busy || !methods.includes('recovery_code')}
            >
              {t('portal.auth.recovery_method', undefined, 'Recovery code')}
            </button>
          </div>
        ) : null}
        <div>
          <label htmlFor="second-factor-code" className="mb-2 block text-sm font-medium">
            {method === 'totp'
              ? t('portal.auth.totp_label', undefined, 'Authenticator code')
              : t('portal.auth.recovery_label', undefined, 'Recovery code')}
          </label>
          <input
            id="second-factor-code"
            type="text"
            inputMode={method === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(event) => { setCode(event.target.value); setMessage(''); setError(false); }}
            disabled={busy}
            className={`input ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
            placeholder={method === 'totp' ? '000000' : 'XXXX-XXXX-XXXX'}
            aria-describedby={message ? 'second-factor-message' : undefined}
          />
        </div>
        {message ? (
          <p id="second-factor-message" role={error ? 'alert' : 'status'} className={`rounded-2xl px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200'}`}>
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">
          {busy ? t('portal.auth.second_factor_verifying', undefined, 'Verifying…') : t('portal.auth.second_factor_continue', undefined, 'Continue')}
        </button>
        <p className="text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t('portal.auth.second_factor_no_access', undefined, 'Lost access to both options? Start sign-in again or contact support.')}
        </p>
      </form>
    </PortalAuthShell>
  );
}

export default function SecondFactorPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SecondFactorContent />
    </Suspense>
  );
}
