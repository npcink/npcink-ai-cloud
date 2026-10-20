import { describe, expect, it } from 'vitest';

import {
  billingPackageNeedsAttention,
  findLimitedBillingResources,
  resolveBillingPackageStatusLabel,
  resolveBillingPressureCta,
  resolveBillingQuotaRowPresentation,
} from '@/lib/portal-billing-status';

const t = (key: string, _params?: Record<string, string>, fallback?: string) => fallback || key;

describe('Portal billing quiet status', () => {
  it('stays quiet when quota is healthy', () => {
    expect(
      billingPackageNeedsAttention({
        status: 'ok',
        ai_credits: { status: 'ok' },
        resource_limits: [{ key: 'active_sites', used: 1, limit: 3, status: 'ok' }],
      })
    ).toBe(false);
  });

  it('surfaces attention for limited quota and picks upgrade vs buy-credits CTAs', () => {
    const capacityLimited = {
      status: 'limited',
      ai_credits: { status: 'ok' },
      resource_limits: [
        { key: 'active_sites', used: 2, limit: 1, status: 'limited' },
        { key: 'vector_documents', used: 164, limit: 100, status: 'limited' },
      ],
    };
    expect(billingPackageNeedsAttention(capacityLimited)).toBe(true);
    expect(findLimitedBillingResources(capacityLimited).map((item) => item.key)).toEqual([
      'active_sites',
      'vector_documents',
    ]);
    expect(resolveBillingPackageStatusLabel(capacityLimited, t)).toBe(
      'Multiple capacities need attention'
    );
    expect(resolveBillingPressureCta({ quotaSummary: capacityLimited, t })).toEqual({
      href: '/portal/account#package-options',
      kind: 'upgrade',
      label: 'Upgrade package',
    });

    const creditLimited = {
      status: 'limited',
      ai_credits: { status: 'limited' },
      resource_limits: [],
    };
    expect(resolveBillingPressureCta({ quotaSummary: creditLimited, t })).toEqual({
      href: '/portal/account#package-options',
      kind: 'buy_credits',
      label: 'Buy credits',
    });
    expect(resolveBillingPackageStatusLabel(creditLimited, t)).toBe('AI credits unavailable');
  });

  it('does not treat load failure as a package-pressure alert surface', () => {
    expect(
      billingPackageNeedsAttention(
        { status: 'limited', ai_credits: { status: 'limited' } },
        'Failed to load'
      )
    ).toBe(false);
  });

  it('quiets limited entitlement rows when attention strip already covers the cause', () => {
    expect(
      resolveBillingQuotaRowPresentation({
        status: 'limited',
        attentionSurfaceActive: true,
      })
    ).toEqual({
      tone: 'error',
      displayTone: 'ok',
      suppressAlarmBadge: true,
      suppressOverflowDetail: true,
    });
  });

  it('keeps limited scream presentation when attention strip is inactive', () => {
    expect(
      resolveBillingQuotaRowPresentation({
        status: 'limited',
        attentionSurfaceActive: false,
      })
    ).toEqual({
      tone: 'error',
      displayTone: 'error',
      suppressAlarmBadge: false,
      suppressOverflowDetail: false,
    });
  });

  it('keeps near_limit watch tone even when attention strip is active', () => {
    expect(
      resolveBillingQuotaRowPresentation({
        status: 'near_limit',
        attentionSurfaceActive: true,
      })
    ).toEqual({
      tone: 'warning',
      displayTone: 'warning',
      suppressAlarmBadge: false,
      suppressOverflowDetail: false,
    });
  });
});
