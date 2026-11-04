import { ApiError } from './errors';

/** Only a complete rejection response proves that a write did not succeed. */
export function adminWriteOutcomeUnknown(error: unknown): boolean {
  return !(error instanceof ApiError)
    || error.errorCode.startsWith('client.')
    || error.errorCode.includes('idempotency')
    || error.statusCode === 408 || error.statusCode === 425
    || error.statusCode < 400 || error.statusCode >= 500;
}
