type PlanRecord = {
  plan_id: string;
  name: string;
  status: string;
  description: string;
  metadata?: Record<string, unknown>;
};

type PlanVersionRecord = {
  plan_id: string;
  plan_version_id: string;
  version_label: string;
  status: string;
  budgets: Record<string, unknown>;
  concurrency: Record<string, unknown>;
  policy: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

type TierSummary = {
  tier_id: string;
  label: string;
  package_alias: string;
  monthly_included_points: number;
  site_limit: number;
  max_vector_documents: number;
  max_media_images: number;
  budgets_template: Record<string, unknown>;
  concurrency_template: Record<string, unknown>;
  max_batch_items: number;
  package_operator_note: string;
  policy_baseline: Record<string, unknown>;
  canonical_shell: {
    entitlements: Record<string, unknown>;
    budgets: Record<string, unknown>;
    concurrency: Record<string, unknown>;
    policy: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  feature_groups: string[];
};

type PackageFitCue = {
  code: string;
  severity: string;
  title: string;
  detail: string;
};

export type PlanDetailPayload = {
  revision: string;
  plan: PlanRecord;
  latest_version?: PlanVersionRecord | null;
  sales_offer?: {
    offer_id: string;
    plan_id: string;
    plan_version_id: string;
    tier_id: string;
    account_id: string;
    purchase_mode: string;
    billing_cycle: string;
    amount: number;
    currency: string;
    status: string;
  } | null;
  tier_summary: TierSummary;
  package_fit_cues: PackageFitCue[];
};

export type PlanVersionFormState = {
  monthly_included_points: string;
  site_limit: string;
  max_vector_documents: string;
  max_media_images: string;
  max_cost_cny_per_period: string;
  sales_price_cny: string;
  max_active_runs: string;
  max_batch_items: string;
  grace_period_days: string;
};

function numberField(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? String(numeric) : '0';
}

export function buildInitialForm(detail: PlanDetailPayload | null): PlanVersionFormState {
  const latestVersion = detail?.latest_version || null;
  const tierSummary = detail?.tier_summary;
  const canonicalShell = tierSummary?.canonical_shell;
  const canonicalBudgets = canonicalShell?.budgets || {};
  const canonicalConcurrency = canonicalShell?.concurrency || {};
  const canonicalPolicy = canonicalShell?.policy || {};
  const canonicalMetadata = canonicalShell?.metadata || {};
  const budgets = latestVersion?.budgets || canonicalBudgets;
  const concurrency = latestVersion?.concurrency || canonicalConcurrency;
  const policy = latestVersion?.policy || canonicalPolicy;
  const metadata = latestVersion?.metadata || canonicalMetadata;
  const policySubscription = (policy.subscription || canonicalPolicy.subscription || {}) as Record<string, unknown>;

  return {
    monthly_included_points: numberField(
      budgets.max_ai_credits_per_period ??
        metadata.monthly_included_points ??
        tierSummary?.monthly_included_points
    ),
    site_limit: numberField(metadata.site_limit ?? tierSummary?.site_limit),
    max_vector_documents: numberField(metadata.max_vector_documents ?? tierSummary?.max_vector_documents),
    max_media_images: numberField(metadata.max_media_images ?? tierSummary?.max_media_images),
    max_cost_cny_per_period: numberField(budgets.max_cost_cny_per_period),
    sales_price_cny: numberField(detail?.sales_offer?.amount),
    max_active_runs: numberField(concurrency.max_active_runs),
    max_batch_items: numberField(metadata.max_batch_items ?? tierSummary?.max_batch_items),
    grace_period_days: numberField(policySubscription.grace_period_days),
  };
}

export function buildBaselineFieldPatch(tierSummary: TierSummary): Partial<PlanVersionFormState> {
  const budgets = tierSummary.canonical_shell?.budgets || {};
  const concurrency = tierSummary.canonical_shell?.concurrency || {};
  const policySubscription = (tierSummary.canonical_shell?.policy?.subscription || {}) as Record<string, unknown>;
  return {
    monthly_included_points: numberField(tierSummary.monthly_included_points),
    site_limit: numberField(tierSummary.site_limit),
    max_vector_documents: numberField(tierSummary.max_vector_documents),
    max_media_images: numberField(tierSummary.max_media_images),
    max_cost_cny_per_period: numberField(budgets.max_cost_cny_per_period),
    max_active_runs: numberField(concurrency.max_active_runs),
    max_batch_items: numberField(tierSummary.max_batch_items),
    grace_period_days: numberField(policySubscription.grace_period_days),
  };
}

export const parameterFields = ['monthly_included_points', 'site_limit', 'max_vector_documents', 'max_media_images', 'max_cost_cny_per_period', 'sales_price_cny', 'max_active_runs', 'max_batch_items', 'grace_period_days'] as const;
export type PlanParameters = Record<typeof parameterFields[number], number>;
export type PlanIntent = { operation_id: string; plan_id: string; plan_version_id: string; revision: string; values: PlanParameters; form: PlanVersionFormState };
export const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const validRevision = (value: unknown): value is string => typeof value === 'string' && /^plan-v1:[a-f0-9]{64}$/.test(value);
const budgetKeys = ['max_ai_credits_per_period', 'max_runs_per_period', 'max_tokens_per_period', 'max_cost_cny_per_period'] as const;
const metadataKeys = ['monthly_included_points', 'site_limit', 'max_vector_documents', 'max_media_images', 'max_batch_items'] as const;
function requireNumbers(value: unknown, keys: readonly string[], integer = false) {
  if (!record(value) || !keys.every(key => number(value[key]) && (!integer || Number.isInteger(value[key])))) throw new Error('Missing or invalid normalized plan value');
}
function requireTemplateBudgets(value: unknown) {
  requireNumbers(value, budgetKeys.filter(key => key !== 'max_tokens_per_period'));
  // _serialize_plan_tier_template sanitizes token-named keys; Version budgets
  // instead pass through _normalize_budgets and must contain real numbers.
  if (!record(value) || (!number(value.max_tokens_per_period) && value.max_tokens_per_period !== '[redacted]')) throw new Error('Invalid template token budget');
}
function requirePolicy(value: unknown) {
  if (!record(value)) throw new Error('Invalid plan policy');
  requireNumbers(value.subscription, ['grace_period_days'], true);
}
function requirePlan(value: unknown) {
  if (!record(value) || !text(value.plan_id) || !text(value.name) || !text(value.status)
    || typeof value.description !== 'string'
    || (value.metadata != null && !record(value.metadata))) throw new Error('Invalid plan');
}
function requireVersion(value: unknown, planId?: string) {
  if (!record(value) || !text(value.plan_version_id) || !text(value.version_label) || !text(value.status)
    || (planId && value.plan_id !== planId) || !record(value.metadata)) throw new Error('Invalid plan version');
  // These fields always exist after the real serializer normalizes a Version.
  requireNumbers(value.budgets, budgetKeys);
  requireNumbers(value.concurrency, ['max_active_runs'], true);
  requirePolicy(value.policy);
  // Historical/custom Version metadata may omit these keys or store null;
  // the form then uses the validated canonical summary instead.
  for (const key of metadataKeys) {
    if (value.metadata[key] != null && !number(value.metadata[key])) throw new Error('Invalid optional plan metadata');
  }
}
function requireSummary(value: unknown) {
  if (!record(value) || !text(value.tier_id) || !text(value.package_alias)
    || !record(value.canonical_shell) || !record(value.canonical_shell.entitlements)
    || !Array.isArray(value.feature_groups) || !value.feature_groups.every(text)) throw new Error('Invalid plan summary');
  requireNumbers(value, metadataKeys, true);
  requireTemplateBudgets(value.budgets_template);
  requireNumbers(value.concurrency_template, ['max_active_runs'], true);
  requireNumbers(value.policy_baseline, ['grace_period_days'], true);
  const shell = value.canonical_shell;
  requireTemplateBudgets(shell.budgets);
  requireNumbers(shell.concurrency, ['max_active_runs'], true);
  requirePolicy(shell.policy);
  requireNumbers(shell.metadata, metadataKeys, true);
  if (!record(shell.metadata) || shell.metadata.tier_id !== value.tier_id) throw new Error('Wrong canonical shell tier');
}
function requireOffer(value: unknown, planId: string, tierId: unknown) {
  if (!record(value) || value.plan_id !== planId || value.offer_id !== `${tierId}_monthly_v1`
    || value.tier_id !== tierId || value.account_id !== '' || value.purchase_mode !== 'self_serve'
    || !text(value.plan_version_id) || !text(value.billing_cycle)
    || !number(value.amount) || value.currency !== 'CNY' || !text(value.status)) throw new Error('Invalid canonical plan offer');
  // A canonical Offer can reference a historical published Version while the
  // current editor targets a draft. Its Version is intentionally not equated.
}
export function requirePlanDetail(value: unknown, planId: string): PlanDetailPayload {
  if (!record(value) || !validRevision(value.revision)) throw new Error('Invalid plan detail');
  requirePlan(value.plan);
  if ((value.plan as Record<string, unknown>).plan_id !== planId || !Object.hasOwn(value, 'latest_version') || !Object.hasOwn(value, 'sales_offer')) throw new Error('Wrong plan detail');
  if (value.latest_version !== null) requireVersion(value.latest_version, planId);
  requireSummary(value.tier_summary);
  if (value.sales_offer !== null) requireOffer(value.sales_offer, planId, (value.tier_summary as Record<string, unknown>).tier_id);
  if (!Array.isArray(value.package_fit_cues) || !value.package_fit_cues.every(cue => record(cue) && ['code', 'severity', 'title', 'detail'].every(key => typeof cue[key] === 'string'))) throw new Error('Invalid plan diagnostics');
  return value as PlanDetailPayload;
}
export function requirePlanCatalog(value: unknown): Record<string, unknown> {
  if (!record(value) || !Array.isArray(value.items) || !Array.isArray(value.tier_templates)) throw new Error('Invalid plan catalog');
  const ids = new Set<string>();
  for (const item of value.items) {
    if (!record(item)) throw new Error('Invalid plan catalog item');
    requirePlan(item.plan); requireSummary(item.tier_summary);
    const id = String((item.plan as Record<string, unknown>).plan_id);
    if (ids.has(id)) throw new Error('Duplicate plan');
    ids.add(id);
    if (!Object.hasOwn(item, 'latest_version')) throw new Error('Missing plan version');
    if (item.latest_version !== null) requireVersion(item.latest_version, id);
    if (!Number.isSafeInteger(item.published_version_count) || Number(item.published_version_count) < 0
      || !record(item.subscription_counts) || !['total', 'active'].every(key => Number.isSafeInteger((item.subscription_counts as Record<string, unknown>)[key]) && Number((item.subscription_counts as Record<string, unknown>)[key]) >= 0)
      || Number(item.subscription_counts.active) > Number(item.subscription_counts.total)) throw new Error('Invalid plan counts');
  }
  const tiers = new Set<string>();
  for (const shell of value.tier_templates) {
    requireSummary(shell);
    const id = String((shell as Record<string, unknown>).tier_id);
    if (tiers.has(id)) throw new Error('Duplicate tier');
    tiers.add(id);
  }
  return value;
}
export function formParameters(form: PlanVersionFormState): PlanParameters {
  return Object.fromEntries(parameterFields.map(key => [key, Number(form[key])])) as PlanParameters;
}
export function sameParameters(value: unknown, expected: PlanParameters): boolean {
  return record(value) && parameterFields.every(key => number(value[key]) && value[key] === expected[key]);
}
export function requirePlanWrite(value: unknown, intent: PlanIntent): void {
  requireVersion(value, intent.plan_id);
  if (!record(value) || value.plan_version_id !== intent.plan_version_id || !record(value.parameter_operation)
    || value.parameter_operation.source_revision !== intent.revision || value.parameter_operation.action !== 'parameters.update'
    || !sameParameters(value.parameter_operation.parameters, intent.values)) throw new Error('Invalid parameter write evidence');
  const budgets = value.budgets as Record<string, unknown>, metadata = value.metadata as Record<string, unknown>;
  const concurrency = value.concurrency as Record<string, unknown>, policy = value.policy as Record<string, unknown>;
  if (!record(policy.subscription) || !sameParameters({
    monthly_included_points: budgets.max_ai_credits_per_period, max_cost_cny_per_period: budgets.max_cost_cny_per_period,
    site_limit: metadata.site_limit, max_vector_documents: metadata.max_vector_documents, max_media_images: metadata.max_media_images,
    max_batch_items: metadata.max_batch_items, max_active_runs: concurrency.max_active_runs, grace_period_days: policy.subscription.grace_period_days,
    sales_price_cny: intent.values.sales_price_cny,
  }, intent.values)) throw new Error('Stale parameter write projection');
}
export type PlanConfirmation = { audit_event_id: number; revision: string; parameters: PlanParameters; plan_version_id: string };
export function readPlanConfirmation(value: unknown, intent: PlanIntent): PlanConfirmation | null {
  if (!record(value) || value.plan_id !== intent.plan_id || value.operation_id !== intent.operation_id
    || value.action !== 'parameters.update' || value.source_revision !== intent.revision) throw new Error('Wrong parameter operation');
  if (value.state === 'unconfirmed' && value.current === null && value.receipt === null) return null;
  const receipt = value.receipt, current = value.current;
  if (value.state !== 'confirmed' || !record(receipt) || !record(current) || !validRevision(current.revision) || !text(current.plan_version_id)
    || current.plan_version_id !== intent.plan_version_id || receipt.plan_version_id !== intent.plan_version_id
    || receipt.method !== 'PATCH' || receipt.path !== `/internal/service/admin/plans/${intent.plan_id}` || receipt.event_kind !== 'plan_version.publish'
    || !text(receipt.actor_kind) || !text(receipt.actor_ref)
    || !Number.isSafeInteger(receipt.audit_event_id) || Number(receipt.audit_event_id) <= 0
    || receipt.operation_id !== intent.operation_id || receipt.plan_id !== intent.plan_id || receipt.action !== 'parameters.update'
    || receipt.source_revision !== intent.revision || !sameParameters(receipt.parameters, intent.values) || !sameParameters(current.parameters, intent.values)) throw new Error('Invalid parameter operation evidence');
  return { ...current, audit_event_id: Number(receipt.audit_event_id) } as PlanConfirmation;
}
export function applyPlanParameters(detail: PlanDetailPayload, current: PlanConfirmation): PlanDetailPayload {
  if (!detail.latest_version) throw new Error('Missing current version');
  const p = current.parameters;
  return { ...detail, revision: current.revision,
    latest_version: { ...detail.latest_version, plan_version_id: current.plan_version_id,
      budgets: { ...detail.latest_version.budgets, max_ai_credits_per_period: p.monthly_included_points, max_cost_cny_per_period: p.max_cost_cny_per_period },
      metadata: { ...detail.latest_version.metadata, monthly_included_points: p.monthly_included_points, site_limit: p.site_limit, max_vector_documents: p.max_vector_documents, max_media_images: p.max_media_images, max_batch_items: p.max_batch_items },
      concurrency: { ...detail.latest_version.concurrency, max_active_runs: p.max_active_runs },
      policy: { ...detail.latest_version.policy, subscription: { ...(record(detail.latest_version.policy.subscription) ? detail.latest_version.policy.subscription : {}), grace_period_days: p.grace_period_days } },
    }, sales_offer: detail.sales_offer ? { ...detail.sales_offer, amount: p.sales_price_cny } : null,
  };
}
