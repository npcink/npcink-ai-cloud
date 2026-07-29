import { createApiClient } from '@/lib/api-client';
import type {
  SupportRequest,
  SupportRequestListPayload,
  SupportRequestsQueryData,
  SupportRequestUpdateInput,
} from './types';

const supportRequestsClient = createApiClient({
  cache: 'default',
  idempotencyPrefix: 'admin_support_requests',
});

export async function fetchSupportRequests(
  requestKey: string,
  signal: AbortSignal
): Promise<SupportRequestsQueryData> {
  const data = (
    await supportRequestsClient.request<SupportRequestListPayload>(
      `/api/admin/support-requests?${requestKey}`,
      { cache: 'no-store', signal }
    )
  ).data;
  return { ...data, requestKey, loadedAt: Date.now() };
}

export async function updateSupportRequest(
  input: SupportRequestUpdateInput
): Promise<{ request?: SupportRequest }> {
  return (
    await supportRequestsClient.request<{ request?: SupportRequest }>(
      `/api/admin/support-requests/${encodeURIComponent(input.requestId)}`,
      {
        method: 'PATCH',
        body: { status: input.status, admin_note: input.adminNote },
      }
    )
  ).data;
}
