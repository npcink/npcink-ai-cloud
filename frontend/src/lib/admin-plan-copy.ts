type TranslateFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export function localizeTierLabel(t: TranslateFn, tierId: string, fallback?: string): string {
  switch (tierId) {
    case 'starter':
      return t('admin.plan_tier_starter', {}, fallback || 'Starter');
    case 'pro':
      return t('admin.plan_tier_pro', {}, fallback || 'Pro');
    case 'agency':
      return t('admin.plan_tier_agency', {}, fallback || 'Agency');
    case 'enterprise':
      return t('admin.plan_tier_enterprise', {}, fallback || 'Enterprise');
    default:
      return fallback || tierId;
  }
}

export function localizePackageAlias(t: TranslateFn, tierId: string, fallback?: string): string {
  switch (tierId) {
    case 'plan_free':
    case 'starter':
      return t('admin.plan_package_alias_starter', {}, fallback || 'Starter');
    case 'pro':
      return t('admin.plan_package_alias_pro', {}, fallback || 'Pro');
    case 'agency':
      return t('admin.plan_package_alias_agency', {}, fallback || 'Agency');
    case 'enterprise':
      return t('admin.plan_package_alias_enterprise', {}, fallback || 'Enterprise');
    default:
      return fallback || tierId;
  }
}

export function localizeUsageBand(t: TranslateFn, tierId: string, fallback?: string): string {
  switch (tierId) {
    case 'starter':
      return t('admin.plan_usage_band_starter', {}, fallback || 'Single-site trial with light GEO and product task usage.');
    case 'pro':
      return t('admin.plan_usage_band_pro', {}, fallback || 'Daily content, GEO, and WooCommerce product operations on one site.');
    case 'agency':
      return t('admin.plan_usage_band_agency', {}, fallback || 'Multi-site, bulk product, multi-language, and team-collaboration usage.');
    case 'enterprise':
      return t('admin.plan_usage_band_enterprise', {}, fallback || 'Custom-scale usage with BYOM, private models, audit, and SLA compliance.');
    default:
      return fallback || '';
  }
}

export function localizePositioning(t: TranslateFn, tierId: string, fallback?: string): string {
  switch (tierId) {
    case 'starter':
      return t('admin.plan_positioning_starter', {}, fallback || 'Baseline package for single-site trial, conservative hosted runs, and operator-managed growth.');
    case 'pro':
      return t('admin.plan_positioning_pro', {}, fallback || 'General-purpose package for steady daily content, GEO, and Woo product ops with predictable hosted operations.');
    case 'agency':
      return t('admin.plan_positioning_agency', {}, fallback || 'High-headroom package for multi-site operators, bulk products, multi-language, and team collaboration.');
    case 'enterprise':
      return t('admin.plan_positioning_enterprise', {}, fallback || 'Custom package for BYOM, private models, extended audit retention, SLA compliance, and dedicated support.');
    default:
      return fallback || '';
  }
}

export function localizeOperatorNote(t: TranslateFn, tierId: string, fallback?: string): string {
  switch (tierId) {
    case 'starter':
      return t('admin.plan_operator_note_starter', {}, fallback || 'Core capabilities stay available across packages. Starter is the most conservative on site count, task volume, concurrency, batch headroom, and over-limit handling.');
    case 'pro':
      return t('admin.plan_operator_note_pro', {}, fallback || 'Core capabilities stay available across packages. Pro expands task volume, concurrency, batch headroom, and support level for daily operations.');
    case 'agency':
      return t('admin.plan_operator_note_agency', {}, fallback || 'Core capabilities stay available across packages. Agency provides the highest standard headroom for multi-site, bulk product, and team-collaboration usage.');
    case 'enterprise':
      return t('admin.plan_operator_note_enterprise', {}, fallback || 'Core capabilities stay available across packages. Enterprise offers custom limits, BYOM, private models, extended audit retention, and dedicated SLA support.');
    default:
      return fallback || '';
  }
}

export function localizeFeatureGroup(t: TranslateFn, feature: string): string {
  switch (feature) {
    case 'Hosted runtime baseline':
      return t('admin.plan_feature_hosted_runtime_baseline', {}, feature);
    case 'Portal usage visibility':
      return t('admin.plan_feature_portal_usage_visibility', {}, feature);
    case 'Operator-managed subscription changes':
      return t('admin.plan_feature_operator_managed_subscription_changes', {}, feature);
    case 'Hosted runtime + workflow coverage':
      return t('admin.plan_feature_hosted_runtime_workflow_coverage', {}, feature);
    case 'Automation-heavy usage':
      return t('admin.plan_feature_automation_heavy_usage', {}, feature);
    case 'Operator-led budget follow-up':
      return t('admin.plan_feature_operator_led_budget_follow_up', {}, feature);
    case 'Higher hosted concurrency':
      return t('admin.plan_feature_higher_hosted_concurrency', {}, feature);
    case 'Multi-site commercial headroom':
      return t('admin.plan_feature_multi_site_commercial_headroom', {}, feature);
    case 'Sustained workflow and automation operations':
      return t('admin.plan_feature_sustained_workflow_automation_operations', {}, feature);
    default:
      return feature;
  }
}

export function localizePlanName(t: TranslateFn, planId: string, name: string): string {
  if (planId === 'plan_free' || name === 'Free') {
    return t('admin.plan_name_free', {}, name || 'Starter');
  }
  if (planId === 'plan_dev_unlimited' || name === 'Development Unlimited') {
    return t('admin.plan_name_development_unlimited', {}, name);
  }
  if (name === 'Magick Cloud MVP Plan') {
    return t('admin.plan_name_magick_cloud_mvp', {}, name);
  }
  return name;
}

export function resolveAdminPackageLabel(
  t: TranslateFn,
  {
    planId,
    packageAlias,
    fallback,
  }: {
    planId?: string;
    packageAlias?: string;
    fallback?: string;
  }
): string {
  const raw = `${planId || ''} ${packageAlias || ''} ${fallback || ''}`.toLowerCase();
  if (raw.includes('enterprise')) {
    return localizePackageAlias(t, 'enterprise', fallback || packageAlias || 'Enterprise');
  }
  if (raw.includes('bulk') || raw.includes('agency')) {
    return localizePackageAlias(t, 'agency', fallback || packageAlias || 'Agency');
  }
  if (raw.includes('basic') || raw.includes('pro')) {
    return localizePackageAlias(t, 'pro', fallback || packageAlias || 'Pro');
  }
  if (raw.includes('free') || raw.includes('starter') || raw.includes('plan_free')) {
    return localizePackageAlias(t, 'starter', fallback || packageAlias || 'Starter');
  }
  return fallback || packageAlias || planId || '';
}

export function localizePackageFitCue(
  t: TranslateFn,
  cue: { code: string; title: string; detail: string }
): { title: string; detail: string } {
  switch (cue.code) {
    case 'package_fit.within_band':
      return {
        title: t('admin.package_fit.within_band_title', {}, cue.title),
        detail: t('admin.package_fit.within_band_detail', {}, cue.detail),
      };
    case 'package_fit.shadow_cost_over_budget':
      return {
        title: t('admin.package_fit.shadow_cost_over_budget_title', {}, cue.title),
        detail: t('admin.package_fit.shadow_cost_over_budget_detail', {}, cue.detail),
      };
    case 'package_fit.shadow_cost_headroom_high':
      return {
        title: t('admin.package_fit.shadow_cost_headroom_high_title', {}, cue.title),
        detail: t('admin.package_fit.shadow_cost_headroom_high_detail', {}, cue.detail),
      };
    case 'package_fit.shadow_tokens_over_budget':
      return {
        title: t('admin.package_fit.shadow_tokens_over_budget_title', {}, cue.title),
        detail: t('admin.package_fit.shadow_tokens_over_budget_detail', {}, cue.detail),
      };
    case 'package_fit.shadow_runs_over_budget':
      return {
        title: t('admin.package_fit.shadow_runs_over_budget_title', {}, cue.title),
        detail: t('admin.package_fit.shadow_runs_over_budget_detail', {}, cue.detail),
      };
    default:
      return cue;
  }
}
