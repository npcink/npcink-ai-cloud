import { describe, expect, it } from 'vitest';
import { getVectorFailureGuidance, getVectorGuidance } from '@/features/admin/observability/vector-guidance';

const snapshot = { site_id: 'site_local', vector_backend: 'postgres_json', embedding_provider: 'ollama-m4-embedding', captured_at: '2026-11-01T00:00:00Z' };
const evidence = {
  health: { status: 'warning' },
  totals: { search_queries_total: 106, search_failed_total: 0, index_failed_total: 0, p95_search_latency_ms: 5391, no_hit_rate: 0.12, last_search_finished_at: '2026-10-31T16:50:22Z' },
  index_snapshots: [snapshot],
};
const guide = (raw: unknown = evidence, environment = 'development', site = 'site_local') => getVectorGuidance(raw, environment, site);

describe('Admin vector handling guidance', () => {
  it('bounds local advice to explicit environment, site and latest retained snapshot', () => {
    expect(guide()).toMatchObject({ kind: 'slow_local', lastSearchAt: evidence.totals.last_search_finished_at });
    for (const environment of ['production', 'staging', 'test', '']) expect(guide(evidence, environment)?.kind).toBe('slow');
    for (const site of ['', 'other_site']) expect(guide(evidence, 'development', site)?.kind).toBe('slow');
    expect(guide({ ...evidence, index_snapshots: [snapshot, { ...snapshot, captured_at: '2026-11-02T00:00:00Z', vector_backend: 'zilliz_cloud' }] })?.kind).toBe('slow');
    expect(guide({ ...evidence, index_snapshots: [snapshot, { ...snapshot, captured_at: '' }] })?.kind).toBe('slow');
  });

  it('keeps failures ahead of slow-development advice including returned groups', () => {
    expect(guide({ ...evidence, totals: { ...evidence.totals, search_failed_total: 1 } })?.kind).toBe('failures');
    expect(guide({ ...evidence, failure_groups: [{ count: 1, error_code: 'unknown' }] })?.kind).toBe('failures');
    expect(guide({ ...evidence, totals: { index_failed_total: 1 } })?.kind).toBe('failures');
  });

  it.each([undefined, null, '', '0', -1, NaN, Infinity, 0.5])('does not convert invalid failure evidence %s into no failures', value => {
    expect(guide({ ...evidence, totals: { ...evidence.totals, search_failed_total: value } })?.kind).toBe('unknown');
  });

  it('explains no-hit independently of a connection failure and keeps unknown health uncertain', () => {
    expect(guide({ ...evidence, totals: { ...evidence.totals, p95_search_latency_ms: 100, no_hit_rate: 0.4 } })?.kind).toBe('no_hit');
    expect(guide({ ...evidence, totals: { ...evidence.totals, p95_search_latency_ms: null } })?.kind).toBe('unknown');
    expect(guide({ ...evidence, totals: { ...evidence.totals, last_search_finished_at: 'invalid' } })?.lastSearchAt).toBeNull();
    expect(guide({ ...evidence, health: { status: 'inactive' }, totals: { search_queries_total: 0, search_failed_total: 0, index_failed_total: 0 } })).toBeNull();
  });

  it('gives bounded code-specific actions without assigning unsupported causes', () => {
    expect(getVectorFailureGuidance('site_knowledge.embedding_dimension_mismatch')).toMatchObject({ settings: true });
    expect(getVectorFailureGuidance('site_knowledge.zilliz_config_missing')).toMatchObject({ settings: true });
    expect(getVectorFailureGuidance('vector_search_timeout').meaning[0]).toContain('无法区分');
    expect(getVectorFailureGuidance('future_code').meaning[0]).toContain('不足以确认根因');
    expect(getVectorFailureGuidance('').settings).toBeUndefined();
  });
});
