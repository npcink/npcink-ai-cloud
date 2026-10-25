import { ApiError } from './errors';

export type PortalWriteFailure =
  | 'not_dispatched'
  | 'rejected_current_attempt'
  | 'outcome_unknown'
  | 'reconciliation_required';

export class PortalWriteNotDispatchedError extends ApiError {
  constructor(readonly reason: 'capacity' | 'scope_changed') {
    super({
      statusCode: 0,
      errorCode: reason === 'capacity'
        ? 'client.portal_write_intent_capacity'
        : 'client.portal_write_scope_changed',
      message: 'The change was not sent.',
    });
    this.name = 'PortalWriteNotDispatchedError';
  }
}

// Preserve the current response evidence without letting it adjudicate an
// earlier attempt whose outcome is still unknown.
export class PortalWriteOutcomeError extends ApiError {
  constructor(error: ApiError, readonly writeDisposition: 'outcome_unknown' | 'reconciliation_required') {
    super({
      statusCode: error.statusCode,
      errorCode: error.errorCode,
      message: error.message,
      details: error.details,
      traceId: error.traceId,
      requestId: error.requestId,
      revision: error.revision,
      rawBody: error.rawBody,
      responseStatusCode: error.responseStatusCode,
      retryAfterSeconds: error.retryAfterSeconds,
      cause: error,
    });
    this.name = 'PortalWriteOutcomeError';
  }
}

export function classifyPortalWriteFailure(error: unknown): PortalWriteFailure {
  if (error instanceof PortalWriteNotDispatchedError) return 'not_dispatched';
  if (error instanceof PortalWriteOutcomeError) return error.writeDisposition;
  if (!(error instanceof ApiError)) return 'outcome_unknown';
  if ([
    'portal.idempotency_in_progress',
    'portal.idempotency_indeterminate',
    'portal.idempotency_conflict',
  ].includes(error.errorCode)) return 'reconciliation_required';
  if ([
    'portal.idempotency_persist_failed',
    'portal.idempotency_receipt_unavailable',
    'portal.idempotency_response_invalid',
    'portal.idempotency_response_too_large',
  ].includes(error.errorCode)) return 'outcome_unknown';
  if (error.statusCode === 0 || error.errorCode.startsWith('client.')
    || error.statusCode === 408 || error.statusCode === 425 || error.statusCode >= 500) {
    return 'outcome_unknown';
  }
  return error.statusCode >= 400 && error.statusCode < 500
    ? 'rejected_current_attempt'
    : 'outcome_unknown';
}
