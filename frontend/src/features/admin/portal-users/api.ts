import { createApiClient } from '@/lib/api-client';
import type {
  BatchDisableResult,
  PortalUserAuditDetail,
  PortalUserDisableResult,
  PortalUsersQueryData,
  PortalUsersResponse,
} from './types';

const portalUsersClient = createApiClient({
  cache: 'default',
  idempotencyPrefix: 'admin_portal_users',
});

export async function fetchPortalUsers(
  requestKey: string,
  signal: AbortSignal
): Promise<PortalUsersQueryData> {
  const data = (
    await portalUsersClient.request<PortalUsersResponse>(
      `/api/admin/portal-users?${requestKey}`,
      { cache: 'no-store', signal }
    )
  ).data;
  return { ...data, requestKey, loadedAt: Date.now() };
}

export async function fetchPortalUserAudit(
  principalId: string,
  signal: AbortSignal
): Promise<PortalUserAuditDetail> {
  return (
    await portalUsersClient.request<PortalUserAuditDetail>(
      `/api/admin/portal-users/${encodeURIComponent(principalId)}/audit?limit=50`,
      { signal }
    )
  ).data;
}

export async function disablePortalUser(input: {
  principalId: string;
  reason: string;
}): Promise<PortalUserDisableResult> {
  return (
    await portalUsersClient.request<PortalUserDisableResult>(
      `/api/admin/portal-users/${encodeURIComponent(input.principalId)}/disable`,
      {
        method: 'POST',
        body: { reason: input.reason },
      }
    )
  ).data;
}

export async function batchDisablePortalUsers(input: {
  principalIds: string[];
  reason: string;
}): Promise<BatchDisableResult> {
  return (
    await portalUsersClient.request<BatchDisableResult>(
      '/api/admin/portal-users/batch-disable',
      {
        method: 'POST',
        body: {
          principal_ids: input.principalIds,
          reason: input.reason,
        },
      }
    )
  ).data;
}
