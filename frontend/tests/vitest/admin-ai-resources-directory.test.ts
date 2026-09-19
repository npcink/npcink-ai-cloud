import { describe, expect, it, vi } from 'vitest';
import {
  aiResourcesKeys,
  fetchAiResourcesDirectory,
  normalizeAiResourcesDirectory,
  normalizeProviderModelHealth,
  type AiResourcesDirectoryRequest,
} from '@/features/admin/ai-resources/directory';

describe('AI resources directory query identity', () => {
  it('uses one stable feature-owned key for the provider directory', () => {
    expect(aiResourcesKeys.directory()).toEqual([
      'admin',
      'ai-resources',
      'directory',
    ]);
  });
});

describe('AI resources directory request lifecycle', () => {
  it('normalizes a missing connection collection to an empty directory', () => {
    expect(normalizeAiResourcesDirectory(null)).toEqual({
      connections: [],
      providerModelHealth: null,
    });
    expect(normalizeAiResourcesDirectory({ connections: 'invalid' })).toEqual({
      connections: [],
      providerModelHealth: null,
    });
  });

  it('passes query cancellation through and preserves Cloud-owned connection data', async () => {
    const controller = new AbortController();
    const connection = {
      connection_id: 'model_ready',
      provider_id: 'openai',
      display_name: 'MQZJ',
      kind: 'openai_compatible',
      enabled: true,
      configured: true,
      status: 'ready',
      base_url: 'https://example.test/v1',
      capability_ids: ['text_generation'],
      runtime_profile_ids: ['text.ai'],
      model_ids: ['gpt-5.5'],
      managed_by: 'cloud_provider_connections',
      metadata: {},
    };
    const request: AiResourcesDirectoryRequest = vi.fn(async (signal) => {
      expect(signal).toBe(controller.signal);
      return { connections: [connection] };
    });

    await expect(
      fetchAiResourcesDirectory(controller.signal, request)
    ).resolves.toEqual({
      connections: [connection],
      providerModelHealth: null,
    });
  });

  it('does not turn an aborted request into an empty healthy directory', async () => {
    const controller = new AbortController();
    const request: AiResourcesDirectoryRequest = vi.fn(async () => {
      controller.abort(new Error('obsolete provider directory request'));
      throw controller.signal.reason;
    });

    await expect(
      fetchAiResourcesDirectory(controller.signal, request)
    ).rejects.toThrow('obsolete provider directory request');
  });
});

describe('AI resources provider model health normalization', () => {
  const healthPayload = {
    source: 'provider_call_records',
    content_exposed: false,
    recent_call_limit: 200,
    default_window_id: 'last_24h',
    windows: [
      {
        window_id: 'last_24h',
        label: 'Last 24h',
        hours: 24,
        rows: [
          {
            provider_id: 'openai',
            model_id: 'gpt-5.5',
            status: 'healthy',
            call_count: 412,
            success_count: 410,
            error_count: 2,
            success_rate: 0.9951,
            avg_latency_ms: 1804.6,
            p95_latency_ms: 4120,
            tokens_in: 12000,
            tokens_out: 34000,
            cost: 0.8621,
            retry_count: 1,
            fallback_count: 2,
            last_error_code: '',
            last_observed_at: '2026-09-18T06:00:00Z',
          },
          {
            provider_id: '',
            model_id: 'dropped-row-missing-provider',
          },
          'not-an-object',
        ],
      },
      {
        window_id: 'last_7d',
        label: 'Last 7d',
        hours: 168,
        rows: [],
      },
    ],
    boundary: { not_a_control_plane: true },
  };

  it('normalizes windows and rows and drops incomplete rows', () => {
    const health = normalizeProviderModelHealth(healthPayload);
    expect(health).not.toBeNull();
    expect(health?.default_window_id).toBe('last_24h');
    expect(health?.windows).toHaveLength(2);
    expect(health?.windows[0].rows).toHaveLength(1);
    const row = health?.windows[0].rows[0];
    expect(row).toMatchObject({
      provider_id: 'openai',
      model_id: 'gpt-5.5',
      status: 'healthy',
      call_count: 412,
      avg_latency_ms: 1805,
      p95_latency_ms: 4120,
      cost: 0.8621,
      fallback_count: 2,
    });
  });

  it('keeps an unknown default window id on the first window', () => {
    const health = normalizeProviderModelHealth({
      ...healthPayload,
      default_window_id: 'missing_window',
    });
    expect(health?.default_window_id).toBe('last_24h');
  });

  it('returns null for missing, malformed, or windowless payloads', () => {
    expect(normalizeProviderModelHealth(null)).toBeNull();
    expect(normalizeProviderModelHealth('invalid')).toBeNull();
    expect(normalizeProviderModelHealth({})).toBeNull();
    expect(normalizeProviderModelHealth({ windows: [] })).toBeNull();
    expect(
      normalizeProviderModelHealth({ windows: [{ label: 'no id' }] })
    ).toBeNull();
  });

  it('keeps health evidence attached to the normalized directory', () => {
    const directory = normalizeAiResourcesDirectory({
      provider_model_health: healthPayload,
    });
    expect(directory.connections).toEqual([]);
    expect(directory.providerModelHealth?.windows).toHaveLength(2);
  });
});
