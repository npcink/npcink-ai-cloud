import { describe, expect, it, vi } from 'vitest';
import {
  accountSiteRuntimeKeys,
  fetchAccountSiteRuntime,
  normalizeAccountSiteIds,
  normalizeSiteRuntimeData,
  type SiteRuntimeRequest,
} from '@/features/admin/accounts/account-site-runtime';

describe('account site runtime query identity', () => {
  it('normalizes duplicate, blank, and reordered site identifiers', () => {
    expect(
      normalizeAccountSiteIds([
        ' site_beta ',
        '',
        'site_alpha',
        'site_beta',
      ])
    ).toEqual(['site_alpha', 'site_beta']);
    expect(
      accountSiteRuntimeKeys.detail('acct_primary', [
        'site_beta',
        'site_alpha',
      ])
    ).toEqual(
      accountSiteRuntimeKeys.detail('acct_primary', [
        'site_alpha',
        'site_beta',
      ])
    );
    expect(
      accountSiteRuntimeKeys.detail('acct_other', ['site_alpha'])
    ).not.toEqual(
      accountSiteRuntimeKeys.detail('acct_primary', ['site_alpha'])
    );
  });
});

describe('account site runtime request lifecycle', () => {
  it('normalizes successful Cloud runtime evidence without changing its owner', () => {
    expect(
      normalizeSiteRuntimeData({
        runtime_summary: {
          total_runs: 12,
          failed_runs: 3,
          last_run_at: '2026-07-29T09:00:00Z',
        },
        usage_summary: {
          cost_estimate: 12.5,
          tokens_total: 2000,
        },
        commercial_policy: {
          usage_totals: {
            cost_cny: 15.5,
            tokens_total: 2500,
            provider_calls: 8,
          },
          budget_state: {
            cost: { current_total: 18.5 },
          },
          entitlement_snapshot: { site_limit: 3 },
        },
        site_keys: [{ status: 'active' }, { status: 'revoked' }],
        subscription: { status: 'active' },
        coverage: {
          coverage_state: 'covered',
          display_package_label: 'Pro',
        },
      })
    ).toMatchObject({
      totalRuns: 12,
      failedRuns: 3,
      costEstimate: 18.5,
      tokensTotal: 2000,
      providerCalls: 8,
      siteLimit: 3,
      activeKeyCount: 1,
      subscriptionStatus: 'active',
      coverageState: 'covered',
      packageLabel: 'Pro',
    });
  });

  it('keeps successful sites and identifies failed sites without fabricating zero-value health', async () => {
    const controller = new AbortController();
    const request: SiteRuntimeRequest = vi.fn(async (siteId, signal) => {
      expect(signal).toBe(controller.signal);
      if (siteId === 'site_failed') {
        throw new Error('site unavailable');
      }
      return {
        runtime_summary: { total_runs: 5, failed_runs: 1 },
      };
    });

    const result = await fetchAccountSiteRuntime(
      ['site_ready', 'site_failed'],
      controller.signal,
      request
    );

    expect(result.failedSiteIds).toEqual(['site_failed']);
    expect(result.items.site_ready).toMatchObject({
      totalRuns: 5,
      failedRuns: 1,
    });
    expect(result.items).not.toHaveProperty('site_failed');
  });

  it('rejects a completely unavailable scope so the page can show retry instead of Healthy', async () => {
    const controller = new AbortController();
    const request: SiteRuntimeRequest = vi.fn(async () => {
      throw new Error('runtime evidence unavailable');
    });

    await expect(
      fetchAccountSiteRuntime(
        ['site_alpha', 'site_beta'],
        controller.signal,
        request
      )
    ).rejects.toThrow('runtime evidence unavailable');
  });

  it('does not commit partial results after cancellation', async () => {
    const controller = new AbortController();
    const request: SiteRuntimeRequest = vi.fn(async (siteId) => {
      if (siteId === 'site_beta') {
        controller.abort(new Error('obsolete account scope'));
      }
      return { runtime_summary: { total_runs: 1, failed_runs: 0 } };
    });

    await expect(
      fetchAccountSiteRuntime(
        ['site_alpha', 'site_beta'],
        controller.signal,
        request
      )
    ).rejects.toThrow('obsolete account scope');
  });
});
