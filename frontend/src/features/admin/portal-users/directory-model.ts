import type {
  PortalUserFilters,
  PortalUserItem,
  PortalUserRisk,
  PortalUserSort,
} from './types';

export const PORTAL_USER_PAGE_SIZE = 25;
const PORTAL_USER_SORTS = new Set<PortalUserSort>([
  'access_risk',
  'recent_login',
  'recent_registration',
]);

export function normalizePortalUserOffset(value: string | null): number {
  const parsed = Number(value || 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizePortalUserSort(value: string | null): PortalUserSort {
  return value && PORTAL_USER_SORTS.has(value as PortalUserSort)
    ? (value as PortalUserSort)
    : 'access_risk';
}

export function activePortalUserIds(users: PortalUserItem[]): Set<string> {
  return new Set(
    users
      .filter((user) => user.status !== 'disabled')
      .map((user) => user.principal_id)
  );
}

export function filterActivePortalUserSelection(
  selectedPrincipalIds: string[],
  users: PortalUserItem[]
): string[] {
  const activeIds = activePortalUserIds(users);
  return selectedPrincipalIds.filter((principalId) => activeIds.has(principalId));
}

export function portalUsersDisplayScope(input: {
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
  if (!isRetainedScope) {
    return { isRetainedScope: false, mode: 'current' };
  }
  if (input.hasError) {
    return { isRetainedScope: true, mode: 'error-fallback' };
  }
  if (input.isPlaceholderData) {
    return { isRetainedScope: true, mode: 'pending-placeholder' };
  }
  return { isRetainedScope: true, mode: 'stale' };
}

export function portalUserRisk(user: PortalUserItem): PortalUserRisk {
  if (user.status === 'disabled') return 'disabled';
  const membershipHealthy = !user.membership_status || user.membership_status === 'active';
  const accountHealthy = !user.account_id || user.account_status === 'active';
  const siteHealthy = !user.site_id || user.site_status === 'active';
  const subscriptionHealthy =
    !user.subscription_id || user.subscription_status === 'active';
  if (
    !membershipHealthy ||
    !accountHealthy ||
    !siteHealthy ||
    !subscriptionHealthy ||
    !user.account_id
  ) {
    return 'access_issue';
  }
  if (!user.last_login_at) return 'onboarding';
  return 'active';
}

function portalUserRiskRank(user: PortalUserItem): number {
  return { access_issue: 0, onboarding: 1, active: 2, disabled: 3 }[
    portalUserRisk(user)
  ];
}

export function sortPortalUsers(
  users: PortalUserItem[],
  sort: PortalUserSort
): PortalUserItem[] {
  return [...users].sort((left, right) => {
    const leftLogin = new Date(left.last_login_at || 0).getTime() || 0;
    const rightLogin = new Date(right.last_login_at || 0).getTime() || 0;
    const leftCreated = new Date(left.created_at || 0).getTime() || 0;
    const rightCreated = new Date(right.created_at || 0).getTime() || 0;
    if (sort === 'recent_login') return rightLogin - leftLogin;
    if (sort === 'recent_registration') return rightCreated - leftCreated;
    return portalUserRiskRank(left) - portalUserRiskRank(right) || leftCreated - rightCreated;
  });
}

export function buildPortalUsersQuery(
  filters: PortalUserFilters,
  offset: number
): string {
  const params = new URLSearchParams();
  params.set('source', 'portal_self_registration');
  params.set('limit', String(PORTAL_USER_PAGE_SIZE));
  if (offset > 0) params.set('offset', String(offset));
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.package_alias.trim()) {
    params.set('package_alias', filters.package_alias.trim());
  }
  if (filters.qq_bound) params.set('qq_bound', filters.qq_bound);
  return params.toString();
}
