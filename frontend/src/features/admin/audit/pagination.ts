import type { AdminAuditPagination } from './types';

export function resolveAuditPaginationRecovery(
  pagination: AdminAuditPagination | undefined,
  requestedOffset: number
): number | null {
  if (!pagination?.is_out_of_range || requestedOffset <= 0) return null;
  const lastOffset = Number(pagination.last_offset ?? 0);
  if (!Number.isInteger(lastOffset) || lastOffset < 0 || lastOffset >= requestedOffset) {
    return null;
  }
  return lastOffset;
}
