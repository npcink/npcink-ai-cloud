import { describe, expect, it, vi } from 'vitest';
import {
  aiResourcesKeys,
  fetchAiResourcesDirectory,
  normalizeAiResourcesDirectory,
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
    expect(normalizeAiResourcesDirectory(null)).toEqual({ connections: [] });
    expect(normalizeAiResourcesDirectory({ connections: 'invalid' })).toEqual({
      connections: [],
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
    ).resolves.toEqual({ connections: [connection] });
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
