import { describe, expect, it } from 'vitest';
import { resolveAuditLoadedRange, resolveAuditPaginationRecovery } from '../../src/features/admin/audit/pagination';

describe('admin audit pagination recovery', () => {
  it('returns the server-owned last valid offset for an out-of-range page', () => {
    expect(resolveAuditPaginationRecovery({
      is_out_of_range: true,
      last_offset: 50,
    }, 75)).toBe(50);
  });

  it('does not redirect valid, first, or malformed pages', () => {
    expect(resolveAuditPaginationRecovery({ is_out_of_range: false, last_offset: 50 }, 75)).toBeNull();
    expect(resolveAuditPaginationRecovery({ is_out_of_range: true, last_offset: 0 }, 0)).toBeNull();
    expect(resolveAuditPaginationRecovery({ is_out_of_range: true, last_offset: 100 }, 75)).toBeNull();
  });
});

describe('loaded audit evidence ranges', () => {
  const data = (offset: string, count: number, responseOffset?: number) => ({
    requestKey: `limit=10&offset=${offset}&include_payload=false`, loadedAt: 1,
    items: Array.from({ length: count }, (_, event_id) => ({ event_id })),
    pagination: responseOffset === undefined ? {} : { offset: responseOffset },
  });

  it('prefers the successful server offset and counts actual returned rows', () => {
    expect(resolveAuditLoadedRange(data('80', 3, 37))).toEqual({ offset: 37, start: 38, end: 40 });
  });
  it('falls back to the loaded request identity rather than a newer URL', () => {
    expect(resolveAuditLoadedRange(data('10', 7))).toEqual({ offset: 10, start: 11, end: 17 });
  });
  it('reports no rows honestly without losing a deep recovery position', () => {
    expect(resolveAuditLoadedRange(data('80', 0))).toEqual({ offset: 80, start: 0, end: 0 });
    expect(resolveAuditLoadedRange(undefined)).toEqual({ offset: 0, start: 0, end: 0 });
  });
  it('rejects invalid offsets without losing the loaded evidence', () => {
    expect(resolveAuditLoadedRange(data('10', 1, -1))).toEqual({ offset: 10, start: 11, end: 11 });
    expect(resolveAuditLoadedRange(data('invalid', 1))).toEqual({ offset: 0, start: 1, end: 1 });
  });
  it('preserves non-page-aligned server recovery without calculating a replacement', () => {
    expect(resolveAuditPaginationRecovery({ is_out_of_range: true, last_offset: 37 }, 83)).toBe(37);
  });
});
