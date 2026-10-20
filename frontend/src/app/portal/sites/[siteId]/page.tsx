'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { PortalPageStack } from '@/components/portal/PortalScaffold';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalSiteKnowledgePanel } from '@/components/portal/PortalSiteKnowledgePanel';
import { PortalSiteServiceStatus } from '@/components/portal/PortalSiteServiceStatus';
import { PortalActionIcon, PortalRowActions } from '@/components/portal/PortalRowActions';
import { PortalBreadcrumb } from '@/components/portal/PortalBreadcrumb';
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
  getPortalCustomerIssueDetail,
  getPortalCustomerIssueTitle,
  getPortalMonitoringIssueCategory,
  hasPortalQuotaPressure,
  isPortalCustomerPluginMissingAction,
  isPortalPluginMissingAction,
  isPortalRecheckHelpfulForAction,
} from '@/lib/portal-monitoring-display';
import { formatDate } from '@/lib/utils';
import {
  getPortalSiteDisplayName,
  getPortalSiteUrl,
  getPortalSiteUrlDisplay,
  getPortalWordPressAdminUrl,
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
        href: '/portal/billing#usage',
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
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [isRenamingSite, setIsRenamingSite] = useState(false);
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
  const recovery = error ? getPortalSiteRecovery(error.code, siteId, t) : null;

  if (error) {
    if (sessionSite) {
      // Keep the owned site snapshot visible while exposing the error-specific
      // recovery action below. The session record remains useful context.
    } else {
    return (
      <PortalPageStack>
        <PortalErrorState
          title={t('common.error')}
          description={error.message}
          retryLabel={t('portal.retry.reload_page', {}, 'Reload page')}
          onRetry={() => window.location.reload()}
          recoveryLabel={recovery?.label}
          recoveryHref={recovery?.href}
        />
      </PortalPageStack>
    );
    }
  }

  const site: Site = {
    site_id: siteId,
    name: summary?.site?.name || sessionSite?.name || siteId,
    site_url: summary?.site?.site_url || sessionSite?.site_url || '',
    platform_kind: summary?.site?.platform_kind || sessionSite?.platform_kind || 'wordpress',
    status: summary?.site?.status || sessionSite?.status || 'inactive',
  };
  const siteUrl = getPortalSiteUrl(site);
  // Quiet default: banner only for concrete customer actions (not soft component scores).
  const monitoringNeedsAttention = Boolean(
    siteMonitoring.overview
    && (
      hasPortalQuotaPressure(siteMonitoring.overview)
      || siteMonitoring.overview.action_required.some((item) => {
        if (getPortalMonitoringIssueCategory(item) === 'knowledge') return false;
        if (isPortalPluginMissingAction(item) && !isPortalCustomerPluginMissingAction(item)) {
          return false;
        }
        return true;
      })
    )
  );
  const siteNeedsAttention = site.status !== 'active'
    || !siteUrl
    || monitoringNeedsAttention;
  const siteConnectionStatusLabel = site.status === 'active'
    ? t('portal.sites.table_ready', {}, 'Connected')
    : site.status === 'inactive'
      ? t('portal.site_status_inactive', {}, 'Inactive')
      : site.status === 'provisioning'
        ? t('portal.site_status_provisioning', {}, 'Provisioning')
        : t('portal.site_status_suspended', {}, 'Suspended');
  const primaryMonitoringAction = siteMonitoring.overview?.action_required.find(
    (item) => {
      if (getPortalMonitoringIssueCategory(item) === 'knowledge') return false;
      // Optional Magick plugins must not become the page attention.
      if (isPortalPluginMissingAction(item) && !isPortalCustomerPluginMissingAction(item)) {
        return false;
      }
      return true;
    }
  ) || null;
  const primaryIssueCategory = primaryMonitoringAction
    ? getPortalMonitoringIssueCategory(primaryMonitoringAction)
    : null;
  const latestActivityAt = siteMonitoring.overview?.activity.last_seen_at
    || siteMonitoring.overview?.generated_at
    || '';
  const pluginMissingPrimary = isPortalCustomerPluginMissingAction(primaryMonitoringAction);
  const recheckHelpful = isPortalRecheckHelpfulForAction(primaryMonitoringAction);
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
      ? getPortalCustomerIssueDetail(primaryMonitoringAction, t)
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
    sessionSite?.allowed_actions?.includes('remove_sites')
    && site.status !== 'archived'
    && site.status !== 'suspended'
  );
  const canRenameThisSite = Boolean(
    sessionSite?.allowed_actions?.includes('provision_sites')
    && site.status !== 'archived'
  );

  const closeRemoveModal = () => {
    if (isRemovingSite) return;
    setShowRemoveModal(false);
    setRemoveError('');
  };

  const closeRenameModal = () => {
    if (isRenamingSite) return;
    setShowRenameModal(false);
    setRenameError('');
  };

  const openRenameModal = () => {
    setRenameValue(getPortalSiteDisplayName(site));
    setRenameError('');
    setShowRenameModal(true);
  };

  const handleRenameSite = async () => {
    if (!canRenameThisSite) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError(t('portal.site_rename_required', {}, 'Enter a site name.'));
      return;
    }
    setIsRenamingSite(true);
    setRenameError('');
    try {
      const response = await portalClient.updateSiteName(site.site_id, nextName);
      const renamed = response.data.site;
      setSummary((current) => (
        current
          ? {
              ...current,
              site: {
                ...current.site,
                name: renamed.name,
              },
            }
          : current
      ));
      await refresh().catch(() => undefined);
      setShowRenameModal(false);
    } catch (err) {
      setRenameError(
        formatPortalErrorMessage(
          err,
          t,
          t('portal.site_rename_failed', {}, 'Failed to rename this site.')
        )
      );
    } finally {
      setIsRenamingSite(false);
    }
  };

  const handleRemoveSite = async () => {
    if (!canRemoveThisSite) return;
    setIsRemovingSite(true);
    setRemoveError('');
    try {
      await portalClient.removeSite(site.site_id);
      let refreshFailed = false;
      await refresh().catch(() => { refreshFailed = true; });
      router.push(`/portal?removed_site=${encodeURIComponent(site.site_id)}${refreshFailed ? '&site_refresh=failed' : ''}#sites`);
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

  const supportHref = `/portal/support?new=1&topic=site&site=${encodeURIComponent(siteId)}`;
  const errorCount = Number(siteMonitoring.overview?.activity.plugin_errors_total || 0);
  const recheckActionLabel = siteMonitoring.isRefreshing
    ? t('portal.retry.rechecking', {}, 'Checking…')
    : t('portal.retry.recheck_service', {}, 'Recheck service');
  const attentionActionLabel = site.status === 'inactive'
    ? t('portal.activate_site_action', {}, 'Activate')
    : !siteUrl
      ? t('portal.support_request_new_action', {}, 'Submit ticket')
      : primaryIssueCategory === 'quota'
        ? t('portal.nav_billing', {}, 'View package')
        : pluginMissingPrimary || !recheckHelpful
          ? t('portal.site_attention_contact_support', {}, 'Contact support')
          : recheckActionLabel;

  const attentionAction = site.status === 'inactive'
    ? {
        label: attentionActionLabel,
        href: '/portal#sites',
        testId: 'attention-cta',
      }
    : !siteUrl
      ? {
          label: attentionActionLabel,
          href: supportHref,
          testId: 'attention-cta',
        }
      : primaryIssueCategory === 'quota'
        ? {
            label: attentionActionLabel,
            href: '/portal/account#package-options',
            testId: 'attention-cta',
          }
        : pluginMissingPrimary || !recheckHelpful
          ? {
              label: attentionActionLabel,
              href: supportHref,
              testId: 'attention-cta',
            }
          : {
              label: attentionActionLabel,
              onClick: siteMonitoring.refresh,
              disabled: siteMonitoring.isLoading || siteMonitoring.isRefreshing,
              testId: 'attention-cta',
            };

  const attentionSecondaryAction = (
    siteNeedsAttention
    && !error
    && site.status !== 'inactive'
    && siteUrl
    && primaryIssueCategory !== 'quota'
    && (pluginMissingPrimary || !recheckHelpful)
  )
    ? {
        label: recheckActionLabel,
        onClick: siteMonitoring.refresh,
        disabled: siteMonitoring.isLoading || siteMonitoring.isRefreshing,
        testId: 'attention-secondary',
      }
    : null;

  const showSupportBesideAttention = errorCount > 0
    && !String(attentionAction.href || '').includes('/portal/support')
    && !pluginMissingPrimary;

  const wpAdminUrl = getPortalWordPressAdminUrl(site);
  const displayName = getPortalSiteDisplayName(site);

  return (
    <PortalPageStack className="space-y-3" data-portal-site-record="page">
      <PortalWorkspaceHeader
        title={displayName}
        currentPage="record"
        selectedSiteId={siteId}
        sites={session.sites}
        breadcrumb={(
          <PortalBreadcrumb
            aria-label={t('portal.site_breadcrumb', {}, 'Site location')}
            items={[
              {
                label: t('portal.nav_service', {}, 'Service'),
                href: '/portal',
              },
              {
                label: t('portal.home.my_sites_title', {}, 'My sites'),
                href: '/portal#sites',
              },
              { label: displayName },
            ]}
          />
        )}
        titleAccessory={(
          <>
            {canRenameThisSite ? (
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-white"
                onClick={openRenameModal}
                aria-label={t('portal.site_rename_action', {}, 'Rename site')}
                title={t('portal.site_rename_action', {}, 'Rename site')}
                data-portal-site="rename"
              >
                <PortalActionIcon id="rename" />
              </button>
            ) : null}
            {!(siteNeedsAttention && !error) ? (
              <PortalStatusBadge
                status={site.status === 'active' ? 'active' : 'warning'}
                label={siteConnectionStatusLabel}
              />
            ) : null}
            {(wpAdminUrl || canRemoveThisSite) ? (
              <div data-portal-site="other-actions">
                <PortalRowActions
                  moreLabel={t('portal.site_other_actions', {}, 'Other actions')}
                  overflow={[
                    ...(wpAdminUrl
                      ? [{
                          id: 'wp-admin',
                          label: t('portal.sites.open_wordpress_admin', {}, 'Open WordPress admin'),
                          href: wpAdminUrl,
                          external: true as const,
                        }]
                      : []),
                    ...(canRemoveThisSite
                      ? [{
                          id: 'remove-site',
                          label: t('portal.remove_site_action', {}, 'Remove site'),
                          danger: true as const,
                          confirm: false as const,
                          onClick: () => {
                            setHasOpenedRemoveModal(true);
                            setShowRemoveModal(true);
                          },
                        }]
                      : []),
                  ]}
                />
              </div>
            ) : null}
          </>
        )}
        metadata={(
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400" data-portal-site="context-summary">
            <span className="truncate" title={siteUrl || undefined}>
              {getPortalSiteUrlDisplay(site) || t('portal.site_url_missing_short', {}, 'Site URL not configured')}
            </span>
            <span>
              {t('portal.monitoring.last_activity', {}, 'Last activity')}:{' '}
              {latestActivityAt
                ? formatDate(latestActivityAt)
                : t('portal.home.package_pending_label', {}, 'To confirm')}
            </span>
          </div>
        )}
      />

      {error ? (
        <PortalErrorState
          title={t('common.error')}
          description={error.message}
          retryLabel={t('portal.retry.reload_page', {}, 'Reload page')}
          onRetry={() => window.location.reload()}
          recoveryLabel={recovery?.label}
          recoveryHref={recovery?.href}
        />
      ) : null}

      <PortalSiteServiceStatus
        t={t}
        overview={siteMonitoring.overview}
        isLoading={siteMonitoring.isLoading}
        error={siteMonitoring.error}
        onRefresh={siteMonitoring.refresh}
        isRefreshing={siteMonitoring.isRefreshing}
        refreshNotice={siteMonitoring.refreshNotice}
        attention={siteNeedsAttention && !error ? {
          title: attentionTitle,
          detail: attentionDetail,
          action: attentionAction,
          secondaryAction: attentionSecondaryAction,
          supportHref: showSupportBesideAttention ? supportHref : null,
          supportLabel: t('portal.site_attention_contact_support', {}, 'Contact support'),
        } : null}
      />

      <PortalSiteKnowledgePanel
        summary={siteKnowledge.summary}
        isLoading={siteKnowledge.isLoading}
        error={siteKnowledge.error}
        onRetry={siteKnowledge.refresh}
      />

      <Modal
        isOpen={showRenameModal}
        onClose={closeRenameModal}
        closeLabel={t('common.close', {}, 'Close')}
        closeOnOverlay={!isRenamingSite}
        title={t('portal.site_rename_action', {}, 'Rename site')}
        description={t(
          'portal.site_rename_desc',
          {},
          'Update the display name for this site in the portal. The WordPress site address does not change.'
        )}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={closeRenameModal} disabled={isRenamingSite}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void handleRenameSite()} disabled={isRenamingSite}>
              {isRenamingSite ? t('common.saving') : t('common.save', {}, 'Save')}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <label className="block space-y-1.5" htmlFor="portal-site-rename-input">
            <span className="font-medium text-slate-950 dark:text-white">
              {t('portal.site_rename_label', {}, 'Site name')}
            </span>
            <input
              id="portal-site-rename-input"
              className="input w-full"
              value={renameValue}
              maxLength={191}
              placeholder={t('portal.site_rename_placeholder', {}, 'Enter a site name')}
              disabled={isRenamingSite}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                // IME composition uses Enter to confirm glyphs; do not save mid-composition.
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleRenameSite();
                }
              }}
              autoComplete="off"
              autoFocus
              data-portal-site="rename-input"
            />
          </label>
          {renameError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {renameError}
            </p>
          ) : null}
        </div>
      </Modal>

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
          <p className="font-semibold text-slate-950 dark:text-white">{displayName}</p>
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
