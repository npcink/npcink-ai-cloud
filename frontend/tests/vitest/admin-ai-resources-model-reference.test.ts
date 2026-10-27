import { describe, expect, it } from 'vitest';
import { modelIdentityKeys, upstreamModelId } from '@/features/admin/ai-resources/model-reference-identity';
import {
  buildModelVisibilityRows,
  formatReferenceContext,
  formatReferencePrice,
  modelReferenceSourceNeedsSync,
  modelReferenceFreshness,
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
  it('keeps upstream vendor paths and case-sensitive IDs distinct', () => {
    const first = modelIdentityKeys('gateway/vendorA/foo', 'gateway');
    const second = modelIdentityKeys('gateway/vendorB/foo', 'gateway');
    expect([...first].some((key) => second.has(key))).toBe(false);
    expect(modelIdentityKeys('Qwen/Qwen3', '')).toEqual(new Set(['Qwen/Qwen3']));
    expect(modelIdentityKeys('gateway/Qwen/Qwen3', 'gateway')).toEqual(new Set(['Qwen/Qwen3', 'gateway/Qwen/Qwen3']));
    expect(modelIdentityKeys('Foo', 'gateway').has('foo')).toBe(false);
    expect(upstreamModelId('deepseek/deepseek-flash', 'deepseek')).toBe('deepseek-flash');
    expect(upstreamModelId('Qwen/Qwen3', 'gateway')).toBe('Qwen/Qwen3');
  });

  it('normalizes provider-qualified model identities once for every consumer', () => {
    expect(modelIdentityKeys('openai/gpt-5.5', 'openai')).toEqual(new Set([
      'openai/gpt-5.5',
      'gpt-5.5',
    ]));
    expect(modelIdentityKeys('gpt-5.5', 'openai')).toEqual(new Set([
      'gpt-5.5',
      'openai/gpt-5.5',
    ]));
  });

  it('merges explicit reference namespaces with a custom connection namespace and uses account capabilities', () => {
    const rows = buildModelVisibilityRows({
      references: [{ ...reference, model_id: 'openai/gpt-5.5', feature: 'text_generation' }],
      catalogPreview: normalizeProviderCatalogPreview({ models: [{ model_id: 'gateway/gpt-5.5', upstream_model_id: 'gpt-5.5', feature: 'vision' }] }),
      selectedModelIds: [], providerId: 'openai', namespacePrefix: 'gateway', search: '',
      featureFilter: 'text', visibilityFilter: 'all', intelligenceFilter: 'all', showDeprecated: false,
      upstreamLabel: 'Account', manualLabel: 'Manual', enabledOnlyLabel: 'Saved',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ modelId: 'gateway/gpt-5.5', sourceKind: 'catalog', feature: 'vision', selected: false });
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
      sourceKind: 'catalog',
      reference,
    });
    expect(rows[1]).toMatchObject({
      modelId: 'manual-audio',
      selected: true,
      sourceKind: 'manual',
    });
  });

  it('merges prefixed and bare catalog identities even before either model is selected', () => {
    const options = {
      references: [reference], catalogPreview: normalizeProviderCatalogPreview({ models: [{ model_id: 'gpt-5.5', feature: 'text' }] }),
      selectedModelIds: [], providerId: 'openai', search: '',
      featureFilter: 'all' as const, visibilityFilter: 'all' as const, intelligenceFilter: 'all' as const,
      showDeprecated: false, upstreamLabel: 'Account', manualLabel: 'Manual', enabledOnlyLabel: 'Saved',
    };
    expect(buildModelVisibilityRows(options)).toHaveLength(1);
    expect(buildModelVisibilityRows(options)[0]).toMatchObject({ modelId: 'gpt-5.5', reference, sourceKind: 'catalog', selected: false });
  });

  it('keeps account evidence separate from reference-only models and retains unconfirmed saved IDs', () => {
    const options = {
      references: [reference], catalogPreview: normalizeProviderCatalogPreview({ models: [{ model_id: 'account-model', feature: 'text' }] }),
      selectedModelIds: ['saved-model'], providerId: 'openai', search: '',
      featureFilter: 'all' as const, visibilityFilter: 'all' as const, intelligenceFilter: 'all' as const,
      showDeprecated: false, upstreamLabel: 'Account', manualLabel: 'Manual', enabledOnlyLabel: 'Saved',
    };
    expect(buildModelVisibilityRows({ ...options, sourceScope: 'account' }).map(row => row.modelId)).toEqual(['saved-model', 'account-model']);
    expect(buildModelVisibilityRows({ ...options, sourceScope: 'reference' }).map(row => row.modelId)).toEqual(['openai/gpt-5.5']);
    const distinct = buildModelVisibilityRows({ ...options,
      references: [{ ...reference, provider_id: 'deepseek', model_id: 'deepseek-v4-flash' }],
      providerId: 'deepseek', selectedModelIds: ['deepseek-v4-flash'],
      catalogPreview: normalizeProviderCatalogPreview({ models: [{ model_id: 'deepseek/deepseek-flash', feature: 'text' }] }),
    });
    expect(distinct).toHaveLength(2);
    const historicalAccount = { ...options,
      references: [{ ...reference, is_deprecated: true }],
      catalogPreview: normalizeProviderCatalogPreview({ models: [{ model_id: 'gpt-5.5', feature: 'text' }] }),
      selectedModelIds: [],
    };
    expect(buildModelVisibilityRows({ ...historicalAccount, sourceScope: 'account' })).toHaveLength(1);
    expect(buildModelVisibilityRows({ ...historicalAccount, sourceScope: 'reference' })).toHaveLength(0);
  });

  it('refreshes missing, failed, invalid or day-old sources but reuses a recent successful check', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const source = { source_id: 'models.dev', display_name: 'models.dev', source_url: 'https://models.dev', status: 'active', last_synced_at: '2026-10-27T11:00:00Z', last_error_code: '', last_error_message: '' };
    expect(modelReferenceSourceNeedsSync(source, now)).toBe(false);
    expect(modelReferenceSourceNeedsSync({ ...source, last_synced_at: '2026-10-26T12:00:01Z' }, now)).toBe(false);
    for (const last_synced_at of ['', 'invalid', '2026-10-26T12:00:00Z', '2026-10-25T12:00:00Z', '2026-10-27T13:00:00Z']) {
      expect(modelReferenceSourceNeedsSync({ ...source, last_synced_at }, now)).toBe(true);
    }
    expect(modelReferenceSourceNeedsSync({ ...source, status: 'error' }, now)).toBe(true);
    expect(modelReferenceSourceNeedsSync(null, now)).toBe(true);
  });

  it('never treats a retained old record as current just because its source was refreshed', () => {
    const now = Date.parse('2026-10-27T12:00:00Z');
    const source = { source_id: 'models.dev', display_name: 'models.dev', source_url: 'https://models.dev', status: 'active', last_synced_at: '2026-10-27T11:00:00Z', last_error_code: '', last_error_message: '' };
    expect(modelReferenceFreshness(reference, source, now)).toBe('superseded');
    const current = { ...reference, synced_at: source.last_synced_at };
    expect(modelReferenceFreshness(current, source, now)).toBe('current');
    expect(modelReferenceFreshness(current, source, Date.parse('2026-10-28T11:00:00Z'))).toBe('expired');
    expect(modelReferenceFreshness(current, { ...source, status: 'error' }, now)).toBe('unconfirmed');
    expect(modelReferenceFreshness(current, null, now)).toBe('unconfirmed');
    expect(modelReferenceFreshness({ ...current, synced_at: '2026-10-27T11:01:00Z' }, source, now)).toBe('unconfirmed');
    expect(modelReferenceFreshness({ ...current, synced_at: 'invalid' }, source, now)).toBe('unconfirmed');
    expect(modelReferenceFreshness({ ...current, synced_at: '2026-10-28T00:00:00Z' }, source, now)).toBe('unconfirmed');
    expect(modelReferenceFreshness(current, { ...source, source_id: 'another-source' }, now)).toBe('unconfirmed');
  });

  it('preserves accepted sync, context, price, and missing-intelligence semantics', () => {
    expect(modelReferenceSourceNeedsSync(null, Date.parse('2026-08-15T01:00:00Z'))).toBe(true);
    expect(modelReferenceSourceNeedsSync({
      source_id: 'models.dev',
      display_name: 'Models.dev',
      source_url: 'https://models.dev',
      status: 'active',
      last_synced_at: '2026-08-15T00:00:00Z',
      last_error_code: '',
      last_error_message: '',
    }, Date.parse('2026-08-15T01:00:00Z'))).toBe(false);
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
