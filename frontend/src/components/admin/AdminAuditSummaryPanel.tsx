'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import {
  BackofficeMetricStrip,
  BackofficeStackCard,
} from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { createApiClient } from '@/lib/api-client';
import { resolveUiErrorMessage } from '@/lib/errors';
import {
  formatDate,
  formatNumber as formatInteger,
} from '@/lib/utils';

const adminAuditSummaryClient = createApiClient({ idempotencyPrefix: 'admin_audit_summary' });

type AuditSummaryGroup = {
  event_kind?: string;
  outcome?: string;
  count?: number;
  first_seen_at?: string;
  last_seen_at?: string;
};

type AuditSummaryPayload = {
  generated_at?: string;
  totals?: {
    events?: number;
    succeeded?: number;
    error?: number;
  };
  groups?: AuditSummaryGroup[];
};

type AuditEvent = {
  event_id?: number;
  event_kind?: string;
  outcome?: string;
  actor_kind?: string;
  actor_ref?: string;
  method?: string;
  path?: string;
  trace_id?: string;
  created_at?: string;
};

type AuditEventPayload = {
  items?: AuditEvent[];
  total?: number;
};

function humanizeAuditToken(value: string): string {
  return value
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function AdminAuditSummaryPanel({
  title,
  siteId,
  accountId,
  trailHref,
  windowMinutes = 1440,
  limit = 5,
  display = 'cards',
  className,
}: {
  title?: string;
  siteId?: string;
  accountId?: string;
  trailHref?: string;
  windowMinutes?: number;
  limit?: number;
  display?: 'cards' | 'table';
  className?: string;
}) {
  const { t } = useLocale();
  const [summary, setSummary] = useState<AuditSummaryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [trailOpen, setTrailOpen] = useState(false);
  const [trailItems, setTrailItems] = useState<AuditEvent[]>([]);
  const [trailLoading, setTrailLoading] = useState(false);
  const [trailError, setTrailError] = useState<string | null>(null);

  const href = useMemo(() => {
    const params = new URLSearchParams();
    if (siteId) {
      params.set('site_id', siteId);
    }
    if (accountId) {
      params.set('account_id', accountId);
    }
    params.set('window_minutes', String(windowMinutes));
    params.set('limit', String(limit));
    return `/api/admin/audit-events/summary?${params.toString()}`;
  }, [accountId, limit, siteId, windowMinutes]);

  const trailApiHref = useMemo(() => {
    const params = new URLSearchParams();
    if (siteId) {
      params.set('site_id', siteId);
    }
    if (accountId) {
      params.set('account_id', accountId);
    }
    params.set('limit', '20');
    return `/api/admin/audit-events?${params.toString()}`;
  }, [accountId, siteId]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await adminAuditSummaryClient.request<AuditSummaryPayload>(href);

        if (!cancelled) {
          setSummary(response.data ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            resolveUiErrorMessage(
              err,
              t(
                'admin.audit_summary.load_failed',
                {},
                'Failed to load recent audit summary.'
              )
            )
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [href, reloadKey, t]);

  const totals = summary?.totals ?? {};
  const groups = Array.isArray(summary?.groups) ? summary.groups : [];
  const eventTotal = Number(totals.events || 0);

  const openTrail = async () => {
    setTrailOpen(true);
    setTrailLoading(true);
    setTrailError(null);
    try {
      const response = await adminAuditSummaryClient.request<AuditEventPayload>(trailApiHref);
      setTrailItems(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (err) {
      setTrailError(
        resolveUiErrorMessage(
          err,
          t('admin.audit_summary.trail_load_failed', {}, 'Failed to load recent audit records.')
        )
      );
    } finally {
      setTrailLoading(false);
    }
  };

  return (
    <>
      <BackofficeStackCard className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
            {title || t('admin.audit_summary.title', {}, 'Recent audit summary')}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              'admin.audit_summary.description',
              {},
              'Use this bounded summary to decide whether you need deeper raw audit review.'
            )}
          </p>
        </div>
        {trailHref && !isLoading && !error && eventTotal > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => void openTrail()}>
            {t('admin.view_audit_trail_count', { count: formatInteger(eventTotal) }, `View ${formatInteger(eventTotal)} audit records`)}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400" role="status">
          {t('common.loading', {}, 'Loading...')}
        </p>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/70 dark:bg-red-950/30" role="alert">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            type="button"
            className="btn btn-secondary btn-sm mt-3"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            {t('common.retry', {}, 'Retry')}
          </button>
        </div>
      ) : (
        <>
          {display === 'table' ? (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 font-semibold">{t('admin.audit_summary.events', {}, 'Events')}</th>
                  <th className="py-2 font-semibold">{t('admin.audit_summary.succeeded', {}, 'Succeeded')}</th>
                  <th className="py-2 font-semibold">{t('admin.audit_summary.errors', {}, 'Errors')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(Number(totals.events || 0))}</td>
                  <td className="py-3 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">{formatInteger(Number(totals.succeeded || 0))}</td>
                  <td className={`py-3 text-lg font-semibold tabular-nums ${Number(totals.error || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-950 dark:text-white'}`}>
                    {formatInteger(Number(totals.error || 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="mt-4">
              <BackofficeMetricStrip
                columnsClassName="md:grid-cols-3 xl:grid-cols-3"
                items={[
                  {
                    label: t('admin.audit_summary.events', {}, 'Events'),
                    value: formatInteger(Number(totals.events || 0)),
                  },
                  {
                    label: t('admin.audit_summary.succeeded', {}, 'Succeeded'),
                    value: formatInteger(Number(totals.succeeded || 0)),
                  },
                  {
                    label: t('admin.audit_summary.errors', {}, 'Errors'),
                    value: formatInteger(Number(totals.error || 0)),
                    toneClassName:
                      Number(totals.error || 0) > 0
                        ? 'text-red-600 dark:text-red-400'
                        : undefined,
                  },
                ]}
              />
            </div>
          )}

          <div className={display === 'table' ? 'mt-2' : 'mt-4 space-y-3'}>
            {groups.length > 0 ? (
              display === 'table' ? (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <tr>
                      <th className="py-2 font-semibold">{t('admin.audit_summary.event_kind', {}, 'Event')}</th>
                      <th className="py-2 font-semibold">{t('admin.audit_summary.outcome', {}, 'Outcome')}</th>
                      <th className="py-2 text-right font-semibold">{t('admin.audit_summary.count', {}, 'Count')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {groups.slice(0, limit).map((group, index) => (
                      <tr key={`${group.event_kind || 'event'}-${group.outcome || 'outcome'}-${index}`}>
                        <td className="py-2 font-medium text-slate-950 dark:text-white">{group.event_kind || t('common.unknown', {}, 'Unknown')}</td>
                        <td className="py-2 text-slate-600 dark:text-slate-300">{group.outcome || t('common.unknown', {}, 'Unknown')}</td>
                        <td className="py-2 text-right font-medium tabular-nums text-slate-950 dark:text-white">{formatInteger(Number(group.count || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                groups.slice(0, limit).map((group, index) => (
                  <div
                    key={`${group.event_kind || 'event'}-${group.outcome || 'outcome'}-${index}`}
                    className="rounded-xl border border-slate-200/70 px-3 py-3 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950 dark:text-white">
                        {group.event_kind || t('common.unknown', {}, 'Unknown')}
                      </p>
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        {group.outcome || t('common.unknown', {}, 'Unknown')}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <span>
                        {t('admin.audit_summary.group_count', { count: String(group.count || 0) }, `${group.count || 0} events`)}
                      </span>
                      {group.last_seen_at ? (
                        <span>
                          {t('admin.audit_summary.last_seen', { date: formatDate(group.last_seen_at) }, `Last seen ${formatDate(group.last_seen_at)}`)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              )
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t(
                  'admin.audit_summary.empty',
                  {},
                  'No recent audit groups are available for the current scope.'
                )}
              </p>
            )}
          </div>

          {summary?.generated_at ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              {t(
                'admin.audit_summary.generated_at',
                { date: formatDate(summary.generated_at) },
                `Generated ${formatDate(summary.generated_at)}`
              )}
            </p>
          ) : null}
        </>
      )}
      </BackofficeStackCard>

      <AdminInspectorDrawer
        open={trailOpen}
        title={t('admin.audit_summary.trail_title', {}, 'Recent audit records')}
        titleId="admin-audit-trail-title"
        eyebrow={t('admin.audit_summary.trail_eyebrow', {}, 'Audit evidence')}
        description={t('admin.audit_summary.trail_description', {}, 'Human-readable recent events for the current customer and site scope.')}
        closeLabel={t('common.close', {}, 'Close')}
        onClose={() => setTrailOpen(false)}
      >
        {trailLoading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400" role="status">
            {t('common.loading', {}, 'Loading...')}
          </p>
        ) : trailError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 dark:border-red-900/70 dark:bg-red-950/30" role="alert">
            <p className="text-sm text-red-700 dark:text-red-300">{trailError}</p>
            <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => void openTrail()}>
              {t('common.retry', {}, 'Retry')}
            </button>
          </div>
        ) : trailItems.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="py-2 pr-3 font-semibold">{t('admin.audit_summary.time', {}, 'Time')}</th>
                <th className="py-2 pr-3 font-semibold">{t('admin.audit_summary.event_kind', {}, 'Event')}</th>
                <th className="py-2 font-semibold">{t('admin.audit_summary.outcome', {}, 'Outcome')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {trailItems.map((item, index) => (
                <tr key={`${item.event_id || 'event'}-${index}`}>
                  <td className="py-3 pr-3 align-top text-xs text-slate-500 dark:text-slate-400">
                    {item.created_at ? formatDate(item.created_at) : t('common.not_available', {}, 'N/A')}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <p className="font-medium text-slate-950 dark:text-white">
                      {humanizeAuditToken(item.event_kind || t('common.unknown', {}, 'Unknown'))}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.actor_ref || humanizeAuditToken(item.actor_kind || t('common.unknown', {}, 'Unknown'))}
                    </p>
                    {item.path || item.trace_id ? (
                      <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <summary className="cursor-pointer font-medium">
                          {t('admin.audit_summary.technical_detail', {}, 'Technical detail')}
                        </summary>
                        <div className="mt-2 space-y-1 break-all">
                          {item.method || item.path ? <p>{[item.method, item.path].filter(Boolean).join(' ')}</p> : null}
                          {item.trace_id ? <p>{t('audit.trace_id', {}, 'Record number')}: {item.trace_id}</p> : null}
                        </div>
                      </details>
                    ) : null}
                  </td>
                  <td className="py-3 align-top font-medium text-slate-700 dark:text-slate-200">
                    {humanizeAuditToken(item.outcome || t('common.unknown', {}, 'Unknown'))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('admin.audit_summary.empty', {}, 'No recent audit groups are available for the current scope.')}
          </p>
        )}
      </AdminInspectorDrawer>
    </>
  );
}
