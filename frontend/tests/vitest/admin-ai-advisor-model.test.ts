import { describe, expect, it } from 'vitest';
import {
  normalizeBranch,
  normalizeHistoryItem,
  normalizePreview,
  normalizeValueMetrics,
} from '@/features/admin/ai-advisor/advisor-model';

describe('AI advisor response projection', () => {
  it('normalizes the diagnostic branches and preserves the fail-closed handoff contract', () => {
    const branch = normalizeBranch({
      generation: { mode: 'provider', request_cost: '0.25', cache_hit: 1 },
      headline: 'Provider reliability needs review',
      status: 'attention',
      severity: 'warning',
      agent_metadata_projection: {
        agent_id: 'operations-advisor',
        requires_operator_review: true,
        direct_wordpress_write: false,
        allowed_actions: ['summarize_evidence'],
        forbidden_actions: ['write_wordpress'],
        fail_closed_behavior: 'return_rule_baseline',
      },
      source_context: {
        advisor: {
          summary: 'Provider errors are elevated.',
          evidence: [{ kind: 'provider_call_records', ref: 42, label: 'Provider calls' }],
          recommended_actions: [{ action: 'inspect_provider_errors', requires_operator: true }],
          signals: [null, { code: 'ops.provider_quality', provider_errors: 3 }],
          drilldown: { provider_errors: [{ provider_id: 'openai', errors: 3 }] },
        },
      },
    });

    expect(branch.generation).toMatchObject({
      mode: 'provider',
      request_cost: 0.25,
      cache_hit: true,
    });
    expect(branch.agentMetadataProjection).toMatchObject({
      agentId: 'operations-advisor',
      requiresOperatorReview: true,
      directWordPressWrite: false,
      allowedActions: ['summarize_evidence'],
      forbiddenActions: ['write_wordpress'],
      failClosedBehavior: 'return_rule_baseline',
    });
    expect(branch.source_context.advisor.evidence).toEqual([
      { kind: 'provider_call_records', ref: '42', label: 'Provider calls' },
    ]);
    expect(branch.source_context.advisor.signals).toEqual([
      { code: 'ops.provider_quality', provider_errors: 3 },
    ]);
  });

  it('projects preview comparison and safety defaults without granting write authority', () => {
    const preview = normalizePreview({
      preview_version: 'v1',
      baseline: { generation: { mode: 'rule' } },
      ai: { generation: { mode: 'provider' } },
      comparison: {
        ai_used: true,
        ai_called: true,
        tokens_in: '120',
        request_cost: '0.031',
      },
      safety: { requires_operator_review: true },
    });

    expect(preview.comparison).toMatchObject({
      aiUsed: true,
      aiCalled: true,
      tokensIn: 120,
      requestCost: 0.031,
    });
    expect(preview.safety).toEqual({
      promptSaved: false,
      outputTextSaved: false,
      wordpressWriteAllowed: false,
      customerArticleGenerationAllowed: false,
      requiresOperatorReview: true,
    });
  });

  it('normalizes saved history and value evidence for stable rendering', () => {
    expect(normalizeHistoryItem({
      cache_key: 123,
      is_stale: 1,
      generation: { tokens_in: '8', cost: '0.02' },
      ai_disclosure: { generated_by_ai: true, review_status: 'needs_review' },
    })).toMatchObject({
      cacheKey: '123',
      isStale: true,
      generation: { tokensIn: 8, cost: 0.02 },
      aiDisclosure: { generatedByAi: true, reviewStatus: 'needs_review' },
    });

    const metrics = normalizeValueMetrics({
      value_metrics_version: 'v1',
      window: { days: '7' },
      totals: { analysis_requests: '9', request_cost: '0.5' },
      rates: { ai_usage_rate: '0.75' },
      breakdown: {
        by_generation_mode: { rule: 2, provider: 7 },
        by_provider: [{ provider_id: 'openai', requests: '7', ai_calls: '6', cost: '0.4' }],
      },
      recent_events: [{ created_at: '2026-08-15T00:00:00Z', cache_hit: true, tokens_out: '30' }],
    });
    expect(metrics).toMatchObject({
      valueMetricsVersion: 'v1',
      window: { days: 7 },
      totals: { analysisRequests: 9, requestCost: 0.5 },
      rates: { aiUsageRate: 0.75 },
      breakdown: {
        byGenerationMode: { rule: 2, provider: 7 },
        byProvider: [{ providerId: 'openai', requests: 7, aiCalls: 6, cost: 0.4 }],
      },
      recentEvents: [{ createdAt: '2026-08-15T00:00:00Z', cacheHit: true, tokensOut: 30 }],
    });
  });
});
