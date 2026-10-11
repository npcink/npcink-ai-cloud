'use client';

import { useQuery } from '@tanstack/react-query';
import { createApiClient } from '@/lib/api-client';
import type {
  ProviderModelHealth,
  ProviderModelHealthRow,
  SupplierConnection,
} from './types';

export type AiResourcesDirectory = {
  connections: SupplierConnection[];
  providerModelHealth: ProviderModelHealth | null;
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

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoundedCount(value: unknown): number {
  return Math.max(0, Math.round(toFiniteNumber(value)));
}

function toOptionalLatencyMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
}

function normalizeProviderModelHealthRow(
  raw: unknown
): ProviderModelHealthRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const providerId = String(record.provider_id || '').trim();
  const modelId = String(record.model_id || '').trim();
  if (!providerId || !modelId) return null;
  return {
    provider_id: providerId,
    model_id: modelId,
    status: String(record.status || 'not_observed'),
    call_count: toBoundedCount(record.call_count),
    success_count: toBoundedCount(record.success_count),
    error_count: toBoundedCount(record.error_count),
    success_rate: Math.max(0, toFiniteNumber(record.success_rate)),
    avg_latency_ms: toOptionalLatencyMs(record.avg_latency_ms),
    p95_latency_ms: toOptionalLatencyMs(record.p95_latency_ms),
    tokens_in: toBoundedCount(record.tokens_in),
    tokens_out: toBoundedCount(record.tokens_out),
    cost: Math.max(0, toFiniteNumber(record.cost)),
    retry_count: toBoundedCount(record.retry_count),
    fallback_count: toBoundedCount(record.fallback_count),
    last_error_code: String(record.last_error_code || ''),
    last_observed_at: String(record.last_observed_at || ''),
  };
}

export function normalizeProviderModelHealth(
  raw: unknown
): ProviderModelHealth | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.windows)) return null;
  const windows = record.windows
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const windowRecord = entry as Record<string, unknown>;
      const windowId = String(windowRecord.window_id || '').trim();
      if (!windowId) return null;
      return {
        window_id: windowId,
        label: String(windowRecord.label || windowId),
        hours: Math.max(1, toBoundedCount(windowRecord.hours) || 24),
        rows: Array.isArray(windowRecord.rows)
          ? windowRecord.rows
              .map(normalizeProviderModelHealthRow)
              .filter((row): row is ProviderModelHealthRow => row !== null)
          : [],
      };
    })
    .filter((window): window is NonNullable<typeof window> => window !== null);
  if (!windows.length) return null;
  const defaultWindowId = String(record.default_window_id || windows[0].window_id);
  return {
    source: String(record.source || 'provider_call_records'),
    content_exposed: record.content_exposed === true,
    recent_call_limit: Math.max(1, toBoundedCount(record.recent_call_limit) || 200),
    default_window_id: windows.some((window) => window.window_id === defaultWindowId)
      ? defaultWindowId
      : windows[0].window_id,
    windows,
  };
}

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
    providerModelHealth: normalizeProviderModelHealth(
      value.provider_model_health
    ),
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
