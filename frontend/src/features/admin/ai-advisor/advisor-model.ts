export type ScalarValue = string | number | boolean | null;
export type DrilldownValue =
  | Array<Record<string, ScalarValue>>
  | Record<string, ScalarValue | Record<string, ScalarValue>>;

export type AgentHandoff = {
  agentId: string;
  agentVersion: string;
  agentRole: string;
  handoffType: string;
  handoffOwner: string;
  requiresOperatorReview: boolean;
  directWordPressWrite: boolean;
  executionPattern: string;
  storageMode: string;
  allowedActions: string[];
  stopConditions: string[];
  forbiddenActions: string[];
  failClosedBehavior: string;
};

export type SummaryBranch = {
  generation: {
    mode: string;
    provider_id: string;
    model_id: string;
    error_code: string;
    tokens_in?: number;
    tokens_out?: number;
    cost?: number;
    request_cost?: number;
    cache_status?: string;
    cache_hit?: boolean;
    cache_expires_at?: string;
    cache_key?: string;
  };
  scope: string;
  ai_disclosure: {
    version: string;
    content_origin: string;
    generated_by_ai: boolean;
    ai_assisted: boolean;
    visible_label_required: boolean;
    visible_label: string;
    brand_label: string;
    visible_notice: string;
    review_status: string;
    provider_brand_visible: boolean;
    machine_readable_required: boolean;
    copy_export_notice: string;
    source_generation_mode: string;
    generated_at: string;
    reviewed_by: string;
    reviewed_at: string;
    review_note: string;
  };
  headline: string;
  operator_summary: string;
  support_draft: string;
  operator_next_step: string;
  safety_note: string;
  severity: string;
  status: string;
  agentMetadataProjection: AgentHandoff;
  source_context: {
    advisor: {
      scope: string;
      status: string;
      severity: string;
      summary: string;
      confidence: string;
      agent_handoff: AgentHandoff;
      evidence: Array<{ kind: string; ref: string; label: string }>;
      recommendedActions: Array<{ action: string; requiresOperator: boolean }>;
      signals: Array<Record<string, ScalarValue>>;
      drilldown: Record<string, DrilldownValue>;
    };
  };
};

export type AdvisorPreviewData = {
  previewVersion: string;
  baseline: SummaryBranch;
  ai: SummaryBranch;
  comparison: {
    baselineMode: string;
    aiMode: string;
    requestedProviderId: string;
    modelId: string;
    aiUsed: boolean;
    aiCalled: boolean;
    cacheHit: boolean;
    cacheStatus: string;
    textChanged: boolean;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    requestCost: number;
    errorCode: string;
    valueCheck: string;
  };
  safety: {
    promptSaved: boolean;
    outputTextSaved: boolean;
    wordpressWriteAllowed: boolean;
    customerArticleGenerationAllowed: boolean;
    requiresOperatorReview: boolean;
  };
};

export type AdvisorHistoryItem = {
  cacheKey: string;
  siteId: string;
  scope: string;
  status: string;
  severity: string;
  headline: string;
  operatorSummary: string;
  operatorNextStep: string;
  draftKind: string;
  generatedAt: string;
  freshUntil: string;
  isStale: boolean;
  generation: {
    mode: string;
    providerId: string;
    modelId: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    requestCost: number;
    cacheStatus: string;
    cacheHit: boolean;
  };
  aiDisclosure: {
    contentOrigin: string;
    generatedByAi: boolean;
    visibleLabel: string;
    reviewStatus: string;
    reviewedBy: string;
    reviewedAt: string;
    sourceGenerationMode: string;
  };
};

export type AdvisorValueMetrics = {
  valueMetricsVersion: string;
  window: { days: number; startAt: string; endAt: string };
  totals: {
    analysisRequests: number;
    aiUsed: number;
    aiCalled: number;
    cacheHits: number;
    deterministicFallbacks: number;
    providerErrors: number;
    blocked: number;
    tokensIn: number;
    tokensOut: number;
    tokensTotal: number;
    cost: number;
    requestCost: number;
    estimatedCacheSavings: number;
  };
  rates: {
    aiUsageRate: number;
    aiCallRate: number;
    cacheHitRate: number;
    fallbackRate: number;
    reviewRate: number;
    confirmedRate: number;
    editedAfterAiRate: number;
    averageLiveRequestCost: number;
  };
  review: {
    cachedAiItems: number;
    needsReview: number;
    humanConfirmed: number;
    editedAfterAi: number;
    reviewed: number;
  };
  valueSignal: { status: string; headline: string; nextStep: string };
  breakdown: {
    byGenerationMode: Record<string, number>;
    byOutcome: Record<string, number>;
    byProvider: Array<{ providerId: string; requests: number; aiCalls: number; cost: number }>;
    byModel: Array<{ modelId: string; requests: number; aiCalls: number; cost: number }>;
  };
  recentEvents: Array<{
    createdAt: string;
    siteId: string;
    scope: string;
    outcome: string;
    generationMode: string;
    providerId: string;
    modelId: string;
    tokensIn: number;
    tokensOut: number;
    cost: number;
    cacheHit: boolean;
    errorCode: string;
  }>;
};

export function normalizeAgentHandoff(raw: any): AgentHandoff {
  return {
    agentId: String(raw?.agent_id ?? ''),
    agentVersion: String(raw?.agent_version ?? ''),
    agentRole: String(raw?.agent_role ?? ''),
    handoffType: String(raw?.handoff_type ?? ''),
    handoffOwner: String(raw?.handoff_owner ?? ''),
    requiresOperatorReview: Boolean(raw?.requires_operator_review),
    directWordPressWrite: Boolean(raw?.direct_wordpress_write),
    executionPattern: String(raw?.execution_pattern ?? ''),
    storageMode: String(raw?.storage_mode ?? ''),
    allowedActions: Array.isArray(raw?.allowed_actions) ? raw.allowed_actions.map(String) : [],
    stopConditions: Array.isArray(raw?.stop_conditions) ? raw.stop_conditions.map(String) : [],
    forbiddenActions: Array.isArray(raw?.forbidden_actions) ? raw.forbidden_actions.map(String) : [],
    failClosedBehavior: String(raw?.fail_closed_behavior ?? ''),
  };
}

export function normalizeBranch(raw: any): SummaryBranch {
  const generation = raw?.generation ?? {};
  const disclosure = raw?.ai_disclosure ?? {};
  const handoff = raw?.source_context?.advisor?.agent_handoff ?? {};
  const metadataProjection = raw?.agent_metadata_projection ?? raw?.agent_handoff ?? handoff;
  return {
    generation: {
      mode: String(generation.mode ?? ''),
      provider_id: String(generation.provider_id ?? ''),
      model_id: String(generation.model_id ?? ''),
      error_code: String(generation.error_code ?? ''),
      tokens_in: Number(generation.tokens_in ?? 0),
      tokens_out: Number(generation.tokens_out ?? 0),
      cost: Number(generation.cost ?? 0),
      request_cost: Number(generation.request_cost ?? generation.cost ?? 0),
      cache_status: String(generation.cache_status ?? ''),
      cache_hit: Boolean(generation.cache_hit),
      cache_expires_at: String(generation.cache_expires_at ?? ''),
      cache_key: String(generation.cache_key ?? ''),
    },
    scope: String(raw?.scope ?? ''),
    ai_disclosure: {
      version: String(disclosure.version ?? ''),
      content_origin: String(disclosure.content_origin ?? ''),
      generated_by_ai: Boolean(disclosure.generated_by_ai),
      ai_assisted: Boolean(disclosure.ai_assisted),
      visible_label_required: Boolean(disclosure.visible_label_required),
      visible_label: String(disclosure.visible_label ?? ''),
      brand_label: String(disclosure.brand_label ?? 'Npcink AI'),
      visible_notice: String(disclosure.visible_notice ?? ''),
      review_status: String(disclosure.review_status ?? ''),
      provider_brand_visible: Boolean(disclosure.provider_brand_visible),
      machine_readable_required: Boolean(disclosure.machine_readable_required),
      copy_export_notice: String(disclosure.copy_export_notice ?? ''),
      source_generation_mode: String(disclosure.source_generation_mode ?? ''),
      generated_at: String(disclosure.generated_at ?? ''),
      reviewed_by: String(disclosure.reviewed_by ?? ''),
      reviewed_at: String(disclosure.reviewed_at ?? ''),
      review_note: String(disclosure.review_note ?? ''),
    },
    headline: String(raw?.headline ?? ''),
    operator_summary: String(raw?.operator_summary ?? ''),
    support_draft: String(raw?.support_draft ?? ''),
    operator_next_step: String(raw?.operator_next_step ?? ''),
    safety_note: String(raw?.safety_note ?? ''),
    severity: String(raw?.severity ?? ''),
    status: String(raw?.status ?? ''),
    agentMetadataProjection: normalizeAgentHandoff(metadataProjection),
    source_context: {
      advisor: {
        scope: String(raw?.source_context?.advisor?.scope ?? ''),
        status: String(raw?.source_context?.advisor?.status ?? raw?.status ?? ''),
        severity: String(raw?.source_context?.advisor?.severity ?? raw?.severity ?? ''),
        summary: String(raw?.source_context?.advisor?.summary ?? ''),
        confidence: String(raw?.source_context?.advisor?.confidence ?? ''),
        agent_handoff: normalizeAgentHandoff(handoff),
        evidence: Array.isArray(raw?.source_context?.advisor?.evidence)
          ? raw.source_context.advisor.evidence.map((item: any) => ({
              kind: String(item?.kind ?? ''),
              ref: String(item?.ref ?? ''),
              label: String(item?.label ?? ''),
            }))
          : [],
        recommendedActions: Array.isArray(raw?.source_context?.advisor?.recommended_actions)
          ? raw.source_context.advisor.recommended_actions.map((item: any) => ({
              action: String(item?.action ?? ''),
              requiresOperator: Boolean(item?.requires_operator),
            }))
          : [],
        signals: Array.isArray(raw?.source_context?.advisor?.signals)
          ? raw.source_context.advisor.signals
              .filter((item: any) => item && typeof item === 'object')
              .map((item: any) => item as Record<string, ScalarValue>)
          : [],
        drilldown:
          raw?.source_context?.advisor?.drilldown &&
          typeof raw.source_context.advisor.drilldown === 'object'
            ? (raw.source_context.advisor.drilldown as Record<string, DrilldownValue>)
            : {},
      },
    },
  };
}

export function normalizePreview(raw: any): AdvisorPreviewData {
  const comparison = raw?.comparison ?? {};
  const safety = raw?.safety ?? {};
  return {
    previewVersion: String(raw?.preview_version ?? ''),
    baseline: normalizeBranch(raw?.baseline ?? {}),
    ai: normalizeBranch(raw?.ai ?? {}),
    comparison: {
      baselineMode: String(comparison.baseline_mode ?? ''),
      aiMode: String(comparison.ai_mode ?? ''),
      requestedProviderId: String(comparison.requested_provider_id ?? ''),
      modelId: String(comparison.model_id ?? ''),
      aiUsed: Boolean(comparison.ai_used),
      aiCalled: Boolean(comparison.ai_called),
      cacheHit: Boolean(comparison.cache_hit),
      cacheStatus: String(comparison.cache_status ?? ''),
      textChanged: Boolean(comparison.text_changed),
      tokensIn: Number(comparison.tokens_in ?? 0),
      tokensOut: Number(comparison.tokens_out ?? 0),
      cost: Number(comparison.cost ?? 0),
      requestCost: Number(comparison.request_cost ?? comparison.cost ?? 0),
      errorCode: String(comparison.error_code ?? ''),
      valueCheck: String(comparison.value_check ?? ''),
    },
    safety: {
      promptSaved: Boolean(safety.prompt_saved),
      outputTextSaved: Boolean(safety.output_text_saved),
      wordpressWriteAllowed: Boolean(safety.wordpress_write_allowed),
      customerArticleGenerationAllowed: Boolean(safety.customer_article_generation_allowed),
      requiresOperatorReview: Boolean(safety.requires_operator_review),
    },
  };
}

export function normalizeHistoryItem(raw: any): AdvisorHistoryItem {
  const generation = raw?.generation ?? {};
  const disclosure = raw?.ai_disclosure ?? {};
  return {
    cacheKey: String(raw?.cache_key ?? ''),
    siteId: String(raw?.site_id ?? ''),
    scope: String(raw?.scope ?? ''),
    status: String(raw?.status ?? ''),
    severity: String(raw?.severity ?? ''),
    headline: String(raw?.headline ?? ''),
    operatorSummary: String(raw?.operator_summary ?? ''),
    operatorNextStep: String(raw?.operator_next_step ?? ''),
    draftKind: String(raw?.draft_kind ?? ''),
    generatedAt: String(raw?.generated_at ?? ''),
    freshUntil: String(raw?.fresh_until ?? ''),
    isStale: Boolean(raw?.is_stale),
    generation: {
      mode: String(generation.mode ?? ''),
      providerId: String(generation.provider_id ?? ''),
      modelId: String(generation.model_id ?? ''),
      tokensIn: Number(generation.tokens_in ?? 0),
      tokensOut: Number(generation.tokens_out ?? 0),
      cost: Number(generation.cost ?? 0),
      requestCost: Number(generation.request_cost ?? 0),
      cacheStatus: String(generation.cache_status ?? ''),
      cacheHit: Boolean(generation.cache_hit),
    },
    aiDisclosure: {
      contentOrigin: String(disclosure.content_origin ?? ''),
      generatedByAi: Boolean(disclosure.generated_by_ai),
      visibleLabel: String(disclosure.visible_label ?? ''),
      reviewStatus: String(disclosure.review_status ?? ''),
      reviewedBy: String(disclosure.reviewed_by ?? ''),
      reviewedAt: String(disclosure.reviewed_at ?? ''),
      sourceGenerationMode: String(disclosure.source_generation_mode ?? ''),
    },
  };
}

export function normalizeValueMetrics(raw: any): AdvisorValueMetrics {
  const totals = raw?.totals ?? {};
  const rates = raw?.rates ?? {};
  const review = raw?.review ?? {};
  const valueSignal = raw?.value_signal ?? {};
  const breakdown = raw?.breakdown ?? {};
  const window = raw?.window ?? {};
  return {
    valueMetricsVersion: String(raw?.value_metrics_version ?? ''),
    window: {
      days: Number(window.days ?? 0),
      startAt: String(window.start_at ?? ''),
      endAt: String(window.end_at ?? ''),
    },
    totals: {
      analysisRequests: Number(totals.analysis_requests ?? 0),
      aiUsed: Number(totals.ai_used ?? 0),
      aiCalled: Number(totals.ai_called ?? 0),
      cacheHits: Number(totals.cache_hits ?? 0),
      deterministicFallbacks: Number(totals.deterministic_fallbacks ?? 0),
      providerErrors: Number(totals.provider_errors ?? 0),
      blocked: Number(totals.blocked ?? 0),
      tokensIn: Number(totals.tokens_in ?? 0),
      tokensOut: Number(totals.tokens_out ?? 0),
      tokensTotal: Number(totals.tokens_total ?? 0),
      cost: Number(totals.cost ?? 0),
      requestCost: Number(totals.request_cost ?? 0),
      estimatedCacheSavings: Number(totals.estimated_cache_savings ?? 0),
    },
    rates: {
      aiUsageRate: Number(rates.ai_usage_rate ?? 0),
      aiCallRate: Number(rates.ai_call_rate ?? 0),
      cacheHitRate: Number(rates.cache_hit_rate ?? 0),
      fallbackRate: Number(rates.fallback_rate ?? 0),
      reviewRate: Number(rates.review_rate ?? 0),
      confirmedRate: Number(rates.confirmed_rate ?? 0),
      editedAfterAiRate: Number(rates.edited_after_ai_rate ?? 0),
      averageLiveRequestCost: Number(rates.average_live_request_cost ?? 0),
    },
    review: {
      cachedAiItems: Number(review.cached_ai_items ?? 0),
      needsReview: Number(review.needs_review ?? 0),
      humanConfirmed: Number(review.human_confirmed ?? 0),
      editedAfterAi: Number(review.edited_after_ai ?? 0),
      reviewed: Number(review.reviewed ?? 0),
    },
    valueSignal: {
      status: String(valueSignal.status ?? ''),
      headline: String(valueSignal.headline ?? ''),
      nextStep: String(valueSignal.next_step ?? ''),
    },
    breakdown: {
      byGenerationMode: breakdown.by_generation_mode ?? {},
      byOutcome: breakdown.by_outcome ?? {},
      byProvider: Array.isArray(breakdown.by_provider)
        ? breakdown.by_provider.map((item: any) => ({
            providerId: String(item.provider_id ?? ''),
            requests: Number(item.requests ?? 0),
            aiCalls: Number(item.ai_calls ?? 0),
            cost: Number(item.cost ?? 0),
          }))
        : [],
      byModel: Array.isArray(breakdown.by_model)
        ? breakdown.by_model.map((item: any) => ({
            modelId: String(item.model_id ?? ''),
            requests: Number(item.requests ?? 0),
            aiCalls: Number(item.ai_calls ?? 0),
            cost: Number(item.cost ?? 0),
          }))
        : [],
    },
    recentEvents: Array.isArray(raw?.recent_events)
      ? raw.recent_events.map((item: any) => ({
          createdAt: String(item.created_at ?? ''),
          siteId: String(item.site_id ?? ''),
          scope: String(item.scope ?? ''),
          outcome: String(item.outcome ?? ''),
          generationMode: String(item.generation_mode ?? ''),
          providerId: String(item.provider_id ?? ''),
          modelId: String(item.model_id ?? ''),
          tokensIn: Number(item.tokens_in ?? 0),
          tokensOut: Number(item.tokens_out ?? 0),
          cost: Number(item.cost ?? 0),
          cacheHit: Boolean(item.cache_hit),
          errorCode: String(item.error_code ?? ''),
        }))
      : [],
  };
}
