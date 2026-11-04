'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PortalPageStack,
  PortalSection,
  PortalCard,
  PortalInfoHint,
} from '@/components/portal/PortalScaffold';
import { PortalBreadcrumb } from '@/components/portal/PortalBreadcrumb';
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
import { ApiError } from '@/lib/errors';
import {
  getPortalSiteDisplayName,
  getPortalSiteSecondaryLabel,
  getVisiblePortalSites,
} from '@/lib/portal-site-display';
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
const AUDIT_PAGE_SIZE = 10;
const AUDIT_FETCH_LIMIT = 200;

type ActivityReadError = { message: string; reference: string };

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
  const router = useRouter();
  const siteFilterId = searchParams.get('site') || '';
  const selectedSite = session?.sites.find((site) => site.site_id === siteFilterId);
  const selectedSiteName = selectedSite
    ? getPortalSiteDisplayName(selectedSite)
    : t('portal.all_sites_option', {}, 'All sites');
  const [auditEvents, setAuditEvents] = useState<PortalAuditEvent[]>([]);
  const [auditSummary, setAuditSummary] = useState<PortalAuditSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ActivityReadError | null>(null);
  const [page, setPage] = useState(0);

  const siteFilterIdRef = useRef(siteFilterId);
  const requestVersionRef = useRef(0);
  const totalEvents = Math.max(
    Number(auditSummary?.totals?.events || 0),
    auditEvents.length,
  );
  const pageCount = Math.max(1, Math.ceil(Math.max(totalEvents, 1) / AUDIT_PAGE_SIZE));
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const pageStartIndex = safePage * AUDIT_PAGE_SIZE;
  const pageEvents = useMemo(
    () => auditEvents.slice(pageStartIndex, pageStartIndex + AUDIT_PAGE_SIZE),
    [auditEvents, pageStartIndex],
  );
  const attentionEventCount = useMemo(() => {
    return auditEvents.filter((event) => !isSuccessfulAuditOutcome(event.outcome)).length;
  }, [auditEvents]);
  const pageRangeStart = auditEvents.length === 0 ? 0 : pageStartIndex + 1;
  const pageRangeEnd = Math.min(pageStartIndex + AUDIT_PAGE_SIZE, auditEvents.length);
  const hasPreviousPage = safePage > 0;
  const hasNextPage = pageStartIndex + AUDIT_PAGE_SIZE < auditEvents.length;

  const onSiteFilterChange = useCallback((nextSiteId: string) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextSiteId) nextParams.set('site', nextSiteId);
    else nextParams.delete('site');
    const query = nextParams.toString();
    router.replace(`/portal/audit${query ? `?${query}` : ''}`, { scroll: false });
  }, [router, searchParams]);

  const loadActivity = useCallback(async () => {
    const requestSiteFilterId = siteFilterIdRef.current;
    if (!isAuthenticated) return;
    const requestVersion = ++requestVersionRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const bundle = await portalClient.getAuditBundle({
        limit: AUDIT_FETCH_LIMIT,
        siteId: requestSiteFilterId || undefined,
      });
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
      setError({ message, reference: err instanceof ApiError ? err.requestId || err.traceId : '' });
    } finally {
      if (
        requestVersion !== requestVersionRef.current
        || requestSiteFilterId !== siteFilterIdRef.current
      ) return;
      setIsLoading(false);
    }
  }, [isAuthenticated, t]);

  useLayoutEffect(() => {
    siteFilterIdRef.current = siteFilterId;
    requestVersionRef.current += 1;
    setAuditEvents([]);
    setAuditSummary(null);
    setPage(0);
    setError(null);
    setIsLoading(Boolean(isAuthenticated));
  }, [siteFilterId, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadActivity();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [isAuthenticated, loadActivity, siteFilterId]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

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

  const visibleSites = getVisiblePortalSites(session.sites);
  const renderSiteFilterControl = (domId: string) => (
    <select
      id={domId}
      className="input h-8 !w-max max-w-[12rem] py-0.5 text-xs font-medium normal-case tracking-normal"
      value={siteFilterId}
      onChange={(event) => onSiteFilterChange(event.target.value)}
      data-portal-audit="site-filter"
      aria-label={t('portal.site_filter_label', {}, 'Site filter')}
    >
      <option value="">{t('portal.all_sites_option', {}, 'All sites')}</option>
      {siteFilterId && !visibleSites.some((site) => site.site_id === siteFilterId) ? (
        <option value={siteFilterId}>{t('portal.site_filter_unavailable', {}, 'Selected site is unavailable')}</option>
      ) : null}
      {visibleSites.map((site) => (
        <option key={site.site_id} value={site.site_id}>
          {getPortalSiteDisplayName(site)} ({getPortalSiteSecondaryLabel(site)})
        </option>
      ))}
    </select>
  );

  return (
    <PortalPageStack data-portal-account-deeplink="audit">
      <PortalWorkspaceHeader
        title={t('portal.audit.nav_label', {}, 'Recent activity')}
        currentPage="audit"
        titleAccessory={(
          <PortalInfoHint
            detail={t(
              'portal.audit.customer_desc_with_site',
              { site: selectedSiteName },
              `Review recent sign-in and service activity for ${selectedSiteName}.`
            )}
          />
        )}
        breadcrumb={(
          <PortalBreadcrumb
            aria-label={t('portal.audit.breadcrumb', {}, 'Activity location')}
            items={[
              {
                label: t('portal.account.title', {}, 'Account'),
                href: '/portal/account',
              },
              {
                label: t('portal.audit.nav_label', {}, 'Recent activity'),
              },
            ]}
          />
        )}
        metrics={!isLoading && !error ? [
          { label: t('portal.audit.visible_records', {}, 'Visible records'), value: auditEvents.length },
          {
            label: t('portal.audit.attention_records', {}, 'Need review'),
            value: attentionEventCount,
            detail:
              attentionEventCount > 0
                ? t('portal.audit.attention_records_desc', {}, 'Some records may need support follow-up.')
                : t('portal.audit.no_attention_records_desc', {}, 'No issue is visible in this view.'),
          },
        ] : []}
        metricsColumnsClassName="sm:grid-cols-2"
        metricsLayout="rail"
        metricsPlacement="title-end"
        secondaryActions={
          <>
            {isLoading || error ? renderSiteFilterControl('portal-audit-site-filter-recovery') : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadActivity()}>
              {t('common.refresh', {}, 'Refresh')}
            </button>
          </>
        }
      />
      {isLoading ? <PortalLoadingState message={t('common.loading')} /> : error ? (
        <PortalErrorState title={t('error.failed_load')} description={error.message} supportReference={error.reference} retryLabel={t('common.retry')} onRetry={() => void loadActivity()} />
      ) : null}

      <PortalSection className="overflow-hidden p-0" hidden={isLoading || Boolean(error)}>
        {!isLoading && !error && auditEvents.length === 0 ? (
          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2" data-portal-audit="site-filter-empty">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {t('portal.site_filter_label', {}, 'Site filter')}
              </span>
              {renderSiteFilterControl('portal-audit-site-filter-empty')}
            </div>
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
                    <th scope="col" className="px-6 py-3 font-medium">
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{t('portal.audit.time_column', {}, 'Time')}</span>
                        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
                          <span className="sr-only">{t('portal.site_filter_label', {}, 'Site filter')}</span>
                          {renderSiteFilterControl('portal-audit-site-filter-table')}
                        </span>
                      </span>
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('audit.event_type', {}, 'Activity')}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{t('audit.outcome', {}, 'Result')}</th>
                    <th scope="col" className="px-6 py-3 text-right font-medium">{t('common.details', {}, 'Details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
                  {pageEvents.map((event) => {
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

            <div className="lg:hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 px-6 py-3 dark:border-slate-800" data-portal-audit="site-filter-mobile">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  {t('portal.site_filter_label', {}, 'Site filter')}
                </span>
                {renderSiteFilterControl('portal-audit-site-filter-mobile')}
              </div>
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {pageEvents.map((event) => {
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
            </div>
          </>
        )}
        {auditEvents.length > 0 ? (
          <nav
            className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-950"
            aria-label={t('common.pagination', {}, 'Pagination')}
            data-portal-audit="records-pagination"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'common.pagination_summary',
                {
                  start: String(pageRangeStart),
                  end: String(pageRangeEnd),
                  total: String(auditEvents.length),
                },
                `${pageRangeStart}-${pageRangeEnd} of ${auditEvents.length}`,
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!hasPreviousPage}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t('common.previous', {}, 'Previous')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('common.next_page', {}, 'Next page')}
              </button>
            </div>
          </nav>
        ) : null}
      </PortalSection>
    </PortalPageStack>
  );
}
