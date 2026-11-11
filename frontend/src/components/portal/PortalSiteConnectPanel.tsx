'use client';
import { readableIdentityName, shortIdentity } from '@/lib/identity-display';

import { useEffect, useState, type FormEvent } from 'react';
import { PortalCard } from '@/components/portal/PortalScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import { portalClient, type PortalAddonConnectionAccount, type AddonActivationPreview } from '@/lib/portal-client';
import { resolveDefaultAddonAccountId } from '@/lib/portal-addon-account-default';
import { recordPortalJourneyBestEffort } from '@/lib/portal-customer-journey';
import {
  formatPortalErrorMessage,
  formatPortalErrorReference,
} from '@/lib/portal-error';

interface PortalSiteConnectPanelProps {
  accounts: PortalAddonConnectionAccount[];
  accountsError?: string;
  isLoadingAccounts?: boolean;
  onRetryAccounts?: () => void;
  onClose?: () => void;
  onSubmittingChange?: (busy: boolean) => void;
  initialSiteUrl?: string;
  initialSiteName?: string;
  addonReturnUrl?: string;
  addonState?: string;
  /** Current account, when known; used to preselect among several accounts. */
  currentAccountId?: string;
}

export function PortalSiteConnectPanel({
  accounts,
  accountsError = '',
  isLoadingAccounts = false,
  onRetryAccounts,

  onSubmittingChange,
  initialSiteUrl = '',
  initialSiteName = '',
  addonReturnUrl = '',
  addonState = '',
  currentAccountId = '',
}: PortalSiteConnectPanelProps) {
  const { t } = useLocale();
  const { session } = useSession();
  const signedInEmail = session?.email || '';
  const [manualAccountId, setSelectedAccountId] = useState('');
  const defaultAccountId = resolveDefaultAddonAccountId(accounts, currentAccountId);
  const selectedAccountId = accounts.some((account) => account.account_id === manualAccountId)
    ? manualAccountId
    : defaultAccountId;
  const siteName = initialSiteName;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorReference, setErrorReference] = useState('');
  const siteUrl = initialSiteUrl.trim();
  const hasAddonConnectionContext = Boolean(siteUrl && addonReturnUrl && addonState);
  const hasSelectedEligibleAccount = accounts.some(
    (account) => account.account_id === selectedAccountId
  );
  const soleAccount =
    accounts.length === 1 ? (accounts.values().next().value ?? null) : null;
  const addonSiteLabel =
    siteName.trim() ||
    siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
    t('portal.connect_site_new_site', undefined, 'New site');

  const [previewVersion, setPreviewVersion] = useState(0);
  const previewContext = JSON.stringify([selectedAccountId, siteUrl, siteName, addonReturnUrl, addonState, previewVersion]);
  const [previewResult, setPreviewResult] = useState<{ context: string; data: AddonActivationPreview } | null>(null);
  const [previewFailure, setPreviewFailure] = useState<{ context: string; message: string; reference: string } | null>(null);
  const [selection, setSelection] = useState<{ context: string; ids: string[] }>({ context: '', ids: [] });
  const preview = previewResult?.context === previewContext ? previewResult.data : null;
  const previewError = previewFailure?.context === previewContext ? previewFailure : null;
  const replacementIds = selection.context === previewContext ? selection.ids : [];
  const activationReady = Boolean(preview && replacementIds.length === preview.required_release_count);

  useEffect(() => {
    if (!hasAddonConnectionContext || !hasSelectedEligibleAccount || isLoadingAccounts) return;
    let cancelled = false;
    void portalClient.previewAddonConnection({
      account_id: selectedAccountId, site_url: siteUrl, site_name: siteName,
      return_url: addonReturnUrl, state: addonState,
    }).then(response => {
      if (!cancelled) {
        setPreviewResult({ context: previewContext, data: response.data });
        setPreviewFailure(null);
      }
    }).catch(error => {
      if (!cancelled) setPreviewFailure({
        context: previewContext,
        message: formatPortalErrorMessage(error, t, t('portal.bind_preview_failed')),
        reference: formatPortalErrorReference(error),
      });
    });
    return () => { cancelled = true; };
  }, [hasAddonConnectionContext, hasSelectedEligibleAccount, isLoadingAccounts,
    selectedAccountId, siteUrl, siteName, addonReturnUrl, addonState, previewContext, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setErrorReference('');
    if (!hasAddonConnectionContext) {
      setErrorMessage(
        t(
          'portal.connect_site_failed',
          undefined,
          'The WordPress addon connection context is incomplete. Restart the connection from WordPress.'
        )
      );
      return;
    }
    if (!hasSelectedEligibleAccount) {
      setErrorMessage(
        t(
          'portal.connect_site_account_required_desc',
          undefined,
          'Select an active customer account before finishing this connection.'
        )
      );
      return;
    }

    if (!activationReady || isSubmitting) return;
    setIsSubmitting(true);
    onSubmittingChange?.(true);
    try {
      const response = await portalClient.createAddonConnection({
        account_id: selectedAccountId,
        site_url: siteUrl,
        site_name: siteName,
        return_url: addonReturnUrl,
        state: addonState,
        activate: true,
        replace_site_ids: replacementIds,
      });
      await recordPortalJourneyBestEffort(
        response.data.site_id,
        'site_connect',
        'succeeded',
        { deadlineMs: 300 }
      );
      window.location.assign(response.data.redirect_url);
    } catch (error) {
      setPreviewVersion(version => version + 1);
      setErrorReference(formatPortalErrorReference(error));
      setErrorMessage(
        formatPortalErrorMessage(
          error,
          t,
          t('portal.connect_site_failed', undefined, 'Failed to connect the WordPress site.')
        )
      );
    } finally {
      setIsSubmitting(false);
      onSubmittingChange?.(false);
    }
  };

  // Distinguish duplicate names without exposing administrator-only customer notes.
  const accountLabel = (account: PortalAddonConnectionAccount, index: number) => {
    const name = readableIdentityName(account.name, account.account_id);
    const duplicate = name && accounts.filter(item => readableIdentityName(item.name, item.account_id) === name).length > 1;
    if (name) return duplicate ? `${name} · ${shortIdentity(account.account_id)}` : name;
    return (accounts.length === 1 ? signedInEmail : '')
      || `${t('portal.bind_account_fallback', { index: String(index + 1) }, `Account ${index + 1}`)} · ${shortIdentity(account.account_id)}`;
  };
  const isBlocked = !hasAddonConnectionContext || (!isLoadingAccounts && !accountsError && accounts.length === 0);

  return (
    <PortalCard className="space-y-6 p-6 sm:p-8" data-portal-bind="card">
      <div>
        <h1 className="text-xl font-semibold text-slate-950 dark:text-white">
          {t('portal.bind_title', undefined, 'Connect this site to your account')}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t(
            'portal.bind_desc',
            undefined,
            'After connecting, this site uses the plan and AI credits of your account.'
          )}
        </p>
      </div>

      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        <div className="px-4 py-3" data-portal-bind="site">
          <dt className="text-xs text-slate-500 dark:text-slate-400">{t('portal.bind_site_label', undefined, 'Site')}</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-slate-950 dark:text-white">{addonSiteLabel}</dd>
          {siteUrl && siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') !== addonSiteLabel ? (
            <dd className="mt-0.5 break-all text-xs text-slate-500 dark:text-slate-400">{siteUrl}</dd>
          ) : null}
        </div>
        {soleAccount ? (
          <div className="px-4 py-3" data-portal-bind="account">
            <dt className="text-xs text-slate-500 dark:text-slate-400">{t('portal.bind_account_label', undefined, 'Your account')}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-950 dark:text-white">
              {accountLabel(soleAccount, 0)}
            </dd>
          </div>
        ) : null}
      </dl>

      <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
        {!soleAccount && accounts.length > 1 ? (
          <fieldset data-portal-bind="account-picker" disabled={isSubmitting}>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('portal.bind_choose_account', undefined, 'Which account should this site use?')}
            </legend>
            <div className="mt-2 space-y-2">
              {accounts.map((account, index) => (
                <label
                  key={account.account_id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60 dark:border-slate-700 dark:has-[:checked]:bg-blue-950/30"
                >
                  <input
                    type="radio"
                    name="portal-addon-account"
                    value={account.account_id}
                    checked={selectedAccountId === account.account_id}
                    onChange={(event) => {
                      setSelectedAccountId(event.target.value);
                      setErrorMessage('');
                    }}
                    required
                  />
                  <span className="min-w-0 break-words font-medium text-slate-950 dark:text-white">
                    {accountLabel(account, index)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {isLoadingAccounts ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading', {}, 'Loading...')}</p>
        ) : null}
        {accountsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <p>{accountsError}</p>
            {onRetryAccounts ? (
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={onRetryAccounts}>
                {t('common.retry')}
              </button>
            ) : null}
          </div>
        ) : null}
        {!isLoadingAccounts && !accountsError && accounts.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p>
              {t(
                'portal.connect_site_account_recovery_desc',
                {},
                'Reload available accounts. If none appear, close this window and restart the connection from WordPress.'
              )}
            </p>
            {onRetryAccounts ? (
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={onRetryAccounts}>
                {t('portal.connect_site_reload_accounts', {}, 'Reload accounts')}
              </button>
            ) : null}
          </div>
        ) : null}
        {!hasAddonConnectionContext ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p>
              {t(
                'portal.connect_site_context_expired_desc',
                {},
                'This connection request is incomplete or expired. Close this window and start again from the WordPress addon.'
              )}
            </p>
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <p>{errorMessage}</p>
            {errorReference ? (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-medium">
                  {t('common.diagnostic_code', {}, 'Reference code')}
                </summary>
                <code className="mt-2 inline-block break-all rounded bg-white/70 px-2 py-1 dark:bg-slate-950/40">
                  {errorReference}
                </code>
              </details>
            ) : null}
          </div>
        ) : null}

        {hasAddonConnectionContext && hasSelectedEligibleAccount && !preview && !previewError ? (
          <p className="text-sm text-slate-500" role="status">{t('portal.bind_checking')}</p>
        ) : null}
        {previewError ? (
          <div role="alert" className="space-y-2 text-sm text-red-700 dark:text-red-200">
            <p>{previewError.message}</p>
            {previewError.reference ? <code className="block break-all text-xs">{previewError.reference}</code> : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreviewVersion(version => version + 1)}>
              {t('common.retry')}
            </button>
          </div>
        ) : null}
        {preview && preview.required_release_count > 0 ? (
          <fieldset className="space-y-3" disabled={isSubmitting} data-portal-bind="replacements">
            <legend className="text-sm font-medium text-slate-900 dark:text-white">
              {t('portal.bind_replace', { count: String(preview.required_release_count) })}
            </legend>
            <p className="text-sm text-amber-800 dark:text-amber-200">{t('portal.bind_replace_desc')}</p>
            {preview.replacement_sites.map(site => (
              <label key={site.site_id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                <input type="checkbox" className="mt-1" checked={replacementIds.includes(site.site_id)}
                  onChange={event => {
                    setSelection({ context: previewContext, ids: event.target.checked
                      ? [...replacementIds, site.site_id] : replacementIds.filter(id => id !== site.site_id) });
                    setErrorMessage('');
                  }} />
                <span className="min-w-0 break-words">
                  <span className="block font-medium">{site.name || site.site_url}</span>
                  {site.name && site.site_url ? <span className="block break-all text-xs text-slate-500">{site.site_url}</span> : null}
                </span>
              </label>
            ))}
            {preview.replacement_sites.length < preview.required_release_count ? (
              <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">{t('portal.bind_no_replacement')}</p>
            ) : null}
          </fieldset>
        ) : null}
        {preview ? <p className="text-sm text-slate-600 dark:text-slate-300">{t('portal.bind_return_desc')}</p> : null}

        <button
          type="submit"
          className="btn btn-primary w-full justify-center"
          data-portal-bind="submit"
          disabled={isSubmitting || isLoadingAccounts || isBlocked || !hasSelectedEligibleAccount || !activationReady}
        >
          {isSubmitting
            ? t('portal.bind_submitting', undefined, 'Connecting…')
            : t('portal.bind_activate')}
        </button>
      </form>
    </PortalCard>
  );
}

export default PortalSiteConnectPanel;
