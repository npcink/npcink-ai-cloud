'use client';
import { supportCustomerLabel, supportSiteLabel } from '@/features/admin/support-requests/display';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  BackofficePageStack,
  BackofficePageHeader,
  BackofficeSectionPanel,
  BackofficeStackCard,
  BackofficeDisclosure,
} from '@/components/backoffice/BackofficeScaffold';
import { BackofficeStatusBadge } from '@/components/backoffice/BackofficeStatusBadge';
import { LoadingFallback } from '@/components/ui/LoadingFallback';
import { useLocale } from '@/contexts/LocaleContext';
import { supportDetailClient, useSupportDetail } from '@/features/admin/support-requests/use-support-detail';
import { readSupportDownload, type SupportAttachment } from '@/features/admin/support-requests/detail-evidence';
import { useSupportDraftNavigation } from '@/features/admin/support-requests/use-support-draft-navigation';
import { hasSupportMessage } from '@/features/admin/support-requests/support-text';
import { resolveUiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';
import {
  ADMIN_QUEUE_PATHNAMES,
  normalizeAdminReturnTo,
} from '@/lib/admin-return-context';

const NEXT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

function statusTone(status: string): string {
  if (status === 'open') return 'warning';
  if (status === 'resolved') return 'success';
  if (status === 'closed') return 'inactive';
  return 'read_only';
}

function downloadAttachmentFile(attachment: SupportAttachment): void {
  if (!attachment.content_base64) return;
  const binary = atob(attachment.content_base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: attachment.content_type || 'application/octet-stream' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.filename || 'support-attachment';
  anchor.click();
  URL.revokeObjectURL(url);
}

function authorLabel(authorKind: string, visibility: string, t: ReturnType<typeof useLocale>['t']): string {
  if (visibility === 'internal') return t('admin.support_message_internal_note', {}, 'Internal note');
  if (authorKind === 'operator') return t('admin.support_message_author_operator', {}, 'Support');
  if (authorKind === 'system') return t('admin.support_message_author_system', {}, 'System');
  return t('admin.support_message_author_customer', {}, 'Customer');
}

export default function AdminSupportRequestDetailPage() {
  const params = useParams<{ requestId?: string }>();
  const searchParams = useSearchParams();
  const requestId = String(params?.requestId || '');
  const returnPath = normalizeAdminReturnTo(
    searchParams.get('return_to'),
    {
      allowedPathnames: [ADMIN_QUEUE_PATHNAMES.supportRequests],
      fallback: ADMIN_QUEUE_PATHNAMES.supportRequests,
    }
  );
  const { t } = useLocale();
  const controller = useSupportDetail(requestId);
  const { confirmation } = useSupportDraftNavigation(controller.hasOrdinaryDraft, controller.discardOrdinaryDrafts);
  const { detail, draft, updateDraft, intent, locked, busy, loading: isLoading, readError, storageBlocked, lastReceipt } = controller;
  const supportRequest = detail?.request || null;
  const messages = detail?.messages || [], attachments = detail?.attachments || [], feedback = detail?.feedback || null;
  const { publicReply, internalNote, file: attachmentFile, visibility: attachmentVisibility, status: statusDraft } = draft;
  const pendingAction = busy ? intent?.action === 'message' ? intent.values.visibility : intent?.action || 'preparing' : '';
  const [downloadError, setDownloadError] = useState('');
  const downloadTarget = useRef(0);
  useLayoutEffect(() => { downloadTarget.current += 1; return () => { downloadTarget.current += 1; }; }, [requestId]);
  const handleAttachmentDownload = async (attachment: SupportAttachment) => {
    if (!supportRequest || !controller.ready) return;
    const target = requestId, revision = downloadTarget.current;
    setDownloadError('');
    try {
      const response = await supportDetailClient.request<unknown>(`/api/admin/support-requests/${encodeURIComponent(target)}/attachments/${encodeURIComponent(attachment.attachment_id)}`);
      const parsed = readSupportDownload(response.data, attachment, supportRequest);
      if (downloadTarget.current === revision) downloadAttachmentFile(parsed);
    } catch (err) {
      if (downloadTarget.current === revision) setDownloadError(resolveUiErrorMessage(err, t('error.failed_load')));
    }
  };
  const error = storageBlocked ? t('admin.support_recovery.storage_blocked')
    : controller.error === 'unknown' ? ''
      : controller.error === 'write' ? t('admin.support_recovery.not_saved') : downloadError;
  const notice = controller.notice === 'public_sent' ? t('admin.support_message_public_sent')
    : controller.notice === 'public_saved' ? t('admin.support_message_public_saved')
      : controller.notice ? t('admin.support_recovery.saved') : '';

  if (isLoading && !detail && !readError && !publicReply && !internalNote && !intent) {
    return <LoadingFallback />;
  }

  return (
    <BackofficePageStack data-ui="support-request-detail-workspace">
      <BackofficePageHeader
        title={supportRequest?.title || t('admin.support_request_detail_title', {}, 'Ticket detail')}
        summaryItems={supportRequest ? [
          { label: t('admin.support_recovery.ticket'), value: supportRequest.request_id },
          { label: t('admin.support_requests_priority', {}, 'Priority'), value: ({ high: t('admin.support_priority_high', {}, 'High'), normal: t('admin.support_priority_normal', {}, 'Normal'), low: t('admin.support_priority_low', {}, 'Low') } as Record<string, string>)[supportRequest.priority] || supportRequest.priority },
          { label: t('common.account', {}, 'Account'), value: supportCustomerLabel(supportRequest, t('admin.accounts.unnamed_customer')) },
          { label: t('common.updated_at', {}, 'Updated'), value: supportRequest.updated_at ? formatDate(supportRequest.updated_at) : t('common.unknown', {}, 'Unknown') },
        ] : []}
        summaryAside={
          supportRequest ? (
            <BackofficeStatusBadge
              status={statusTone(supportRequest.status)}
              label={t(`admin.support_status_${supportRequest.status}`, {}, supportRequest.status)}
            />
          ) : null
        }
        secondaryAction={
          <Link href={returnPath} className="btn btn-secondary">
            {t('common.back', {}, 'Back')}
          </Link>
        }
      />

      {readError ? (
        <div role="alert" className="space-y-2 text-sm" data-ui="support-read-recovery">
          <p>{t('admin.support_recovery.read_failed')} · {requestId}</p>
          <button type="button" className="btn btn-secondary" disabled={isLoading || busy} onClick={() => void controller.load()}>{t('common.retry')}</button>
        </div>
      ) : null}
      {detail?.issues.length ? <div role="alert" className="text-sm" data-ui="support-child-issues">
        <p>{t('admin.support_recovery.child_issues', { count: String(detail.issues.length) })}</p>
        <details><summary className="cursor-pointer">{t('admin.readability.invalid_records')}</summary><p className="select-text break-all text-xs">{detail.issues.join(', ')}</p></details>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy || isLoading} onClick={() => void controller.load()}>{t('common.retry')}</button>
      </div> : null}
      {intent ? <div role="status" className="space-y-2 text-sm" data-ui="support-operation-recovery">
        <p>{busy ? t('admin.support_recovery.sending') : t('admin.support_recovery.unknown')}</p>
        <p>{t('admin.support_recovery.ticket')}: {intent.request_id}</p>
        <button type="button" className="btn btn-secondary" disabled={busy || storageBlocked} onClick={() => void controller.confirm()}>{t('admin.support_recovery.confirm')}</button>
        <BackofficeDisclosure summary={t('admin.support_recovery.evidence')}>
          <dl className="space-y-2 select-text break-all">
            {[
              [t('admin.readability.actor_kind'), intent.actor_kind],
              [t('admin.audit_workspace.actor_ref'), intent.actor_ref],
              [t('admin.readability.operation_id'), intent.operation_id],
              [t('admin.readability.occurred_at'), intent.created_at],
              [t('admin.readability.submitted_values'), JSON.stringify(intent.values, null, 2)],
            ].map(([label, value]) => <div key={label}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}
          </dl>
        </BackofficeDisclosure>
      </div> : null}
      {lastReceipt ? <BackofficeDisclosure summary={t('admin.support_recovery.evidence')}>
        <dl className="space-y-2 select-text break-all">
          {[
            [t('admin.readability.operation_id'), lastReceipt.operation_id],
            [t('admin.audit_workspace.actor_ref'), lastReceipt.actor_ref],
            [t('admin.audit_workspace.event_id'), lastReceipt.event_id],
            [t('admin.readability.message_id'), lastReceipt.message_id || '—'],
            [t('admin.readability.attachment_id'), lastReceipt.attachment_id || '—'],
            [t('admin.readability.occurred_at'), lastReceipt.created_at],
          ].map(([label, value]) => <div key={String(label)}><dt className="font-medium">{String(label)}</dt><dd>{String(value ?? '—')}</dd></div>)}
        </dl>
      </BackofficeDisclosure> : null}

      {notice ? (
        <div className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {supportRequest ? (
        <BackofficeSectionPanel>
          <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2 xl:grid-cols-3">
            <Link className="font-medium text-blue-700 hover:underline dark:text-blue-300" href={`/admin/accounts/${encodeURIComponent(supportRequest.account_id)}`}>{supportCustomerLabel(supportRequest, t('admin.accounts.unnamed_customer'))}</Link>
            {supportRequest.site_id ? (
              <Link className="font-medium text-blue-700 hover:underline dark:text-blue-300" href={`/admin/sites/${encodeURIComponent(supportRequest.site_id)}`}>{supportSiteLabel(supportRequest, t('admin.readability.unnamed_site'))}</Link>
            ) : (
              <span>{t('portal.support_request_no_site', {}, 'Account-level issue')}</span>
            )}
            <span>{t(`portal.support_topic_${supportRequest.topic}`, {}, supportRequest.topic)}</span>
          </div>
          <details className="mt-3 text-xs"><summary className="cursor-pointer">{t('admin.notices.evidence')}</summary>
            <dl className="mt-2 space-y-2 select-text break-all">
              <div><dt>{t('admin.account_id')}</dt><dd>{supportRequest.account_id}</dd></div>
              <div><dt>{t('admin.audit_workspace.site_id')}</dt><dd>{supportRequest.site_id || '—'}</dd></div>
            </dl>
          </details>
        </BackofficeSectionPanel>
      ) : null}

      {supportRequest ? <BackofficeSectionPanel>
        <div className="space-y-3">
          {supportRequest?.description && !messages.some(message => message.body === supportRequest.description) ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{supportRequest.description}</p> : null}
          {messages.map((message) => (
            <BackofficeStackCard
              key={message.message_id}
              className={message.visibility === 'internal' ? 'bg-amber-50/70 dark:bg-amber-950/20' : 'bg-white/80 dark:bg-slate-950/45'}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {authorLabel(message.author_kind, message.visibility, t)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {message.created_at ? formatDate(message.created_at) : message.message_id}
                </p>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                {message.body}
              </p>
            </BackofficeStackCard>
          ))}
        </div>
      </BackofficeSectionPanel> : null}

      {feedback ? (
        <BackofficeSectionPanel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('admin.support_feedback_title', {}, 'Close evaluation')}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {feedback.comment || t('admin.support_feedback_no_comment', {}, 'No comment provided.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BackofficeStatusBadge
                status={feedback.resolved ? 'success' : 'warning'}
                label={
                  feedback.resolved
                    ? t('admin.support_feedback_resolved', {}, 'Resolved')
                    : t('admin.support_feedback_unresolved', {}, 'Not resolved')
                }
              />
              <BackofficeStatusBadge
                status="read_only"
                label={t(
                  'admin.support_feedback_rating_value',
                  { rating: String(feedback.rating) },
                  '{{rating}}/5'
                )}
              />
            </div>
          </div>
        </BackofficeSectionPanel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <BackofficeSectionPanel>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('admin.support_message_public_reply', {}, 'Public reply')}
            <textarea
              className="input mt-2 min-h-32"
              value={publicReply}
              maxLength={4000}
              disabled={busy || Boolean(intent)}
              onChange={(event) => updateDraft({ publicReply: event.target.value })}
              placeholder={t('admin.support_message_public_placeholder', {}, 'Reply to the customer.')}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={locked || !hasSupportMessage(publicReply)}
              data-ui="support-public-action"
              onClick={() => void controller.submit('message', 'public')}
            >
              {pendingAction === 'public'
                ? t('common.saving', {}, 'Saving...')
                : t('admin.support_message_public_action', {}, 'Send public reply')}
            </button>
          </div>
        </BackofficeSectionPanel>

        <BackofficeSectionPanel>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('admin.support_request_status_label', {}, 'Status')}
            <select
              className="input mt-2"
              value={statusDraft}
              disabled={busy || Boolean(intent)}
              onChange={(event) => updateDraft({ status: event.target.value, statusDirty: true })}
            >
              {NEXT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`admin.support_status_${status}`, {}, status)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            disabled={locked}
            data-ui="support-status-action"
              onClick={() => void controller.submit('status')}
          >
            {pendingAction === 'status'
              ? t('common.saving', {}, 'Saving...')
              : t('admin.support_request_status_action', {}, 'Update status')}
          </button>

          <label className="mt-5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('admin.support_message_internal_note', {}, 'Internal note')}
            <textarea
              className="input mt-2 min-h-28"
              value={internalNote}
              maxLength={4000}
              disabled={busy || Boolean(intent)}
              onChange={(event) => updateDraft({ internalNote: event.target.value })}
              placeholder={t('admin.support_message_internal_placeholder', {}, 'Visible only to admins.')}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            disabled={locked || !hasSupportMessage(internalNote)}
            data-ui="support-internal-action"
              onClick={() => void controller.submit('message', 'internal')}
          >
            {pendingAction === 'internal'
              ? t('common.saving', {}, 'Saving...')
              : t('admin.support_message_internal_action', {}, 'Save internal note')}
          </button>
        </BackofficeSectionPanel>
      </div>

      <BackofficeDisclosure summary={<span>{t('admin.support_attachments_title', {}, 'Attachments')} · {attachments.length}{attachmentFile ? ` · ${attachmentFile.name}` : ''}</span>}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('admin.support_attachment_limit', {}, 'PDF, image, text, CSV, or JSON. Max 5 MB each.')}
          </p>
        </div>
        {attachments.length ? (
          <div className="mb-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {attachments.map((attachment) => (
              <div key={attachment.attachment_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{attachment.filename}</p>
                    <BackofficeStatusBadge
                      status={attachment.visibility === 'internal' ? 'warning' : 'read_only'}
                      label={
                        attachment.visibility === 'internal'
                          ? t('admin.support_attachment_internal', {}, 'Internal')
                          : t('admin.support_attachment_public', {}, 'Public')
                      }
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {attachment.content_type} · {Math.ceil((attachment.byte_size || 0) / 1024)} KB
                  </p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!controller.ready} onClick={() => void handleAttachmentDownload(attachment)}>
                  {t('common.download', {}, 'Download')}
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-center">
          <input
            className="input"
            type="file"
            aria-label={t('admin.support_attachments_title', {}, 'Attachments')}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,application/json"
            disabled={busy || Boolean(intent)}
            onChange={(event) => updateDraft({ file: event.target.files?.[0] || null })}
          />
          <select
            className="input"
            aria-label={t('admin.support_attachment_visibility', {}, 'Attachment visibility')}
            value={attachmentVisibility}
            disabled={busy || Boolean(intent)}
            onChange={(event) => updateDraft({ visibility: event.target.value as 'public' | 'internal' })}
          >
            <option value="public">{t('admin.support_attachment_public', {}, 'Public')}</option>
            <option value="internal">{t('admin.support_attachment_internal', {}, 'Internal')}</option>
          </select>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={locked || !attachmentFile}
            data-ui="support-attachment-action"
              onClick={() => void controller.submit('attachment')}
          >
            {pendingAction === 'attachment'
              ? t('common.saving', {}, 'Saving...')
              : t('admin.support_attachment_upload_action', {}, 'Upload')}
          </button>
        </div>
      </BackofficeDisclosure>

      {confirmation}
    </BackofficePageStack>
  );
}
