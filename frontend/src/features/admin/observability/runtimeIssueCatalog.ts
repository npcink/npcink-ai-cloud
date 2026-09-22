import { formatNumber } from '@/lib/utils';
import { statusTone } from '@/features/admin/observability/runtimeTelemetry';

export type TranslationFn = (key: string, params?: Record<string, string>, fallback?: string) => string;

export type EvidenceLane = {
  id: string;
  href: string;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
};

export const evidenceLanes: EvidenceLane[] = [
  {
    id: 'audit',
    href: '/admin/audit',
    titleKey: 'admin.audit_workspace.title',
    titleFallback: 'Audit evidence',
    descKey: 'admin.audit_workspace.lane_description',
    descFallback: 'Exact service operation receipts, outcomes, scopes, and bounded request metadata.',
  },
  {
    id: 'plugin',
    href: '/admin/plugin-observability',
    titleKey: 'admin.nav_plugin_observability',
    titleFallback: 'Plugin observability',
    descKey: 'admin.advanced.plugin_observability_desc',
    descFallback: 'Plugin event volume, error pressure, latency, and recent failure evidence.',
  },
  {
    id: 'media',
    href: '/admin/media-observability',
    titleKey: 'admin.nav_media_observability',
    titleFallback: 'Media observability',
    descKey: 'admin.advanced.media_observability_desc',
    descFallback: 'Media processing jobs, failures, processing duration, and compression value.',
  },
  {
    id: 'vector',
    href: '/admin/vector-observability',
    titleKey: 'admin.nav_vector_observability',
    titleFallback: 'Vector observability',
    descKey: 'admin.advanced.vector_observability_desc',
    descFallback: 'Vector and Site Knowledge indexing health for support investigations.',
  },
  {
    id: 'feedback',
    href: '/admin/agent-feedback',
    titleKey: 'admin.nav_agent_feedback',
    titleFallback: 'Agent feedback quality',
    descKey: 'admin.advanced.agent_feedback_desc',
    descFallback: 'Read-only quality signals from local operator feedback across Cloud-backed AI assistance.',
  },
  {
    id: 'advisor',
    href: '/admin/ai-advisor',
    titleKey: 'admin.ai_advisor.title',
    titleFallback: 'Operations Advisor',
    descKey: 'admin.advanced.ai_advisor_desc',
    descFallback: 'AI-assisted diagnosis for selected operational signals.',
  },
];

export const runtimeEvidenceItems = [
  {
    titleKey: 'admin.advanced.runtime_resolution_title',
    titleFallback: 'Runtime resolution',
    descKey: 'admin.advanced.runtime_resolution_desc',
    descFallback: 'Capability to profile, supplier, and model selection evidence. Read-only, not a router editor.',
  },
  {
    titleKey: 'admin.advanced.capability_matrix_title',
    titleFallback: 'Capability matrix',
    descKey: 'admin.advanced.capability_matrix_desc',
    descFallback: 'Current Cloud runtime mapping across capabilities, selected providers, and write posture.',
  },
  {
    titleKey: 'admin.advanced.runtime_profiles_title',
    titleFallback: 'Runtime configurations',
    descKey: 'admin.advanced.runtime_profiles_desc',
    descFallback: 'Cloud runtime profile metadata and selected provider/model references.',
  },
  {
    titleKey: 'admin.advanced.recent_runtime_evidence_title',
    titleFallback: 'Recent runtime evidence',
    descKey: 'admin.advanced.recent_runtime_evidence_desc',
    descFallback: 'Recent run metadata used for diagnostics without exposing prompts, results, or provider secrets.',
  },
];

export function scopeLabel(capabilities: string[], t: TranslationFn): string {
  return capabilities.map((capability) => {
    const labels: Record<string, string> = {
      text: 'admin.troubleshooting.scope_text',
      knowledge: 'admin.troubleshooting.scope_knowledge',
      image: 'admin.troubleshooting.scope_image',
      audio: 'admin.troubleshooting.scope_audio',
    };
    return labels[capability] ? t(labels[capability], {}, capability) : capability;
  }).join(', ') || t('admin.troubleshooting.runtime_scope', {}, 'Cloud runtime');
}

export function issueTitle(issue: { code: string; title: string }, t: TranslationFn): string {
  const knownTitles: Record<string, [string, string]> = {
    'hosted_model.unmetered_runs': ['admin.troubleshooting.issue_meter_gap', 'Usage records missing'],
    'hosted_model.provider_errors': ['admin.troubleshooting.issue_provider_errors', 'Provider call errors'],
    'hosted_model.failed_runs': ['admin.troubleshooting.issue_runtime_failed', 'Runtime runs failed'],
    'hosted_model.provider_call_gap': ['admin.troubleshooting.issue_provider_gap', 'Provider call coverage gap'],
  };
  const known = knownTitles[issue.code];
  return known ? t(known[0], {}, known[1]) : issue.title || issue.code;
}

export function issueAction(issue: { code: string; suggestedAction: string }, t: TranslationFn): string {
  if (issue.code === 'hosted_model.provider_errors') return t('admin.troubleshooting.action_provider_failures', {}, 'Inspect the failure details and next actions below.');
  const knownActions: Record<string, [string, string]> = {
    inspect_metering_callback_or_usage_event_mapping: ['admin.troubleshooting.action_check_metering', 'Ask technical support to check usage event recording and request association for the affected functions.'],
    inspect_provider_credentials_quota_and_health: ['admin.troubleshooting.action_check_provider_health', 'Check supplier health, credentials, and quota evidence.'],
    inspect_runtime_failure_detail: ['admin.troubleshooting.action_check_runtime_failures', 'Inspect runtime failure codes and provider health evidence.'],
    inspect_runtime_failure_codes_and_provider_health: ['admin.troubleshooting.action_check_runtime_failures', 'Inspect runtime failure codes and provider health evidence.'],
    inspect_provider_call_recording_for_hosted_profiles: ['admin.troubleshooting.action_check_telemetry_gap', 'Inspect provider-call recording coverage for hosted profiles.'],
  };
  const known = knownActions[issue.suggestedAction];
  return known ? t(known[0], {}, known[1]) : t('admin.troubleshooting.action_unknown', {}, 'Ask technical support to investigate this time window and diagnostic code.');
}

export function issueOwner(issue: { code: string }, t: TranslationFn): string {
  const key = issue.code === 'hosted_model.provider_errors' || issue.code === 'hosted_model.failed_runs'
    ? 'admin.troubleshooting.owner_maintenance'
    : issue.code === 'hosted_model.unmetered_runs' || issue.code === 'hosted_model.provider_call_gap'
      ? 'admin.troubleshooting.owner_support'
      : 'admin.troubleshooting.owner_platform';
  return t(key, {}, key === 'admin.troubleshooting.owner_maintenance' ? 'Maintenance engineer' : key === 'admin.troubleshooting.owner_support' ? 'Technical support' : 'Platform administrator');
}

export function issueEvidenceGuidance(issue: { code: string }, t: TranslationFn): string {
  if (issue.code === 'hosted_model.provider_call_gap') {
    return t('admin.troubleshooting.evidence_provider_gap', {}, 'This is a provider-call evidence gap. It does not establish that the run failed.');
  }
  if (issue.code === 'hosted_model.unmetered_runs') {
    return t('admin.troubleshooting.evidence_meter_gap', {}, 'This is a metering evidence gap. It does not establish a billing error or run failure.');
  }
  if (issue.code === 'hosted_model.provider_errors') {
    return t('admin.troubleshooting.evidence_provider_error', {}, 'This represents provider-call errors. Confirm the individual run evidence before declaring recovery.');
  }
  return t('admin.troubleshooting.evidence_runtime_failure', {}, 'This represents runtime failures in the selected telemetry window.');
}

export function severityLabel(severity: string, t: TranslationFn): string {
  return statusTone(severity) === 'error'
    ? t('admin.troubleshooting.severity_error', {}, 'Error')
    : statusTone(severity) === 'warning'
      ? t('admin.troubleshooting.severity_warning', {}, 'Warning')
      : t('admin.troubleshooting.severity_notice', {}, 'Notice');
}

export function issueCount(issue: { code: string; count: number }, t: TranslationFn): string {
  return t(issue.code === 'hosted_model.provider_errors'
    ? 'admin.troubleshooting.count_calls'
    : 'admin.troubleshooting.count_runs', { count: formatNumber(issue.count) });
}

export function runStatusLabel(status: string, t: TranslationFn): string {
  if (status.toLowerCase() === 'succeeded') return t('admin.troubleshooting.run_succeeded');
  if (status.toLowerCase() === 'failed') return t('admin.troubleshooting.run_failed');
  return status;
}
