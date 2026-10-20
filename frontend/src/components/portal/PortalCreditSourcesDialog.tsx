'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { PortalCreditSourcesContent } from '@/components/portal/PortalCreditSourcesContent';
import { useLocale } from '@/contexts/LocaleContext';
import {
  portalClient,
  type Entitlements,
  type PortalCreditLedgerPayload,
} from '@/lib/portal-client';
import { PORTAL_ACQUISITION_EVENT_TYPES } from '@/lib/portal-credit-sources';
import { formatPortalErrorMessage } from '@/lib/portal-error';

type QuotaSummary = NonNullable<Entitlements['quota_summary']>;

export type PortalCreditSourcesDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  quotaSummary?: QuotaSummary | null;
};

const PAGE_SIZE = 20;

function formatUpdatedAt(value: string, locale: string): string {
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : {
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
        month: locale === 'en' ? 'short' : 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

export function PortalCreditSourcesDialog({
  isOpen,
  onClose,
  quotaSummary,
}: PortalCreditSourcesDialogProps) {
  const { locale, t } = useLocale();
  const [creditLedger, setCreditLedger] = useState<PortalCreditLedgerPayload | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);

  const loadPage = useCallback(async (nextOffset: number) => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await portalClient.getAccountCreditLedger({
        limit: PAGE_SIZE,
        offset: nextOffset,
        eventTypes: Array.from(PORTAL_ACQUISITION_EVENT_TYPES),
      });
      if (requestVersion !== requestVersionRef.current) return;
      setCreditLedger(response.data);
      setOffset(nextOffset);
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;
      setError(formatPortalErrorMessage(err, t, t('error.failed_load')));
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen) return;
    setCreditLedger(null);
    setOffset(0);
    void loadPage(0);
    return () => {
      requestVersionRef.current += 1;
    };
  }, [isOpen, loadPage]);

  const packageRemaining = Number(quotaSummary?.ai_credits?.package_remaining ?? 0);
  const packageLimit = Number(
    quotaSummary?.ai_credits?.package_limit ?? quotaSummary?.ai_credits?.limit ?? 0,
  );
  const paidRemaining = Number(quotaSummary?.ai_credits?.paid_remaining ?? 0);
  const paidGrantCount = Number(quotaSummary?.ai_credits?.paid_grant_count ?? 0);
  const updatedAtLabel = creditLedger?.generated_at
    ? formatUpdatedAt(creditLedger.generated_at, locale)
    : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeLabel={t('common.close', {}, 'Close')}
      title={t('portal.usage.sources_title', {}, 'Credit sources')}
      description={t(
        'portal.usage.sources_desc',
        {},
        'See how package and paid credits were added this period.',
      )}
      size="lg"
      className="max-w-3xl rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
    >
      <div className="max-h-[min(70vh,36rem)] overflow-y-auto pr-1" data-portal-billing="credit-sources-dialog">
        <PortalCreditSourcesContent
          t={t}
          locale={locale}
          compact
          hideHeader
          packageRemaining={packageRemaining}
          packageLimit={packageLimit}
          paidRemaining={paidRemaining}
          paidGrantCount={paidGrantCount}
          creditLedger={creditLedger}
          creditLedgerLoading={loading}
          creditLedgerError={error}
          creditLedgerOffset={offset}
          creditLedgerPageSize={PAGE_SIZE}
          updatedAtLabel={updatedAtLabel}
          onRetry={() => void loadPage(offset)}
          onOffsetChange={(nextOffset) => void loadPage(nextOffset)}
        />
      </div>
    </Modal>
  );
}
