'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PortalPageStack,
  PortalSection,
  PortalCard,
  PortalInfoHint,
} from '@/components/portal/PortalScaffold';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalAccountCommercePanels } from '@/components/portal/PortalAccountCommercePanels';
import { PortalDataExport } from '@/components/portal/PortalDataExport';
import { PortalSessions } from '@/components/portal/PortalSessions';
import { PortalRevokeSessions } from '@/components/portal/PortalRevokeSessions';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { Modal } from '@/components/ui/Modal';
import {
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  publishPortalNotificationCount,
  type PortalIdentityProviderStatus,
} from '@/lib/portal-client';
import { formatPortalErrorMessage, formatPortalWriteErrorMessage } from '@/lib/portal-error';
import { ApiError } from '@/lib/errors';
import { cn, formatDate } from '@/lib/utils';

type AccountActionState =
  | 'idle'
  | 'loading'
  | 'binding'
  | 'unbinding'
  | 'requesting_email_change'
  | 'verifying_email_change'
  | 'error';

function normalizePortalContact(value?: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  const withoutPrefix = trimmed.replace(/^user:/, '');
  return withoutPrefix.includes('@') && !withoutPrefix.startsWith('prn_') ? withoutPrefix : '';
}

function AccountPageContent() {
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { session, isLoading, isAuthenticated, refresh, logout } = useSession();
  const [providerState, setProviderState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [providerError, setProviderError] = useState('');
  const [providers, setProviders] = useState<PortalIdentityProviderStatus[]>([]);
  const [status, setStatus] = useState<AccountActionState>('idle');
  const [message, setMessage] = useState('');
  const [emailChangeNewEmail, setEmailChangeNewEmail] = useState('');
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [emailChangePendingEmail, setEmailChangePendingEmail] = useState('');
  const [showEmailChange, setShowEmailChange] = useState(false);

  const [showClosure, setShowClosure] = useState(false);
  const [closureStep, setClosureStep] = useState<'review' | 'code'>('review');
  const [closureBusy, setClosureBusy] = useState(false);
  const [closureCode, setClosureCode] = useState('');
  const [closureError, setClosureError] = useState('');
  const [closureEmail, setClosureEmail] = useState('');

  const closeClosureDialog = () => {
    if (closureBusy) return;
    setShowClosure(false);
    setClosureCode('');
    setClosureError('');
  };

  const handleClosure = async (requestNewCode = false) => {
    setClosureBusy(true);
    setClosureError('');
    try {
      if (closureStep === 'review' || requestNewCode) {
        const response = await portalClient.requestAccountDeletionCode(locale);
        setClosureEmail(response.data.email);
        setClosureCode('');
        setClosureStep('code');
      } else {
        await portalClient.confirmAccountDeletion(closureCode.trim());
        publishPortalNotificationCount(0);
        await logout();
        router.replace('/portal/login');
      }
    } catch (error) {
      const key = error instanceof ApiError
        && error.errorCode === 'service.portal_account_closure_unavailable'
        ? 'portal.account.closure_unavailable'
        : error instanceof ApiError && error.errorCode === 'service.portal_account_deletion_code_pending'
          ? 'portal.account.closure_code_pending'
        : error instanceof ApiError && error.errorCode === 'auth.account_deletion_code_invalid'
          ? 'portal.account.closure_code_invalid'
          : 'portal.account.closure_failed';
      setClosureError(formatPortalWriteErrorMessage(error, t, t(key)));
    } finally {
      setClosureBusy(false);
    }
  };

  const qqProvider = useMemo(
    () => providers.find((provider) => provider.provider === 'qq') || null,
    [providers]
  );
  const contactEmail = normalizePortalContact(session?.email);
  const qqStatus = searchParams?.get('qq') || '';

  const loadProviders = useCallback(async () => {
    setProviderState('loading');
    setProviderError('');
    try {
      const response = await portalClient.getIdentityProviders();
      setProviders(response.data?.providers || []);
      setProviderState('ready');
    } catch (error) {
      setProviderState('error');
      setProviderError(formatPortalErrorMessage(error, t, t('portal.account.identity_provider_load_failed')));
    }
  }, [t]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    void loadProviders();
  }, [isAuthenticated, loadProviders]);

  useEffect(() => {
    if (qqStatus === 'bound') {
      setMessage(t('portal.account.qq_bound', undefined, 'QQ quick login is bound.'));
      void loadProviders();
      void refresh();
    }
    if (qqStatus === 'binding_required') {
      setMessage(
        t(
          'portal.account.qq_binding_required',
          undefined,
          'This QQ account is not linked yet. Sign in and start binding from Account Center.'
        )
      );
    }
  }, [loadProviders, qqStatus, refresh, t]);

  const handleBindQq = async () => {
    setStatus('binding');
    setMessage('');
    try {
      const response = await portalClient.startQqBind('/portal/account');
      const authorizationUrl = response.data?.authorization_url || '';
      if (!authorizationUrl) {
        throw new Error(t('portal.account.qq_authorization_missing', undefined, 'QQ authorization URL is empty'));
      }
      window.location.assign(authorizationUrl);
    } catch (error) {
      setStatus('error');
      setMessage(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.account.qq_bind_failed', undefined, 'Unable to start QQ binding')
        )
      );
    }
  };

  const handleUnbindQq = async () => {
    setStatus('unbinding');
    setMessage('');
    try {
      await portalClient.unbindQqLogin();
      setProviders((current) =>
        current.map((provider) =>
          provider.provider === 'qq'
            ? { ...provider, bound: false, binding: null }
            : provider
        )
      );
      setMessage(t('portal.account.qq_unbound', undefined, 'QQ quick login has been unbound. Sign in again.'));
      setStatus('idle');
      window.location.assign('/portal/login?reason=qq_unbound');
    } catch (error) {
      setStatus('error');
      setMessage(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.account.qq_unbind_failed', undefined, 'Unable to unbind QQ quick login')
        )
      );
    }
  };

  const handleRequestEmailChange = async () => {
    const nextEmail = emailChangeNewEmail.trim();
    if (!nextEmail) {
      setStatus('error');
      setMessage(t('portal.account.email_change_required', undefined, 'Enter the new email address.'));
      return;
    }
    setStatus('requesting_email_change');
    setMessage('');
    setEmailChangeCode('');
    try {
      const response = await portalClient.requestEmailChangeCode({
        new_email: nextEmail,
        locale: locale === 'en' ? 'en' : 'zh-CN',
      });
      const pendingEmail = response.data?.new_email || nextEmail;
      setEmailChangePendingEmail(pendingEmail);
      setMessage(
        t(
          'portal.account.email_change_code_sent',
          { email: pendingEmail },
          'Verification code sent to {{email}}. The current email remains active until verification.'
        )
      );
      setStatus('idle');
    } catch (error) {
      setStatus('error');
      setMessage(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.account.email_change_request_failed', undefined, 'Unable to send the email change code')
        )
      );
    }
  };

  const handleVerifyEmailChange = async () => {
    const nextEmail = (emailChangePendingEmail || emailChangeNewEmail).trim();
    const code = emailChangeCode.trim();
    if (!nextEmail || !code) {
      setStatus('error');
      setMessage(t('portal.account.email_change_code_required', undefined, 'Enter the verification code from the new email.'));
      return;
    }
    setStatus('verifying_email_change');
    setMessage('');
    try {
      const response = await portalClient.verifyEmailChangeCode({
        new_email: nextEmail,
        code,
      });
      const changedEmail = response.data?.new_email || nextEmail;
      setEmailChangeNewEmail('');
      setEmailChangePendingEmail('');
      setEmailChangeCode('');
      setMessage(
        t(
          'portal.account.email_change_done',
          { email: changedEmail },
          'Login email changed to {{email}}.'
        )
      );
      await refresh();
      setStatus('idle');
      setShowEmailChange(false);
    } catch (error) {
      setStatus('error');
      setMessage(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.account.email_change_verify_failed', undefined, 'Unable to verify the email change code')
        )
      );
    }
  };

  if (isLoading) {
    return (
      <PortalLoadingState
        message={t('portal.loading_session', undefined, 'Loading Portal session')}
      />
    );
  }

  if (!isAuthenticated || !session) {
    return (
      <PortalSignedOutState
        title={t('portal.account.signed_out_title', undefined, 'Sign-in required')}
        description={t('portal.account.signed_out_desc', undefined, 'Sign in to view Account Center.')}
        actionLabel={t('nav.sign_in')}
      />
    );
  }

  const showPrimaryIdentityBadge = Boolean(qqProvider?.bound);

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        title={t('portal.account.title', undefined, 'Account')}
        currentPage="account"
        actionsPlacement="title-end"
        titleAccessory={(
          <PortalInfoHint
            detail={t(
              'portal.account.description',
              undefined,
              'Manage sign-in methods, contact email, and payment history. Package changes live on the Package page.'
            )}
          />
        )}
        actions={
          <Link href="/portal/audit" className="btn btn-secondary btn-sm" data-portal-account-deeplink="audit">
            {t('portal.audit.nav_label', undefined, 'Recent activity')}
          </Link>
        }
      />

      {message ? (
        <div
          className={cn(
            'rounded-[1.1rem] border px-4 py-3 text-sm',
            status === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
              : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200'
          )}
        >
          {message}
        </div>
      ) : null}

      <PortalSection className="space-y-4" data-portal-account="login-security">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            {t('portal.account.login_security_title', undefined, 'Sign-in and security')}
          </h2>
          <PortalInfoHint
            detail={t(
              'portal.account.email_login_desc',
              undefined,
              'Sign in with a verification code sent to the contact email shown on this page.'
            )}
          />
        </div>

        <div
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-portal-account="contact-info"
        >
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-950 dark:text-white">
              {contactEmail || t('portal.account.contact_missing_desc', undefined, 'Email contact is not visible in this local session.')}
            </p>
            {showPrimaryIdentityBadge ? (
              <div className="mt-1.5">
                <PortalStatusBadge
                  force
                  label={t('portal.account.primary_identity', undefined, 'Primary identity')}
                  status="active"
                />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm shrink-0"
            onClick={() => setShowEmailChange(true)}
          >
            {contactEmail
              ? t('portal.account.contact_change_title', undefined, 'Change email')
              : t('portal.account.contact_add_title', undefined, 'Add email')}
          </button>
        </div>

          {providerState === 'loading' ? (
            <PortalLoadingState message={t('common.loading')} compact />
          ) : providerState === 'error' ? (
            <PortalErrorState
              title={t('error.failed_load', {}, 'Failed to load')}
              description={providerError}
              retryLabel={t('common.retry')}
              onRetry={() => void loadProviders()}
            />
          ) : !qqProvider?.configured && !qqProvider?.bound ? (
            <div
              className="rounded-[1.1rem] border border-slate-200/80 bg-white/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/35"
              data-portal-account="other-login-unavailable"
            >
              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('portal.account.other_login_methods_title', undefined, 'Other sign-in methods')}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t(
                  'portal.account.qq_unavailable_short',
                  undefined,
                  'QQ quick login is not available in the current environment.'
                )}
              </p>
            </div>
          ) : (
          <PortalCard className="space-y-4 bg-white/80 dark:bg-slate-950/55">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-950 dark:text-white">
                    {t('portal.account.qq_login_title', undefined, 'QQ quick login')}
                  </h3>
                  <PortalStatusBadge
                    force
                    label={
                      qqProvider?.bound
                        ? t('portal.account.bound', undefined, 'Bound')
                        : t('portal.account.unbound', undefined, 'Unbound')
                    }
                    status={qqProvider?.bound ? 'active' : 'inactive'}
                  />
                  {!qqProvider?.configured ? (
                    <PortalStatusBadge
                      label={t('portal.account.not_configured', undefined, 'Not configured')}
                      status="warning"
                    />
                  ) : null}
                  <PortalInfoHint
                    detail={
                      qqProvider?.bound
                        ? t('portal.account.qq_bound_desc', undefined, 'You can use the bound QQ account for quick Portal login.')
                        : t('portal.account.qq_unbound_desc', undefined, 'After binding, QQ can be used for quick login. Email remains the primary account.')
                    }
                  />
                </div>
                {qqProvider?.bound && qqProvider.binding?.display_name ? (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    {t('portal.account.qq_bound_as', undefined, 'Bound account')}: {qqProvider.binding.display_name}
                  </p>
                ) : null}
                {!qqProvider?.configured ? (
                  <p className="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    {t('portal.account.qq_unavailable_desc', undefined, 'QQ quick login is not available in the current environment. Email login remains available.')}
                  </p>
                ) : null}
                {qqProvider?.binding?.last_login_at ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {t('portal.account.qq_last_login', undefined, 'Last QQ login')}:
                    {formatDate(qqProvider.binding.last_login_at)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {qqProvider?.bound ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleUnbindQq()}
                    disabled={status === 'unbinding' || !contactEmail}
                    title={!contactEmail ? t('portal.account.qq_unbind_requires_email', undefined, 'Set and verify an email login before unbinding QQ.') : undefined}
                  >
                    {status === 'unbinding'
                      ? t('portal.account.unbinding', undefined, 'Unbinding')
                      : t('portal.account.unbind_qq', undefined, 'Unbind QQ')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleBindQq()}
                    disabled={!qqProvider?.configured || status === 'binding'}
                  >
                    {status === 'binding'
                      ? t('portal.account.binding', undefined, 'Redirecting')
                      : t('portal.account.bind_qq', undefined, 'Bind QQ')}
                  </button>
                )}
              </div>
            </div>
          </PortalCard>
          )}
        <PortalSessions />
        <PortalRevokeSessions />
        <PortalDataExport />
      </PortalSection>

      <div className="space-y-3" data-portal-account="payment-orders-section">
        <PortalAccountCommercePanels surface="account" />
      </div>

      <PortalSection className="space-y-3" data-portal-account="closure">
        <h2 className="text-base font-semibold text-slate-950 dark:text-white">{t('portal.account.closure_title')}</h2>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{t('portal.account.closure_impact')}</p>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('portal.account.closure_eligibility')}</p>
        <button type="button" className="btn btn-secondary btn-sm text-rose-700 dark:text-rose-300" onClick={() => setShowClosure(true)}>
          {t('portal.account.closure_start')}
        </button>
      </PortalSection>

      <Modal
        isOpen={showClosure}
        onClose={closeClosureDialog}
        closeLabel={t('common.close')}
        title={t(closureStep === 'review' ? 'portal.account.closure_review' : 'portal.account.closure_verify')}
        description={t('portal.account.closure_impact')}
      >
        <div className="space-y-4" data-portal-account="closure-dialog">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">{t('portal.account.closure_eligibility')}</p>
          {closureStep === 'code' ? (
            <>
              <p className="text-sm" role="status">{t('portal.account.closure_sent', { email: closureEmail })}</p>
              <label className="grid gap-2 text-sm font-medium">
                {t('portal.account.closure_code')}
                <input className="input" inputMode="numeric" autoComplete="one-time-code" value={closureCode} maxLength={6} onChange={(event) => setClosureCode(event.target.value.replace(/\D/g, ''))} />
              </label>
              <button type="button" className="text-sm text-blue-700 hover:underline dark:text-blue-300" disabled={closureBusy} onClick={() => void handleClosure(true)}>
                {t('portal.account.closure_restart')}
              </button>
            </>
          ) : null}
          {closureError ? <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{closureError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-secondary" disabled={closureBusy} onClick={closeClosureDialog}>{t('common.cancel')}</button>
            <button type="button" className="btn bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-50" disabled={closureBusy || (closureStep === 'code' && closureCode.length !== 6)} onClick={() => void handleClosure()}>
              {closureBusy ? t('common.loading') : t(closureStep === 'review' ? 'portal.account.closure_send' : 'portal.account.closure_confirm')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showEmailChange}
        onClose={() => { if (status !== 'requesting_email_change' && status !== 'verifying_email_change') setShowEmailChange(false); }}
        closeLabel={t('common.close', {}, 'Close')}
        title={contactEmail
          ? t('portal.account.contact_change_title', undefined, 'Change email')
          : t('portal.account.contact_add_title', undefined, 'Add email')}
        description={contactEmail
          ? t(
              'portal.account.contact_change_desc',
              undefined,
              'Enter a new email and verify the code sent there. Your current email remains active until verification succeeds.'
            )
          : t(
              'portal.account.contact_add_desc',
              undefined,
              'Add and verify an email login before removing another sign-in method.'
            )}
      >
        <div className="grid gap-3" data-portal-account="email-change-dialog">
          {message ? (
            <p
              id="portal-account-action-message"
              className={cn(
                'rounded-xl px-3 py-2 text-sm',
                status === 'error'
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-200'
              )}
              role={status === 'error' ? 'alert' : 'status'}
              aria-live={status === 'error' ? 'assertive' : 'polite'}
            >
              {message}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('portal.account.email_change_new_email', undefined, 'New email')}
            <input
              type="email"
              value={emailChangeNewEmail}
              onChange={(event) => setEmailChangeNewEmail(event.target.value)}
              placeholder={t('auth.email_placeholder', undefined, 'you@example.com')}
              className="input"
              autoComplete="email"
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary justify-center"
            onClick={() => void handleRequestEmailChange()}
            disabled={status === 'requesting_email_change'}
          >
            {status === 'requesting_email_change'
              ? t('portal.account.email_change_sending', undefined, 'Sending')
              : t('portal.account.email_change_send_code', undefined, 'Send verification code')}
          </button>
          {emailChangePendingEmail ? (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t(
                  'portal.account.email_change_pending_desc',
                  { email: emailChangePendingEmail },
                  'Enter the code sent to {{email}} to switch the login email.'
                )}
              </p>
              <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {t('portal.account.email_change_code', undefined, 'Verification code')}
                <input
                  type="text"
                  inputMode="numeric"
                  value={emailChangeCode}
                  onChange={(event) => setEmailChangeCode(event.target.value)}
                  placeholder="000000"
                  className="input"
                  autoComplete="one-time-code"
                />
              </label>
              <button
                type="button"
                className="btn btn-primary justify-center"
                onClick={() => void handleVerifyEmailChange()}
                disabled={status === 'verifying_email_change'}
              >
                {status === 'verifying_email_change'
                  ? t('portal.account.email_change_verifying', undefined, 'Verifying')
                  : t('portal.account.email_change_confirm', undefined, 'Confirm email change')}
              </button>
            </div>
          ) : null}
        </div>
      </Modal>
    </PortalPageStack>
  );
}

export default function PortalAccountPage() {
  return (
    <Suspense fallback={<AccountPageFallback />}>
      <AccountPageContent />
    </Suspense>
  );
}

function AccountPageFallback() {
  const { t } = useLocale();
  return <PortalLoadingState message={t('common.loading', {}, 'Loading...')} />;
}
