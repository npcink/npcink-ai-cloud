'use client';

import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api-client';
import type { SupplierConnection } from './types';

export type AiResourcesDirectory = {
  connections: SupplierConnection[];
};

export type AiResourcesDirectoryRequest = (
  signal: AbortSignal
) => Promise<unknown>;

export const aiResourcesClient = createApiClient({
  idempotencyPrefix: 'ai_resources',
});

export const aiResourcesKeys = {
  all: ['admin', 'ai-resources'] as const,
  directory: () => [...aiResourcesKeys.all, 'directory'] as const,
};

export function normalizeAiResourcesDirectory(
  raw: unknown
): AiResourcesDirectory {
  const value =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    connections: Array.isArray(value.connections)
      ? (value.connections as SupplierConnection[])
      : [],
  };
}

async function requestAiResourcesDirectory(
  signal: AbortSignal
): Promise<unknown> {
  return (
    await aiResourcesClient.request<unknown>('/api/admin/ai-resources', {
      signal,
    })
  ).data;
}

export async function fetchAiResourcesDirectory(
  signal: AbortSignal,
  request: AiResourcesDirectoryRequest = requestAiResourcesDirectory
): Promise<AiResourcesDirectory> {
  return normalizeAiResourcesDirectory(await request(signal));
}

export function useAiResourcesDirectory() {
  return useQuery({
    queryKey: aiResourcesKeys.directory(),
    queryFn: ({ signal }) => fetchAiResourcesDirectory(signal),
  });
}
