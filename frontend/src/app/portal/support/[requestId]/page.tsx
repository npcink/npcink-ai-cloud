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
import { ApiError } from '@/lib/errors';
import {
  formatPortalErrorMessage,
  formatPortalWriteErrorMessage,
} from '@/lib/portal-error';
import { formatDate } from '@/lib/utils';
import { classifyPortalWriteFailure } from '@/lib/portal-write-outcome';

function statusTone(status: string): 'active' | 'warning' | 'neutral' | 'danger' {
  if (status === 'open') return 'warning';
  if (status === 'resolved') return 'active';
  return 'neutral';
}

const SUPPORT_DRAFT_MAX_COUNT = 10;
const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const SUPPORT_ATTACHMENT_CONTENT_TYPES = new Set([
  'application/json',
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
]);

/** Local composer draft — File stays client-side until Send uploads + links it. */
type ComposerDraft = {
  localId: string;
  filename: string;
  byte_size: number;
  content_type: string;
  file?: File;
  /** Only set for server orphans (legacy pick-upload) or mid-send uploaded-but-unlinked. */
  attachment_id?: string;
};

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

function downloadLocalDraftFile(draft: ComposerDraft): void {
  if (!draft.file) return;
  const url = URL.createObjectURL(draft.file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = draft.filename || 'support-attachment';
  anchor.click();
  URL.revokeObjectURL(url);
}

function inferSupportAttachmentContentType(file: File): string {
  const typed = String(file.type || '').trim().toLowerCase();
  if (typed && SUPPORT_ATTACHMENT_CONTENT_TYPES.has(typed)) return typed;
  const name = String(file.name || '').trim().toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.csv')) return 'text/csv';
  if (name.endsWith('.json')) return 'application/json';
  return typed;
}

function isSupportAttachmentGoneError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.statusCode === 404) return true;
  return error.errorCode.includes('not_found');
}

function isUnconfirmedPortalWriteError(error: unknown): boolean {
  const disposition = classifyPortalWriteFailure(error);
  return disposition === 'outcome_unknown' || disposition === 'reconciliation_required';
}

export default function PortalSupportRequestDetailPage() {
  const params = useParams<{ requestId?: string }>();
  const requestId = String(params?.requestId || '');
  const { t } = useLocale();
  const { session, isLoading, isAuthenticated } = useSession();
  const contextSiteId = session?.selected_context?.site.site_id || '';
  const [supportRequest, setSupportRequest] = useState<PortalSupportRequest | null>(null);
  const [messages, setMessages] = useState<PortalSupportRequestMessage[]>([]);
  /** Composer chips — local File drafts until Send (optional attachment_id for orphans). */
  const [composerDrafts, setComposerDrafts] = useState<ComposerDraft[]>([]);
  const [draftLimitExceeded, setDraftLimitExceeded] = useState(false);
  /** Request attachments shown under chat bubbles by message_id. */
  const [attachments, setAttachments] = useState<PortalSupportRequestAttachment[]>([]);
  const [feedback, setFeedback] = useState<PortalSupportRequestFeedback | null>(null);
  const [reply, setReply] = useState('');
  const [feedbackResolved, setFeedbackResolved] = useState(true);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackEditorOpen, setFeedbackEditorOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const contextSiteIdRef = useRef(contextSiteId);
  const requestIdRef = useRef(requestId);
  const contextRequestVersionRef = useRef(0);
  const detailRequestVersionRef = useRef(0);
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const removingDraftIdsRef = useRef<Set<string>>(new Set());
  const composerDraftsRef = useRef<ComposerDraft[]>([]);

  useEffect(() => {
    composerDraftsRef.current = composerDrafts;
  }, [composerDrafts]);

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
    setComposerDrafts([]);
    setDraftLimitExceeded(false);
    setAttachments([]);
    setFeedback(null);
    setReply('');
    removingDraftIdsRef.current = new Set();
    setFeedbackResolved(true);
    setFeedbackRating(5);
    setFeedbackComment('');
    setIsDetailLoading(Boolean(isAuthenticated && requestId));
    setIsSubmitting(false);
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
    if (isSubmitting) return;
    const draftsSnapshot = [...composerDraftsRef.current];
    setIsSubmitting(true);
    setError('');
    setNotice('');
    try {
      const attachmentIds: string[] = [];
      const nextDrafts: ComposerDraft[] = [];
      for (const draft of draftsSnapshot) {
        if (draft.attachment_id) {
          attachmentIds.push(draft.attachment_id);
          nextDrafts.push(draft);
          continue;
        }
        if (!draft.file) {
          throw new Error('draft file missing');
        }
        const contentBase64 = await readFileAsBase64(draft.file);
        if (
          contextRequestVersion !== contextRequestVersionRef.current
          || requestContextSiteId !== contextSiteIdRef.current
          || capturedRequestId !== requestIdRef.current
        ) return;
        const uploadResponse = await portalClient.createSupportRequestAttachment(capturedRequestId, {
          filename: draft.filename,
          content_type: draft.content_type,
          content_base64: contentBase64,
        });
        if (
          contextRequestVersion !== contextRequestVersionRef.current
          || requestContextSiteId !== contextSiteIdRef.current
          || capturedRequestId !== requestIdRef.current
        ) return;
        const uploaded = uploadResponse.data.attachment;
        const linkedDraft: ComposerDraft = {
          ...draft,
          attachment_id: uploaded.attachment_id,
          filename: uploaded.filename || draft.filename,
          byte_size: uploaded.byte_size || draft.byte_size,
          content_type: uploaded.content_type || draft.content_type,
        };
        nextDrafts.push(linkedDraft);
        attachmentIds.push(uploaded.attachment_id);
        // Persist mid-send progress so a later message failure can retry without re-upload,
        // and × can DELETE the orphan.
        setComposerDrafts((current) => current.map((item) => (
          item.localId === draft.localId ? linkedDraft : item
        )));
      }

      const response = await portalClient.createSupportRequestMessage(capturedRequestId, {
        body,
        attachment_ids: attachmentIds,
      });
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      const linkedAttachments = response.data.attachments || nextDrafts
        .filter((item) => item.attachment_id)
        .map((item) => ({
          attachment_id: item.attachment_id as string,
          request_id: capturedRequestId,
          message_id: response.data.message.message_id,
          uploader_kind: 'customer',
          filename: item.filename,
          content_type: item.content_type,
          byte_size: item.byte_size,
        }));
      setSupportRequest(response.data.request);
      setMessages((current) => [...current, response.data.message]);
      setAttachments((current) => {
        const linkedIds = new Set(linkedAttachments.map((item) => item.attachment_id));
        const kept = current.filter((item) => !linkedIds.has(item.attachment_id));
        return [...kept, ...linkedAttachments];
      });
      setComposerDrafts([]);
      setDraftLimitExceeded(false);
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

  const handleAttachmentFilesSelected = (fileList: FileList | null) => {
    if (!fileList?.length || isSubmitting) return;
    const files = Array.from(fileList);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');
    setNotice('');
    setDraftLimitExceeded(false);
    // Reserve pending removals: a confirmed DELETE failure restores its chip.
    const availableSlots = Math.max(
      0,
      SUPPORT_DRAFT_MAX_COUNT - composerDraftsRef.current.length - removingDraftIdsRef.current.size
    );
    const accepted: ComposerDraft[] = [];
    for (const file of files) {
      const contentType = inferSupportAttachmentContentType(file);
      if (!SUPPORT_ATTACHMENT_CONTENT_TYPES.has(contentType)) {
        setError(t(
          'portal.support_attachment_type_invalid',
          {},
          'Use PDF, image, text, CSV, or JSON files only.'
        ));
        continue;
      }
      if (file.size <= 0 || file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
        setError(t(
          'portal.support_attachment_size_invalid',
          {},
          'Each attachment must be between 1 byte and 5 MB.'
        ));
        continue;
      }
      if (accepted.length >= availableSlots) {
        setDraftLimitExceeded(true);
        continue;
      }
      accepted.push({
        localId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        filename: file.name,
        byte_size: file.size,
        content_type: contentType,
      });
    }
    if (!accepted.length) return;
    const nextDrafts = [...composerDraftsRef.current, ...accepted];
    composerDraftsRef.current = nextDrafts;
    setComposerDrafts(nextDrafts);
  };

  const handleComposerDraftRemove = async (draft: ComposerDraft) => {
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    const contextRequestVersion = contextRequestVersionRef.current;
    if (removingDraftIdsRef.current.has(draft.localId)) return;
    removingDraftIdsRef.current.add(draft.localId);
    setDraftLimitExceeded(false);
    // Quiet local remove first — drafts never uploaded never touch the server.
    setComposerDrafts((current) => current.filter((item) => item.localId !== draft.localId));
    setError('');
    const attachmentId = draft.attachment_id;
    if (!attachmentId || !isAuthenticated || !capturedRequestId) {
      removingDraftIdsRef.current.delete(draft.localId);
      return;
    }
    try {
      const response = await portalClient.deleteSupportRequestAttachment(capturedRequestId, attachmentId);
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      setSupportRequest(response.data.request);
    } catch (err) {
      if (
        contextRequestVersion !== contextRequestVersionRef.current
        || requestContextSiteId !== contextSiteIdRef.current
        || capturedRequestId !== requestIdRef.current
      ) return;
      if (isSupportAttachmentGoneError(err)) {
        // Already gone — chip stays removed.
        return;
      }
      if (isUnconfirmedPortalWriteError(err)) {
        // Optimistic remove kept; avoid the scary outcome-unknown banner for draft cleanup.
        setNotice(t(
          'portal.support_attachment_remove_unconfirmed',
          {},
          'Could not confirm removal on the server. Refresh if the file still appears after you send.'
        ));
        return;
      }
      // Confirmed failure — restore chip so the user can retry.
      setComposerDrafts((current) => (
        current.some((item) => item.localId === draft.localId)
          ? current
          : [...current, draft]
      ));
      setError(formatPortalErrorMessage(err, t, t('error.failed_save', {}, 'Failed to save')));
    } finally {
      removingDraftIdsRef.current.delete(draft.localId);
    }
  };

  const handleDraftChipOpen = async (draft: ComposerDraft) => {
    if (draft.file) {
      downloadLocalDraftFile(draft);
      return;
    }
    const requestContextSiteId = contextSiteIdRef.current;
    const capturedRequestId = requestIdRef.current;
    const contextRequestVersion = contextRequestVersionRef.current;
    if (!isAuthenticated || !capturedRequestId || !draft.attachment_id) return;
    setError('');
    try {
      const response = await portalClient.getSupportRequestAttachment(
        capturedRequestId,
        draft.attachment_id
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
            const messageAttachments = attachments.filter(
              (item) => item.message_id && item.message_id === message.message_id
            );
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
                    {messageAttachments.length ? (
                      <ul
                        className="mt-2 space-y-1.5"
                        data-portal-support="bubble-attachments"
                      >
                        {messageAttachments.map((attachment) => (
                          <li key={attachment.attachment_id}>
                            <button
                              type="button"
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs font-medium transition ${
                                isCustomer
                                  ? 'bg-white/12 text-white hover:bg-white/18 dark:bg-slate-950/15 dark:text-slate-950 dark:hover:bg-slate-950/25'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
                              }`}
                              data-portal-support="bubble-attachment"
                              title={attachment.filename}
                              onClick={() => void handleAttachmentDownload(attachment)}
                            >
                              <PortalActionIcon id="attach" className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{attachment.filename}</span>
                              <span className={`shrink-0 tabular-nums ${isCustomer ? 'opacity-70' : 'text-slate-500 dark:text-slate-400'}`}>
                                {Math.ceil((attachment.byte_size || 0) / 1024)} KB
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

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
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          multiple
          tabIndex={-1}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv,application/json"
          onChange={(event) => void handleAttachmentFilesSelected(event.target.files)}
          data-portal-support="composer-attach-input"
        />
        {composerDrafts.length ? (
          <div
            className="mb-2 flex flex-wrap items-center gap-2"
            data-portal-support="attachment-chips"
          >
            {composerDrafts.map((draft) => (
              <span
                key={draft.localId}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200/90 bg-white/95 py-1 pl-3 pr-1 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-200"
                data-portal-support="attachment-chip"
                data-draft-local={!draft.attachment_id ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="inline-flex min-w-0 items-center gap-2 rounded-full py-0.5 text-left transition hover:text-slate-950 dark:hover:text-white"
                  onClick={() => void handleDraftChipOpen(draft)}
                  title={draft.filename}
                >
                  <PortalActionIcon id="attach" className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{draft.filename}</span>
                  <span className="shrink-0 text-slate-400">
                    {Math.ceil((draft.byte_size || 0) / 1024)} KB
                  </span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  aria-label={t('portal.support_attachment_remove', {}, 'Remove attachment')}
                  title={t('portal.support_attachment_remove', {}, 'Remove attachment')}
                  data-portal-support="attachment-remove"
                  disabled={isSubmitting}
                  onClick={() => void handleComposerDraftRemove(draft)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            ))}
            <span
              className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap text-xs text-slate-400"
              title={t('portal.support_attachment_limit', {}, 'PDF, image, text, CSV, or JSON. Max 5 MB each; up to 10 attachments per draft. The ticket total limit also applies.')}
              aria-label={t('portal.support_attachment_limit', {}, 'PDF, image, text, CSV, or JSON. Max 5 MB each; up to 10 attachments per draft. The ticket total limit also applies.')}
              data-portal-support="attachment-hint"
            >
              <span>{composerDrafts.length} / {SUPPORT_DRAFT_MAX_COUNT}</span>
              <span aria-hidden="true">ⓘ</span>
            </span>
          </div>
        ) : null}
        {draftLimitExceeded ? (
          <p role="status" className="mb-2 text-xs leading-5 text-slate-500 dark:text-slate-400" data-portal-support="draft-limit-notice">
            {t(
              'portal.support_attachment_draft_limit',
              {},
              'Up to 10 attachments per draft. Extra files were not added. The ticket total limit also applies.'
            )}
          </p>
        ) : null}
        <div
          className="rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-950/90"
          data-portal-support="composer-shell"
        >
          <div className="flex items-end gap-1.5" data-portal-support="reply-actions">
            <button
              type="button"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                composerDrafts.length
                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
              }`}
              data-portal-support="composer-attach"
              aria-label={t('portal.support_attachment_add_optional', {}, 'Add attachment (optional)')}
              title={t(
                'portal.support_attachment_limit',
                {},
                'PDF, image, text, CSV, or JSON. Max 5 MB each; up to 10 attachments per draft. The ticket total limit also applies.'
              )}
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
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
