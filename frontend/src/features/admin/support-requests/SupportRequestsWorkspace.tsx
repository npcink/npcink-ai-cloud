'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AdminContextDrawer } from '@/components/admin/AdminContextDrawer';
import { AdminDataTableFrame } from '@/components/admin/AdminDataTableFrame';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { BackofficeIdentifier } from '@/components/backoffice/BackofficeIdentifier';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import {
  BackofficePageHeader,
  BackofficePageStack,
} from '@/components/backoffice/BackofficeScaffold';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { ListPagination } from '@/components/ui/ListPagination';
import { useToast } from '@/components/ui/Toast';
import { useLocale } from '@/contexts/LocaleContext';
import { resolveUiErrorMessage } from '@/lib/errors';
import { cn, formatDate, formatNumber as formatInteger } from '@/lib/utils';
import {
  SUPPORT_REQUEST_PAGE_SIZE,
  SUPPORT_REQUEST_STATUS_FILTERS,
  SUPPORT_REQUEST_TOPICS,
  ageHours,
  buildSupportRequestDetailHref,
  buildSupportRequestQueueReturnPath,
  buildSupportRequestsQuery,
  normalizeSupportRequestOffset,
  normalizeSupportRequestSort,
  requestRisk,
  riskToneClassName,
  supportRequestsDisplayScope,
} from './directory-model';
import {
  getLatestSupportRequestsDirectoryData,
  useSupportRequestUpdate,
  useSupportRequestsDirectory,
} from './queries';
import type { SupportRequest, SupportRequestStatus } from './types';

const NEXT_STATUSES: SupportRequestStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

function statusTone(status: SupportRequestStatus): string {
  if (status === 'open') return 'warning';
  if (status === 'resolved') return 'success';
  if (status === 'closed') return 'inactive';
  return 'read_only';
}

export function SupportRequestsWorkspace() {
  const { t } = useLocale();
  const toast = useToast();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [queueParamsKey, setQueueParamsKey] = useState(searchParamsKey);
  const queueParams = useMemo(() => new URLSearchParams(queueParamsKey), [queueParamsKey]);
  const appliedStatus = queueParams.get('status') || '';
  const appliedTopic = queueParams.get('topic') || '';
  const appliedQuery = queueParams.get('q') || '';
  const sort = normalizeSupportRequestSort(queueParams.get('sort'));
  const offset = normalizeSupportRequestOffset(queueParams.get('offset'));
  const focusedRequestId = queueParams.get('focus') || '';

  const [queryDraft, setQueryDraft] = useState(appliedQuery);
  const [actionError, setActionError] = useState('');
  const [editRequest, setEditRequest] = useState<SupportRequest | null>(null);
  const inspectorTriggerRef = useRef<HTMLButtonElement | null>(null);

  const requestKey = useMemo(
    () =>
      buildSupportRequestsQuery(
        { q: appliedQuery, status: appliedStatus, topic: appliedTopic },
        sort,
        offset
      ),
    [appliedQuery, appliedStatus, appliedTopic, offset, sort]
  );
  const directoryQuery = useSupportRequestsDirectory(requestKey);
  const updateRequest = useSupportRequestUpdate();
  const fallbackDirectory = directoryQuery.isError
    ? getLatestSupportRequestsDirectoryData(queryClient)
    : undefined;
  const directory = directoryQuery.data || fallbackDirectory;
  const displayScope = supportRequestsDisplayScope({
    currentRequestKey: requestKey,
    displayedRequestKey: directory?.requestKey,
    isPlaceholderData: directoryQuery.isPlaceholderData,
    hasError: directoryQuery.isError,
  });
  const summary = directory?.summary || {};
  const total = Number(directory?.pagination?.total || 0);
  const loadedAt = directory?.loadedAt ? new Date(directory.loadedAt) : null;
  const hasLoaded = Boolean(directory);
  const isLoading = directoryQuery.isPending && !hasLoaded;
  const isRefreshing = directoryQuery.isFetching;
  const loadError = directoryQuery.error
    ? resolveUiErrorMessage(directoryQuery.error, t('error.failed_load'))
    : '';

  const updateQueueUrl = useCallback((changes: Record<string, string | null>) => {
    const params = new URLSearchParams(queueParamsKey);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || (key === 'sort' && value === 'risk')) params.delete(key);
      else params.set(key, value);
    });
    const next = params.toString();
    setQueueParamsKey(next);
    const nextUrl = next ? `${pathname}?${next}` : pathname;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [pathname, queueParamsKey]);

  useEffect(() => {
    const browserParamsKey = new URLSearchParams(window.location.search).toString();
    if (searchParamsKey === browserParamsKey) {
      setQueueParamsKey(searchParamsKey);
    }
  }, [searchParamsKey]);

  useEffect(() => {
    setQueryDraft(appliedQuery);
  }, [appliedQuery]);

  const items = directory?.items || [];
  const selectedRequest = items.find((item) => item.request_id === focusedRequestId) || null;

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedQuery = String(new FormData(event.currentTarget).get('q') || '').trim();
    setQueryDraft(submittedQuery);
    updateQueueUrl({ q: submittedQuery || null, offset: null, focus: null });
  };

  const clearFilters = () => {
    setQueryDraft('');
    updateQueueUrl({ status: null, topic: null, q: null, sort: null, offset: null, focus: null });
  };

  const handleUpdate = async (formData: FormData) => {
    if (!editRequest) return;
    const requestedStatus = String(formData.get('status') || '');
    if (!NEXT_STATUSES.includes(requestedStatus as SupportRequestStatus)) {
      setActionError(t('error.failed_save'));
      return;
    }
    setActionError('');
    try {
      const data = await updateRequest.mutateAsync({
        requestId: editRequest.request_id,
        status: requestedStatus as SupportRequestStatus,
        adminNote: String(formData.get('admin_note') || ''),
      });
      if (!data.request) {
        throw new Error(t('error.failed_save'));
      }
      updateQueueUrl({ focus: editRequest.request_id });
      setEditRequest(null);
      toast.success(t('admin.support_requests_updated_notice', {}, 'Ticket updated.'), t('admin.support_requests_updated_title', {}, 'Ticket saved'));
    } catch (error) {
      setActionError(resolveUiErrorMessage(error, t('error.failed_save')));
    }
  };

  if (loadError && !hasLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div role="alert" className="max-w-md text-center">
          <h2 className="mb-4 text-2xl font-bold text-rose-600">{t('common.error')}</h2>
          <p className="mb-6 text-slate-600 dark:text-slate-400">{loadError}</p>
          <button type="button" onClick={() => void directoryQuery.refetch()} className="btn btn-primary">{t('common.retry')}</button>
        </div>
      </div>
    );
  }
  if (isLoading && !hasLoaded) return <LoadingFallback />;

  const hasFilters = Boolean(appliedStatus || appliedTopic || appliedQuery || sort !== 'risk');
  const openCount = Number(summary?.open || 0);
  const inProgressCount = Number(summary?.in_progress || 0);
  const criticalCount = Number(summary?.critical || 0);
  const selectedRisk = selectedRequest ? requestRisk(selectedRequest) : null;
  const selectedAge = selectedRequest ? ageHours(selectedRequest.created_at) : null;
  const selectedRiskReason = selectedRisk === 'critical'
    ? t('admin.support_requests_reason_overdue', {}, 'This unanswered or urgent ticket needs immediate operator review.')
    : selectedRisk === 'warning'
      ? t('admin.support_requests_reason_open', {}, 'The customer is waiting for the first operator response.')
      : selectedRisk === 'monitor'
        ? t('admin.support_requests_reason_in_progress', {}, 'Work has started; keep the customer conversation and internal next step current.')
        : t('admin.support_requests_reason_complete', {}, 'The ticket is resolved or closed and remains available as support history.');
  const closeInspector = () => updateQueueUrl({ focus: null });
  const openEditor = (item: SupportRequest) => {
    setActionError('');
    setEditRequest(item);
  };

  return (
    <BackofficePageStack className="space-y-5">
      <BackofficePageHeader
        eyebrow={t('admin.support_requests_eyebrow', {}, 'Customer support')}
        title={t('admin.support_requests_title', {}, 'Tickets')}
        description={t('admin.support_requests_workspace_desc', {}, 'Prioritize unanswered customer issues, inspect one ticket, then continue the full conversation in its detail view.')}
        secondaryAction={(
          <button type="button" className="btn btn-secondary" onClick={() => void directoryQuery.refetch()} disabled={isRefreshing}>
            {isRefreshing ? t('common.loading', {}, 'Loading...') : t('admin.support_requests_refresh_action', {}, 'Refresh tickets')}
          </button>
        )}
        summaryItems={[
          { label: t('admin.support_requests_open', {}, 'Open'), value: formatInteger(openCount), toneClassName: openCount ? 'text-amber-600 dark:text-amber-300' : undefined },
          { label: t('admin.support_requests_in_progress', {}, 'In progress'), value: formatInteger(inProgressCount) },
          { label: t('admin.support_requests_page_critical', {}, 'Critical'), value: formatInteger(criticalCount), toneClassName: criticalCount ? 'text-rose-600 dark:text-rose-300' : undefined },
          { label: t('admin.support_requests_total', {}, 'Filtered total'), value: formatInteger(total) },
          { label: t('common.updated_at', {}, 'Updated'), value: loadedAt ? formatDate(loadedAt.toISOString()) : t('common.unknown', {}, 'Unknown') },
        ]}
      />

      {loadError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between">
          <span>
            {loadError}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void directoryQuery.refetch()}>{t('common.retry')}</button>
        </div>
      ) : null}

      {displayScope.isRetainedScope ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
          {t('admin.support_requests_retained_notice', {}, 'Showing the last successfully loaded page; it may not match the current filters. Updates are disabled until the current view loads.')}
        </div>
      ) : null}

      <AdminDataTableFrame
        title={t('admin.support_requests_queue_title', {}, 'Customer ticket queue')}
        resultLabel={`${t('admin.support_requests_result_count', { visible: formatInteger(items.length), total: formatInteger(total) }, `${formatInteger(items.length)} on this page · ${formatInteger(total)} total`)} · ${t('admin.support_requests_queue_desc', {}, 'The service applies filters and global risk ordering before pagination.')}`}
        dataUi="support-request-table"
        density="compact"
        bodyClassName="overflow-hidden"
        footer={<ListPagination offset={offset} limit={SUPPORT_REQUEST_PAGE_SIZE} total={total} isLoading={isRefreshing} onOffsetChange={(nextOffset) => updateQueueUrl({ offset: String(nextOffset), focus: null })} />}
      >
        <form
          data-ui="support-request-toolbar"
          onSubmit={applySearch}
          className="grid gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-6"
        >
          <label className="text-sm text-slate-700 dark:text-slate-200 xl:col-span-2">
            <span className="sr-only">{t('admin.support_requests_search_label', {}, 'Search tickets')}</span>
            <input name="q" type="search" className="input w-full" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder={t('admin.support_requests_search_placeholder', {}, 'Email, site, account, or title')} />
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="sr-only">{t('admin.support_requests_status_filter_label', {}, 'Ticket status')}</span>
            <select className="input w-full" value={appliedStatus} onChange={(event) => updateQueueUrl({ status: event.target.value || null, offset: null, focus: null })}>
              {SUPPORT_REQUEST_STATUS_FILTERS.map((status) => <option key={status || 'all'} value={status}>{status ? t(`admin.support_status_${status}`, {}, status) : t('common.all', {}, 'All')}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="sr-only">{t('admin.support_requests_topic_filter_label', {}, 'Ticket topic')}</span>
            <select className="input w-full" value={appliedTopic} onChange={(event) => updateQueueUrl({ topic: event.target.value || null, offset: null, focus: null })}>
              {SUPPORT_REQUEST_TOPICS.map((topic) => <option key={topic || 'all'} value={topic}>{topic ? t(`portal.support_topic_${topic}`, {}, topic) : t('admin.support_topic_all', {}, 'All topics')}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-700 dark:text-slate-200">
            <span className="sr-only">{t('admin.support_requests_sort_label', {}, 'Sort')}</span>
            <select className="input w-full" value={sort} onChange={(event) => updateQueueUrl({ sort: normalizeSupportRequestSort(event.target.value), focus: null })}>
              <option value="risk">{t('admin.support_requests_sort_risk', {}, 'Highest risk')}</option>
              <option value="updated_at">{t('admin.support_requests_sort_updated', {}, 'Recently updated')}</option>
            </select>
          </label>
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            <button type="submit" className="btn btn-primary btn-sm">{t('common.apply', {}, 'Apply')}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!hasFilters && !queryDraft} onClick={clearFilters}>{t('common.clear_filters', {}, 'Clear filters')}</button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] table-fixed text-left text-sm">
            <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th scope="col" className="w-36 px-3 py-2">{t('admin.support_requests_table_risk', {}, 'Risk / age')}</th>
                <th scope="col" className="w-[28%] px-3 py-2">{t('admin.support_requests_table_ticket', {}, 'Ticket / customer')}</th>
                <th scope="col" className="w-36 px-3 py-2">{t('common.status')}</th>
                <th scope="col" className="w-52 px-3 py-2">{t('admin.support_requests_table_scope', {}, 'Account / site')}</th>
                <th scope="col" className="w-36 px-3 py-2">{t('common.updated_at', {}, 'Updated')}</th>
                <th scope="col" className="w-56 px-3 py-2 text-right">{t('common.actions', {}, 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {items.length ? items.map((item) => {
                const risk = requestRisk(item);
                const isSelected = selectedRequest?.request_id === item.request_id;
                const age = ageHours(item.created_at);
                return (
                  <tr key={item.request_id} data-ui="support-request-row" className={cn('align-middle transition', isSelected ? 'bg-blue-50/65 dark:bg-blue-950/15' : 'hover:bg-slate-50/70 dark:hover:bg-slate-950/35')}>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', riskToneClassName(risk))}>{t(`admin.support_requests_risk_${risk}`, {}, risk)}</span>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{age === null ? t('common.unknown', {}, 'Unknown') : t('admin.support_requests_age_hours', { hours: String(age) }, `${age}h`)}</p>
                    </td>
                    <td className="min-w-0 px-3 py-2.5">
                      <p className="truncate font-semibold text-slate-950 dark:text-white">{item.title}</p>
                      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="truncate">{item.email}</span>
                        <span aria-hidden="true">·</span>
                        <BackofficeIdentifier value={item.request_id} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <BackofficeStatusBadge status={statusTone(item.status)} label={t(`admin.support_status_${item.status}`, {}, item.status)} />
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{t(`portal.support_topic_${item.topic}`, {}, item.topic)}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <p className="truncate font-medium text-slate-950 dark:text-white">{item.account_id}</p>
                      <p className="mt-1 truncate">{item.site_id || t('common.not_available', {}, 'N/A')}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                      {item.updated_at ? formatDate(item.updated_at) : t('common.unknown', {}, 'Unknown')}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button ref={isSelected ? inspectorTriggerRef : undefined} type="button" className="btn btn-secondary btn-sm" aria-pressed={isSelected} onClick={(event) => { inspectorTriggerRef.current = event.currentTarget; updateQueueUrl({ focus: item.request_id }); }}>{t('admin.support_requests_inspect_action', {}, 'Inspect')}</button>
                        <Link
                          className="btn btn-primary btn-sm"
                          href={buildSupportRequestDetailHref(item.request_id, buildSupportRequestQueueReturnPath(pathname, queueParamsKey, item.request_id))}
                        >
                          {t('admin.support_requests_open_conversation_action', {}, 'Open conversation')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="px-3 py-3">
                    <AdminEmptyState className="mx-auto max-w-2xl text-center">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{hasFilters ? t('admin.support_requests_filtered_empty_title', {}, 'No tickets match these filters') : t('admin.support_requests_empty_title', {}, 'No support tickets yet')}</p>
                      <p className="mt-1">{hasFilters ? t('admin.support_requests_filtered_empty_desc', {}, 'Clear or change the filters to return to the ticket queue.') : t('admin.support_requests_empty_desc', {}, 'New Portal support tickets will appear here.')}</p>
                      {hasFilters ? <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={clearFilters}>{t('common.clear_filters', {}, 'Clear filters')}</button> : null}
                    </AdminEmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminDataTableFrame>

      <AdminContextDrawer
        open={Boolean(selectedRequest) && !editRequest}
        title={selectedRequest?.title || t('admin.support_requests_inspector_title', {}, 'Current ticket')}
        titleId="support-request-drawer-title"
        eyebrow={t('admin.support_requests_inspector_eyebrow', {}, 'Inspector')}
        closeLabel={t('admin.support_requests_close_inspector', {}, 'Close ticket inspector')}
        onClose={closeInspector}
        returnFocusRef={inspectorTriggerRef}
        footer={selectedRequest ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={displayScope.isRetainedScope} onClick={() => openEditor(selectedRequest)}>{t('admin.support_requests_edit_action', {}, 'Edit handling')}</button>
            <Link className="btn btn-primary" href={buildSupportRequestDetailHref(selectedRequest.request_id, buildSupportRequestQueueReturnPath(pathname, queueParamsKey, selectedRequest.request_id))}>{t('admin.support_requests_open_conversation_action', {}, 'Open conversation')}</Link>
          </>
        ) : null}
      >
        {selectedRequest ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <BackofficeIdentifier value={selectedRequest.request_id} full />
              {selectedRisk ? <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold', riskToneClassName(selectedRisk))}>{t(`admin.support_requests_risk_${selectedRisk}`, {}, selectedRisk)}</span> : null}
            </div>
            <section aria-labelledby="support-request-risk-title" className="border-l-2 border-slate-300 pl-3 dark:border-slate-700">
              <h3 id="support-request-risk-title" className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.support_requests_risk_summary_title', {}, 'Queue reason')}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedRiskReason}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('admin.support_requests_age_label', {}, 'Age')}: {selectedAge === null ? t('common.unknown', {}, 'Unknown') : t('admin.support_requests_age_hours', { hours: String(selectedAge) }, `${selectedAge}h`)}</p>
            </section>
            <section aria-labelledby="support-request-customer-submission-title">
              <h3 id="support-request-customer-submission-title" className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.support_requests_customer_submission_title', {}, 'Customer submission')}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedRequest.description}</p>
            </section>
            <dl className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-x-4 gap-y-2 border-y border-slate-200 py-4 text-sm dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">{t('common.email', {}, 'Email')}</dt><dd className="truncate text-right text-slate-950 dark:text-white">{selectedRequest.email}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.account_id', {}, 'Account ID')}</dt><dd className="truncate text-right"><Link className="font-medium text-blue-700 hover:underline dark:text-blue-300" href={`/admin/accounts/${encodeURIComponent(selectedRequest.account_id)}`}>{selectedRequest.account_id}</Link></dd>
              <dt className="text-slate-500 dark:text-slate-400">{t('common.site', {}, 'Site')}</dt><dd className="truncate text-right">{selectedRequest.site_id ? <Link className="font-medium text-blue-700 hover:underline dark:text-blue-300" href={`/admin/sites/${encodeURIComponent(selectedRequest.site_id)}`}>{selectedRequest.site_id}</Link> : t('common.not_available', {}, 'N/A')}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{t('common.status')}</dt><dd className="text-right"><BackofficeStatusBadge status={statusTone(selectedRequest.status)} label={t(`admin.support_status_${selectedRequest.status}`, {}, selectedRequest.status)} /></dd>
              <dt className="text-slate-500 dark:text-slate-400">{t('admin.support_requests_topic_filter_label', {}, 'Ticket topic')}</dt><dd className="text-right text-slate-950 dark:text-white">{t(`portal.support_topic_${selectedRequest.topic}`, {}, selectedRequest.topic)}</dd>
              <dt className="text-slate-500 dark:text-slate-400">{t('common.updated_at', {}, 'Updated')}</dt><dd className="text-right text-slate-950 dark:text-white">{selectedRequest.updated_at ? formatDate(selectedRequest.updated_at) : t('common.unknown', {}, 'Unknown')}</dd>
            </dl>
            <section aria-labelledby="support-request-internal-handling-title">
              <h3 id="support-request-internal-handling-title" className="text-sm font-semibold text-slate-950 dark:text-white">{t('admin.support_requests_internal_handling_title', {}, 'Internal handling')}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedRequest.admin_note || t('admin.support_requests_no_internal_note', {}, 'No internal handling note yet.')}</p>
            </section>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t('admin.support_requests_inspector_boundary', {}, 'The queue updates Cloud support status and internal notes only. Public replies, attachments, and the full timeline stay in ticket detail; no WordPress write is created.')}</p>
          </div>
        ) : null}
      </AdminContextDrawer>

      <AdminWorkbenchDialog
        key={editRequest?.request_id || 'closed-support-request-editor'}
        open={Boolean(editRequest)}
        title={t('admin.support_requests_edit_title', { title: editRequest?.title || '' }, 'Edit internal handling')}
        titleId="support-request-edit-title"
        saving={updateRequest.isPending}
        error={actionError}
        closeLabel={t('common.close')}
        cancelLabel={t('common.cancel')}
        saveLabel={t('common.save')}
        savingLabel={t('common.saving', {}, 'Saving...')}
        footerNotice={t('admin.support_requests_edit_notice', {}, 'This changes the Cloud ticket status and internal note only.')}
        width="compact"
        density="compact"
        onClose={() => setEditRequest(null)}
        onSubmit={(formData) => void handleUpdate(formData)}
      >
        {editRequest ? (
          <>
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.support_requests_status_edit_label', { title: editRequest.title }, `Status for ${editRequest.title}`)}</span>
              <select name="status" className="input w-full" defaultValue={editRequest.status}>
                {NEXT_STATUSES.map((status) => <option key={status} value={status}>{t(`admin.support_status_${status}`, {}, status)}</option>)}
              </select>
            </label>
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">{t('admin.support_requests_note_edit_label', { title: editRequest.title }, `Internal note for ${editRequest.title}`)}</span>
              <textarea name="admin_note" className="input min-h-32 w-full" defaultValue={editRequest.admin_note || ''} placeholder={t('admin.support_requests_note_placeholder', {}, 'Internal handling note')} />
            </label>
          </>
        ) : null}
      </AdminWorkbenchDialog>
    </BackofficePageStack>
  );
}
