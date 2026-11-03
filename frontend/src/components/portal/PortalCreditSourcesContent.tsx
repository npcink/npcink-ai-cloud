'use client';

import { ListPagination } from '@/components/ui/ListPagination';
import { PortalErrorState } from '@/components/portal/PortalPageState';
import { PortalMetricStrip } from '@/components/portal/PortalScaffold';
import type { Locale } from '@/lib/i18n';
import type { PortalCreditLedgerEntry, PortalCreditLedgerPayload } from '@/lib/portal-client';
import {
  buildPortalCreditSourceSummaryMetrics,
  formatPortalCreditEventTime,
  formatPortalSourceCreditAmount,
  isPortalAcquisitionLedgerEntry,
  portalCreditSourceEntryLabel,
} from '@/lib/portal-credit-sources';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type PortalCreditSourcesContentProps = {
  t: TranslateFn;
  locale: Locale;
  packageRemaining: number;
  packageLimit: number;
  paidRemaining: number;
  paidGrantCount: number;
  creditLedger: PortalCreditLedgerPayload | null;
  creditLedgerLoading: boolean;
  creditLedgerError: string;
  creditLedgerOffset: number;
  creditLedgerPageSize: number;
  onRetry: () => void;
  onOffsetChange: (nextOffset: number) => void;
  /** Optional updated-at already formatted for the subtitle. */
  updatedAtLabel?: string;
  /** Compact dialog layout: slightly denser title. */
  compact?: boolean;
  /** When true, skip the in-body title (Modal already shows it). */
  hideHeader?: boolean;
};

export function PortalCreditSourcesContent({
  t,
  locale,
  packageRemaining,
  packageLimit,
  paidRemaining,
  paidGrantCount,
  creditLedger,
  creditLedgerLoading,
  creditLedgerError,
  creditLedgerOffset,
  creditLedgerPageSize,
  onRetry,
  onOffsetChange,
  updatedAtLabel,
  compact = false,
  hideHeader = false,
}: PortalCreditSourcesContentProps) {
  const ledgerSummary = creditLedger?.summary || null;
  const grantedCredits = Number(ledgerSummary?.granted_ai_credits ?? 0);
  const adjustmentCredits = Number(ledgerSummary?.adjustment_ai_credits ?? 0);
  const refundCredits = Number(ledgerSummary?.refund_ai_credits ?? 0);
  const sourceLedgerItems = (creditLedger?.items || []).filter(isPortalAcquisitionLedgerEntry);
  const sourceLedgerTotal = Number(
    Number.isFinite(Number(creditLedger?.pagination?.total))
      ? creditLedger?.pagination?.total
      : sourceLedgerItems.length,
  );

  const sourceSummaryMetrics = buildPortalCreditSourceSummaryMetrics({
    t,
    packageRemaining,
    packageLimit,
    paidRemaining,
    paidGrantCount,
    grantedCredits,
    adjustmentCredits,
    refundCredits,
  });

  return (
    <div className="space-y-5" data-portal-usage="credit-sources">
      {hideHeader ? (
        updatedAtLabel ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('portal.usage.updated_at_inline', { time: updatedAtLabel }, 'Updated {{time}}')}
          </p>
        ) : null
      ) : (
        <div>
          <h2 className={compact ? 'text-lg font-semibold text-gray-950 dark:text-white' : 'text-xl font-semibold text-gray-950 dark:text-white'}>
            {t('portal.usage.sources_title', {}, 'Credit sources')}
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
            {t(
              'portal.usage.sources_desc',
              {},
              'See how package and paid credits were added this period.',
            )}
            {updatedAtLabel
              ? ` · ${t('portal.usage.updated_at_inline', { time: updatedAtLabel }, 'Updated {{time}}')}`
              : ''}
          </p>
        </div>
      )}

      <div data-portal-usage="sources-summary">
        <PortalMetricStrip items={sourceSummaryMetrics} variant="header" />
      </div>

      {creditLedgerError ? (
        <PortalErrorState
          title={t('error.failed_load')}
          description={creditLedgerError}
          retryLabel={t('common.retry')}
          onRetry={onRetry}
        />
      ) : creditLedgerLoading && !creditLedger ? (
        <div className="space-y-2" aria-label={t('common.loading')}>
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
          ))}
        </div>
      ) : sourceLedgerItems.length > 0 ? (
        <>
          <div className="hidden overflow-x-auto lg:block" data-portal-usage="sources-table">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('portal.usage.sources_title', {}, 'Credit sources')}</caption>
              <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">
                    {t('portal.usage.sources_column_source', {}, 'Source')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    {t('portal.usage.sources_column_credits', {}, 'AI credits')}
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">
                    {t('portal.usage.credit_ledger_time', {}, 'Time')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sourceLedgerItems.map((entry: PortalCreditLedgerEntry) => {
                  const delta = Number(entry.net_ai_credit_delta ?? entry.ai_credit_delta ?? 0);
                  return (
                    <tr key={entry.ledger_entry_id || `${entry.source_type}-${entry.created_at}`}>
                      <th scope="row" className="px-3 py-4 font-medium text-slate-950 dark:text-white">
                        {portalCreditSourceEntryLabel(t, entry)}
                      </th>
                      <td className={`px-3 py-4 text-right font-semibold ${
                        delta > 0
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : delta < 0
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-slate-950 dark:text-white'
                      }`}>
                        {formatPortalSourceCreditAmount(t, delta)}
                      </td>
                      <td className="px-3 py-4 text-right text-slate-500 dark:text-slate-400">
                        {entry.created_at ? formatPortalCreditEventTime(entry.created_at, locale) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 lg:hidden">
            {sourceLedgerItems.map((entry) => {
              const delta = Number(entry.net_ai_credit_delta ?? entry.ai_credit_delta ?? 0);
              return (
                <div
                  key={entry.ledger_entry_id || `${entry.source_type}-${entry.created_at}`}
                  className="flex items-start justify-between gap-4 py-4"
                >
                  <span>
                    <strong className="text-slate-950 dark:text-white">{portalCreditSourceEntryLabel(t, entry)}</strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {entry.created_at ? formatPortalCreditEventTime(entry.created_at, locale) : '-'}
                    </span>
                  </span>
                  <strong className={
                    delta > 0
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : delta < 0
                        ? 'text-rose-700 dark:text-rose-300'
                        : ''
                  }>
                    {formatPortalSourceCreditAmount(t, delta)}
                  </strong>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="py-6 text-sm text-slate-500">
          {t('portal.usage.sources_empty', {}, 'No credit grants recorded this period.')}
        </p>
      )}

      {!creditLedgerError && creditLedger && sourceLedgerTotal > 0 ? (
        <ListPagination
          offset={creditLedgerOffset}
          limit={creditLedgerPageSize}
          total={sourceLedgerTotal}
          isLoading={creditLedgerLoading}
          onOffsetChange={onOffsetChange}
          className="px-0 pb-0"
        />
      ) : null}

      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
        {t(
          'portal.usage.sources_package_grant_note',
          {},
          'Package allowance may appear as remaining balance above when no separate grant row is recorded for the period start.',
        )}
      </p>
    </div>
  );
}
