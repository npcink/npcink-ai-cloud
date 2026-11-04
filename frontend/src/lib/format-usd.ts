/** Unknown amounts stay unknown; tiny positive costs must not look free. */
export function formatUsdAmount(value: number | null | undefined, missingLabel = '—'): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return missingLabel;
  if (value > 0 && value < 0.00000001) return '< $0.00000001';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', useGrouping: false,
    minimumFractionDigits: 2, maximumFractionDigits: 8,
  }).format(value);
}
