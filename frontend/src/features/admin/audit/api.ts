import { readAdminAuditEvidence } from './evidence';
import { createApiClient } from '@/lib/api-client';
import type { AdminAuditQueryData } from './types';

const adminAuditClient = createApiClient({
  cache: 'default',
  idempotencyPrefix: 'admin_audit_workspace',
});

export async function fetchAdminAuditEvents(
  requestKey: string,
  signal: AbortSignal
): Promise<AdminAuditQueryData> {
  const data = (
    await adminAuditClient.request<unknown>(
      `/api/admin/audit-events?${requestKey}`,
      { cache: 'no-store', signal }
    )
  ).data;
  return { ...readAdminAuditEvidence(data, requestKey), requestKey, loadedAt: Date.now() };
}
