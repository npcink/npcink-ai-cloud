export type VectorProfile = {
  runtime?: {
    environment: string;
    provider_id: string;
    model_id: string;
    dimensions: number;
    backend: string;
    index_status: string;
  };
  profile_id: string;
  model_id: string;
  dimensions: number;
  metric: string;
  production_backend: string;
  local_test_backend: string;
  active_backend: string;
  status: string;
  editable_fields: string[];
  reindex_policy: string;
  provider: {
    provider_id: string;
    display_name: string;
    connection_id: string;
    configured: boolean;
    verified: boolean;
    status: string;
    last_tested_at: string;
  };
  vector_store: {
    provider_id: string;
    display_name: string;
    connection_id: string;
    configured: boolean;
    verified: boolean;
    status: string;
    settings_owner: string;
    endpoint: string;
    token_configured: boolean;
    collection: string;
    last_tested_at: string;
  };
  validation: {
    connection: {
      status: string;
      provider_verified: boolean;
      vector_store_verified: boolean;
    };
    index: {
      status: string;
      reason: string;
      embedding_space_id: string;
      source_document_count: number;
      source_chunk_count: number;
      indexed_chunk_count: number;
      roundtrip_status: string;
      last_reindexed_at: string;
      last_error_code: string;
    };
    retrieval: {
      status: string;
      last_verified_at: string;
      result_count: number;
      top1_score: number;
      evidence_source: string;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The same minimum read contract guards initial reads and mutation replies. */
export function readVectorProfile(value: unknown): VectorProfile {
  const strings = (record: Record<string, unknown>, keys: string[]) => keys.every(key => typeof record[key] === 'string');
  const booleans = (record: Record<string, unknown>, keys: string[]) => keys.every(key => typeof record[key] === 'boolean');
  const numbers = (record: Record<string, unknown>, keys: string[]) => keys.every(key => typeof record[key] === 'number' && Number.isFinite(record[key]));
  if (!isRecord(value) || !strings(value, ['profile_id', 'model_id', 'metric', 'production_backend', 'local_test_backend', 'active_backend', 'status', 'reindex_policy'])
    || !numbers(value, ['dimensions']) || !Array.isArray(value.editable_fields) || !value.editable_fields.every(field => typeof field === 'string')) throw new Error('Invalid vector profile');
  const { provider, vector_store: store, validation, runtime } = value;
  if (!isRecord(provider) || !strings(provider, ['provider_id', 'display_name', 'connection_id', 'status', 'last_tested_at']) || !booleans(provider, ['configured', 'verified'])
    || !isRecord(store) || !strings(store, ['provider_id', 'display_name', 'connection_id', 'status', 'settings_owner', 'endpoint', 'collection', 'last_tested_at']) || !booleans(store, ['configured', 'verified', 'token_configured'])
    || !isRecord(validation)) throw new Error('Invalid vector profile');
  const { connection, index, retrieval } = validation;
  if (!isRecord(connection) || !strings(connection, ['status']) || !booleans(connection, ['provider_verified', 'vector_store_verified'])
    || !isRecord(index) || !strings(index, ['status', 'reason', 'embedding_space_id', 'roundtrip_status', 'last_reindexed_at', 'last_error_code']) || !numbers(index, ['source_document_count', 'source_chunk_count', 'indexed_chunk_count'])
    || !isRecord(retrieval) || !strings(retrieval, ['status', 'last_verified_at', 'evidence_source']) || !numbers(retrieval, ['result_count', 'top1_score'])
    || (runtime !== undefined && (!isRecord(runtime) || !strings(runtime, ['environment', 'provider_id', 'model_id', 'backend', 'index_status']) || !numbers(runtime, ['dimensions'])))) throw new Error('Invalid vector profile');
  return value as VectorProfile;
}
