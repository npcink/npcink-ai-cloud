'use client';

import { useState } from 'react';
import { AdminMutationReceipt, type AdminMutationReceiptPayload } from '@/components/admin/AdminMutationReceipt';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { BackofficeSectionPanel } from '@/components/backoffice/BackofficeScaffold';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';

export type CustomerIdentityRelationshipState =
  | 'healthy'
  | 'missing'
  | 'conflict'
  | 'access_disabled';

export type CustomerPrimaryIdentity = {
  principal_id: string;
  email: string;
  status: string;
  session_version: number;
  last_login_at?: string;
  created_at?: string;
  membership_id: string;
  membership_role: string;
  membership_status: string;
  qq_bound: boolean;
  qq_binding_count: number;
};

type IdentityAuditPayload = {
  items?: Array<{
    event_id: number;
    event_kind: string;
    outcome: string;
    created_at?: string;
  }>;
  summary?: {
    events?: number;
    registration_events?: number;
    disable_events?: number;
    failed?: number;
  };
};

type IdentityDisablePayload = {
  receipt?: AdminMutationReceiptPayload | null;
};

type CustomerAccessPanelProps = {
  accountId: string;
  identity: CustomerPrimaryIdentity | null;
  relationshipState: CustomerIdentityRelationshipState;
  onAccessChanged: () => Promise<void>;
};

const customerAccessClient = createApiClient({ idempotencyPrefix: 'admin_customer_access' });

export function CustomerAccessPanel({
  accountId,
  identity,
  relationshipState,
  onAccessChanged,
}: CustomerAccessPanelProps) {
  const { t } = useLocale();
  const toast = useToast();
  const [audit, setAudit] = useState<IdentityAuditPayload | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableReason, setDisableReason] = useState('');
  const [disableError, setDisableError] = useState('');
  const [isDisabling, setIsDisabling] = useState(false);
  const [receipt, setReceipt] = useState<AdminMutationReceiptPayload | null>(null);

  const loadAudit = async () => {
    if (!identity?.principal_id) return;
    setAudit(null);
    setAuditError('');
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const payload = (
        await customerAccessClient.request<IdentityAuditPayload>(
          `/api/admin/portal-users/${encodeURIComponent(identity.principal_id)}/audit?limit=50`
        )
      ).data;
      setAudit(payload);
    } catch (error) {
      setAuditError(
        resolveUiErrorMessage(
          error,
          t('admin.accounts.identity_audit_load_failed', {}, 'Failed to load identity audit.')
        )
      );
    } finally {
      setAuditLoading(false);
    }
  };

  const disableAccess = async () => {
    const reason = disableReason.trim();
    if (!identity?.principal_id || !reason || isDisabling) return;
    setDisableError('');
    setIsDisabling(true);
    try {
      const payload = (
        await customerAccessClient.request<IdentityDisablePayload>(
          `/api/admin/portal-users/${encodeURIComponent(identity.principal_id)}/disable`,
          {
            method: 'POST',
            body: { reason },
          }
        )
      ).data;
      setReceipt(payload.receipt || null);
      setDisableOpen(false);
      setDisableReason('');
      toast.success(
        t(
          'admin.accounts.identity_disabled_notice',
          { user: identity.email || identity.principal_id },
          `${identity.email || identity.principal_id} access was disabled and active sessions were revoked.`
        ),
        t('admin.accounts.identity_disabled_title', {}, 'Customer access disabled')
      );
      await onAccessChanged();
    } catch (error) {
      setDisableError(
        resolveUiErrorMessage(
          error,
          t('admin.accounts.identity_disable_failed', {}, 'Failed to disable customer access.')
        )
      );
    } finally {
      setIsDisabling(false);
    }
  };

  const relationshipLabel =
    relationshipState === 'healthy'
      ? t('admin.accounts.identity_healthy_label', {}, 'Active owner')
      : t(
          `admin.accounts.identity_${relationshipState}`,
          {},
          relationshipState.replace(/_/g, ' ')
        );

  return (
    <div id="customer-access" className="space-y-5">
      <BackofficeSectionPanel className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t('admin.account_detail.access_eyebrow', {}, 'Customer access')}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
              {t('admin.account_detail.access_title', {}, 'Login identity and access')}
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t(
                'admin.account_detail.access_desc',
                {},
                'Inspect the owner login identity, review its audit trail, and perform customer-specific access actions.'
              )}
            </p>
          </div>
          <BackofficeStatusBadge
            status={relationshipState === 'healthy' ? 'active' : 'warning'}
            label={relationshipLabel}
          />
        </div>

        {identity ? (
          <>
            <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
              {[
                [t('admin.accounts.login_email_label', {}, 'Login email'), identity.email],
                [t('admin.accounts.identity_status_label', {}, 'Login access'), identity.status],
                [t('admin.accounts.membership_status_label', {}, 'Owner membership'), identity.membership_status],
                [t('admin.accounts.membership_role_label', {}, 'Role'), identity.membership_role],
                [
                  t('admin.accounts.last_login_label', {}, 'Last login'),
                  identity.last_login_at
                    ? formatDate(identity.last_login_at)
                    : t('admin.accounts.never_logged_in', {}, 'No recorded login'),
                ],
                [
                  'QQ',
                  identity.qq_bound
                    ? t('admin.accounts.qq_bound_label', {}, 'Bound')
                    : t('admin.accounts.qq_unbound_label', {}, 'Not bound'),
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 border-b border-slate-200/70 pb-2 dark:border-slate-800"
                >
                  <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="text-right font-semibold text-slate-950 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => void loadAudit()}>
                {t('admin.accounts.identity_audit_action', {}, 'Identity audit')}
              </button>
            </div>

            {relationshipState === 'healthy' && identity.status === 'active' ? (
              <details className="border-t border-rose-200/80 pt-4 text-sm dark:border-rose-900/50">
                <summary className="cursor-pointer font-semibold text-rose-700 dark:text-rose-300">
                  {t('admin.accounts.access_actions_title', {}, 'Access actions')}
                </summary>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {t(
                    'admin.accounts.disable_access_boundary',
                    {},
                    'Disabling access revokes login sessions, the owner membership, and QQ quick-login bindings. It does not delete the customer account.'
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-danger btn-sm mt-3"
                  onClick={() => {
                    setDisableError('');
                    setDisableReason('');
                    setDisableOpen(true);
                  }}
                >
                  {t('admin.accounts.disable_access_action', {}, 'Disable login access')}
                </button>
              </details>
            ) : null}
          </>
        ) : (
          <div className="border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
            <p className="font-semibold">
              {relationshipState === 'conflict'
                ? t(
                    'admin.account_detail.identity_conflict_title',
                    {},
                    'Owner identity relationship requires repair'
                  )
                : t(
                    'admin.account_detail.identity_missing_title',
                    {},
                    'Owner login identity is missing'
                  )}
            </p>
            <p className="mt-1">
              {t(
                'admin.account_detail.identity_repair_desc',
                {},
                'This is a customer-specific service issue. Confirm the intended owner before repairing identity data; commercial and WordPress records are not changed here.'
              )}
            </p>
          </div>
        )}

        <AdminMutationReceipt receipt={receipt} />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t(
            'admin.account_detail.access_boundary',
            { account: accountId },
            `Access actions apply only to ${accountId}. They do not delete the customer or write to WordPress.`
          )}
        </p>
      </BackofficeSectionPanel>

      <AdminWorkbenchDialog
        open={auditOpen}
        title={t('admin.accounts.identity_audit_title', {}, 'Identity audit')}
        titleId="customer-identity-audit-title"
        error={auditError}
        saving={auditLoading}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.close', {}, 'Close')}
        saveLabel={t('common.close', {}, 'Close')}
        savingLabel={t('common.loading', {}, 'Loading...')}
        footerNotice={t(
          'admin.account_detail.identity_audit_boundary',
          {},
          'Read-only identity evidence for this customer.'
        )}
        footerActions={(
          <button
            type="button"
            className="btn btn-secondary"
            disabled={auditLoading}
            onClick={() => setAuditOpen(false)}
          >
            {t('common.close', {}, 'Close')}
          </button>
        )}
        onClose={() => setAuditOpen(false)}
        onSubmit={() => setAuditOpen(false)}
      >
        {auditLoading ? (
          <LoadingFallback />
        ) : (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                [t('admin.accounts.audit_events_label', {}, 'Events'), String(audit?.summary?.events || 0)],
                [
                  t('admin.accounts.audit_registration_label', {}, 'Registrations'),
                  String(audit?.summary?.registration_events || 0),
                ],
                [t('admin.accounts.audit_disable_label', {}, 'Disables'), String(audit?.summary?.disable_events || 0)],
                [t('admin.accounts.audit_failed_label', {}, 'Failed'), String(audit?.summary?.failed || 0)],
              ].map(([label, value]) => (
                <div key={label} className="border border-slate-200 px-3 py-2 dark:border-slate-800">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="mt-1 font-semibold text-slate-950 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-2">
              {(audit?.items || []).length ? (
                (audit?.items || []).map((event) => (
                  <div
                    key={event.event_id}
                    className="flex items-center justify-between gap-4 border-b border-slate-200/70 pb-2 text-sm last:border-b-0 dark:border-slate-800"
                  >
                    <div>
                      <p className="font-medium text-slate-950 dark:text-white">{event.event_kind}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {event.created_at
                          ? formatDate(event.created_at)
                          : t('common.unknown', {}, 'Unknown')}
                      </p>
                    </div>
                    <BackofficeStatusBadge status={event.outcome} label={event.outcome} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t(
                    'admin.accounts.no_identity_audit_events',
                    {},
                    'No identity audit events are recorded.'
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </AdminWorkbenchDialog>

      <AdminWorkbenchDialog
        open={disableOpen}
        title={t('admin.accounts.disable_access_title', {}, 'Disable customer login access')}
        titleId="disable-customer-access-title"
        error={disableError}
        saving={isDisabling}
        closeLabel={t('common.close', {}, 'Close')}
        cancelLabel={t('common.cancel', {}, 'Cancel')}
        saveLabel={t('admin.accounts.confirm_disable_access', {}, 'Confirm disable')}
        savingLabel={t('common.saving', {}, 'Saving...')}
        footerNotice={t(
          'admin.accounts.disable_access_boundary',
          {},
          'This does not delete the customer account or its commercial records.'
        )}
        width="compact"
        onClose={() => {
          if (!isDisabling) setDisableOpen(false);
        }}
        onSubmit={() => void disableAccess()}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t(
            'admin.accounts.disable_access_desc',
            {},
            'This immediately invalidates customer sessions and revokes active owner and QQ access. The customer account and commercial records remain intact.'
          )}
        </p>
        <label className="block text-sm">
          <span className="mb-2 block font-medium text-slate-700 dark:text-slate-300">
            {t('admin.accounts.disable_reason_label', {}, 'Reason')}
          </span>
          <textarea
            value={disableReason}
            onChange={(event) => {
              setDisableReason(event.target.value);
              if (disableError) setDisableError('');
            }}
            className="input min-h-24 w-full"
            maxLength={500}
            disabled={isDisabling}
            required
          />
        </label>
      </AdminWorkbenchDialog>
    </div>
  );
}
