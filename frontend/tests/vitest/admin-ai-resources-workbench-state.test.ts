import { describe, expect, it } from 'vitest';
import {
  buildProviderConnectionForm,
  EMPTY_PROVIDER_CONNECTION_FORM,
  INITIAL_PROVIDER_WORKBENCH_STATE,
  providerWorkbenchReducer,
  type ProviderCatalogPreview,
  type ProviderConnectionForm,
  type ProviderWorkbenchState,
} from '@/features/admin/ai-resources/provider-workbench-state';
import type { SupplierConnection } from '@/features/admin/ai-resources/types';

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
  modelReferenceShowDeprecated: false,
  confirmingClearModels: true,
  customModelInput: 'claude-opus-4',
};

describe('AI resources provider workbench state', () => {
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
      modelReferenceShowDeprecated: true,
      confirmingClearModels: false,
      customModelInput: '',
    });
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
      providerCatalogPreview: catalogPreview,
      modelReferenceProviderId: 'anthropic',
      modelReferenceShowDeprecated: true,
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
    expect(state.modelReferenceShowDeprecated).toBe(true);
    expect(state.confirmingClearModels).toBe(false);
    expect(state.customModelInput).toBe('');
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
