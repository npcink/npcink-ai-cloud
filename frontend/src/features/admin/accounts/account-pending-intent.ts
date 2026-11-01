import { ApiError } from '@/lib/errors';

// Customer forms only: persist before dispatch and clear only this operation.
export function clearCustomerIntent(key: string, operationId: string) {
  const saved = sessionStorage.getItem(key);
  if (saved && JSON.parse(saved).operation_id === operationId) sessionStorage.removeItem(key);
}

export function customerWriteRejected(error: unknown, codes: readonly string[]): boolean {
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500
    && codes.includes(error.errorCode);
}
