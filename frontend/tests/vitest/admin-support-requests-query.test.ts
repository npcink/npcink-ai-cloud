import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  buildSupportRequestsQuery,
  normalizeSupportRequestOffset,
  normalizeSupportRequestSort,
  requestRisk,
  supportRequestsDisplayScope,
} from '@/features/admin/support-requests/directory-model';
import {
  getLatestSupportRequestsDirectoryData,
  supportRequestKeys,
} from '@/features/admin/support-requests/queries';
import type { SupportRequest } from '@/features/admin/support-requests/types';

function supportRequest(
  overrides: Partial<SupportRequest> = {}
): SupportRequest {
  return {
    request_id: 'sr_default',
    account_id: 'acct_default',
    site_id: 'site_default',
    email: 'customer@example.com',
    topic: 'general',
    title: 'Default ticket',
    description: 'Default description',
    status: 'open',
    priority: 'normal',
    waiting_on: 'operator',
    waiting_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updated_at: '2026-07-29T08:00:00Z',
    ...overrides,
  };
}

describe('Support request directory model', () => {
  it('builds one bounded query from normalized URL filters', () => {
    const query = new URLSearchParams(
      buildSupportRequestsQuery(
        {
          q: '  customer@example.com  ',
          status: 'open',
          topic: 'billing',
          attention: 'waiting_for_operator',
        },
        'risk',
        20
      )
    );

    expect(Object.fromEntries(query)).toEqual({
      limit: '20',
      sort: 'risk',
      offset: '20',
      status: 'open',
      topic: 'billing',
      q: 'customer@example.com',
      attention: 'waiting_for_operator',
    });
  });

  it('normalizes offset and server sort without inventing values', () => {
    expect(normalizeSupportRequestOffset('-1')).toBe(0);
    expect(normalizeSupportRequestOffset('12.5')).toBe(0);
    expect(normalizeSupportRequestOffset('40')).toBe(40);
    expect(normalizeSupportRequestSort('unknown')).toBe('risk');
    expect(normalizeSupportRequestSort('updated_at')).toBe('updated_at');
  });

  it('classifies risk for the server-ordered queue presentation', () => {
    const critical = supportRequest({
      request_id: 'sr_critical',
      priority: 'critical',
    });

    expect(requestRisk(critical)).toBe('critical');
    expect(requestRisk(supportRequest({ status: 'in_progress' }))).toBe('warning');
    expect(requestRisk(supportRequest({
      status: 'in_progress',
      waiting_on: 'customer',
    }))).toBe('monitor');
    expect(requestRisk(supportRequest({
      status: 'resolved',
      priority: 'urgent',
      waiting_on: 'none',
      waiting_since: undefined,
    }))).toBe('stable');
  });

  it('marks placeholder and failed-filter fallbacks as read-only scopes', () => {
    expect(
      supportRequestsDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=previous',
        isPlaceholderData: true,
        hasError: false,
      })
    ).toEqual({ isRetainedScope: true, mode: 'pending-placeholder' });
    expect(
      supportRequestsDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=previous',
        isPlaceholderData: false,
        hasError: true,
      })
    ).toEqual({ isRetainedScope: true, mode: 'error-fallback' });
    expect(
      supportRequestsDisplayScope({
        currentRequestKey: 'q=current',
        displayedRequestKey: 'q=current',
        isPlaceholderData: false,
        hasError: false,
      })
    ).toEqual({ isRetainedScope: false, mode: 'current' });
  });
});

describe('Support request query policy', () => {
  it('uses a stable hierarchical directory key', () => {
    expect(supportRequestKeys.directory('limit=20&status=open')).toEqual([
      'admin',
      'support-requests',
      'directory',
      'limit=20&status=open',
    ]);
  });

  it('selects the latest successful cached directory for failed-filter recovery', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      supportRequestKeys.directory('request=older'),
      {
        items: [supportRequest({ request_id: 'sr_older' })],
        requestKey: 'request=older',
        loadedAt: 100,
      },
      { updatedAt: 100 }
    );
    queryClient.setQueryData(
      supportRequestKeys.directory('request=latest'),
      {
        items: [supportRequest({ request_id: 'sr_latest' })],
        requestKey: 'request=latest',
        loadedAt: 200,
      },
      { updatedAt: 200 }
    );

    expect(getLatestSupportRequestsDirectoryData(queryClient)?.requestKey).toBe(
      'request=latest'
    );
  });
});
