'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { PortalPageStack, PortalSection } from '@/components/portal/PortalScaffold';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalSiteKnowledgePanel } from '@/components/portal/PortalSiteKnowledgePanel';
import { PortalSiteServiceStatus } from '@/components/portal/PortalSiteServiceStatus';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { PortalErrorState, PortalLoadingState, PortalSignedOutState } from '@/components/portal/PortalPageState';
import { Modal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { usePortalSiteMonitoring } from '@/hooks/usePortalSiteMonitoring';
import { usePortalSiteKnowledge } from '@/hooks/usePortalSiteKnowledge';
import { useSession } from '@/hooks/useSession';
import { ApiError } from '@/lib/errors';
import {
  portalClient,
  type PortalSiteRelinkPolicy,
  type PortalSiteSummaryRecord,
  type Site,
} from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import {
  getPortalCustomerIssueTitle,
  getPortalMonitoringIssueCategory,
  hasPortalServiceAttention,
} from '@/lib/portal-monitoring-display';
import { formatDate } from '@/lib/utils';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrl,
} from '@/lib/portal-site-display';

type PortalSiteLoadError = {
  code: string;
  message: string;
};

function getPortalSiteRecovery(
  errorCode: string,
  siteId: string,
  t: (key: string, params?: Record<string, string>, fallback?: string) => string
): { label: string; href: string } | null {
  switch (errorCode) {
    case 'auth.site_inactive':
      return {
        label: t('error.portal_recovery_activate_site', {}, 'Review site activation'),
        href: '/portal#sites',
      };
    case 'auth.site_suspended':
      return {
        label: t('error.portal_recovery_contact_support', {}, 'Contact support'),
        href: `/portal/support?new=1&topic=site&site=${encodeURIComponent(siteId)}`,
      };
    case 'commercial.quota_exceeded':
      return {
        label: t('error.portal_recovery_review_account_quota', {}, 'Review account usage'),
        href: '/portal/usage',
      };
    case 'auth.site_not_found':
      return {
        label: t('error.portal_recovery_choose_owned_site', {}, 'Choose a connected site'),
        href: '/portal#sites',
      };
    case 'provider_connection.auth_failed':
      return {
        label: t('error.portal_recovery_update_connector', {}, 'Review connection steps'),
        href: '/portal#sites',
      };
    case 'provider_connection.network_error':
    case 'provider.unavailable':
    case 'service.entitlements_temporarily_unavailable':
      return {
        label: t('error.portal_recovery_contact_support', {}, 'Contact support'),
        href: `/portal/support?new=1&topic=site&site=${encodeURIComponent(siteId)}`,
      };
    default:
      return null;
  }
}

function PortalSiteRecordContent() {
  const params = useParams<{ siteId?: string }>();
  const router = useRouter();
  const siteId = String(params?.siteId || '');
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated, refresh } = useSession();
  const [summary, setSummary] = useState<PortalSiteSummaryRecord | null>(null);
  const [error, setError] = useState<PortalSiteLoadError | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [isRemovingSite, setIsRemovingSite] = useState(false);
  const [siteRelinkPolicy, setSiteRelinkPolicy] = useState<PortalSiteRelinkPolicy | null>(null);
  const [expectedRelinkAvailableAt, setExpectedRelinkAvailableAt] = useState('');
  const [hasOpenedRemoveModal, setHasOpenedRemoveModal] = useState(false);
  const siteMonitoring = usePortalSiteMonitoring(siteId, t);
  const siteKnowledge = usePortalSiteKnowledge(siteId, t);

  useEffect(() => {
    setSummary(null);
    setError(null);
    if (!isAuthenticated || !siteId) return;
    let alive = true;
    portalClient
      .getSiteSummary(siteId)
      .then((response) => {
        if (alive) {
          setSummary(response.data);
        }
      })
      .catch((err) => {
        if (alive) {
          setError({
            code: err instanceof ApiError ? err.errorCode : '',
            message: formatPortalErrorMessage(err, t, t('error.failed_load')),
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [isAuthenticated, siteId, t]);

  useEffect(() => {
    if (!isAuthenticated || !hasOpenedRemoveModal) {
      setSiteRelinkPolicy(null);
      setExpectedRelinkAvailableAt('');
      return;
    }
    let alive = true;
    portalClient
      .getSiteRelinkPolicy()
      .then((response) => {
        if (alive) {
          setSiteRelinkPolicy(response.data);
          setExpectedRelinkAvailableAt(
            formatDate(new Date(Date.now() + response.data.cooldown_days * 86400000))
          );
        }
      })
      .catch(() => {
        if (alive) {
          setSiteRelinkPolicy(null);
          setExpectedRelinkAvailableAt('');
        }
      });
    return () => {
      alive = false;
    };
  }, [hasOpenedRemoveModal, isAuthenticated]);

  if (isLoading) {
    return <PortalLoadingState message={t('common.loading')} />;
  }

  if (!isAuthenticated || !session) {
    return (
      <PortalSignedOutState
        title={t('auth.not_signed_in')}
        description={t('auth.please_sign_in')}
        actionLabel={t('nav.sign_in')}
      />
    );
  }

  const sessionSite = session.sites.find((item) => item.site_id === siteId) || null;

  if (error && !sessionSite) {
    const recovery = getPortalSiteRecovery(error.code, siteId, t);

    return (
      <PortalPageStack>
        <PortalErrorState
          title={t('common.error')}
          description={error.message}
          retryLabel={t('common.retry')}
          onRetry={() => window.location.reload()}
          recoveryLabel={recovery?.label}
          recoveryHref={recovery?.href}
        />
      </PortalPageStack>
    );
  }

  const site: Site = {
    site_id: siteId,
    name: summary?.site?.name || sessionSite?.name || siteId,
    site_url: summary?.site?.site_url || sessionSite?.site_url || '',
    platform_kind: summary?.site?.platform_kind || sessionSite?.platform_kind || 'wordpress',
    status: summary?.site?.status || sessionSite?.status || 'inactive',
  };
  const siteUrl = getPortalSiteUrl(site);
  const monitoringNeedsAttention = siteMonitoring.overview
    ? hasPortalServiceAttention(siteMonitoring.overview)
    : false;
  const siteNeedsAttention = site.status !== 'active'
    || !siteUrl
    || Boolean(summary?.customer_status?.needs_attention)
    || monitoringNeedsAttention;
  const siteConnectionStatusLabel = site.status === 'active'
    ? t('portal.sites.table_ready', {}, 'Connected')
    : site.status === 'inactive'
      ? t('portal.site_status_inactive', {}, 'Inactive')
      : site.status === 'provisioning'
        ? t('portal.site_status_provisioning', {}, 'Provisioning')
        : t('portal.site_status_suspended', {}, 'Suspended');
  const primaryMonitoringAction = siteMonitoring.overview?.action_required.find(
    (item) => getPortalMonitoringIssueCategory(item) !== 'knowledge'
  ) || null;
  const primaryIssueCategory = primaryMonitoringAction
    ? getPortalMonitoringIssueCategory(primaryMonitoringAction)
    : null;
  const latestActivityAt = siteMonitoring.overview?.activity.last_seen_at
    || siteMonitoring.overview?.generated_at
    || '';
  const attentionTitle = site.status === 'inactive'
    ? t('portal.site_connection_status_attention', {}, 'Site connection needs confirmation')
    : primaryMonitoringAction
      ? getPortalCustomerIssueTitle(primaryMonitoringAction, t)
      : !siteUrl
      ? t('portal.site_url_missing_short', {}, 'Site URL not configured')
      : site.status !== 'active'
        ? t('portal.site_connection_status_attention', {}, 'Site connection needs confirmation')
        : t('portal.site_service_status_attention', {}, 'Site service status needs confirmation');
  const attentionDetail = site.status === 'inactive'
    ? t(
        'portal.site_inactive_recovery_detail',
        {},
        'Reconnect this site from the WordPress plugin first. If it still remains inactive, submit a ticket and include the site name.'
      )
    : primaryMonitoringAction
      ? primaryIssueCategory === 'quota'
      ? t(
          'portal.monitoring.quota_evidence_attention',
          {},
          'Usage is near or over the current package limit.'
        )
        : t(
          'portal.monitoring.customer_issue_detail',
          {},
          'If this keeps showing, contact support and include the site name.'
        )
      : !siteUrl
      ? t(
          'portal.site_record_address_missing_detail',
          {},
          'Add a site address so support can identify this site faster.'
        )
      : t(
          'portal.site_service_status_attention_detail',
          {},
          'The latest service evidence is incomplete or needs review. Refresh the service status before contacting support.'
        );
  const canRemoveThisSite = Boolean(
    session.selected_context?.site.site_id === siteId
    && session.selected_context.allowed_actions.includes('remove_sites')
    && site.status !== 'archived'
    && site.status !== 'suspended'
  );

  const closeRemoveModal = () => {
    if (isRemovingSite) return;
    setShowRemoveModal(false);
    setRemoveError('');
  };

  const handleRemoveSite = async () => {
    if (!canRemoveThisSite) return;
    setIsRemovingSite(true);
    setRemoveError('');
    try {
      await portalClient.removeSite(site.site_id);
      await refresh();
      router.push(`/portal?removed_site=${encodeURIComponent(site.site_id)}#sites`);
    } catch (err) {
      setRemoveError(
        formatPortalErrorMessage(
          err,
          t,
          t('portal.site_remove_failed', {}, 'Failed to remove this site.')
        )
      );
    } finally {
      setIsRemovingSite(false);
    }
  };

  const removeSiteConfirmation = expectedRelinkAvailableAt
    ? siteRelinkPolicy?.enabled
      ? t(
          'portal.remove_site_confirm_with_date',
          { date: expectedRelinkAvailableAt },
          `Remove this site? Cloud service will stop and active keys will be revoked. The same account may reconnect immediately; another account may try after approximately ${expectedRelinkAvailableAt}. Free service and credits stay with this account.`
        )
      : t(
          'portal.remove_site_confirm_disabled_with_date',
          { date: expectedRelinkAvailableAt },
          `Remove this site? Cloud service will stop and active keys will be revoked. The same account may reconnect immediately. The cooldown is expected to end around ${expectedRelinkAvailableAt}, but cross-account relinking is currently disabled. Free service and credits stay with this account.`
        )
    : t(
        'portal.remove_site_confirm',
        {},
        'Remove this site? Cloud service will stop and active keys will be revoked. The same account may reconnect immediately; another account must wait for the Cloud cooldown to end. Free service and credits stay with this account.'
      );

  return (
    <PortalPageStack>
      <PortalWorkspaceHeader
        title={getPortalSiteDisplayName(site)}
        description={t(
          'portal.site_record.description',
          {},
          'Check whether this site is connected and whether AI can use its content.'
        )}
        currentPage="record"
        selectedSiteId={siteId}
        sites={session.sites}
        titleAccessory={(
          <PortalStatusBadge
            status={site.status === 'active' ? 'active' : 'warning'}
            label={siteConnectionStatusLabel}
          />
        )}
        metadata={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span className="break-all">
              {siteUrl || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
            </span>
            <span>
              {t('portal.monitoring.last_activity', {}, 'Last activity')}: {' '}
              {latestActivityAt
                ? formatDate(latestActivityAt)
                : t('portal.home.package_pending_label', {}, 'To confirm')}
            </span>
          </div>
        )}
        contextPanel={siteNeedsAttention ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">{attentionTitle}</p>
              <p className="mt-1 text-sm leading-5 text-amber-800 dark:text-amber-200">{attentionDetail}</p>
            </div>
            <Link
              href={primaryIssueCategory === 'quota'
                ? '/portal/billing'
                : `/portal/support?new=1&topic=site&site=${encodeURIComponent(siteId)}`}
              className="btn btn-secondary btn-sm mt-3"
            >
              {primaryIssueCategory === 'quota'
                ? t('portal.nav_billing', {}, 'View package')
                : t('portal.support_request_new_action', {}, 'Submit ticket')}
            </Link>
          </div>
        ) : undefined}
      />

      {error ? (
        <PortalSection className="py-3 md:py-3" variant="portal">
          <p className="text-sm text-amber-800 dark:text-amber-200">{error.message}</p>
        </PortalSection>
      ) : null}

      <PortalSiteServiceStatus
        t={t}
        overview={siteMonitoring.overview}
        isLoading={siteMonitoring.isLoading}
        error={siteMonitoring.error}
        onRefresh={siteMonitoring.refresh}
      />

      <PortalSiteKnowledgePanel
        summary={siteKnowledge.summary}
        isLoading={siteKnowledge.isLoading}
        error={siteKnowledge.error}
        onRetry={siteKnowledge.refresh}
      />

      {canRemoveThisSite ? (
        <PortalSection className="py-3 md:py-3" variant="portal">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('portal.site_other_actions', {}, 'Other actions')}
            </summary>
            <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
              <button
                type="button"
                className="btn btn-secondary btn-sm text-red-700 hover:border-red-300 hover:bg-red-50 dark:text-red-300 dark:hover:border-red-900 dark:hover:bg-red-950/30"
                onClick={() => {
                  setHasOpenedRemoveModal(true);
                  setShowRemoveModal(true);
                }}
              >
                {t('portal.remove_site_action', {}, 'Remove site')}
              </button>
            </div>
          </details>
        </PortalSection>
      ) : null}

      <Modal
        isOpen={showRemoveModal}
        onClose={closeRemoveModal}
        closeLabel={t('common.close', {}, 'Close')}
        closeOnOverlay={!isRemovingSite}
        title={t('portal.remove_site_action', {}, 'Remove site')}
        description={removeSiteConfirmation}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeRemoveModal} disabled={isRemovingSite}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void handleRemoveSite()} disabled={isRemovingSite}>
              {isRemovingSite ? t('common.saving') : t('portal.remove_site_action', {}, 'Remove site')}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p className="font-semibold text-slate-950 dark:text-white">{getPortalSiteDisplayName(site)}</p>
          <p className="break-words">
            {siteUrl || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
          </p>
          {removeError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {removeError}
            </p>
          ) : null}
        </div>
      </Modal>
    </PortalPageStack>
  );
}

export default function PortalSiteRecordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PortalSiteRecordContent />
    </Suspense>
  );
}
