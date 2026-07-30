import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  buildSupportRequestDetailHref,
  buildSupportRequestQueueReturnPath,
  buildSupportRequestsQuery,
  normalizeSupportRequestOffset,
  normalizeSupportRequestSort,
  requestRisk,
  sanitizeSupportRequestReturnPath,
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
  });

  it('preserves queue context in detail links and rejects external returns', () => {
    const returnPath = buildSupportRequestQueueReturnPath(
      '/admin/support-requests',
      'status=open&sort=updated_at&offset=20',
      'sr_critical'
    );
    expect(returnPath).toBe(
      '/admin/support-requests?status=open&sort=updated_at&offset=20&focus=sr_critical'
    );
    expect(buildSupportRequestDetailHref('sr_critical', returnPath)).toContain(
      'return_to=%2Fadmin%2Fsupport-requests%3Fstatus%3Dopen'
    );
    expect(sanitizeSupportRequestReturnPath(returnPath)).toBe(returnPath);
    expect(sanitizeSupportRequestReturnPath('https://example.com')).toBe(
      '/admin/support-requests'
    );
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
