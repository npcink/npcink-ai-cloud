import { formatCurrency } from '@/lib/utils';

// ============================================
// Shared currency types and constants
// ============================================

export type SupportedCurrency = 'CNY' | 'USD' | 'HKD';

export const DEFAULT_CURRENCY: SupportedCurrency = 'CNY';
export const MULTI_CURRENCY_ENABLED = false;

// ============================================
// Core currency utilities
// ============================================

export function normalizeCurrency(value: unknown): SupportedCurrency {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'USD' || normalized === 'HKD' || normalized === 'CNY'
    ? normalized
    : DEFAULT_CURRENCY;
}

export function resolveDisplayCurrency(value: unknown): SupportedCurrency {
  return MULTI_CURRENCY_ENABLED
    ? normalizeCurrency(value)
    : DEFAULT_CURRENCY;
}

export function convertCurrencyAmount(
  value: number,
  {
    from,
    to,
  }: {
    from: SupportedCurrency;
    to: SupportedCurrency;
  }
): number {
  if (from === to) {
    return value;
  }
  throw new Error(
    `Client-side currency conversion is disabled (${from} -> ${to}); use a server-snapshotted accounting amount.`
  );
}

export function formatCurrencyValue(
  value: number,
  {
    from = 'USD',
    to = DEFAULT_CURRENCY,
    options = {},
  }: {
    from?: SupportedCurrency;
    to?: SupportedCurrency;
    options?: Intl.NumberFormatOptions;
  } = {}
): string {
  return formatCurrency(convertCurrencyAmount(value, { from, to }), to, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  });
}

// ============================================
// Admin-specific helpers (CNY-only shortcut)
// ============================================

export const ADMIN_CURRENCY = DEFAULT_CURRENCY;

export function formatAdminCurrency(value: number, options: Intl.NumberFormatOptions = {}): string {
  return formatCurrencyValue(value, { from: ADMIN_CURRENCY, to: ADMIN_CURRENCY, options });
}

// ============================================
// Portal-specific helpers (alias for backward compat)
// ============================================

export type PortalCurrency = SupportedCurrency;
export const DEFAULT_PORTAL_CURRENCY = DEFAULT_CURRENCY;
export const PORTAL_MULTI_CURRENCY_ENABLED = MULTI_CURRENCY_ENABLED;

export const normalizePortalCurrency = normalizeCurrency;
export const resolvePortalDisplayCurrency = resolveDisplayCurrency;
export const convertPortalCurrencyAmount = convertCurrencyAmount;
export const formatPortalCurrency = formatCurrencyValue;
