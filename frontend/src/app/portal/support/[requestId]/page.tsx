'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  PortalPageStack,
} from '@/components/portal/PortalScaffold';
import { PortalBreadcrumb } from '@/components/portal/PortalBreadcrumb';
import { PortalActionIcon } from '@/components/portal/PortalRowActions';
import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import {
  PortalErrorState,
  PortalLoadingState,
  PortalSignedOutState,
} from '@/components/portal/PortalPageState';
import { PortalWorkspaceHeader } from '@/components/portal/PortalWorkspaceHeader';
import { useLocale } from '@/contexts/LocaleContext';
import { useSession } from '@/hooks/useSession';
import {
  portalClient,
  type PortalSupportRequest,
  type PortalSupportRequestAttachment,
  type PortalSupportRequestFeedback,
  type PortalSupportRequestMessage,
} from '@/lib/portal-client';
import {
  formatPortalErrorMessage,
  formatPortalWriteErrorMessage,
} from '@/lib/portal-error';
import { formatDate } from '@/lib/utils';

function statusTone(status: string): 'active' | 'warning' | 'neutral' | 'danger' {
  if (status === 'open') return 'warning';
  if (status === 'resolved') return 'active';
  return 'neutral';
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '');
    reader.onerror = () => reject(reader.error || new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

function downloadAttachmentFile(attachment: PortalSupportRequestAttachment): void {
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

export default function PortalSupportRequestDetailPage() {
  const params = useParams<{ requestId?: string }>();
  const requestId = String(params?.requestId || '');
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated } = useSession();
  const contextSiteId = session?.selected_context?.site.site_id || '';
  const [supportRequest, setSupportRequest] = useState<PortalSupportRequest | null>(null);
  const [messages, setMessages] = useState<PortalSupportRequestMessage[]>([]);
  const [attachments, setAttachments] = useState<PortalSupportRequestAttachment[]>([]);
  const [feedback, setFeedback] = useState<PortalSupportRequestFeedback | null>(null);
  const [reply, setReply] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [feedbackResolved, setFeedbackResolved] = useState(true);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackEditorOpen, setFeedbackEditorOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const contextSiteIdRef = useRef(contextSiteId);
  const requestIdRef = useRef(requestId);
  const contextRequestVersionRef = useRef(0);
  const detailRequestVersionRef = useRef(0);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDetail = useCallback(async () => {
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    if (!isAuthenticated || !capturedRequestId) return;
    const contextRequestVersion = contextRequestVersionRef.current;
    const detailRequestVersion = ++detailRequestVersionRef.current;
    setIsDetailLoading(true);
    setError('');
    try {
      const response = await portalClient.getSupportRequest(capturedRequestId);
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || detailRequestVersion !== detailRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setSupportRequest(response.data.request);
      setMessages(response.data.messages || []);
      setAttachments(response.data.attachments || []);
      setFeedback(response.data.feedback || null);
      if (response.data.feedback) {
        setFeedbackResolved(response.data.feedback.resolved);
        setFeedbackRating(response.data.feedback.rating || 5);
        setFeedbackComment(response.data.feedback.comment || '');
      }
    } catch (err) {
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || detailRequestVersion !== detailRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setError(formatPortalErrorMessage(err, t, t('error.failed_load', {}, 'Failed to load')));
    } finally {
      if (
        contextRequestVersion === contextRequestVersionRef.current
        && detailRequestVersion === detailRequestVersionRef.current
        && requestContextSiteId === contextSiteIdRef.current
        && capturedRequestId === requestIdRef.current
      ) setIsDetailLoading(false);
    }
  }, [isAuthenticated, t]);

  useLayoutEffect(() => {
    contextSiteIdRef.current = contextSiteId;
    requestIdRef.current = requestId;
    contextRequestVersionRef.current += 1;
    detailRequestVersionRef.current += 1;
    setSupportRequest(null);
    setMessages([]);
    setAttachments([]);
    setFeedback(null);
    setReply('');
    setAttachmentFile(null);
    setAttachOpen(false);
    setFeedbackResolved(true);
    setFeedbackRating(5);
    setFeedbackComment('');
    setIsDetailLoading(Boolean(isAuthenticated && requestId));
    setIsSubmitting(false);
    setIsUploadingAttachment(false);
    setIsSubmittingFeedback(false);
    setError('');
    setNotice('');
  }, [contextSiteId, isAuthenticated, requestId]);

  useEffect(() => {
    if (!isAuthenticated || !requestId) return;
    void loadDetail();
    return () => {
      detailRequestVersionRef.current += 1;
    };
  }, [contextSiteId, isAuthenticated, loadDetail, requestId]);

  useEffect(() => {
    const node = replyTextareaRef.current;
    if (!node) return;
    node.style.height = '0px';
    const next = Math.min(Math.max(node.scrollHeight, 40), 144);
    node.style.height = `${next}px`;
  }, [reply]);

  const handleReply = async () => {
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    const contextRequestVersion = contextRequestVersionRef.current;
    if (!isAuthenticated || !capturedRequestId) return;
    const body = reply.trim();
    if (!body) return;
    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      const response = await portalClient.createSupportRequestMessage(capturedRequestId, { body });
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setSupportRequest(response.data.request);
      setMessages((current) => [...current, response.data.message]);
      setReply('');
      setNotice(t('portal.support_message_created', {}, 'Reply submitted.'));
    } catch (err) {
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setError(formatPortalWriteErrorMessage(err, t, t('error.failed_save', {}, 'Failed to save')));
    } finally {
      if (
        contextRequestVersion === contextRequestVersionRef.current
        && requestContextSiteId === contextSiteIdRef.current
        && capturedRequestId === requestIdRef.current
      ) setIsSubmitting(false);
    }
  };

  const handleAttachmentUpload = async () => {
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    const contextRequestVersion = contextRequestVersionRef.current;
    if (!isAuthenticated || !capturedRequestId) return;
    if (!attachmentFile) return;
    setIsUploadingAttachment(true);
    setError('');
    setNotice('');
    try {
      const contentBase64 = await readFileAsBase64(attachmentFile);
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      const response = await portalClient.createSupportRequestAttachment(capturedRequestId, {
        filename: attachmentFile.name,
        content_type: attachmentFile.type || 'application/octet-stream',
        content_base64: contentBase64,
      });
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setSupportRequest(response.data.request);
      setAttachments((current) => [...current, response.data.attachment]);
      setAttachmentFile(null);
      setAttachOpen(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNotice(t('portal.support_attachment_created', {}, 'Attachment uploaded.'));
    } catch (err) {
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setError(formatPortalWriteErrorMessage(err, t, t('error.failed_save', {}, 'Failed to save')));
    } finally {
      if (
        contextRequestVersion === contextRequestVersionRef.current
        && requestContextSiteId === contextSiteIdRef.current
        && capturedRequestId === requestIdRef.current
      ) setIsUploadingAttachment(false);
    }
  };

  const handleAttachmentDownload = async (attachment: PortalSupportRequestAttachment) => {
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    const contextRequestVersion = contextRequestVersionRef.current;
    if (!isAuthenticated || !capturedRequestId) return;
    setError('');
    try {
      const response = await portalClient.getSupportRequestAttachment(
        capturedRequestId,
        attachment.attachment_id
      );
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      downloadAttachmentFile(response.data.attachment);
    } catch (err) {
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setError(formatPortalErrorMessage(err, t, t('error.failed_load', {}, 'Failed to load')));
    }
  };

  const handleFeedbackSubmit = async () => {
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    const contextRequestVersion = contextRequestVersionRef.current;
    if (!isAuthenticated || !capturedRequestId) return;
    setIsSubmittingFeedback(true);
    setError('');
    setNotice('');
    try {
      const response = await portalClient.submitSupportRequestFeedback(capturedRequestId, {
        resolved: feedbackResolved,
        rating: feedbackRating,
        comment: feedbackComment,
      });
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setSupportRequest(response.data.request);
      setFeedback(response.data.feedback);
      setFeedbackEditorOpen(false);
      setNotice(t('portal.support_feedback_submitted', {}, 'Feedback submitted.'));
    } catch (err) {
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setError(formatPortalWriteErrorMessage(err, t, t('error.failed_save', {}, 'Failed to save')));
    } finally {
      if (
        contextRequestVersion === contextRequestVersionRef.current
        && requestContextSiteId === contextSiteIdRef.current
        && capturedRequestId === requestIdRef.current
      ) setIsSubmittingFeedback(false);
    }
  };

  if (isLoading) {
    return <PortalLoadingState message={t('common.loading', {}, 'Loading...')} />;
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

  if (isDetailLoading) {
    return <PortalLoadingState message={t('common.loading', {}, 'Loading...')} />;
  }

  if (error && !supportRequest) {
    return (
      <PortalErrorState
        title={t('error.failed_load', {}, 'Failed to load')}
        description={error}
        retryLabel={t('common.retry', {}, 'Retry')}
        onRetry={() => void loadDetail()}
      />
    );
  }

  const willReopen = supportRequest?.status === 'resolved' || supportRequest?.status === 'closed';
  const showFeedbackEditor = willReopen && (!feedback || feedbackEditorOpen);
  const showFeedbackUpdateLink = Boolean(willReopen && feedback && !feedbackEditorOpen);

  return (
    <PortalPageStack className="space-y-3">
      <PortalWorkspaceHeader
        title={supportRequest?.title || t('portal.support_request_detail_title', {}, 'Ticket detail')}
        titleDisplay="sr-only"
        currentPage="support"
        breadcrumb={(
          <PortalBreadcrumb
            aria-label={t('portal.support_breadcrumb', {}, 'Ticket location')}
            items={[
              {
                label: t('portal.support_requests_title', {}, 'Tickets'),
                href: '/portal/support',
              },
              {
                label: supportRequest?.title || t('portal.support_request_detail_title', {}, 'Ticket detail'),
              },
            ]}
          />
        )}
      />

      {notice ? (
        <div role="status" className="rounded-[1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-[1rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {supportRequest ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          data-portal-support="ticket-meta"
        >
          <div className="flex flex-wrap items-center gap-2">
            <PortalStatusBadge
              status={statusTone(supportRequest.status)}
              force
              label={t(`portal.support_status_${supportRequest.status}`, {}, supportRequest.status)}
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {t(`portal.support_topic_${supportRequest.topic}`, {}, supportRequest.topic)}
            </span>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {supportRequest.updated_at ? formatDate(supportRequest.updated_at) : supportRequest.request_id}
          </span>
        </div>
      ) : null}

      <div className="space-y-3" data-portal-support="message-thread">
          {messages.map((message) => {
            if (message.author_kind === 'system') {
              return (
                <div
                  key={message.message_id}
                  className="flex justify-center px-2"
                  data-portal-support="system-line"
                >
                  <p className="max-w-[80%] text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {message.body}
                    {message.created_at ? ` · ${formatDate(message.created_at)}` : ''}
                  </p>
                </div>
              );
            }
            const isCustomer = message.author_kind !== 'operator';
            return (
              <div
                key={message.message_id}
                className={`group flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
                data-portal-support={isCustomer ? 'bubble-customer' : 'bubble-operator'}
              >
                <div className={`flex max-w-[78%] flex-col ${isCustomer ? 'items-end' : 'items-start'}`}>
                  {message.created_at ? (
                    <span
                      className="mb-0.5 px-1 text-[11px] leading-4 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 dark:text-slate-500"
                      data-portal-support="bubble-time"
                    >
                      {formatDate(message.created_at)}
                    </span>
                  ) : null}
                  <div
                    tabIndex={0}
                    className={`rounded-2xl px-3.5 py-2.5 shadow-sm outline-none ${
                      isCustomer
                        ? 'rounded-br-md bg-slate-900 text-white dark:bg-blue-500 dark:text-slate-950'
                        : 'rounded-bl-md border border-slate-200/90 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">
                      {message.body}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {attachments.length ? (
        <div
          className="flex flex-wrap gap-2"
          data-portal-support="attachment-chips"
        >
          {attachments.map((attachment) => (
            <button
              key={attachment.attachment_id}
              type="button"
              className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              onClick={() => void handleAttachmentDownload(attachment)}
              title={attachment.filename}
            >
              <PortalActionIcon id="attach" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{attachment.filename}</span>
              <span className="shrink-0 text-slate-400">
                {Math.ceil((attachment.byte_size || 0) / 1024)} KB
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {showFeedbackUpdateLink ? (
        <div className="flex justify-center" data-portal-support="close-evaluation-update">
          <button
            type="button"
            className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
            onClick={() => setFeedbackEditorOpen(true)}
          >
            {t('portal.support_feedback_update_action', {}, 'Update evaluation')}
          </button>
        </div>
      ) : null}

      {showFeedbackEditor ? (
        <div className="flex justify-center" data-portal-support="close-evaluation-wrap">
          <div
            className="w-full max-w-[30rem] rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
            data-portal-support="close-evaluation"
          >
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                {t('portal.support_feedback_title', {}, 'Close evaluation')}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {t('portal.support_feedback_desc', {}, 'Confirm whether the issue is resolved. If not, the ticket will reopen.')}
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t('portal.support_feedback_resolved_label', {}, 'Issue status')}
                </p>
                <div
                  className="flex w-full rounded-full border border-slate-200/90 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-900/60"
                  role="group"
                  aria-label={t('portal.support_feedback_resolved_label', {}, 'Issue status')}
                  data-portal-support="feedback-resolved-segment"
                >
                  <button
                    type="button"
                    className={`flex-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      feedbackResolved
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                    aria-pressed={feedbackResolved}
                    onClick={() => setFeedbackResolved(true)}
                  >
                    {t('portal.support_feedback_resolved_yes', {}, 'Resolved')}
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      !feedbackResolved
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                    aria-pressed={!feedbackResolved}
                    onClick={() => setFeedbackResolved(false)}
                  >
                    {t('portal.support_feedback_resolved_no', {}, 'Not resolved')}
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  {t('portal.support_feedback_rating_label', {}, 'Rating')}
                </p>
                <div
                  className="flex items-center gap-1"
                  role="group"
                  aria-label={t('portal.support_feedback_rating_label', {}, 'Rating')}
                  data-portal-support="feedback-rating-stars"
                >
                  {[1, 2, 3, 4, 5].map((rating) => {
                    const active = feedbackRating >= rating;
                    return (
                      <button
                        key={rating}
                        type="button"
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-lg transition ${
                          active
                            ? 'text-amber-500'
                            : 'text-slate-300 hover:text-amber-400 dark:text-slate-600 dark:hover:text-amber-400'
                        }`}
                        aria-label={`${rating}`}
                        aria-pressed={feedbackRating === rating}
                        onClick={() => setFeedbackRating(rating)}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="sr-only">{t('portal.support_feedback_comment_placeholder', {}, 'Optional note for support.')}</span>
                <textarea
                  className="input mt-0 min-h-[4.5rem]"
                  value={feedbackComment}
                  maxLength={2000}
                  rows={2}
                  onChange={(event) => setFeedbackComment(event.target.value)}
                  placeholder={t('portal.support_feedback_comment_placeholder', {}, 'Optional note for support.')}
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-1">
                {feedback ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={isSubmittingFeedback}
                    onClick={() => setFeedbackEditorOpen(false)}
                  >
                    {t('common.cancel', {}, 'Cancel')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSubmittingFeedback}
                  onClick={() => void handleFeedbackSubmit()}
                >
                  {isSubmittingFeedback
                    ? t('common.saving', {}, 'Saving...')
                    : t('portal.support_feedback_submit_action', {}, 'Submit evaluation')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="sticky bottom-0 z-10 pt-2"
        data-portal-support="composer"
      >
        {attachOpen ? (
          <div
            className="mb-2 rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/50"
            data-portal-support="composer-attach-panel"
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                className="input max-w-full flex-1 py-1.5 text-sm"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,application/json"
                onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isUploadingAttachment || !attachmentFile}
                onClick={() => void handleAttachmentUpload()}
              >
                {isUploadingAttachment
                  ? t('common.saving', {}, 'Saving...')
                  : t('portal.support_attachment_upload_action', {}, 'Upload attachment')}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              {t('portal.support_attachment_limit', {}, 'PDF, image, text, CSV, or JSON. Max 5 MB each.')}
            </p>
          </div>
        ) : null}
        <div
          className="rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/90"
          data-portal-support="composer-shell"
        >
          <div className="flex items-end gap-1.5" data-portal-support="reply-actions">
            <button
              type="button"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                attachOpen
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              data-portal-support="composer-attach"
              aria-expanded={attachOpen}
              aria-label={t('portal.support_attachment_add_optional', {}, 'Add attachment (optional)')}
              title={t('portal.support_attachment_add_optional', {}, 'Add attachment (optional)')}
              onClick={() => setAttachOpen((open) => !open)}
            >
              <PortalActionIcon id="attach" />
            </button>
            <div className="relative min-w-0 flex-1">
              <label className="block">
                <span className="sr-only">{t('portal.support_message_reply_label', {}, 'Reply')}</span>
                <textarea
                  ref={replyTextareaRef}
                  className="input max-h-36 min-h-10 w-full resize-none border-0 bg-transparent py-2.5 pl-3 pr-11 leading-5 shadow-none focus:ring-0"
                  value={reply}
                  maxLength={4000}
                  rows={1}
                  onChange={(event) => setReply(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && reply.trim() && !isSubmitting) {
                      event.preventDefault();
                      void handleReply();
                    }
                  }}
                  placeholder={t('portal.support_message_reply_placeholder', {}, 'Add more details for support.')}
                />
              </label>
              <button
                type="button"
                className="absolute bottom-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                data-portal-support="refresh-detail"
                aria-label={t('common.refresh', {}, 'Refresh')}
                title={t('common.refresh', {}, 'Refresh')}
                onClick={() => void loadDetail()}
              >
                <PortalActionIcon id="recheck" className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary shrink-0 rounded-full px-4"
              disabled={isSubmitting || !reply.trim()}
              onClick={() => void handleReply()}
            >
              {isSubmitting
                ? t('common.saving', {}, 'Saving...')
                : willReopen
                  ? t('portal.support_message_reopen_action', {}, 'Reopen and reply')
                  : t('portal.support_message_reply_action', {}, 'Send reply')}
            </button>
          </div>
          {willReopen ? (
            <p
              className="mt-1.5 pr-1 text-right text-xs leading-5 text-slate-500 dark:text-slate-400"
              data-portal-support="reply-reopen-notice"
              role="status"
            >
              {t(
                'portal.support_reply_reopens_notice',
                {},
                'Replying will reopen this ticket and return it to the support queue.'
              )}
            </p>
          ) : null}
        </div>
      </div>
    </PortalPageStack>
  );
}
