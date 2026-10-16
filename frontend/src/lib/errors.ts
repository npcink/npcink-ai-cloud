export interface ApiErrorInit {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
  traceId?: string;
  requestId?: string;
  revision?: string;
  rawBody?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly details: unknown;
  readonly traceId: string;
  readonly requestId: string;
  readonly revision: string;
  readonly rawBody: unknown;
  override readonly cause: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.statusCode = init.statusCode;
    this.errorCode = init.errorCode;
    this.details = init.details;
    this.traceId = init.traceId || '';
    this.requestId = init.requestId || '';
    this.revision = init.revision || '';
    this.rawBody = init.rawBody;
    this.cause = init.cause;
  }

  get isAuthError(): boolean {
    return this.statusCode === 401 || this.errorCode.startsWith('auth.');
  }

  get isRateLimitError(): boolean {
    return this.statusCode === 429 || this.errorCode.includes('rate_limit');
  }
}

type ErrorTranslator = (
  key: string,
  params?: Record<string, string>,
  fallback?: string
) => string;

const PROVIDER_ERROR_KEYS: Record<string, string> = {
  'client.network_error': 'error.client_network_error',
  'client.request_timeout': 'error.client_request_timeout',
  'provider_connection.auth_failed': 'error.provider_auth_failed',
  'provider.auth_invalid': 'error.provider_auth_failed',
  'provider_connection.network_error': 'error.provider_network_error',
  'provider.network_error': 'error.provider_network_error',
  'provider.timeout': 'error.provider_timeout',
  'provider.rate_limited': 'error.provider_rate_limited',
  'provider.unavailable': 'error.provider_unavailable',
  'provider.error': 'error.provider_upstream_error',
  'provider_connection.upstream_error': 'error.provider_upstream_error',
  'provider_connection.test_failed': 'error.provider_test_failed',
  'provider.invalid_response': 'error.provider_invalid_response',
  'provider.output_contract_invalid': 'error.provider_invalid_response',
  'provider.response_too_large': 'error.provider_response_too_large',
  'provider.reader_error': 'error.provider_reader_error',
  'provider_connection.disabled': 'error.provider_disabled',
  'provider_connection.missing_secret': 'error.provider_missing_secret',
  'provider_connection.saved_credential_unreadable': 'error.provider_credential_unreadable',
  'provider_connection.preview_credential_required': 'error.provider_missing_secret',
  'provider_connection.catalog_empty': 'error.provider_catalog_empty',
  'provider_connection.catalog_sync_failed': 'error.provider_catalog_sync_failed',
  'provider_connection.unsupported_provider_kind': 'error.provider_unsupported_kind',
  'provider_connection.missing_base_url': 'error.provider_missing_base_url',
  'provider_connection.reader_empty': 'error.provider_reader_empty',
  'provider.quota_exhausted': 'error.provider_quota_exhausted',
  'web_search.apify_actor_missing': 'error.provider_configuration_incomplete',
  'web_search.apify_api_token_missing': 'error.provider_missing_secret',
  'web_search.apify_http_error': 'error.provider_upstream_error',
  'web_search.anysearch_api_key_missing': 'error.provider_missing_secret',
  'web_search.anysearch_endpoint_missing': 'error.provider_missing_base_url',
  'web_search.anysearch_filters_unsupported': 'error.provider_unsupported_kind',
  'web_search.anysearch_http_error': 'error.provider_upstream_error',
  'web_search.bocha_api_key_missing': 'error.provider_missing_secret',
  'web_search.bocha_http_error': 'error.provider_upstream_error',
  'web_search.doubao_api_key_missing': 'error.provider_missing_secret',
  'web_search.doubao_endpoint_missing': 'error.provider_missing_base_url',
  'web_search.doubao_http_error': 'error.provider_upstream_error',
  'web_search.provider_fallback_exhausted': 'error.provider_unavailable',
  'web_search.provider_not_configured': 'error.provider_configuration_incomplete',
  'web_search.provider_not_supported': 'error.provider_unsupported_kind',
  'web_search.query_required': 'error.provider_configuration_incomplete',
  'web_search.reader_not_configured': 'error.provider_configuration_incomplete',
  'web_search.tavily_api_key_missing': 'error.provider_missing_secret',
  'web_search.tavily_http_error': 'error.provider_upstream_error',
  'web_search.zhihu_access_secret_missing': 'error.provider_missing_secret',
  'web_search.zhihu_endpoint_missing': 'error.provider_missing_base_url',
  'web_search.zhihu_http_error': 'error.provider_upstream_error',
};

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function extractMessage(value: unknown): string {
  if (value instanceof Error) {
    return String(value.message || '').trim();
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  const record = value as Record<string, unknown>;
  return typeof record.message === 'string' ? record.message.trim() : '';
}

export function resolveUiErrorMessage(
  error: unknown,
  fallback: string,
  t?: ErrorTranslator
): string {
  const record = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : undefined;
  const code = error instanceof ApiError ? error.errorCode : record?.error_code;
  if (t && typeof code === 'string') {
    const key = Object.hasOwn(PROVIDER_ERROR_KEYS, code) ? PROVIDER_ERROR_KEYS[code] : undefined;
    if (key) return t(key, undefined, fallback);
  }

  // Backend/transport prose is diagnostic data, not localized product copy.
  // Keep the caller's action-specific message for unknown API failures.
  if (error instanceof ApiError || typeof code === 'string') return fallback;
  const message = extractMessage(error);
  if (
    !message
    || (containsCjk(fallback) && !containsCjk(message))
    || /^(failed to |error\b|unexpected error|unable to |request failed|internal server error$|forbidden$|unauthorized$|bad request$)/i.test(message)
  ) return fallback;
  return message;
}
