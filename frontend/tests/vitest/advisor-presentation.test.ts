import { describe, expect, it } from 'vitest';
import { normalizeBranch } from '../../src/features/admin/ai-advisor/advisor-model';
import { advisorActionHref, advisorMetrics, advisorNumeric, advisorScope } from '../../src/features/admin/ai-advisor/advisor-presentation';

const branch = (scope: string, signals: Record<string, unknown>[]) => normalizeBranch({ scope, source_context: { advisor: { scope, signals } } });
describe('Advisor evidence semantics', () => {
  it('keeps missing, redacted, malformed values distinct from a returned zero', () => {
    for (const value of [undefined, null, '', '0', false, NaN, -1, Infinity]) expect(advisorNumeric(value)).toBeNull();
    expect(advisorNumeric(0)).toBe(0);
    expect(advisorMetrics(branch('operations_analysis', [{ code: 'ops.runtime_quality', failed_runs: 0 }]))[0].value).toBe(0);
    expect(advisorMetrics(branch('operations_analysis', []))[0].value).toBeNull();
  });
  it('uses runtime, commercial and routing signals instead of fabricated operations zeros', () => {
    expect(advisorMetrics(branch('runtime_operations', [{ code: 'runtime.queue_pressure', queued_runs: 4 }])).map(m => m.value)).toEqual([null, 4, null]);
    expect(advisorMetrics(branch('commercial_operations', [{ code: 'commercial.subscription_expiring_soon', within_7_days: 2 }]))[1].value).toBe(2);
    expect(advisorMetrics(branch('routing_operations', [{ code: 'routing.profile_candidates', recommended_profile_ids: ['a', 'b'] }]))[0].value).toBe(2);
    expect(advisorScope('unknown')).toBe('operations');
  });
  it('lands failures on diagnosis with the applied site, not the supplier editor', () => {
    const href = advisorActionHref('inspect_failed_runs_by_site_and_ability', 'a&b')!;
    const url = new URL(href, 'https://example.com');
    expect(url.pathname).toBe('/admin/troubleshooting');
    expect(url.searchParams.get('focus')).toBe('hosted_model.failed_runs');
    expect(url.searchParams.get('site')).toBe('a&b');
    expect(advisorActionHref('continue_runtime_monitoring', 'a')).toBeUndefined();
    expect(advisorActionHref('inspect_attention_subscriptions', 'a')).toBe('/admin/subscriptions');
  });
});
