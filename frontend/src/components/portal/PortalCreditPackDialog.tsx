'use client';

import { PortalStatusBadge } from '@/components/portal/PortalStatusBadge';
import { Modal } from '@/components/ui/Modal';
import type { PortalCreditPackCatalogPayload } from '@/lib/portal-client';
import {
  DEFAULT_PORTAL_CURRENCY,
  formatPortalCurrency,
  normalizePortalCurrency,
} from '@/lib/currency';
import { formatNumber } from '@/lib/utils';

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

type PortalCreditPackDialogProps = {
  t: TranslateFn;
  isOpen: boolean;
  packs: PortalCreditPackCatalogPayload['items'];
  selectedPackId: string | null;
  pendingPackId: string | null;
  error: string | null;
  onClose: () => void;
  onSelect: (packId: string) => void;
  onConfirm: () => void;
};

function formatPoints(value: unknown): string {
  return formatNumber(Math.round(Number(value || 0)));
}

export function PortalCreditPackDialog({
  t,
  isOpen,
  packs,
  selectedPackId,
  pendingPackId,
  error,
  onClose,
  onSelect,
  onConfirm,
}: PortalCreditPackDialogProps) {
  const selectedPack = packs.find((pack) => pack.pack_id === selectedPackId) || null;
  const selectedAmount = selectedPack
    ? formatPortalCurrency(Number(selectedPack.amount || 0), {
        from: normalizePortalCurrency(selectedPack.currency),
        to: DEFAULT_PORTAL_CURRENCY,
      })
    : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('portal.usage.credit_packs_title', {}, 'Credit packs')}
      description={t(
        'portal.usage.credit_packs_desc',
        {},
        'Add points without changing your plan. Purchased credits are valid for one year after payment.'
      )}
      size="xl"
      className="portal-commercial-dialog max-w-4xl rounded-[18px] shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <PortalStatusBadge
            status="warning"
            label={t('portal.usage.credit_packs_period_badge', {}, 'One-year validity')}
          />
        </div>
        <div
          className="grid gap-3 md:grid-cols-3"
          role="radiogroup"
          aria-label={t('portal.usage.credit_packs_title', {}, 'Credit packs')}
        >
          {packs.map((pack) => (
            <button
              key={pack.pack_id}
              type="button"
              role="radio"
              aria-checked={selectedPackId === pack.pack_id}
              className={`rounded-[18px] border-2 bg-white p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3] focus-visible:ring-offset-2 dark:bg-slate-950 dark:focus-visible:ring-[#2997ff] dark:focus-visible:ring-offset-slate-950 ${
                selectedPackId === pack.pack_id
                  ? 'border-[#0071e3] dark:border-[#2997ff]'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
              disabled={pendingPackId !== null}
              onClick={() => onSelect(pack.pack_id)}
            >
              <p className="text-sm font-semibold text-slate-950 dark:text-white">
                {t(`portal.usage.credit_pack_${pack.pack_id}`, {}, pack.label)}
              </p>
              <p className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
                {formatPoints(pack.ai_credits)}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {formatPortalCurrency(Number(pack.amount || 0), {
                  from: normalizePortalCurrency(pack.currency),
                  to: DEFAULT_PORTAL_CURRENCY,
                })}
              </p>
              <p className="mt-4 text-sm font-semibold text-[#0066cc] dark:text-[#2997ff]">
                {selectedPackId === pack.pack_id
                  ? t('portal.usage.credit_pack_selected', {}, 'Selected')
                  : t('portal.usage.credit_pack_select_action', {}, 'Select pack')}
              </p>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-[18px] border border-slate-200 bg-[#f5f5f7] p-4 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-white">
              {selectedPack
                ? t(`portal.usage.credit_pack_${selectedPack.pack_id}`, {}, selectedPack.label)
                : t('portal.usage.credit_pack_select_hint', {}, 'Select a credit pack above to continue.')}
            </p>
            {selectedPack ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {t(
                  'portal.usage.credit_pack_selection_summary',
                  { points: formatPoints(selectedPack.ai_credits), amount: selectedAmount },
                  `${formatPoints(selectedPack.ai_credits)} points for ${selectedAmount}`
                )}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-primary shrink-0 whitespace-nowrap"
            disabled={!selectedPack || pendingPackId !== null}
            onClick={onConfirm}
          >
            {pendingPackId
              ? t('common.saving', {}, 'Saving...')
              : t('portal.usage.credit_pack_buy_action', {}, 'Buy credits')}
          </button>
        </div>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/25 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
