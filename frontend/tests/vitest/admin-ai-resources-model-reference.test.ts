import { describe, expect, it } from 'vitest';
import { modelIdentityKeys } from '@/features/admin/ai-resources/model-reference-identity';
import {
  buildModelVisibilityRows,
  formatReferenceContext,
  formatReferencePrice,
  modelReferenceSourceNeedsSync,
  normalizeProviderCatalogPreview,
  type ModelReferenceEntry,
} from '@/features/admin/ai-resources/model-reference-model';

const reference: ModelReferenceEntry = {
  source_id: 'models.dev',
  source_label: 'Models.dev',
  provider_id: 'openai',
  provider_label: 'OpenAI',
  model_id: 'openai/gpt-5.5',
  display_name: 'GPT 5.5',
  family: 'gpt',
  feature: 'text_generation',
  status: 'active',
  modalities: { input: ['text'], output: ['text'] },
  capability_flags: { reasoning: true, tool_call: true },
  context_window: 400_000,
  output_limit: 128_000,
  price: {
    input: 1.25,
    output: 10,
    cache_read: 0.125,
    unit: 'usd_per_million_tokens',
    billing_truth: false,
  },
  source_updated_at: '2026-08-15T00:00:00Z',
  synced_at: '2026-08-15T00:01:00Z',
  is_deprecated: false,
  override_present: false,
};

describe('AI resources model reference projection', () => {
  it('normalizes provider-qualified model identities once for every consumer', () => {
    expect(modelIdentityKeys('OpenAI/GPT-5.5', 'openai')).toEqual(new Set([
      'openai/gpt-5.5',
      'gpt-5.5',
    ]));
    expect(modelIdentityKeys('gpt-5.5', 'openai')).toEqual(new Set([
      'gpt-5.5',
      'openai/gpt-5.5',
    ]));
  });

  it('normalizes untrusted catalog previews without retaining malformed rows', () => {
    expect(normalizeProviderCatalogPreview(null)).toBeNull();
    expect(normalizeProviderCatalogPreview({
      provider_id: 'openai',
      model_count: 2,
      models: [
        { model_id: 'gpt-5.5', feature: 'text', capability_tags: ['reasoning'] },
        { model_id: '' },
      ],
    })).toMatchObject({
      provider_id: 'openai',
      model_count: 2,
      model_ids: ['gpt-5.5'],
      models: [{ model_id: 'gpt-5.5', capability_tags: ['reasoning'] }],
    });
  });

  it('merges reference and upstream catalog evidence around the saved model identity', () => {
    const rows = buildModelVisibilityRows({
      references: [reference],
      catalogPreview: normalizeProviderCatalogPreview({
        provider_id: 'openai',
        models: [{
          model_id: 'gpt-5.5',
          family: 'gpt',
          feature: 'text',
          verified: true,
        }],
      }),
      selectedModelIds: ['gpt-5.5', 'manual-audio'],
      providerId: 'openai',
      search: '',
      featureFilter: 'all',
      visibilityFilter: 'all',
      intelligenceFilter: 'all',
      showDeprecated: false,
      upstreamLabel: 'Upstream catalog',
      manualLabel: 'Manually added',
      enabledOnlyLabel: 'Saved model ID only',
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      modelId: 'gpt-5.5',
      selected: true,
      verified: true,
      sourceKind: 'reference',
      reference,
    });
    expect(rows[1]).toMatchObject({
      modelId: 'manual-audio',
      selected: true,
      sourceKind: 'manual',
    });
  });

  it('preserves accepted sync, context, price, and missing-intelligence semantics', () => {
    expect(modelReferenceSourceNeedsSync(null, 0)).toBe(true);
    expect(modelReferenceSourceNeedsSync({
      source_id: 'models.dev',
      display_name: 'Models.dev',
      source_url: 'https://models.dev',
      status: 'active',
      last_synced_at: '2026-08-15T00:00:00Z',
      last_error_code: '',
      last_error_message: '',
    }, 0)).toBe(false);
    expect(formatReferenceContext(reference, 'Missing')).not.toBe('Missing');
    expect(formatReferencePrice(reference, 'cache', 'Missing')).toBe('$1.25 / $10 · cache $0.125 / -');
    expect(buildModelVisibilityRows({
      references: [reference],
      catalogPreview: null,
      selectedModelIds: ['manual-model'],
      providerId: 'openai',
      search: '',
      featureFilter: 'all',
      visibilityFilter: 'all',
      intelligenceFilter: 'missing',
      showDeprecated: true,
      upstreamLabel: 'Upstream catalog',
      manualLabel: 'Manually added',
      enabledOnlyLabel: 'Saved model ID only',
    }).map((row) => row.modelId)).toEqual(['manual-model']);
  });
});
