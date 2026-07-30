import { describe, expect, it } from 'vitest';

import { formatDateOnly, formatDateTime } from '@/lib/utils';

describe('formatDateOnly', () => {
  const expiry = new Date(2027, 3, 7, 12, 0, 0);

  it('formats an expiry date with the explicit English locale', () => {
    expect(formatDateOnly(expiry, 'en')).toBe('Apr 7, 2027');
  });

  it('formats an expiry date with the explicit Simplified Chinese locale', () => {
    expect(formatDateOnly(expiry, 'zh-CN')).toBe('2027/4/7');
  });

  it('preserves the cutoff time with an explicit English locale', () => {
    expect(formatDateTime(expiry, 'en')).toMatch(/4\/7\/2027.*12:00/);
  });

  it('preserves the cutoff time with an explicit Simplified Chinese locale', () => {
    expect(formatDateTime(expiry, 'zh-CN')).toMatch(/2027\/4\/7.*12:00/);
  });

  it('returns an empty value for invalid expiry evidence', () => {
    expect(formatDateOnly('not-a-date', 'en')).toBe('');
    expect(formatDateTime('not-a-date', 'en')).toBe('');
  });
});
