export type ResourceStatus =
  | 'ready'
  | 'missing_secret'
  | 'missing_provider'
  | 'disabled'
  | string;

export type ConnectionStatusFilter =
  | 'all'
  | 'ready'
  | 'attention'
  | 'missing_secret'
  | 'disabled';

export type SupplierConnection = {
  connection_id: string;
  provider_id: string;
  display_name: string;
  kind: string;
  enabled: boolean;
  configured: boolean;
  status: ResourceStatus;
  configuration_status?: ResourceStatus;
  verification_status?: 'passed' | 'failed' | 'not_observed' | string;
  attention_required?: boolean;
  attention_reasons?: string[];
  base_url: string;
  capability_ids: string[];
  runtime_profile_ids: string[];
  model_ids?: string[];
  config?: {
    image_response_format?: string;
    image_output_hosts?: string[];
    [key: string]: unknown;
  };
  last_tested_at?: string;
  last_error_code?: string;
  last_error_message?: string;
  updated_at?: string;
  detail_href?: string;
  managed_by?: string;
  metadata?: Record<string, unknown>;
  image_delivery_probe?: {
    probe_id?: string;
    status?: 'ready' | 'approval_required' | 'host_approved' | string;
    provider_id?: string;
    model_id?: string;
    delivery_format?: 'url' | 'base64' | string;
    detected_host?: string;
    tested_at?: string;
    host_approved_at?: string;
  };
  image_delivery_repair?: {
    status?: 'pending' | 'approved' | string;
    reason_code?: string;
    detected_host?: string;
    evidence_kind?: 'runtime_run' | 'admin_probe' | string;
    probe_id?: string;
    run_id?: string;
    observed_at?: string;
    approved_at?: string;
  };
};

export type ProviderConnectionDeletePreflight = {
  surface: 'admin_provider_connection_delete_preflight';
  connection: {
    connection_id: string;
    provider_id: string;
    display_name: string;
    enabled: boolean;
    configuration_status: string;
  };
  expected_updated_at: string;
  impact: {
    risk_level: 'low' | 'warning' | 'high' | string;
    runtime_profile_ids: string[];
    uncovered_runtime_profile_ids: string[];
    capability_ids: string[];
    model_count: number;
    alternative_connections: Array<{
      connection_id: string;
      display_name: string;
      shared_runtime_profile_ids: string[];
    }>;
  };
  requires_confirmation: true;
};

export function isProviderConnectionDeletePreflight(
  value: unknown
): value is ProviderConnectionDeletePreflight {
  if (!value || typeof value !== 'object') return false;
  const preflight = value as Record<string, unknown>;
  const connection = preflight.connection;
  const impact = preflight.impact;
  if (!connection || typeof connection !== 'object' || !impact || typeof impact !== 'object') {
    return false;
  }
  const connectionRecord = connection as Record<string, unknown>;
  const impactRecord = impact as Record<string, unknown>;
  const stringArray = (candidate: unknown): candidate is string[] => (
    Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')
  );
  const alternatives = impactRecord.alternative_connections;
  return preflight.surface === 'admin_provider_connection_delete_preflight'
    && preflight.requires_confirmation === true
    && typeof preflight.expected_updated_at === 'string'
    && preflight.expected_updated_at.length > 0
    && typeof connectionRecord.connection_id === 'string'
    && typeof connectionRecord.provider_id === 'string'
    && typeof connectionRecord.display_name === 'string'
    && typeof connectionRecord.enabled === 'boolean'
    && typeof connectionRecord.configuration_status === 'string'
    && typeof impactRecord.risk_level === 'string'
    && stringArray(impactRecord.runtime_profile_ids)
    && stringArray(impactRecord.uncovered_runtime_profile_ids)
    && stringArray(impactRecord.capability_ids)
    && typeof impactRecord.model_count === 'number'
    && Number.isFinite(impactRecord.model_count)
    && Array.isArray(alternatives)
    && alternatives.every((alternative) => {
      if (!alternative || typeof alternative !== 'object') return false;
      const record = alternative as Record<string, unknown>;
      return typeof record.connection_id === 'string'
        && typeof record.display_name === 'string'
        && stringArray(record.shared_runtime_profile_ids);
    });
}

export type ProviderImageDeliveryProbeResult = {
  probe_id: string;
  connection_id: string;
  provider_id: string;
  model_id: string;
  status: 'ready' | 'approval_required' | 'host_approved' | string;
  ok: boolean;
  delivery_format: 'url' | 'base64' | string;
  detected_host?: string;
  host_approved: boolean;
  content_type?: string;
  width?: number;
  height?: number;
  latency_ms: number;
  estimated_cost: number;
  provider_call_billable: true;
  tested_at: string;
  message: string;
};

export type ProviderConnectionTestResult = {
  connection_id: string;
  provider_id: string;
  kind: string;
  status: ResourceStatus;
  stage: string;
  ok: boolean;
  error_code: string;
  message: string;
  tested_at: string;
  catalog?: {
    provider_id?: string;
    display_name?: string;
    adapter_type?: string;
    model_count?: number;
    sample_model_ids?: string[];
  };
  probe?: {
    provider_id?: string;
    result_count?: number;
    latency_ms?: number;
    write_posture?: string;
    direct_wordpress_write?: boolean;
  };
};
