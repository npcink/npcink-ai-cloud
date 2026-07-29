export type ResourceStatus =
  | 'ready'
  | 'missing_secret'
  | 'missing_provider'
  | 'disabled'
  | string;

export type ConnectionStatusFilter =
  | 'all'
  | 'ready'
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
