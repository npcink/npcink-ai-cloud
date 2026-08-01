import type { SupplierConnection } from './types';

export type ProviderCatalogPreviewModel = {
  model_id: string;
  family: string;
  feature: string;
  status: string;
  is_deprecated: boolean;
  runtime_supported: boolean;
  verified: boolean;
  capability_tags: string[];
};

export type ProviderCatalogPreview = {
  provider_id: string;
  display_name: string;
  adapter_type: string;
  model_count: number;
  model_ids: string[];
  models?: ProviderCatalogPreviewModel[];
  truncated: boolean;
};

export type ModelReferenceFeatureFilter =
  | 'all'
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'embedding';

export type ModelReferenceVisibilityFilter = 'all' | 'enabled' | 'disabled';

export type ModelReferenceIdentity = {
  model_id: string;
  provider_id?: string;
};

function modelIdentityKeys(modelId: string, providerId: string): Set<string> {
  const normalizedModelId = modelId.trim().toLowerCase();
  const normalizedProviderId = providerId.trim().toLowerCase();
  const keys = new Set<string>();
  if (!normalizedModelId) return keys;

  keys.add(normalizedModelId);
  const slashIndex = normalizedModelId.indexOf('/');
  if (slashIndex > 0 && slashIndex < normalizedModelId.length - 1) {
    keys.add(normalizedModelId.slice(slashIndex + 1));
  }
  if (normalizedProviderId && normalizedModelId.startsWith(`${normalizedProviderId}/`)) {
    keys.add(normalizedModelId.slice(normalizedProviderId.length + 1));
  }
  if (normalizedProviderId && !normalizedModelId.includes('/')) {
    keys.add(`${normalizedProviderId}/${normalizedModelId}`);
  }
  return keys;
}

function identitySetsOverlap(left: Set<string>, right: Set<string>): boolean {
  return Array.from(left).some((key) => right.has(key));
}

export function computeModelReferenceCoverage({
  providerId,
  targetModelIds,
  references,
}: {
  providerId: string;
  targetModelIds: string[];
  references: ModelReferenceIdentity[];
}): { covered: number; total: number } {
  const targetIdentitySets: Set<string>[] = [];
  for (const modelId of targetModelIds) {
    const keys = modelIdentityKeys(modelId, providerId);
    if (!keys.size || targetIdentitySets.some((existing) => identitySetsOverlap(existing, keys))) {
      continue;
    }
    targetIdentitySets.push(keys);
  }

  const referenceIdentitySets = references
    .map((reference) => modelIdentityKeys(reference.model_id, reference.provider_id || providerId))
    .filter((keys) => keys.size > 0);
  return {
    covered: targetIdentitySets.filter((target) => (
      referenceIdentitySets.some((reference) => identitySetsOverlap(target, reference))
    )).length,
    total: targetIdentitySets.length,
  };
}

export type ProviderConnectionForm = {
  providerPreset: string;
  connectionId: string;
  providerId: string;
  displayName: string;
  kind: string;
  baseUrl: string;
  sourceRole: string;
  capabilityIds: string;
  runtimeProfileIds: string;
  modelIds: string;
  imageResponseFormat: string;
  imageOutputHosts: string;
  credential: string;
  enabled: boolean;
};

export const EMPTY_PROVIDER_CONNECTION_FORM: ProviderConnectionForm = {
  providerPreset: 'openai_compatible',
  connectionId: '',
  providerId: 'openai',
  displayName: 'OpenAI Compatible',
  kind: 'openai_compatible',
  baseUrl: 'https://api.openai.com/v1',
  sourceRole: 'execution_source',
  capabilityIds: 'text_generation, image_generation',
  runtimeProfileIds: 'text.ai, text.free-gpt55, grok-imagine-image-quality',
  modelIds: '',
  imageResponseFormat: '',
  imageOutputHosts: '',
  credential: '',
  enabled: true,
};

export type ProviderWorkbenchState = {
  providerFormOpen: boolean;
  providerFormMode: 'create' | 'edit';
  credentialEditOpen: boolean;
  providerConnectionForm: ProviderConnectionForm;
  providerCatalogPreview: ProviderCatalogPreview | null;
  modelReferenceProviderId: string;
  modelReferenceSearch: string;
  modelReferenceFeatureFilter: ModelReferenceFeatureFilter;
  modelReferenceVisibilityFilter: ModelReferenceVisibilityFilter;
  modelReferenceShowDeprecated: boolean;
  modelReferencePage: number;
  confirmingClearModels: boolean;
  confirmingModelBatch: 'enable' | 'disable' | '';
  customModelInput: string;
};

export const INITIAL_PROVIDER_WORKBENCH_STATE: ProviderWorkbenchState = {
  providerFormOpen: false,
  providerFormMode: 'create',
  credentialEditOpen: true,
  providerConnectionForm: EMPTY_PROVIDER_CONNECTION_FORM,
  providerCatalogPreview: null,
  modelReferenceProviderId: 'openai',
  modelReferenceSearch: '',
  modelReferenceFeatureFilter: 'all',
  modelReferenceVisibilityFilter: 'all',
  modelReferenceShowDeprecated: false,
  modelReferencePage: 1,
  confirmingClearModels: false,
  confirmingModelBatch: '',
  customModelInput: '',
};

export type ProviderWorkbenchAction =
  | { type: 'open_create'; referenceProviderId: string }
  | {
      type: 'open_edit';
      form: ProviderConnectionForm;
      catalogPreview: ProviderCatalogPreview | null;
      referenceProviderId: string;
    }
  | { type: 'close' }
  | { type: 'reset_after_save' }
  | {
      type: 'patch_form';
      patch: Partial<ProviderConnectionForm>;
      referenceProviderId?: string;
      invalidateCatalog?: boolean;
    }
  | { type: 'apply_preset'; form: ProviderConnectionForm; referenceProviderId: string }
  | {
      type: 'set_model_ids';
      modelIds: string;
      referenceProviderId?: string;
    }
  | { type: 'set_catalog_preview'; preview: ProviderCatalogPreview | null }
  | { type: 'set_reference_provider'; providerId: string }
  | { type: 'set_reference_search'; search: string }
  | { type: 'set_reference_feature_filter'; filter: ModelReferenceFeatureFilter }
  | {
      type: 'set_reference_visibility_filter';
      filter: ModelReferenceVisibilityFilter;
    }
  | { type: 'set_show_deprecated'; show: boolean }
  | { type: 'set_reference_page'; page: number }
  | { type: 'set_custom_model_input'; value: string }
  | { type: 'set_confirming_clear_models'; confirming: boolean }
  | { type: 'set_confirming_model_batch'; batch: 'enable' | 'disable' | '' }
  | { type: 'set_credential_edit_open'; open: boolean }
  | { type: 'cancel_credential_edit' };

export function providerWorkbenchReducer(
  state: ProviderWorkbenchState,
  action: ProviderWorkbenchAction
): ProviderWorkbenchState {
  switch (action.type) {
    case 'open_create':
      return {
        ...INITIAL_PROVIDER_WORKBENCH_STATE,
        providerFormOpen: true,
        modelReferenceProviderId: action.referenceProviderId,
        modelReferenceShowDeprecated: true,
        modelReferencePage: 1,
      };
    case 'open_edit':
      return {
        ...INITIAL_PROVIDER_WORKBENCH_STATE,
        providerFormOpen: true,
        providerFormMode: 'edit',
        credentialEditOpen: false,
        providerConnectionForm: action.form,
        providerCatalogPreview: action.catalogPreview,
        modelReferenceProviderId: action.referenceProviderId,
        modelReferenceShowDeprecated: true,
        modelReferencePage: 1,
      };
    case 'close':
      return {
        ...state,
        providerFormOpen: false,
        credentialEditOpen: true,
        confirmingClearModels: false,
        confirmingModelBatch: '',
      };
    case 'reset_after_save':
      return {
        ...state,
        providerFormOpen: false,
        providerFormMode: 'create',
        credentialEditOpen: true,
        providerConnectionForm: EMPTY_PROVIDER_CONNECTION_FORM,
        providerCatalogPreview: null,
        modelReferencePage: 1,
        confirmingClearModels: false,
        confirmingModelBatch: '',
        customModelInput: '',
      };
    case 'patch_form':
      return {
        ...state,
        providerConnectionForm: {
          ...state.providerConnectionForm,
          ...action.patch,
        },
        providerCatalogPreview: action.invalidateCatalog
          ? null
          : state.providerCatalogPreview,
        modelReferenceProviderId:
          action.referenceProviderId ?? state.modelReferenceProviderId,
      };
    case 'apply_preset':
      return {
        ...state,
        providerConnectionForm: action.form,
        providerCatalogPreview: null,
        modelReferenceProviderId: action.referenceProviderId,
        modelReferenceSearch: '',
        modelReferenceFeatureFilter: 'all',
        modelReferenceVisibilityFilter: 'all',
        modelReferenceShowDeprecated: true,
        modelReferencePage: 1,
        customModelInput: '',
        confirmingClearModels: false,
        confirmingModelBatch: '',
      };
    case 'set_model_ids':
      return {
        ...state,
        providerConnectionForm: {
          ...state.providerConnectionForm,
          modelIds: action.modelIds,
        },
        modelReferenceProviderId:
          action.referenceProviderId ?? state.modelReferenceProviderId,
        confirmingClearModels: false,
        confirmingModelBatch: '',
        modelReferencePage: 1,
      };
    case 'set_catalog_preview':
      return { ...state, providerCatalogPreview: action.preview };
    case 'set_reference_provider':
      return { ...state, modelReferenceProviderId: action.providerId, modelReferencePage: 1, confirmingModelBatch: '' };
    case 'set_reference_search':
      return { ...state, modelReferenceSearch: action.search, modelReferencePage: 1, confirmingModelBatch: '' };
    case 'set_reference_feature_filter':
      return { ...state, modelReferenceFeatureFilter: action.filter, modelReferencePage: 1, confirmingModelBatch: '' };
    case 'set_reference_visibility_filter':
      return { ...state, modelReferenceVisibilityFilter: action.filter, modelReferencePage: 1, confirmingModelBatch: '' };
    case 'set_show_deprecated':
      return { ...state, modelReferenceShowDeprecated: action.show, modelReferencePage: 1, confirmingModelBatch: '' };
    case 'set_reference_page':
      return { ...state, modelReferencePage: Math.max(1, Math.floor(action.page)) };
    case 'set_custom_model_input':
      return { ...state, customModelInput: action.value };
    case 'set_confirming_clear_models':
      return { ...state, confirmingClearModels: action.confirming, confirmingModelBatch: '' };
    case 'set_confirming_model_batch':
      return { ...state, confirmingModelBatch: action.batch, confirmingClearModels: false };
    case 'set_credential_edit_open':
      return { ...state, credentialEditOpen: action.open };
    case 'cancel_credential_edit':
      return {
        ...state,
        credentialEditOpen: false,
        providerConnectionForm: {
          ...state.providerConnectionForm,
          credential: '',
        },
      };
  }
}

export function buildProviderConnectionForm(
  connection: SupplierConnection,
  providerPreset: string
): ProviderConnectionForm {
  return {
    providerPreset,
    connectionId: connection.connection_id,
    providerId: connection.provider_id,
    displayName: connection.display_name,
    kind: connection.kind,
    baseUrl: connection.base_url || '',
    sourceRole: 'execution_source',
    capabilityIds: connection.capability_ids.join(', '),
    runtimeProfileIds: connection.runtime_profile_ids.join(', '),
    modelIds: (connection.model_ids || []).join(', '),
    imageResponseFormat: String(connection.config?.image_response_format || ''),
    imageOutputHosts: Array.isArray(connection.config?.image_output_hosts)
      ? connection.config.image_output_hosts.map(String).join(', ')
      : '',
    credential: '',
    enabled: connection.enabled,
  };
}
