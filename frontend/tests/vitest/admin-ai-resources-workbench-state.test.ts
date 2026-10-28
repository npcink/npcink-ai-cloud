import { describe, expect, it } from 'vitest';
import {
  buildProviderConnectionForm,
  computeModelReferenceCoverage,
  EMPTY_PROVIDER_CONNECTION_FORM,
  hasProviderWorkbenchDraftChanges,
  INITIAL_PROVIDER_WORKBENCH_STATE,
  providerWorkbenchReducer,
  type ProviderCatalogPreview,
  type ProviderConnectionForm,
  type ProviderWorkbenchState,
} from '@/features/admin/ai-resources/provider-workbench-state';
import {
  isProviderConnectionDeletePreflight,
  type SupplierConnection,
} from '@/features/admin/ai-resources/types';
import {
  inferProviderPreset,
  providerReferenceLinksForConnection,
} from '@/features/admin/ai-resources/provider-presets';

const catalogPreview: ProviderCatalogPreview = {
  provider_id: 'anthropic',
  display_name: 'Anthropic',
  adapter_type: 'anthropic',
  model_count: 1,
  model_ids: ['claude-sonnet-4'],
  models: [
    {
      model_id: 'claude-sonnet-4',
      family: 'claude',
      feature: 'text',
      status: 'active',
      is_deprecated: false,
      runtime_supported: true,
      verified: true,
      capability_tags: ['text_generation'],
    },
  ],
  truncated: false,
};

const editedForm: ProviderConnectionForm = {
  ...EMPTY_PROVIDER_CONNECTION_FORM,
  providerPreset: 'anthropic',
  connectionId: 'anthropic_primary',
  providerId: 'anthropic',
  displayName: 'Anthropic Primary',
  kind: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  modelIds: 'claude-sonnet-4',
};

const staleWorkbench: ProviderWorkbenchState = {
  ...INITIAL_PROVIDER_WORKBENCH_STATE,
  providerFormOpen: true,
  providerFormMode: 'edit',
  credentialEditOpen: false,
  providerConnectionForm: editedForm,
  providerCatalogPreview: catalogPreview,
  modelReferenceProviderId: 'anthropic',
  modelReferenceSearch: 'sonnet',
  modelReferenceFeatureFilter: 'text',
  modelReferenceVisibilityFilter: 'enabled',
  modelReferenceIntelligenceFilter: 'missing',
  modelReferenceShowDeprecated: false,
  modelReferencePage: 4,
  confirmingClearModels: true,
  confirmingModelBatch: '',
};

describe('AI resources provider workbench state', () => {
  it('acknowledges server-saved image delivery without discarding concurrent drafts', () => {
    const opened = providerWorkbenchReducer(INITIAL_PROVIDER_WORKBENCH_STATE, {
      type: 'open_edit', form: editedForm, catalogPreview, referenceProviderId: 'anthropic',
    });
    const saved = {
      type: 'apply_saved_image_delivery' as const, connectionId: editedForm.connectionId,
      imageResponseFormat: 'url', imageOutputHosts: 'images.example.com',
    };
    const clean = providerWorkbenchReducer(opened, saved);
    expect(hasProviderWorkbenchDraftChanges(clean)).toBe(false);
    expect(clean.providerConnectionForm.imageOutputHosts).toBe('images.example.com');
    const draft = providerWorkbenchReducer(opened, {
      type: 'patch_form', patch: { displayName: 'New name', imageOutputHosts: 'draft.example.com' },
    });
    const retained = providerWorkbenchReducer(draft, saved);
    expect(retained.providerConnectionForm).toMatchObject({
      displayName: 'New name', imageOutputHosts: 'draft.example.com', imageResponseFormat: 'url',
    });
    expect(retained.initialProviderConnectionForm.imageOutputHosts).toBe('images.example.com');
    expect(hasProviderWorkbenchDraftChanges(retained)).toBe(true);
    expect(providerWorkbenchReducer(opened, { ...saved, connectionId: 'other' })).toBe(opened);
  });

  it('tracks only connection and selection changes as drafts', () => {
    expect(hasProviderWorkbenchDraftChanges(INITIAL_PROVIDER_WORKBENCH_STATE)).toBe(false);
    const state = providerWorkbenchReducer(INITIAL_PROVIDER_WORKBENCH_STATE, { type: 'set_model_ids', modelIds: 'account-model' });
    expect(hasProviderWorkbenchDraftChanges(state)).toBe(true);
  });

  it('rejects incomplete provider deletion preflight responses', () => {
    const valid = {
      surface: 'admin_provider_connection_delete_preflight',
      connection: {
        connection_id: 'anthropic_primary',
        provider_id: 'anthropic',
        display_name: 'Anthropic',
        enabled: true,
        configuration_status: 'ready',
      },
      expected_updated_at: '2026-08-15T00:00:00Z',
      impact: {
        risk_level: 'high',
        runtime_profile_ids: ['text.ai'],
        uncovered_runtime_profile_ids: ['text.ai'],
        capability_ids: ['text_generation'],
        model_count: 1,
        alternative_connections: [],
      },
      requires_confirmation: true,
    };
    expect(isProviderConnectionDeletePreflight(valid)).toBe(true);
    expect(isProviderConnectionDeletePreflight({ ...valid, impact: {} })).toBe(false);
    expect(isProviderConnectionDeletePreflight({ ...valid, expected_updated_at: '' })).toBe(false);
  });

  it('counts reference coverage by matching model identity instead of aggregate size', () => {
    expect(computeModelReferenceCoverage({
      providerId: 'openai',
      targetModelIds: ['gpt-a', 'gpt-b'],
      references: [
        { provider_id: 'openai', model_id: 'other-a' },
        { provider_id: 'openai', model_id: 'other-b' },
      ],
    })).toEqual({ covered: 0, total: 2 });

    expect(computeModelReferenceCoverage({
      providerId: 'openai',
      targetModelIds: ['gpt-a', 'openai/gpt-a'],
      references: [{ provider_id: 'openai', model_id: 'openai/gpt-a' }],
    })).toEqual({ covered: 1, total: 1 });
  });

  it('opens a clean create workflow without leaking the previous edit draft', () => {
    const state = providerWorkbenchReducer(staleWorkbench, {
      type: 'open_create',
      referenceProviderId: 'openai',
    });

    expect(state).toMatchObject({
      providerFormOpen: true,
      providerFormMode: 'create',
      credentialEditOpen: true,
      providerConnectionForm: EMPTY_PROVIDER_CONNECTION_FORM,
      providerCatalogPreview: null,
      modelReferenceProviderId: 'openai',
      modelReferenceSearch: '',
      modelReferenceFeatureFilter: 'all',
      modelReferenceVisibilityFilter: 'all',
      modelReferenceIntelligenceFilter: 'all',
      modelReferenceShowDeprecated: false,
      modelReferencePage: 1,
      confirmingClearModels: false,
    });
  });

  it('keeps the list preference outside saved supplier drafts and preserves it when opening another supplier', () => {
    const preferred = providerWorkbenchReducer(INITIAL_PROVIDER_WORKBENCH_STATE, { type: 'set_show_deprecated', show: true });
    expect(hasProviderWorkbenchDraftChanges(preferred)).toBe(false);
    const opened = providerWorkbenchReducer(preferred, { type: 'open_create', referenceProviderId: 'openai' });
    expect(opened.modelReferenceShowDeprecated).toBe(true);
    const edited = providerWorkbenchReducer(opened, { type: 'open_edit', form: editedForm, catalogPreview, referenceProviderId: 'openai' });
    expect(edited.modelReferenceShowDeprecated).toBe(true);
  });

  it('opens an edit workflow with one consistent form, preview, and reference owner', () => {
    const state = providerWorkbenchReducer(INITIAL_PROVIDER_WORKBENCH_STATE, {
      type: 'open_edit',
      form: editedForm,
      catalogPreview,
      referenceProviderId: 'anthropic',
    });

    expect(state).toMatchObject({
      providerFormOpen: true,
      providerFormMode: 'edit',
      credentialEditOpen: false,
      providerConnectionForm: editedForm,
      initialProviderConnectionForm: editedForm,
      providerCatalogPreview: catalogPreview,
      modelReferenceProviderId: 'anthropic',
      modelReferenceShowDeprecated: false,
      modelReferencePage: 1,
    });
  });

  it('updates form identity and invalidates a stale upstream catalog atomically', () => {
    const state = providerWorkbenchReducer(staleWorkbench, {
      type: 'patch_form',
      patch: {
        providerId: 'openai',
        baseUrl: 'https://api.openai.com/v1',
      },
      referenceProviderId: 'openai',
      invalidateCatalog: true,
    });

    expect(state.providerConnectionForm).toMatchObject({
      providerId: 'openai',
      baseUrl: 'https://api.openai.com/v1',
    });
    expect(state.modelReferenceProviderId).toBe('openai');
    expect(state.providerCatalogPreview).toBeNull();
    expect(hasProviderWorkbenchDraftChanges(state)).toBe(true);
  });

  it('distinguishes an unchanged edit snapshot from an unsaved provider draft', () => {
    const opened = providerWorkbenchReducer(INITIAL_PROVIDER_WORKBENCH_STATE, {
      type: 'open_edit',
      form: editedForm,
      catalogPreview,
      referenceProviderId: 'anthropic',
    });
    expect(hasProviderWorkbenchDraftChanges(opened)).toBe(false);

    const edited = providerWorkbenchReducer(opened, {
      type: 'patch_form',
      patch: { displayName: 'Anthropic Draft' },
    });
    expect(hasProviderWorkbenchDraftChanges(edited)).toBe(true);

    const closed = providerWorkbenchReducer(edited, { type: 'close' });
    expect(hasProviderWorkbenchDraftChanges(closed)).toBe(true);
    const reopened = providerWorkbenchReducer(closed, { type: 'reopen_draft' });
    expect(reopened.providerFormOpen).toBe(true);
    expect(reopened.providerConnectionForm.displayName).toBe('Anthropic Draft');
    expect(hasProviderWorkbenchDraftChanges(reopened)).toBe(true);
  });

  it('keeps the saved credential masked when replacement is cancelled', () => {
    const state = providerWorkbenchReducer(
      {
        ...staleWorkbench,
        credentialEditOpen: true,
        providerConnectionForm: {
          ...staleWorkbench.providerConnectionForm,
          credential: 'replacement-secret',
        },
      },
      { type: 'cancel_credential_edit' }
    );

    expect(state.credentialEditOpen).toBe(false);
    expect(state.providerConnectionForm.credential).toBe('');
    expect(state.providerCatalogPreview).toBe(catalogPreview);
  });

  it('changes the enabled model set and clears a pending destructive confirmation', () => {
    const state = providerWorkbenchReducer(staleWorkbench, {
      type: 'set_model_ids',
      modelIds: 'gpt-5.5, gpt-image-1',
      referenceProviderId: 'openai',
    });

    expect(state.providerConnectionForm.modelIds).toBe('gpt-5.5, gpt-image-1');
    expect(state.modelReferenceProviderId).toBe('openai');
    expect(state.confirmingClearModels).toBe(false);
    expect(state.modelReferencePage).toBe(1);
  });

  it('keeps filtered batch confirmation mutually exclusive with clear-all', () => {
    const batch = providerWorkbenchReducer(staleWorkbench, {
      type: 'set_confirming_model_batch',
      batch: 'disable',
    });
    expect(batch.confirmingModelBatch).toBe('disable');
    expect(batch.confirmingClearModels).toBe(false);

    const filtered = providerWorkbenchReducer(batch, {
      type: 'set_reference_search',
      search: 'audio',
    });
    expect(filtered.confirmingModelBatch).toBe('');
    expect(filtered.modelReferencePage).toBe(1);
  });

  it('applies a preset as one transition and resets stale model controls', () => {
    const nextForm = {
      ...editedForm,
      providerPreset: 'openai_compatible',
      providerId: 'openai',
      displayName: 'OpenAI Compatible',
      kind: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
    };
    const state = providerWorkbenchReducer(staleWorkbench, {
      type: 'apply_preset',
      form: nextForm,
      referenceProviderId: 'openai',
    });

    expect(state.providerConnectionForm).toEqual(nextForm);
    expect(state.providerCatalogPreview).toBeNull();
    expect(state.modelReferenceProviderId).toBe('openai');
    expect(state.modelReferenceSearch).toBe('');
    expect(state.modelReferenceFeatureFilter).toBe('all');
    expect(state.modelReferenceVisibilityFilter).toBe('all');
    expect(state.modelReferenceIntelligenceFilter).toBe('all');
    expect(state.modelReferenceShowDeprecated).toBe(false);
    expect(state.confirmingClearModels).toBe(false);
    expect(state.modelReferencePage).toBe(1);
  });

  it('keeps model pagination bounded and resets it when filters change', () => {
    const paged = providerWorkbenchReducer(staleWorkbench, {
      type: 'set_reference_page',
      page: 3.8,
    });
    expect(paged.modelReferencePage).toBe(3);

    const filtered = providerWorkbenchReducer(paged, {
      type: 'set_reference_visibility_filter',
      filter: 'disabled',
    });
    expect(filtered.modelReferenceVisibilityFilter).toBe('disabled');
    expect(filtered.modelReferencePage).toBe(1);

    const intelligenceFiltered = providerWorkbenchReducer(filtered, {
      type: 'set_reference_intelligence_filter',
      filter: 'missing',
    });
    expect(intelligenceFiltered.modelReferenceIntelligenceFilter).toBe('missing');
    expect(intelligenceFiltered.modelReferencePage).toBe(1);
  });

  it('closes safely and resets the workflow after a successful save', () => {
    const closed = providerWorkbenchReducer(staleWorkbench, { type: 'close' });
    expect(closed.providerFormOpen).toBe(false);
    expect(closed.credentialEditOpen).toBe(true);
    expect(closed.confirmingClearModels).toBe(false);
    expect(closed.providerConnectionForm).toBe(editedForm);

    const reset = providerWorkbenchReducer(closed, { type: 'reset_after_save' });
    expect(reset.providerFormOpen).toBe(false);
    expect(reset.providerFormMode).toBe('create');
    expect(reset.providerConnectionForm).toBe(EMPTY_PROVIDER_CONNECTION_FORM);
    expect(reset.initialProviderConnectionForm).toBe(EMPTY_PROVIDER_CONNECTION_FORM);
    expect(reset.providerCatalogPreview).toBeNull();
  });
});

describe('AI resources provider form projection', () => {
  it('projects a Cloud supplier connection into the editable workbench draft', () => {
    const connection: SupplierConnection = {
      connection_id: 'anthropic_primary',
      provider_id: 'anthropic',
      display_name: 'Anthropic Primary',
      kind: 'anthropic',
      enabled: true,
      configured: true,
      status: 'ready',
      base_url: 'https://api.anthropic.com',
      capability_ids: ['text_generation'],
      runtime_profile_ids: ['text.ai'],
      model_ids: ['claude-sonnet-4'],
      config: {
        image_response_format: 'url',
        image_output_hosts: ['cdn.example.test'],
      },
    };

    expect(buildProviderConnectionForm(connection, 'anthropic')).toEqual({
      providerPreset: 'anthropic',
      connectionId: 'anthropic_primary',
      providerId: 'anthropic',
      displayName: 'Anthropic Primary',
      kind: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      sourceRole: 'execution_source',
      capabilityIds: 'text_generation',
      runtimeProfileIds: 'text.ai',
      modelIds: 'claude-sonnet-4',
      imageResponseFormat: 'url',
      imageOutputHosts: 'cdn.example.test',
      credential: '',
      enabled: true,
    });
  });
});

describe('AI resources provider reference ownership', () => {
  const compatibleConnection: SupplierConnection = {
    connection_id: 'ollama_m4',
    provider_id: 'openai',
    display_name: 'Ollama M4',
    kind: 'openai_compatible',
    enabled: true,
    configured: true,
    status: 'ready',
    base_url: 'http://host.docker.internal:11434/v1',
    capability_ids: ['text_generation'],
    runtime_profile_ids: ['text.ai'],
    metadata: {},
  };

  it('does not project OpenAI links onto an Ollama-compatible connection', () => {
    expect(inferProviderPreset(compatibleConnection)).toBe('ollama');
    expect(providerReferenceLinksForConnection(compatibleConnection)).toMatchObject({
      websiteUrl: 'https://ollama.com/',
      docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    });
  });

  it('prefers saved supplier-specific links over inferred defaults', () => {
    expect(providerReferenceLinksForConnection({
      ...compatibleConnection,
      metadata: { docs_url: 'https://internal.example.test/provider-docs' },
    })).toEqual({
      websiteUrl: undefined,
      statusUrl: undefined,
      docsUrl: 'https://internal.example.test/provider-docs',
    });
  });
});
