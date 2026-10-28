import { describe, expect, it } from 'vitest';
import { groupModelSuppliers, supplierGroupNeedsAttention, supplierGroupReady } from '@/features/admin/ai-resources/supplier-groups';
import type { SupplierConnection } from '@/features/admin/ai-resources/types';

const text: SupplierConnection = {
  connection_id: 'ollama-m4', provider_id: 'ollama-m4', display_name: 'Ollama M4',
  kind: 'openai_compatible', enabled: true, configured: true, status: 'ready',
  base_url: 'http://host.docker.internal:11434/v1', capability_ids: ['text_generation', 'vision'],
  runtime_profile_ids: ['wp-ai.editorial'], model_ids: ['qwen3.5:9b', 'qwen3-vl:2b'],
};
const embedding: SupplierConnection = {
  ...text, connection_id: 'ollama_m4_embedding', provider_id: 'ollama-m4-embedding',
  display_name: 'Ollama M4 Embedding', capability_ids: ['embedding'], runtime_profile_ids: ['embed.default'],
  model_ids: ['qwen3-embedding:0.6b'],
};

describe('M4 Ollama supplier presentation', () => {
  it('groups the shared service without merging models, changing IDs or hiding disabled connections', () => {
    const disabled = { ...text, connection_id: 'ollama_m4', enabled: false, status: 'disabled' };
    const input = [text, embedding, disabled];
    const before = structuredClone(input);
    const groups = groupModelSuppliers(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].displayName).toBe('Ollama M4');
    expect(groups[0].connections).toEqual(input);
    expect(groups[0].connections[1]).toBe(embedding);
    expect(input).toEqual(before);
    expect(supplierGroupReady(groups[0])).toBe(true);
    expect(supplierGroupNeedsAttention(groups[0])).toBe(false);
  });

  it('normalizes only equivalent endpoint spellings', () => {
    expect(groupModelSuppliers([text, { ...embedding, base_url: text.base_url + '/' }])).toHaveLength(1);
  });

  it.each([
    'http://other-host:11434/v1', 'http://host.docker.internal:11435/v1',
    'https://host.docker.internal:11434/v1', 'http://host.docker.internal:11434/other',
    '', 'not-a-url', 'http://host.docker.internal:11434/v1?tenant=other',
    'http://user@host.docker.internal:11434/v1',
  ])('does not combine distinct or ambiguous endpoints: %s', base_url => {
    expect(groupModelSuppliers([text, { ...embedding, base_url }])).toHaveLength(2);
  });

  it('does not infer supplier identity from a matching name or shared gateway URL', () => {
    const other = { ...text, connection_id: 'other', provider_id: 'another-provider' };
    expect(groupModelSuppliers([text, other])).toHaveLength(2);
    expect(groupModelSuppliers([text, { ...embedding, kind: 'embedding_provider' }])).toHaveLength(2);
  });

  it('retains group identity after filtering to a single embedding or disabled connection', () => {
    const all = groupModelSuppliers([text, embedding]);
    const filtered = groupModelSuppliers([embedding]);
    expect(filtered[0].key).toBe(all[0].key);
    expect(filtered[0].displayName).toBe('Ollama M4');
    const disabled = groupModelSuppliers([{ ...text, enabled: false, status: 'disabled' }])[0];
    expect(supplierGroupReady(disabled)).toBe(false);
    expect(supplierGroupNeedsAttention(disabled)).toBe(false);
  });

  it('does not count a partially broken supplier as ready or count it twice', () => {
    const groups = groupModelSuppliers([text, { ...embedding, status: 'missing_secret', configured: false }]);
    expect(groups).toHaveLength(1);
    expect(supplierGroupReady(groups[0])).toBe(false);
    expect(supplierGroupNeedsAttention(groups[0])).toBe(true);
  });

  it('preserves ordinary suppliers, order and empty results', () => {
    const other = { ...text, connection_id: 'openai', provider_id: 'openai', display_name: 'OpenAI' };
    expect(groupModelSuppliers([other, text, embedding]).map(group => group.displayName)).toEqual(['OpenAI', 'Ollama M4']);
    expect(groupModelSuppliers([])).toEqual([]);
  });
});
