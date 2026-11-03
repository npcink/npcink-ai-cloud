'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ui/Modal';
import { useLocale } from '@/contexts/LocaleContext';
import { useAdminNavigationGuard } from '@/hooks/useAdminNavigationGuard';

export function useSupportDraftNavigation(dirty: boolean, discard: () => void, onClose?: () => void) {
  const { t } = useLocale(), router = useRouter();
  const [pendingExit, setPendingExit] = useState('');
  const { cancelNavigation, confirmNavigation } = useAdminNavigationGuard(dirty, setPendingExit, href => router.push(href));
  const requestClose = () => { if (dirty) setPendingExit('__close'); else onClose?.(); };
  const confirmation = <ConfirmModal isOpen={Boolean(pendingExit)}
    title={t('admin.support_drafts.leave_title')}
    message={t('admin.support_drafts.leave_message')}
    confirmLabel={t('admin.support_drafts.discard')} cancelLabel={t('common.cancel')}
    variant="danger" onClose={() => { setPendingExit(''); cancelNavigation(); }}
    onConfirm={() => {
      const destination = pendingExit;
      discard(); setPendingExit('');
      if (destination === '__close') onClose?.();
      else confirmNavigation(destination);
    }} />;
  return { requestClose, confirmation };
}
