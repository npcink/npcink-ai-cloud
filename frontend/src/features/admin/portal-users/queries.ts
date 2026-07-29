import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  batchDisablePortalUsers,
  disablePortalUser,
  fetchPortalUserAudit,
  fetchPortalUsers,
} from './api';
import type { PortalUsersQueryData } from './types';

export const portalUserKeys = {
  all: ['admin', 'portal-users'] as const,
  directories: () => [...portalUserKeys.all, 'directory'] as const,
  directory: (requestKey: string) =>
    [...portalUserKeys.directories(), requestKey] as const,
  audits: () => [...portalUserKeys.all, 'audit'] as const,
  audit: (principalId: string) =>
    [...portalUserKeys.audits(), principalId] as const,
};

export function usePortalUsersDirectory(requestKey: string) {
  return useQuery({
    queryKey: portalUserKeys.directory(requestKey),
    queryFn: ({ signal }) => fetchPortalUsers(requestKey, signal),
    placeholderData: keepPreviousData,
    // Directory failures keep the last page visible and expose an explicit retry;
    // avoid hiding a scope failure behind a duplicate operator read.
    retry: false,
  });
}

export function getLatestPortalUsersDirectoryData(
  queryClient: QueryClient
): PortalUsersQueryData | undefined {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: portalUserKeys.directories() })
    .reduce<{ data?: PortalUsersQueryData; updatedAt: number }>(
      (latest, query) => {
        const data = query.state.data as PortalUsersQueryData | undefined;
        return data && query.state.dataUpdatedAt > latest.updatedAt
          ? { data, updatedAt: query.state.dataUpdatedAt }
          : latest;
      },
      { updatedAt: 0 }
    ).data;
}

export function usePortalUserAudit(principalId: string) {
  return useQuery({
    queryKey: portalUserKeys.audit(principalId),
    queryFn: ({ signal }) => fetchPortalUserAudit(principalId, signal),
    enabled: Boolean(principalId),
  });
}

export function useDisablePortalUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disablePortalUser,
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: portalUserKeys.directories(),
        }),
        queryClient.invalidateQueries({
          queryKey: portalUserKeys.audit(input.principalId),
          exact: true,
        }),
      ]);
    },
  });
}

export function useBatchDisablePortalUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: batchDisablePortalUsers,
    onSuccess: async (_data, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: portalUserKeys.directories(),
        }),
        ...input.principalIds.map((principalId) =>
          queryClient.invalidateQueries({
            queryKey: portalUserKeys.audit(principalId),
            exact: true,
          })
        ),
      ]);
    },
  });
}
