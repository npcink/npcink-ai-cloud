import { describe, expect, it } from 'vitest';
import { resolveAuditPaginationRecovery } from '../../src/features/admin/audit/pagination';

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
