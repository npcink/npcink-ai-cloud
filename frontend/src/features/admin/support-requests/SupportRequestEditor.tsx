'use client';

import { useEffect, useRef } from 'react';
import { AdminWorkbenchDialog } from '@/components/admin/AdminWorkbenchDialog';
import { BackofficeDisclosure } from '@/components/backoffice/BackofficeScaffold';
import { useLocale } from '@/contexts/LocaleContext';
import { useSupportDetail } from './use-support-detail';
import { useSupportDraftNavigation } from './use-support-draft-navigation';
import type { SupportRequest } from './types';

export function SupportRequestEditor({ request, directoryBlocked, onClose, onSaved }: {
  request: SupportRequest; directoryBlocked: boolean; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLocale();
  const controller = useSupportDetail(request.request_id);
  const { draft, updateDraft, intent, busy, locked, storageBlocked } = controller;
  const { requestClose, confirmation } = useSupportDraftNavigation(controller.hasOrdinaryDraft, controller.discardOrdinaryDrafts, onClose);
  const completed = useRef(false);
  useEffect(() => {
    if (!controller.lastReceipt || completed.current) return;
    completed.current = true; onSaved();
  }, [controller.lastReceipt, onSaved]);
  const actionError = storageBlocked ? t('admin.support_recovery.storage_blocked')
    : controller.error === 'write' ? t('admin.support_recovery.not_saved') : '';
  return <>
    <AdminWorkbenchDialog open title={t('admin.support_requests_edit_title', { title: request.title }, 'Edit internal handling')}
      titleId="support-request-edit-title" saving={busy} error={actionError}
      closeLabel={t('common.close')} cancelLabel={t('common.cancel')} saveLabel={t('common.save')}
      savingLabel={t('common.saving')} footerNotice={t('admin.support_drafts.note_notice')}
      width="compact" density="compact" hideFooterActions
      onClose={requestClose} onSubmit={() => { if (!directoryBlocked) void controller.submit('status'); }}
      footerActions={<div className="flex shrink-0 gap-2">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={requestClose}>{t('common.cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={locked || directoryBlocked}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>}
    >
      <p className="break-all text-sm">{t('admin.support_recovery.ticket')}: {request.request_id}</p>
      {controller.readError ? <div role="alert"><p>{t('admin.support_recovery.read_failed')}</p>
        <button type="button" className="btn btn-secondary" disabled={busy || controller.loading} onClick={() => void controller.load()}>{t('common.retry')}</button></div> : null}
      {directoryBlocked ? <p role="alert">{t('admin.support_drafts.directory_blocked')}</p> : null}
      {intent ? <div role="status" data-ui="support-operation-recovery" className="space-y-2 text-sm">
        <p>{busy ? t('admin.support_recovery.sending') : t('admin.support_recovery.unknown')}</p>
        <button type="button" className="btn btn-secondary" disabled={busy || storageBlocked} onClick={() => void controller.confirm()}>{t('admin.support_recovery.confirm')}</button>
        <BackofficeDisclosure summary={t('admin.support_recovery.evidence')}>
          <div className="break-all"><p>{intent.actor_ref} · {intent.operation_id} · {intent.created_at}</p>
            <p className="whitespace-pre-wrap">{intent.values.status} · {intent.values.admin_note}</p></div>
        </BackofficeDisclosure>
      </div> : null}
      <label className="block text-sm text-slate-700 dark:text-slate-200">
        <span className="mb-1.5 block text-xs font-medium">{t('admin.support_requests_status_edit_label', { title: request.title })}</span>
        <select name="status" className="input w-full" value={draft.status} disabled={locked}
          onChange={event => updateDraft({ status: event.target.value, statusDirty: true })}>
          {['open', 'in_progress', 'resolved', 'closed'].map(status => <option key={status} value={status}>{t(`admin.support_status_${status}`)}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700 dark:text-slate-200">
        <span className="mb-1.5 block text-xs font-medium">{t('admin.support_drafts.new_note')}</span>
        <textarea name="admin_note" className="input min-h-32 w-full" value={draft.statusNote}
          disabled={locked} maxLength={2000} onChange={event => updateDraft({ statusNote: event.target.value })}
          placeholder={t('admin.support_drafts.new_note_placeholder')} />
      </label>
    </AdminWorkbenchDialog>
    {confirmation}
  </>;
}
