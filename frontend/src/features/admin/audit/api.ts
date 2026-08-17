import { createApiClient } from '@/lib/api-client';
import type { AdminAuditListPayload, AdminAuditQueryData } from './types';

const adminAuditClient = createApiClient({
  cache: 'default',
  idempotencyPrefix: 'admin_audit_workspace',
});

export async function fetchAdminAuditEvents(
  requestKey: string,
  signal: AbortSignal
): Promise<AdminAuditQueryData> {
  const data = (
    await adminAuditClient.request<AdminAuditListPayload>(
      `/api/admin/audit-events?${requestKey}`,
      { cache: 'no-store', signal }
    )
  ).data;
  return { ...data, requestKey, loadedAt: Date.now() };
}
