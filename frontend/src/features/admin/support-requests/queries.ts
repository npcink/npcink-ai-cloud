import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { fetchSupportRequests, updateSupportRequest } from './api';
import type { SupportRequestsQueryData } from './types';

export const supportRequestKeys = {
  all: ['admin', 'support-requests'] as const,
  directories: () => [...supportRequestKeys.all, 'directory'] as const,
  directory: (requestKey: string) =>
    [...supportRequestKeys.directories(), requestKey] as const,
};

export function useSupportRequestsDirectory(requestKey: string) {
  return useQuery({
    queryKey: supportRequestKeys.directory(requestKey),
    queryFn: ({ signal }) => fetchSupportRequests(requestKey, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function getLatestSupportRequestsDirectoryData(
  queryClient: QueryClient
): SupportRequestsQueryData | undefined {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: supportRequestKeys.directories() })
    .reduce<{ data?: SupportRequestsQueryData; updatedAt: number }>(
      (latest, query) => {
        const data = query.state.data as SupportRequestsQueryData | undefined;
        return data && query.state.dataUpdatedAt > latest.updatedAt
          ? { data, updatedAt: query.state.dataUpdatedAt }
          : latest;
      },
      { updatedAt: 0 }
    ).data;
}

export function useSupportRequestUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSupportRequest,
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: supportRequestKeys.directories(),
      });
    },
  });
}
