import type { AdminAuditPagination, AdminAuditQueryData } from './types';

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

/** Describe the loaded evidence, including retained pages while a new URL is pending. */
export function resolveAuditLoadedRange(data: AdminAuditQueryData | undefined) {
  const responseOffset = data?.pagination?.offset;
  const requestedOffset = Number(new URLSearchParams(data?.requestKey).get('offset'));
  const offset = typeof responseOffset === 'number' && Number.isInteger(responseOffset) && responseOffset >= 0
    ? responseOffset
    : Number.isInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const count = Array.isArray(data?.items) ? data.items.length : 0;
  return { offset, start: count ? offset + 1 : 0, end: count ? offset + count : 0 };
}
