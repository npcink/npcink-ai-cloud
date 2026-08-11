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
