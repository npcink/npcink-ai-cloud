import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchAdminAuditEvents } from './api';

export const adminAuditKeys = {
  all: ['admin', 'audit'] as const,
  workspace: (requestKey: string) => [...adminAuditKeys.all, requestKey] as const,
};

export function useAdminAuditWorkspace(requestKey: string) {
  return useQuery({
    queryKey: adminAuditKeys.workspace(requestKey),
    queryFn: ({ signal }) => fetchAdminAuditEvents(requestKey, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
