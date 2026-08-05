import { describe, expect, it } from 'vitest';
import {
  ADMIN_QUEUE_PATHNAMES,
  ADMIN_ACCOUNT_ID_MAX_LENGTH,
  ADMIN_RETURN_TO_MAX_LENGTH,
  buildAdminAccountDetailPathname,
  buildAdminAccountSiteReturnTo,
  buildAdminDetailHref,
  buildAdminNestedDetailHref,
  buildAdminQueueReturnTo,
  normalizeAdminAccountSiteReturnTo,
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
  const accountsPolicy = {
    allowedPathnames: [ADMIN_QUEUE_PATHNAMES.accounts],
    fallback: ADMIN_QUEUE_PATHNAMES.accounts,
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
    '/admin/subscriptions?return_to=%2Fadmin%2Fsubscriptions',
    '/admin/subscriptions?%72eturn_to=%2Fadmin%2Fsubscriptions',
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

  it.each([
    '',
    ' account',
    'account ',
    '.',
    '..',
    'acct/child',
    'acct\\child',
    'acct?query',
    'acct#fragment',
    'acct\nchild',
    'x'.repeat(ADMIN_ACCOUNT_ID_MAX_LENGTH + 1),
  ])('rejects an unsafe account detail segment: %s', (accountId) => {
    expect(() => buildAdminAccountDetailPathname(accountId)).toThrow(
      /safe path segment/
    );
  });

  it('builds one canonical encoded account detail path segment', () => {
    expect(buildAdminAccountDetailPathname('acct 你好')).toBe(
      '/admin/accounts/acct%20%E4%BD%A0%E5%A5%BD'
    );
  });

  it('builds one bounded parent Account context and preserves non-return query order', () => {
    const parentPathname = buildAdminAccountDetailPathname('acct_parent');
    const context = buildAdminAccountSiteReturnTo({
      parentPathname,
      searchParams: 'tab=sites&return_to=%2Fadmin%2Faccounts%3Fstatus%3Dactive%26tag%3Done%26tag%3Dtwo&view=compact',
      accountsPolicy,
    });
    expect(context).toBe(
      '/admin/accounts/acct_parent?tab=sites&view=compact&return_to=%2Fadmin%2Faccounts%3Fstatus%3Dactive%26tag%3Done%26tag%3Dtwo'
    );
    expect(
      buildAdminAccountSiteReturnTo({
        parentPathname,
        searchParams: new URL(context, 'https://example.test').searchParams,
        accountsPolicy,
      })
    ).toBe(context);
  });

  it('collapses missing or duplicate inner contexts to one Accounts fallback', () => {
    const parentPathname = buildAdminAccountDetailPathname('acct_parent');
    expect(buildAdminAccountSiteReturnTo({
      parentPathname,
      searchParams: '',
      accountsPolicy,
    })).toBe('/admin/accounts/acct_parent?return_to=%2Fadmin%2Faccounts');
    expect(buildAdminAccountSiteReturnTo({
      parentPathname,
      searchParams: 'return_to=%2Fadmin%2Faccounts%3Fq%3Done&return_to=%2Fadmin%2Faccounts%3Fq%3Dtwo',
      accountsPolicy,
    })).toBe('/admin/accounts/acct_parent?return_to=%2Fadmin%2Faccounts');
  });

  it.each([
    null,
    '',
    '/admin/accounts/acct_other',
    '/admin/accounts/acct_parent?return_to=https%3A%2F%2Fevil.example',
    '/admin/accounts/acct_parent?return_to=%2F%2Fevil.example',
    '/admin/accounts/acct_parent?return_to=%2Fadmin%2Faccounts%3Freturn_to%3D%252Fadmin%252Faccounts',
    '/admin/accounts/acct_parent?return_to=%2Fadmin%2Faccounts&return_to=%2Fadmin%2Faccounts',
    '/admin/accounts/acct_parent?return_to=%252Fadmin%252Faccounts',
    '/admin/accounts/acct_parent?return_to=%E0%A4%A',
    '/admin/accounts/acct_parent#fragment',
  ])('fails closed for invalid nested Account context: %s', (returnTo) => {
    const parentPathname = buildAdminAccountDetailPathname('acct_parent');
    expect(normalizeAdminAccountSiteReturnTo(returnTo, {
      parentPathname,
      fallback: ADMIN_QUEUE_PATHNAMES.accounts,
    })).toBe(ADMIN_QUEUE_PATHNAMES.accounts);
  });

  it('normalizes one exact parent and canonical Accounts queue inner context', () => {
    const parentPathname = buildAdminAccountDetailPathname('acct_parent');
    const value = '/admin/accounts/acct_parent?tab=sites&return_to=%2Fadmin%2Faccounts%3Fq%3Dzeta%26status%3Dsuspended';
    expect(normalizeAdminAccountSiteReturnTo(value, {
      parentPathname,
      fallback: ADMIN_QUEUE_PATHNAMES.accounts,
    })).toBe(value);
  });

  it('keeps nested Site href bounded and stable across repeated round trips', () => {
    const parentPathname = buildAdminAccountDetailPathname('acct_parent');
    const parentContext = buildAdminAccountSiteReturnTo({
      parentPathname,
      searchParams: `return_to=${encodeURIComponent(`/admin/accounts?q=${'x'.repeat(ADMIN_RETURN_TO_MAX_LENGTH)}`)}`,
      accountsPolicy,
    });
    const href = buildAdminNestedDetailHref({
      detailPathname: '/admin/sites/site_child',
      returnTo: parentContext,
      policy: {
        parentPathname,
        fallback: ADMIN_QUEUE_PATHNAMES.accounts,
      },
    });
    expect(href.length).toBeLessThanOrEqual(ADMIN_RETURN_TO_MAX_LENGTH);
    expect(href).toBe(
      '/admin/sites/site_child?return_to=%2Fadmin%2Faccounts%2Facct_parent%3Freturn_to%3D%252Fadmin%252Faccounts'
    );
  });

  it('rejects a nested detail href whose fallback transport cannot be bounded', () => {
    const parentPathname = buildAdminAccountDetailPathname('acct_parent');
    expect(() => buildAdminNestedDetailHref({
      detailPathname: `/admin/sites/${'x'.repeat(ADMIN_RETURN_TO_MAX_LENGTH)}`,
      returnTo: parentPathname,
      policy: {
        parentPathname,
        fallback: ADMIN_QUEUE_PATHNAMES.accounts,
      },
    })).toThrow(/exceeds the return context limit/);
  });
});
