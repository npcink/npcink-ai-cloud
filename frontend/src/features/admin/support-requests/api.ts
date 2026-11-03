import { createApiClient } from '@/lib/api-client';
import type { SupportRequestsQueryData } from './types';
import { readSupportDirectory } from './directory-evidence';

const supportRequestsClient = createApiClient({
  cache: 'default',
  idempotencyPrefix: 'admin_support_requests',
});

export async function fetchSupportRequests(
  requestKey: string,
  signal: AbortSignal
): Promise<SupportRequestsQueryData> {
  const data = (
    await supportRequestsClient.request<unknown>(
      `/api/admin/support-requests?${requestKey}`,
      { cache: 'no-store', signal }
    )
  ).data;
  return { ...readSupportDirectory(data, requestKey), requestKey, loadedAt: Date.now() };
}
