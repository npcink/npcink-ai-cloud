'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useMemo, useState } from 'react';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminInspectorDrawer } from '@/components/admin/AdminInspectorDrawer';
import {
  BackofficeDiagnosticNotice,
  BackofficeEmptyState,
  BackofficePageHeader,
  BackofficePageStack,
  BackofficeSectionPanel,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { useLocale } from '@/contexts/LocaleContext';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/utils';
import { useAdminAuditWorkspace } from './queries';
import type { AdminAuditEvent } from './types';

const PAGE_SIZE = 25;
const FILTER_KEYS = [
  'event_id',
  'idempotency_key',
  'scope_kind',
  'scope_id',
  'site_id',
  'account_id',
  'event_kind',
  'outcome',
] as const;

function positiveInteger(value: string | null, fallback = 0): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function humanizeAuditToken(value: string): string {
  return value
    .replaceAll('.', ' ')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function identifier(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function auditScope(event: AdminAuditEvent, fallback: string): string {
  const kind = identifier(event.scope_kind, 'scope');
  const id = identifier(event.scope_id, fallback);
  return `${kind}: ${id}`;
}

export function AdminAuditWorkspace() {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dismissedFocus, setDismissedFocus] = useState(0);
  const offset = positiveInteger(searchParams.get('offset'));

  const requestKey = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key)?.trim();
      if (value) params.set(key, value);
    }
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    params.set('include_payload', 'false');
    return params.toString();
  }, [offset, searchParams]);

  const query = useAdminAuditWorkspace(requestKey);
  const items = Array.isArray(query.data?.items) ? query.data.items : [];
  const pagination = query.data?.pagination ?? {};
  const total = Number(pagination.total ?? query.data?.total ?? 0);
  const focusedEventId = positiveInteger(searchParams.get('focus'));
  const selectedEventId = focusedEventId === dismissedFocus ? 0 : focusedEventId;
  const selectedEvent = items.find((item) => Number(item.event_id || 0) === selectedEventId);
  const filterCount = FILTER_KEYS.filter((key) => searchParams.get(key)?.trim()).length;

  function updateUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDismissedFocus(0);
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = String(data.get(key) || '').trim();
      if (value) params.set(key, value);
    }
    const exactEventId = params.get('event_id');
    if (exactEventId) params.set('focus', exactEventId);
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
  }

  function pageTo(nextOffset: number) {
    updateUrl({ offset: nextOffset > 0 ? String(nextOffset) : null, focus: null });
  }

  function closeInspector() {
    setDismissedFocus(focusedEventId);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('focus');
    const nextHref = `${pathname}${params.size ? `?${params.toString()}` : ''}`;
    window.history.replaceState(window.history.state, '', nextHref);
  }

  const errorMessage = query.error
    ? resolveUiErrorMessage(
        query.error,
        t('admin.audit_workspace.load_failed', {}, 'Failed to load audit evidence.')
      )
    : '';
  const notAvailable = t('common.not_available', {}, 'N/A');

  return (
    <BackofficePageStack>
      <BackofficePageHeader
        eyebrow={t('admin.audit_workspace.eyebrow', {}, 'Service evidence')}
        title={t('admin.audit_workspace.title', {}, 'Audit evidence')}
        description={t(
          'admin.audit_workspace.description',
          {},
          'Find one service-plane operation, then inspect its bounded metadata without opening the raw API.'
        )}
        summaryItems={[
          {
            label: t('admin.audit_workspace.visible', {}, 'Visible records'),
            value: formatNumber(items.length),
          },
          {
            label: t('admin.audit_workspace.total', {}, 'Matching records'),
            value: formatNumber(total),
          },
          {
            label: t('admin.audit_workspace.filters', {}, 'Active filters'),
            value: formatNumber(filterCount),
          },
        ]}
        secondaryAction={(
          <button
            type="button"
            className="btn btn-secondary"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching
              ? t('common.refreshing', {}, 'Refreshing...')
              : t('common.refresh', {}, 'Refresh')}
          </button>
        )}
        summaryAside={t(
          'admin.audit_workspace.boundary',
          {},
          'Read-only Cloud service evidence. WordPress approval, final audit truth, and writes remain local.'
        )}
      />

      <BackofficeSectionPanel>
        <form key={requestKey} data-ui="admin-audit-filter-workbench" onSubmit={applyFilters}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('admin.audit_workspace.event_id', {}, 'Event ID')}
              <input
                name="event_id"
                inputMode="numeric"
                min="1"
                defaultValue={searchParams.get('event_id') || ''}
                className="input mt-1 w-full"
                placeholder="721"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('admin.audit_workspace.idempotency_key', {}, 'Idempotency key')}
              <input
                name="idempotency_key"
                defaultValue={searchParams.get('idempotency_key') || ''}
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('admin.audit_workspace.scope_kind', {}, 'Scope type')}
              <input
                name="scope_kind"
                defaultValue={searchParams.get('scope_kind') || ''}
                className="input mt-1 w-full"
                placeholder="subscription"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {t('admin.audit_workspace.scope_id', {}, 'Scope ID')}
              <input
                name="scope_id"
                defaultValue={searchParams.get('scope_id') || ''}
                className="input mt-1 w-full"
              />
            </label>
          </div>

          <details className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
              {t('admin.audit_workspace.more_filters', {}, 'More filters')}
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('admin.audit_workspace.site_id', {}, 'Site ID')}
                <input name="site_id" defaultValue={searchParams.get('site_id') || ''} className="input mt-1 w-full" />
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('admin.audit_workspace.account_id', {}, 'Account ID')}
                <input name="account_id" defaultValue={searchParams.get('account_id') || ''} className="input mt-1 w-full" />
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('admin.audit_workspace.event_kind', {}, 'Event type')}
                <input name="event_kind" defaultValue={searchParams.get('event_kind') || ''} className="input mt-1 w-full" />
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {t('admin.audit_workspace.outcome', {}, 'Outcome')}
                <select name="outcome" defaultValue={searchParams.get('outcome') || ''} className="input mt-1 w-full">
                  <option value="">{t('common.all', {}, 'All')}</option>
                  <option value="succeeded">{t('common.succeeded', {}, 'Succeeded')}</option>
                  <option value="success">{t('common.success', {}, 'Success')}</option>
                  <option value="error">{t('common.error', {}, 'Error')}</option>
                  <option value="blocked">{t('common.blocked', {}, 'Blocked')}</option>
                </select>
              </label>
            </div>
          </details>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary">
              {t('admin.audit_workspace.apply_filters', {}, 'Apply filters')}
            </button>
            <Link href={pathname} className="btn btn-secondary">
              {t('admin.audit_workspace.clear_filters', {}, 'Clear filters')}
            </Link>
          </div>
        </form>
      </BackofficeSectionPanel>

      {errorMessage ? (
        <BackofficeDiagnosticNotice
          message={errorMessage}
          staleDescription={query.data
            ? t('admin.audit_workspace.stale_notice', {}, 'The last loaded audit page remains visible.')
            : undefined}
          retryLabel={t('common.retry', {}, 'Retry')}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      <AdminDataTableFrame
        dataUi="admin-audit-directory"
        density="compact"
        title={t('admin.audit_workspace.directory_title', {}, 'Audit records')}
        resultLabel={t(
          'admin.audit_workspace.directory_result',
          { count: formatNumber(total) },
          '{{count}} matching records'
        )}
        bodyClassName="max-h-[var(--admin-diagnostic-queue-max-height)] overflow-auto"
        footer={total > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'admin.audit_workspace.page_range',
                {
                  start: String(total ? offset + 1 : 0),
                  end: String(Math.min(offset + items.length, total)),
                  total: String(total),
                },
                '{{start}}–{{end}} of {{total}}'
              )}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" disabled={offset === 0} onClick={() => pageTo(Math.max(0, offset - PAGE_SIZE))}>
                {t('common.previous', {}, 'Previous')}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!pagination.has_more} onClick={() => pageTo(Number(pagination.next_offset ?? offset + PAGE_SIZE))}>
                {t('common.next', {}, 'Next')}
              </button>
            </div>
          </div>
        ) : undefined}
      >
        {query.isLoading && !query.data ? (
          <p className="px-4 py-8 text-sm text-slate-500 dark:text-slate-400" role="status">
            {t('admin.audit_workspace.loading', {}, 'Loading audit evidence...')}
          </p>
        ) : items.length ? (
          <table className="w-full min-w-[58rem] table-fixed text-left text-sm" aria-label={t('admin.audit_workspace.directory_title', {}, 'Audit records')}>
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="w-[10rem] px-3 py-2" scope="col">{t('admin.audit_workspace.time', {}, 'Time')}</th>
                <th className="w-[17rem] px-3 py-2" scope="col">{t('admin.audit_workspace.event_kind', {}, 'Event type')}</th>
                <th className="w-[8rem] px-3 py-2" scope="col">{t('admin.audit_workspace.outcome', {}, 'Outcome')}</th>
                <th className="px-3 py-2" scope="col">{t('admin.audit_workspace.scope', {}, 'Scope')}</th>
                <th className="w-[10rem] px-3 py-2" scope="col">{t('admin.audit_workspace.actor', {}, 'Operator')}</th>
                <th className="w-[5rem] px-3 py-2 text-right" scope="col">{t('admin.troubleshooting.column_action', {}, 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {items.map((item) => {
                const eventId = Number(item.event_id || 0);
                const selected = eventId > 0 && eventId === selectedEventId;
                return (
                  <tr key={eventId || `${item.event_kind}-${item.created_at}`} aria-selected={selected} className={selected ? 'bg-blue-50/80 dark:bg-blue-950/25' : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/30'}>
                    <td className="px-3 py-2.5 align-top text-xs text-slate-500 dark:text-slate-400">{item.created_at ? formatDate(item.created_at) : notAvailable}</td>
                    <td className="px-3 py-2.5 align-top"><p className="truncate font-semibold text-slate-950 dark:text-white">{humanizeAuditToken(identifier(item.event_kind, notAvailable))}</p><p className="mt-1 font-mono text-[0.68rem] text-slate-500 dark:text-slate-400">#{eventId || notAvailable}</p></td>
                    <td className="px-3 py-2.5 align-top"><BackofficeStatusBadge label={humanizeAuditToken(identifier(item.outcome, notAvailable))} status={identifier(item.outcome, 'unknown')} /></td>
                    <td className="px-3 py-2.5 align-top"><p className="truncate font-mono text-xs text-slate-700 dark:text-slate-200">{auditScope(item, notAvailable)}</p></td>
                    <td className="px-3 py-2.5 align-top text-xs text-slate-600 dark:text-slate-300">{identifier(item.actor_ref, humanizeAuditToken(identifier(item.actor_kind, notAvailable)))}</td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <button
                        type="button"
                        className="text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
                        onClick={() => {
                          setDismissedFocus(0);
                          updateUrl({ focus: String(eventId) });
                        }}
                      >
                        {t('admin.troubleshooting.inspect', {}, 'Inspect')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <BackofficeEmptyState
            className="m-5 md:m-6"
            title={t('admin.audit_workspace.empty_title', {}, 'No matching audit evidence')}
            description={t('admin.audit_workspace.empty_description', {}, 'Change or clear the filters. No operation is available from this read-only surface.')}
          />
        )}
      </AdminDataTableFrame>

      <AdminInspectorDrawer
        open={Boolean(selectedEvent)}
        title={selectedEvent ? humanizeAuditToken(identifier(selectedEvent.event_kind, notAvailable)) : t('admin.audit_workspace.event_detail', {}, 'Audit event detail')}
        titleId="admin-audit-event-title"
        eyebrow={selectedEvent ? `#${selectedEvent.event_id}` : undefined}
        description={t('admin.audit_workspace.detail_description', {}, 'Bounded service-plane metadata for support and operation verification.')}
        closeLabel={t('common.close', {}, 'Close')}
        headerAccessory={selectedEvent ? <BackofficeStatusBadge label={humanizeAuditToken(identifier(selectedEvent.outcome, notAvailable))} status={identifier(selectedEvent.outcome, 'unknown')} /> : undefined}
        onClose={closeInspector}
      >
        {selectedEvent ? (
          <div className="space-y-5">
            <dl className="grid gap-4 text-sm">
              {[
                [t('admin.audit_workspace.scope', {}, 'Scope'), auditScope(selectedEvent, notAvailable)],
                [t('admin.audit_workspace.actor', {}, 'Operator'), identifier(selectedEvent.actor_ref, humanizeAuditToken(identifier(selectedEvent.actor_kind, notAvailable)))],
                [t('admin.audit_workspace.time', {}, 'Time'), selectedEvent.created_at ? formatDate(selectedEvent.created_at) : notAvailable],
                [t('admin.audit_workspace.site_id', {}, 'Site ID'), identifier(selectedEvent.site_id, notAvailable)],
                [t('admin.audit_workspace.account_id', {}, 'Account ID'), identifier(selectedEvent.account_id, notAvailable)],
              ].map(([label, value]) => (
                <div key={label}><dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-all text-slate-900 dark:text-slate-100">{value}</dd></div>
              ))}
            </dl>
            <details className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">{t('admin.audit_workspace.technical_detail', {}, 'Technical detail')}</summary>
              <dl className="mt-4 grid gap-4 text-sm">
                {[
                  [t('admin.audit_workspace.request_path', {}, 'Request path'), [selectedEvent.method, selectedEvent.path].filter(Boolean).join(' ') || notAvailable],
                  [t('audit.trace_id', {}, 'Record number'), identifier(selectedEvent.trace_id, notAvailable)],
                  [t('admin.audit_workspace.idempotency_key', {}, 'Idempotency key'), identifier(selectedEvent.idempotency_key, notAvailable)],
                  [t('admin.audit_workspace.subscription_id', {}, 'Subscription ID'), identifier(selectedEvent.subscription_id, notAvailable)],
                  [t('admin.audit_workspace.plan_version_id', {}, 'Plan version ID'), identifier(selectedEvent.plan_version_id, notAvailable)],
                ].map(([label, value]) => (
                  <div key={label}><dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-all font-mono text-xs text-slate-900 dark:text-slate-100">{value}</dd></div>
                ))}
              </dl>
            </details>
            <p className="border-l-2 border-slate-300 pl-3 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t('admin.audit_workspace.payload_boundary', {}, 'Request and result payload values are intentionally excluded from this workspace.')}
            </p>
          </div>
        ) : null}
      </AdminInspectorDrawer>
    </BackofficePageStack>
  );
}
