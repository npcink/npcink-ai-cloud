import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { shouldRetryAdminQuery } from '@/components/admin/AdminQueryProvider';
import {
  activePortalUserIds,
  buildPortalUsersQuery,
  filterActivePortalUserSelection,
  normalizePortalUserOffset,
  normalizePortalUserSort,
  portalUserRisk,
  portalUsersDisplayScope,
  sortPortalUsers,
} from '@/features/admin/portal-users/directory-model';
import {
  getLatestPortalUsersDirectoryData,
  portalUserKeys,
} from '@/features/admin/portal-users/queries';
import type { PortalUserItem } from '@/features/admin/portal-users/types';
import { ApiError } from '@/lib/errors';

function portalUser(overrides: Partial<PortalUserItem> = {}): PortalUserItem {
  return {
    principal_id: 'prn_default',
    email: 'user@example.com',
    status: 'active',
    session_version: 1,
    source: 'portal_self_registration',
    account_id: 'account_default',
    account_status: 'active',
    membership_status: 'active',
    site_id: 'site_default',
    site_name: 'Example',
    site_status: 'active',
    site_url: 'https://example.com',
    platform_kind: 'wordpress',
    subscription_id: 'subscription_default',
    subscription_status: 'active',
    qq_bound: false,
    qq_binding_count: 0,
    last_login_at: '2026-07-29T08:00:00Z',
    created_at: '2026-07-28T08:00:00Z',
    ...overrides,
  };
}

function apiError(statusCode: number): ApiError {
  return new ApiError({
    statusCode,
    errorCode: `http.${statusCode}`,
    message: `HTTP ${statusCode}`,
  });
}

describe('Portal user directory model', () => {
  it('builds the bounded self-registration query from normalized URL filters', () => {
    const query = new URLSearchParams(
      buildPortalUsersQuery(
        {
          q: '  user@example.com  ',
          status: 'active',
          package_alias: '  free  ',
          qq_bound: 'false',
        },
        25
      )
    );

    expect(Object.fromEntries(query)).toEqual({
      source: 'portal_self_registration',
      limit: '25',
      offset: '25',
      q: 'user@example.com',
      status: 'active',
      package_alias: 'free',
      qq_bound: 'false',
    });
  });

  it('normalizes invalid offset and sort URL state without inventing new values', () => {
    expect(normalizePortalUserOffset('-1')).toBe(0);
    expect(normalizePortalUserOffset('12.5')).toBe(0);
    expect(normalizePortalUserOffset('50')).toBe(50);
    expect(normalizePortalUserSort('unknown')).toBe('access_risk');
    expect(normalizePortalUserSort('recent_login')).toBe('recent_login');
  });

  it('classifies disabled, access issue, onboarding, and active identities', () => {
    expect(portalUserRisk(portalUser({ status: 'disabled' }))).toBe('disabled');
    expect(portalUserRisk(portalUser({ account_id: undefined }))).toBe('access_issue');
    expect(portalUserRisk(portalUser({ membership_status: 'revoked' }))).toBe('access_issue');
    expect(portalUserRisk(portalUser({ last_login_at: undefined }))).toBe('onboarding');
    expect(portalUserRisk(portalUser())).toBe('active');
  });

  it('sorts only the current page by risk or the selected timestamps', () => {
    const onboarding = portalUser({
      principal_id: 'prn_onboarding',
      last_login_at: undefined,
      created_at: '2026-07-29T08:00:00Z',
    });
    const accessIssue = portalUser({
      principal_id: 'prn_issue',
      account_status: 'disabled',
      created_at: '2026-07-27T08:00:00Z',
    });
    const active = portalUser({
      principal_id: 'prn_active',
      last_login_at: '2026-07-30T08:00:00Z',
      created_at: '2026-07-28T08:00:00Z',
    });

    expect(
      sortPortalUsers([active, onboarding, accessIssue], 'access_risk').map(
        (user) => user.principal_id
      )
    ).toEqual(['prn_issue', 'prn_onboarding', 'prn_active']);
    expect(
      sortPortalUsers([onboarding, accessIssue, active], 'recent_login').map(
        (user) => user.principal_id
      )[0]
    ).toBe('prn_active');
  });

  it('prunes disabled or absent identities from active selection and payload inputs', () => {
    const active = portalUser({ principal_id: 'prn_active' });
    const disabled = portalUser({
      principal_id: 'prn_disabled',
      status: 'disabled',
    });

    expect([...activePortalUserIds([active, disabled])]).toEqual(['prn_active']);
    expect(
      filterActivePortalUserSelection(
        ['prn_active', 'prn_disabled', 'prn_absent'],
        [active, disabled]
      )
    ).toEqual(['prn_active']);
  });

  it('marks placeholder, error fallback, and unexplained stale scopes read-only', () => {
    expect(
      portalUsersDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=previous',
        isPlaceholderData: true,
        hasError: false,
      })
    ).toEqual({ isRetainedScope: true, mode: 'pending-placeholder' });
    expect(
      portalUsersDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=previous',
        isPlaceholderData: false,
        hasError: true,
      })
    ).toEqual({ isRetainedScope: true, mode: 'error-fallback' });
    expect(
      portalUsersDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=previous',
        isPlaceholderData: false,
        hasError: false,
      })
    ).toEqual({ isRetainedScope: true, mode: 'stale' });
    expect(
      portalUsersDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=current',
        isPlaceholderData: false,
        hasError: false,
      })
    ).toEqual({ isRetainedScope: false, mode: 'current' });
  });
});

describe('Portal user query policy', () => {
  it('uses stable hierarchical keys that isolate one directory and one audit record', () => {
    expect(portalUserKeys.directory('source=portal_self_registration&limit=25')).toEqual([
      'admin',
      'portal-users',
      'directory',
      'source=portal_self_registration&limit=25',
    ]);
    expect(portalUserKeys.audit('prn_123')).toEqual([
      'admin',
      'portal-users',
      'audit',
      'prn_123',
    ]);
  });

  it('keeps the latest successful directory in query-owned cache for an honest failed-filter fallback', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      portalUserKeys.directory('request=older'),
      {
        items: [portalUser({ principal_id: 'prn_older' })],
        requestKey: 'request=older',
        loadedAt: 100,
      },
      { updatedAt: 100 }
    );
    queryClient.setQueryData(
      portalUserKeys.directory('request=latest'),
      {
        items: [portalUser({ principal_id: 'prn_latest' })],
        requestKey: 'request=latest',
        loadedAt: 200,
      },
      { updatedAt: 200 }
    );

    expect(getLatestPortalUsersDirectoryData(queryClient)?.requestKey).toBe(
      'request=latest'
    );
  });

  it('retries only bounded transient API failures', () => {
    expect(shouldRetryAdminQuery(0, apiError(500))).toBe(true);
    expect(shouldRetryAdminQuery(1, apiError(429))).toBe(true);
    expect(shouldRetryAdminQuery(2, apiError(500))).toBe(false);
    expect(shouldRetryAdminQuery(0, apiError(401))).toBe(false);
    expect(shouldRetryAdminQuery(0, apiError(422))).toBe(false);
    expect(shouldRetryAdminQuery(0, new Error('unknown'))).toBe(false);
  });
});
