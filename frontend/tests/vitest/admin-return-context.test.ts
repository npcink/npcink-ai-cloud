import { describe, expect, it } from 'vitest';
import {
  ADMIN_QUEUE_PATHNAMES,
  ADMIN_RETURN_TO_MAX_LENGTH,
  buildAdminDetailHref,
  buildAdminQueueReturnTo,
  normalizeAdminReturnTo,
} from '@/lib/admin-return-context';

describe('AdminReturnContext', () => {
  const supportPolicy = {
    allowedPathnames: [ADMIN_QUEUE_PATHNAMES.supportRequests],
    fallback: ADMIN_QUEUE_PATHNAMES.supportRequests,
  } as const;
  const subscriptionsPolicy = {
    allowedPathnames: [ADMIN_QUEUE_PATHNAMES.subscriptions],
    fallback: ADMIN_QUEUE_PATHNAMES.subscriptions,
  } as const;

  it.each([
    '/admin/support-requests',
    '/admin/support-requests?status=open&sort=updated_at&offset=20&focus=sr_123',
    '/admin/support-requests?q=%E4%BB%98%E6%AC%BE+failed&attention=overdue',
  ])('preserves a valid Support queue pathname and query: %s', (returnTo) => {
    expect(
      normalizeAdminReturnTo(returnTo, supportPolicy)
    ).toBe(returnTo);
  });

  it.each([
    null,
    '',
    ' /admin/subscriptions',
    '/admin/subscriptions ',
    'https://example.com/admin/subscriptions',
    'http://example.com/admin/subscriptions',
    '//example.com/admin/subscriptions',
    '/\\example.com/admin/subscriptions',
    '\\example.com\\admin\\subscriptions',
    '%2F%2Fexample.com%2Fadmin%2Fsubscriptions',
    '%252F%252Fexample.com%252Fadmin%252Fsubscriptions',
    'https%3A%2F%2Fexample.com%2Fadmin%2Fsubscriptions',
    'https%253A%252F%252Fexample.com%252Fadmin%252Fsubscriptions',
    'javascript:alert(1)',
    '/admin/accounts?status=active',
    '/admin/support-requests?status=open',
    '/admin/subscriptions/sub_123',
    '/admin/subscriptions%2Fsub_123',
    '/admin/subscriptions%252Fsub_123',
    '/admin/subscriptions%5Csub_123',
    '/admin/subscriptions%255Csub_123',
    '/admin/subscriptions\n?status=active',
    '/admin/subscriptions?status=active%0ASet-Cookie%3Aunsafe',
    '/admin/subscriptions?status=active%250ASet-Cookie%253Aunsafe',
    '/admin/subscriptions?status=active%',
    '/admin/subscriptions?status=active%2',
    '/admin/subscriptions?status=active#focused',
  ])('fails closed for an invalid Subscriptions return_to: %s', (returnTo) => {
    expect(normalizeAdminReturnTo(returnTo, subscriptionsPolicy)).toBe(
      ADMIN_QUEUE_PATHNAMES.subscriptions
    );
  });

  it('accepts the maximum length and fails closed one character above it', () => {
    const prefix = '/admin/subscriptions?q=';
    const boundaryReturnTo = `${prefix}${'x'.repeat(ADMIN_RETURN_TO_MAX_LENGTH - prefix.length)}`;
    expect(normalizeAdminReturnTo(boundaryReturnTo, subscriptionsPolicy)).toBe(
      boundaryReturnTo
    );
    expect(
      normalizeAdminReturnTo(`${boundaryReturnTo}x`, subscriptionsPolicy)
    ).toBe(ADMIN_QUEUE_PATHNAMES.subscriptions);
  });

  it('builds queue context from current pathname/search, drops nested return_to, and preserves duplicate order', () => {
    expect(
      buildAdminQueueReturnTo({
        pathname: '/admin/subscriptions',
        searchParams: 'tag=first&return_to=%2Fadmin%2Fsubscriptions&tag=second&offset=20',
        policy: subscriptionsPolicy,
        focusId: 'sub stale/1',
      })
    ).toBe('/admin/subscriptions?tag=first&tag=second&offset=20&focus=sub+stale%2F1');
  });

  it('uses the shared return_to transport and revalidates the queue context', () => {
    expect(
      buildAdminDetailHref({
        detailPathname: '/admin/support-requests/sr_critical',
        returnTo: '/admin/accounts?focus=acct_1',
        policy: supportPolicy,
      })
    ).toBe(
      '/admin/support-requests/sr_critical?return_to=%2Fadmin%2Fsupport-requests'
    );
  });

  it('rejects a detail pathname that would normalize outside its declared path', () => {
    expect(() => buildAdminDetailHref({
      detailPathname: '/admin/../subscriptions',
      returnTo: '/admin/support-requests',
      policy: supportPolicy,
    })).toThrow(/must not require URL normalization/);
  });
});
