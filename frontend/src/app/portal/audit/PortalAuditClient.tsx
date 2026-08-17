'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PortalPageStack,
  PortalSection,
  PortalCard,
} from '@/components/portal/PortalScaffold';
import { PortalIdentifier } from '@/components/portal/PortalIdentifier';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import {
  PortalEmptyState,
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type PortalAuditEvent,
  type PortalAuditSummary,
} from '@/lib/portal-client';
import { formatPortalErrorMessage } from '@/lib/portal-error';
import { getPortalSiteDisplayName } from '@/lib/portal-site-display';
import { formatDate } from '@/lib/utils';

const AUDIT_EVENT_KIND_LABELS: Record<string, string> = {
  'site_admin_access.upsert': 'audit.kind.site_admin_access.upsert',
  'portal_magic_link.requested': 'audit.kind.portal_login_code.requested',
  'portal_magic_link.consumed': 'audit.kind.portal_login_code.verified',
  'api_key.created': 'audit.kind.api_key.created',
  'api_key.rotated': 'audit.kind.api_key.rotated',
  'api_key.revoked': 'audit.kind.api_key.revoked',
  'site.connected': 'audit.kind.site.connected',
  'site.disconnected': 'audit.kind.site.disconnected',
  'subscription.activated': 'audit.kind.subscription.activated',
  'subscription.updated': 'audit.kind.subscription.updated',
  'subscription.canceled': 'audit.kind.subscription.canceled',
};

const SUCCESSFUL_AUDIT_OUTCOMES = new Set(['success', 'succeeded', 'ok', 'completed']);

function isSuccessfulAuditOutcome(outcome: string): boolean {
  return SUCCESSFUL_AUDIT_OUTCOMES.has(String(outcome || '').trim().toLowerCase());
}

function getAuditTraceId(event: PortalAuditEvent): string {
  return typeof event.trace_id === 'string' ? event.trace_id : '';
}

export function PortalAuditClient() {
  const { session, isLoading: sessionLoading, isAuthenticated } = useSession();
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const siteFilterId = searchParams.get('site') || '';
  const selectedSite = session?.sites.find((site) => site.site_id === siteFilterId);
  const selectedSiteName = selectedSite
    ? getPortalSiteDisplayName(selectedSite)
    : t('portal.all_sites_option', {}, 'All sites');
  const [auditEvents, setAuditEvents] = useState<PortalAuditEvent[]>([]);
  const [auditSummary, setAuditSummary] = useState<PortalAuditSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [visibleLimit, setVisibleLimit] = useState(10);
  const siteFilterIdRef = useRef(siteFilterId);
  const requestVersionRef = useRef(0);
  const recentEvents = useMemo(() => auditEvents, [auditEvents]);
  const attentionEventCount = useMemo(() => {
    return recentEvents.filter((event) => !isSuccessfulAuditOutcome(event.outcome)).length;
  }, [recentEvents]);

  const loadActivity = useCallback(async (limit: number, loadingMore = false) => {
    const requestSiteFilterId = siteFilterIdRef.current;
    if (!isAuthenticated) return;
    const requestVersion = ++requestVersionRef.current;
    if (loadingMore) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    if (loadingMore) {
      setLoadMoreError(null);
    } else {
      setError(null);
    }
    try {
      const bundle = await portalClient.getAuditBundle({ limit, siteId: requestSiteFilterId || undefined });
      if (
        requestVersion !== requestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      setAuditSummary(bundle.summary);
      setAuditEvents(bundle.events);
    } catch (err) {
      if (
        requestVersion !== requestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      const message = formatPortalErrorMessage(
        err,
        t,
        t('audit.load_error', {}, 'Failed to load audit data')
      );
      if (loadingMore) {
        setLoadMoreError(message);
      } else {
        setError(message);
      }
    } finally {
      if (
        requestVersion !== requestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      if (loadingMore) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated, t]);

  useLayoutEffect(() => {
    siteFilterIdRef.current = siteFilterId;
    requestVersionRef.current += 1;
    setAuditEvents([]);
    setAuditSummary(null);
    setVisibleLimit(10);
    setError(null);
    setLoadMoreError(null);
    setIsLoadingMore(false);
    setIsLoading(Boolean(isAuthenticated));
  }, [siteFilterId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadActivity(10);
    return () => {
      requestVersionRef.current += 1;
    };
  }, [isAuthenticated, loadActivity, siteFilterId]);

  const translateOutcome = (outcome: string) => {
    if (isSuccessfulAuditOutcome(outcome)) {
      return t('status.success', {}, 'Success');
    }
    if (outcome === 'error') {
      return t('common.error');
    }
    return t(`status.${outcome}`, {}, outcome);
  };

  const translateEventKind = (eventKind: string) => {
    const key = AUDIT_EVENT_KIND_LABELS[eventKind];
    if (key) {
      return t(key);
    }
    if (eventKind.startsWith('support_request.')) {
      return t('portal.support.nav_label', {}, 'Support request');
    }
    if (eventKind.startsWith('payment.') || eventKind.startsWith('payment_') || eventKind.startsWith('refund.')) {
      return t('portal.billing.payment_activity_label', {}, 'Payment activity');
    }
    if (eventKind.startsWith('subscription.')) {
      return t('portal.package.current_plan', {}, 'Package activity');
    }
    if (eventKind.startsWith('site_key.') || eventKind.startsWith('api_key.')) {
      return t('portal.audit.connection_key_activity', {}, 'Connection key activity');
    }
    if (eventKind.startsWith('site.') || eventKind.startsWith('wordpress_addon_connection.')) {
      return t('portal.audit.site_connection_activity', {}, 'Site connection activity');
    }
    if (eventKind === 'run' || eventKind === 'provider_call' || eventKind.startsWith('abilities.')) {
      return t('portal.audit.ai_service_activity', {}, 'AI service activity');
    }
    return t('portal.audit.generic_activity', {}, 'Account activity');
  };

  if (sessionLoading) {
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

  if (isLoading) {
    return <PortalLoadingState message={t('common.loading')} />;
  }

  if (error) {
    return (
      <PortalErrorState
        title={t('common.error')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => void loadActivity(visibleLimit)}
      />
    );
  }

  return (
    <PortalPageStack data-portal-support-deeplink="audit">
      <PortalWorkspaceHeader
        eyebrow={t('portal.audit.records_title', {}, 'Activity records')}
        title={t('portal.audit.nav_label', {}, 'Recent activity')}
        eyebrowInfo={t(
          'portal.audit.customer_desc_with_site',
          { site: selectedSiteName },
          `Review recent sign-in and service activity for ${selectedSiteName}.`
        )}
        currentPage="audit"
        selectedSiteId={siteFilterId}
        sites={session.sites}
        siteSelectorMode="filter"
        onSiteChange={(nextSiteId) => {
          const nextParams = new URLSearchParams(searchParams.toString());
          if (nextSiteId) nextParams.set('site', nextSiteId);
          else nextParams.delete('site');
          const query = nextParams.toString();
          window.history.replaceState(window.history.state, '', `/portal/audit${query ? `?${query}` : ''}`);
        }}
        metrics={[
          { label: t('portal.audit.records_total', {}, 'Total records'), value: auditSummary?.totals?.events || 0 },
          { label: t('portal.audit.visible_records', {}, 'Visible records'), value: recentEvents.length },
          {
            label: t('portal.audit.attention_records', {}, 'Need review'),
            value: attentionEventCount,
            detail:
              attentionEventCount > 0
                ? t('portal.audit.attention_records_desc', {}, 'Some records may need support follow-up.')
                : t('portal.audit.no_attention_records_desc', {}, 'No issue is visible in this view.'),
          },
          {
            label: t('portal.updated_at', {}, 'Updated'),
            value: auditSummary?.generated_at ? formatDate(auditSummary.generated_at) : t('portal.home.package_pending_label', {}, 'To confirm'),
            size: 'compact',
          },
        ]}
        metricsColumnsClassName="xl:grid-cols-4"
        secondaryActions={
          <button type="button" className="btn btn-secondary" onClick={() => void loadActivity(visibleLimit)}>
            {t('common.refresh', {}, 'Refresh')}
          </button>
        }
      />

      <PortalSection className="overflow-hidden p-0">
        <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-950 dark:text-white">{t('portal.audit.records_title', {}, 'Activity records')}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {t('portal.audit.recent_desc', {}, 'Only recent customer-readable activity is shown here.')}
          </p>
        </div>
        {recentEvents.length === 0 ? (
          <div className="p-6">
            <PortalEmptyState
              title={t('portal.audit.empty_title', {}, 'No activity in this view')}
              description={t(
                'portal.audit.empty_desc',
                {},
                'No site activity is visible yet. Return to the workspace or check again later.'
              )}
              actionLabel={t('portal.workspace_label', {}, 'Workspace')}
              actionHref="/portal"
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block" data-portal-audit="records-table">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">
                  {t('portal.audit.recent_desc', {}, 'Only recent customer-readable activity is shown here.')}
                </caption>
                <thead className="border-b border-slate-200/80 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-medium">{t('portal.audit.time_column', {}, 'Time')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('audit.event_type', {}, 'Activity')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('audit.outcome', {}, 'Result')}</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">{t('common.details', {}, 'Details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {recentEvents.map((event) => {
                    const traceId = getAuditTraceId(event);
                    const showSupportInformation = !isSuccessfulAuditOutcome(event.outcome) || Boolean(traceId);
                    return (
                    <tr key={event.event_id} className="align-top">
                      <td className="whitespace-nowrap px-6 py-4 text-slate-500 dark:text-slate-400">
                        {formatDate(event.created_at)}
                      </td>
                      <th scope="row" className="px-4 py-4 font-medium text-slate-950 dark:text-white">
                        {translateEventKind(event.event_kind)}
                        {!isSuccessfulAuditOutcome(event.outcome) ? (
                          <span className="mt-1 block max-w-md text-xs font-normal leading-5 text-amber-700 dark:text-amber-300">
                            {t('portal.audit.support_hint', {}, 'Contact support with the site name and activity time.')}
                          </span>
                        ) : null}
                      </th>
                      <td className="whitespace-nowrap px-4 py-4">
                        <PortalStatusBadge status={event.outcome} label={translateOutcome(event.outcome)} />
                      </td>
                      <td className="px-6 py-4">
                        {showSupportInformation ? (
                          <details className="ml-auto max-w-sm text-left text-xs text-slate-500 dark:text-slate-400">
                          <summary className="cursor-pointer text-right font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200">
                            {t('portal.support_information', {}, 'Support information')}
                          </summary>
                          <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                            <div>
                              <span className="block font-medium text-slate-700 dark:text-slate-300">Event ID</span>
                              <PortalIdentifier value={String(event.event_id)} full />
                            </div>
                            {traceId ? (
                              <div>
                                <span className="block font-medium text-slate-700 dark:text-slate-300">
                                  {t('audit.trace_id', {}, 'Trace ID')}
                                </span>
                                <PortalIdentifier value={traceId} full />
                              </div>
                            ) : null}
                          </div>
                          </details>
                        ) : (
                          <span className="block text-right text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-200 dark:divide-gray-800 lg:hidden">
            {recentEvents.map((event) => {
              const traceId = getAuditTraceId(event);
              const showSupportInformation = !isSuccessfulAuditOutcome(event.outcome) || Boolean(traceId);
              return (
              <article key={event.event_id} className="px-6 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{translateEventKind(event.event_kind)}</span>
                      <PortalStatusBadge status={event.outcome} label={translateOutcome(event.outcome)} />
                    </div>
                    <p className="text-sm text-gray-500">{formatDate(event.created_at)}</p>
                    {showSupportInformation ? (
                      <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-gray-500 dark:bg-slate-900/60 dark:text-gray-400">
                      <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-300">
                        {t('portal.support_information', {}, 'Support information')}
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <span className="block font-medium text-gray-600 dark:text-gray-300">Event ID</span>
                          <PortalIdentifier value={String(event.event_id)} full />
                        </div>
                        {traceId ? (
                          <div>
                            <span className="block font-medium text-gray-600 dark:text-gray-300">
                              {t('audit.trace_id', {}, 'Trace ID')}
                            </span>
                            <PortalIdentifier value={traceId} full />
                          </div>
                        ) : null}
                      </div>
                      </details>
                    ) : null}
                  </div>
                  {!isSuccessfulAuditOutcome(event.outcome) ? (
                    <PortalCard className="max-w-md border-amber-200 bg-amber-50/70 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                      {t('portal.audit.support_hint', {}, 'Contact support with the site name and activity time.')}
                    </PortalCard>
                  ) : null}
                </div>
              </article>
              );
            })}
            </div>
          </>
        )}
        {recentEvents.length > 0
        && recentEvents.length < Number(auditSummary?.totals?.events || 0)
        && (visibleLimit < 200 || isLoadingMore || Boolean(loadMoreError)) ? (
          <div className="border-t border-gray-200 px-6 py-4 text-center dark:border-gray-800">
            {loadMoreError ? (
              <p className="mb-3 text-sm text-red-700 dark:text-red-300">{loadMoreError}</p>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isLoadingMore}
              onClick={() => {
                const nextLimit = Math.min(200, visibleLimit + 20);
                setVisibleLimit(nextLimit);
                void loadActivity(nextLimit, true);
              }}
            >
              {isLoadingMore
                ? t('common.loading', {}, 'Loading...')
                : t('portal.audit.load_more', {}, 'Load more activity')}
            </button>
          </div>
        ) : null}
      </PortalSection>
    </PortalPageStack>
  );
}
