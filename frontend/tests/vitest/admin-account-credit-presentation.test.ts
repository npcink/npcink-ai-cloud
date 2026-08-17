import { describe, expect, it } from 'vitest';
import type { SiteRuntimeData } from '@/features/admin/accounts/account-site-runtime';
import {
  creditBreakdownLabel,
  formatSignedCreditDelta,
  formatUsageRatio,
  metricToBudgetSummary,
  quotaMetricLabel,
  quotaMetricToneClass,
  quotaToneClass,
  summarizeBudget,
} from '@/features/admin/accounts/account-credit-presentation';

const translate = (_key: string, _vars?: Record<string, string>, fallback?: string) =>
  fallback || '';

function siteRuntime(
  currentTotal: number,
  limit: number,
  overLimit = false
): SiteRuntimeData {
  return {
    budgetState: {
      runs: {
        current_total: currentTotal,
        limit,
        over_limit: overLimit,
      },
    },
  } as SiteRuntimeData;
}

describe('Account credit presentation model', () => {
  it('aggregates trusted site runtime budgets without inventing a finite limit', () => {
    expect(summarizeBudget({}, 'runs')).toEqual({
      used: 0,
      limit: 0,
      remaining: 0,
      usageRatio: 0,
      overLimit: false,
      unlimited: true,
    });
    expect(
      summarizeBudget(
        {
          site_a: siteRuntime(40, 100),
          site_b: siteRuntime(30, 0),
          site_c: siteRuntime(50, 100, true),
        },
        'runs'
      )
    ).toEqual({
      used: 120,
      limit: 200,
      remaining: 80,
      usageRatio: 0.6,
      overLimit: true,
      unlimited: false,
    });
  });

  it('keeps the accepted quota ratio and warning thresholds', () => {
    expect(formatUsageRatio({
      used: 0,
      limit: 0,
      remaining: 0,
      usageRatio: 0,
      overLimit: false,
      unlimited: true,
    }, 'No limit')).toBe('No limit');
    expect(formatUsageRatio({
      used: 9999,
      limit: 100,
      remaining: 0,
      usageRatio: 99.99,
      overLimit: true,
      unlimited: false,
    })).toBe('999%');
    expect(quotaToneClass({
      used: 80,
      limit: 100,
      remaining: 20,
      usageRatio: 0.8,
      overLimit: false,
      unlimited: false,
    })).toContain('amber');
    expect(quotaToneClass({
      used: 100,
      limit: 100,
      remaining: 0,
      usageRatio: 1,
      overLimit: false,
      unlimited: false,
    })).toContain('red');
  });

  it('normalizes server quota metrics and preserves explicit status severity', () => {
    const metric = {
      key: 'ai_credits',
      used: 90,
      limit: 100,
      remaining: 10,
      usage_ratio: 0.9,
      unlimited: false,
      status: 'near_limit',
      unit: 'credits',
    };
    expect(metricToBudgetSummary(metric)).toEqual({
      used: 90,
      limit: 100,
      remaining: 10,
      usageRatio: 0.9,
      overLimit: false,
      unlimited: false,
    });
    expect(quotaMetricToneClass(metric)).toContain('amber');
    expect(quotaMetricToneClass({ ...metric, status: 'limited' })).toContain('red');
  });

  it('owns localized metric labels and safe server-label fallbacks', () => {
    expect(quotaMetricLabel({
      key: 'active_api_key_sites',
      used: 1,
      limit: 2,
      remaining: 1,
      usage_ratio: 0.5,
      unlimited: false,
      status: 'ok',
      unit: 'sites',
    }, translate)).toBe('Active API keys');
    expect(creditBreakdownLabel({
      key: 'custom_component',
      label: 'Custom component',
      quantity: 1,
      unit: 'call',
      rate: 2,
      ai_credits: 2,
    }, translate)).toBe('Custom component');
  });

  it('formats signed ledger deltas after the accepted integer rounding', () => {
    expect(formatSignedCreditDelta(12.6)).toBe('+13');
    expect(formatSignedCreditDelta(-12.6)).toBe('-13');
    expect(formatSignedCreditDelta(0)).toBe('0');
  });
});
