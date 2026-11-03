import { describe, expect, it } from 'vitest';
import { formatUsdAmount } from '@/lib/format-usd';

describe('USD evidence formatting', () => {
  it('distinguishes missing, zero and small positive amounts', () => {
    expect(formatUsdAmount(null)).toBe('—');
    expect(formatUsdAmount(Number.NaN)).toBe('—');
    expect(formatUsdAmount(-1)).toBe('—');
    expect(formatUsdAmount(0)).toBe('$0.00');
    expect(formatUsdAmount(0.000004)).toBe('$0.000004');
    expect(formatUsdAmount(0.000000001)).toBe('< $0.00000001');
  });
});
