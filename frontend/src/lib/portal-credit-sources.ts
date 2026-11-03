import type { PortalCreditLedgerEntry } from '@/lib/portal-client';
import type { Locale } from '@/lib/i18n';
import { formatNumber } from '@/lib/utils';

export const PORTAL_ACQUISITION_EVENT_TYPES = new Set(['grant', 'adjustment', 'refund']);

const PORTAL_PAID_OR_OPERATOR_SOURCE_TYPES = new Set([
  'credit_pack_purchase',
  'credit_pack_refund',
  'operator_credit_adjustment',
  'subscription_topup',
]);

type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export function isPortalAcquisitionLedgerEntry(entry: PortalCreditLedgerEntry): boolean {
  const eventType = String(entry.event_type || '').trim().toLowerCase();
  if (PORTAL_ACQUISITION_EVENT_TYPES.has(eventType)) return true;
  if (eventType === 'consume') return false;
  const sourceType = String(entry.source_type || '').trim().toLowerCase();
  if (PORTAL_PAID_OR_OPERATOR_SOURCE_TYPES.has(sourceType)) return true;
  const category = String(entry.category || '').trim().toLowerCase();
  if (category && category !== 'ai_usage') return true;
  const delta = Number(entry.net_ai_credit_delta ?? entry.ai_credit_delta ?? 0);
  return delta > 0;
}

function parseUsageDate(value: string): Date | null {
  const normalizedValue = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPortalCreditEventTime(value: string, locale: Locale): string {
  const date = parseUsageDate(value);
  if (!date) return '-';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (sameDay) return locale === 'en' ? `Today ${time}` : `今天 ${time}`;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    month: locale === 'en' ? 'short' : 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPortalCreditPoints(t: TranslateFn, value: number): string {
  return t(
    'portal.usage.credit_points_value',
    { count: formatNumber(Math.abs(Math.round(value))) },
    '{{count}} AI credits',
  );
}

export function formatPortalSourceCreditAmount(t: TranslateFn, value: number): string {
  const rounded = Math.round(Number(value || 0));
  const points = formatPortalCreditPoints(t, rounded);
  if (rounded > 0) return `+${points}`;
  if (rounded < 0) return `-${points}`;
  return points;
}

export function portalCreditSourceEntryLabel(t: TranslateFn, entry: PortalCreditLedgerEntry): string {
  const sourceType = String(entry.source_type || '').trim().toLowerCase();
  const category = String(entry.category || '').trim().toLowerCase();
  if (sourceType === 'credit_pack_purchase' || category === 'credit_pack_purchase') {
    return t('portal.usage.source_label_credit_pack', {}, 'Credit pack');
  }
  if (sourceType === 'credit_pack_refund' || category === 'refund_adjustment') {
    return t('portal.usage.source_label_credit_pack_refund', {}, 'Credit pack refund');
  }
  if (sourceType === 'operator_credit_adjustment' || category === 'operator_adjustment') {
    return t('portal.usage.source_label_operator', {}, 'Manual adjustment');
  }
  if (sourceType === 'subscription_topup' || category === 'subscription_topup') {
    return t('portal.usage.source_label_topup', {}, 'Top-up pack');
  }
  if (category === 'monthly_plan_grant' || sourceType.includes('plan') || sourceType.includes('subscription')) {
    return t('portal.usage.source_label_package', {}, 'Package');
  }
  if (category === 'refund' || String(entry.event_type || '').toLowerCase() === 'refund') {
    return t('portal.usage.source_label_refund', {}, 'Refund');
  }
  const categoryLabel = String(entry.category_label || '').trim();
  if (categoryLabel) return categoryLabel;
  const explanation = String(entry.explanation || '').trim();
  if (explanation) return explanation;
  return sourceType || String(entry.event_type || '').trim() || t('common.not_available', {}, 'Not available');
}

export type PortalCreditSourceSummaryMetric = {
  label: string;
  value: string;
  detail: string;
  size?: 'compact';
};

export function buildPortalCreditSourceSummaryMetrics(args: {
  t: TranslateFn;
  packageRemaining: number;
  packageLimit: number;
  paidRemaining: number;
  paidGrantCount: number;
  grantedCredits: number;
  adjustmentCredits: number;
  refundCredits: number;
}): PortalCreditSourceSummaryMetric[] {
  const { t } = args;
  const formatQuota = (value: number) => formatNumber(Math.round(Number(value || 0)));
  return [
    {
      label: t('portal.usage.package_remaining_label', {}, 'Package remaining'),
      value: formatQuota(args.packageRemaining),
      detail: args.packageLimit > 0
        ? t(
          'portal.usage.sources_package_detail',
          { limit: formatQuota(args.packageLimit) },
          'Of {{limit}} package AI credits this period.',
        )
        : t('portal.usage.sources_package_detail_fallback', {}, 'Package AI credits still available this period.'),
    },
    {
      label: t('portal.usage.paid_remaining_label', {}, 'Paid credits'),
      value: formatQuota(args.paidRemaining),
      detail: args.paidGrantCount > 0
        ? t(
          'portal.usage.sources_paid_detail',
          { count: formatQuota(args.paidGrantCount) },
          '{{count}} paid grant(s) still available.',
        )
        : t('portal.usage.sources_paid_detail_empty', {}, 'No paid credit balance right now.'),
    },
    ...(args.grantedCredits > 0 ? [{
      label: t('portal.usage.sources_granted_label', {}, 'Granted this period'),
      value: formatQuota(args.grantedCredits),
      detail: t('portal.usage.sources_granted_detail', {}, 'Credits added by package grants or purchases.'),
      size: 'compact' as const,
    }] : []),
    ...(args.adjustmentCredits !== 0 ? [{
      label: t('portal.usage.sources_adjustment_label', {}, 'Adjustments'),
      value: formatPortalSourceCreditAmount(t, args.adjustmentCredits),
      detail: t('portal.usage.sources_adjustment_detail', {}, 'Manual credit adjustments this period.'),
      size: 'compact' as const,
    }] : []),
    ...(args.refundCredits > 0 ? [{
      label: t('portal.usage.sources_refund_label', {}, 'Refunds'),
      value: formatQuota(args.refundCredits),
      detail: t('portal.usage.sources_refund_detail', {}, 'Credits returned by refunds this period.'),
      size: 'compact' as const,
    }] : []),
  ];
}
