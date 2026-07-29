import type {
  SupportRequest,
  SupportRequestFilters,
  SupportRequestRisk,
  SupportRequestSort,
} from './types';

export const SUPPORT_REQUEST_PAGE_SIZE = 20;
export const SUPPORT_REQUEST_STATUS_FILTERS = [
  '',
  'open',
  'in_progress',
  'resolved',
  'closed',
] as const;
export const SUPPORT_REQUEST_TOPICS = [
  '',
  'billing',
  'payment',
  'site',
  'usage',
  'account',
  'general',
] as const;

const SUPPORT_REQUEST_SORTS = new Set<SupportRequestSort>([
  'risk',
  'updated_at',
]);

export function normalizeSupportRequestOffset(value: string | null): number {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeSupportRequestSort(
  value: string | null
): SupportRequestSort {
  return value && SUPPORT_REQUEST_SORTS.has(value as SupportRequestSort)
    ? (value as SupportRequestSort)
    : 'risk';
}

export function buildSupportRequestsQuery(
  filters: SupportRequestFilters,
  offset: number
): string {
  const params = new URLSearchParams();
  params.set('limit', String(SUPPORT_REQUEST_PAGE_SIZE));
  if (offset > 0) params.set('offset', String(offset));
  if (filters.status) params.set('status', filters.status);
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.q.trim()) params.set('q', filters.q.trim());
  return params.toString();
}

export function supportRequestsDisplayScope(input: {
  currentRequestKey: string;
  displayedRequestKey?: string;
  isPlaceholderData: boolean;
  hasError: boolean;
}): {
  isRetainedScope: boolean;
  mode: 'current' | 'pending-placeholder' | 'error-fallback' | 'stale';
} {
  const isRetainedScope = Boolean(
    input.displayedRequestKey &&
      input.displayedRequestKey !== input.currentRequestKey
  );
  if (!isRetainedScope) return { isRetainedScope: false, mode: 'current' };
  if (input.hasError) {
    return { isRetainedScope: true, mode: 'error-fallback' };
  }
  if (input.isPlaceholderData) {
    return { isRetainedScope: true, mode: 'pending-placeholder' };
  }
  return { isRetainedScope: true, mode: 'stale' };
}

export function ageHours(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
}

export function requestRisk(item: SupportRequest): SupportRequestRisk {
  const age = ageHours(item.created_at);
  const priority = item.priority.toLowerCase();
  if (
    priority === 'critical' ||
    priority === 'urgent' ||
    (item.status === 'open' && age !== null && age >= 48)
  ) {
    return 'critical';
  }
  if (item.status === 'open' || priority === 'high') return 'warning';
  if (item.status === 'in_progress') return 'monitor';
  return 'stable';
}

function riskRank(item: SupportRequest): number {
  return { critical: 0, warning: 1, monitor: 2, stable: 3 }[
    requestRisk(item)
  ];
}

export function sortSupportRequests(
  items: SupportRequest[],
  sort: SupportRequestSort
): SupportRequest[] {
  return [...items].sort((left, right) => {
    const leftTime =
      new Date(left.updated_at || left.created_at || 0).getTime() || 0;
    const rightTime =
      new Date(right.updated_at || right.created_at || 0).getTime() || 0;
    if (sort === 'updated_at') return rightTime - leftTime;
    const rankDifference = riskRank(left) - riskRank(right);
    if (rankDifference) return rankDifference;
    if (left.status === 'open' || left.status === 'in_progress') {
      return leftTime - rightTime;
    }
    return rightTime - leftTime;
  });
}

export function riskToneClassName(risk: SupportRequestRisk): string {
  if (risk === 'critical') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/25 dark:text-rose-200';
  }
  if (risk === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200';
  }
  if (risk === 'monitor') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-200';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200';
}
