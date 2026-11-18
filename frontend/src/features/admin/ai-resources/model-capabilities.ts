import { modelIdentityKeys, upstreamModelId } from './model-reference-identity';

export type ImageCapability = 'image_generation' | 'image_editing';
export type ImageCapabilities = Record<ImageCapability, boolean>;
export type ModelMetadataOverrides = Record<string, Record<string, unknown>>;
export type ImageCapabilityDeclarations = Partial<Record<ImageCapability, { supported: boolean }>>;
type CapabilityModel = {
  model_id: string;
  upstream_model_id?: string;
  feature?: string;
  image_capability_declarations?: ImageCapabilityDeclarations;
};

export function imageCapabilityOverrideKey(overrides: ModelMetadataOverrides, modelId: string, namespacePrefix: string): string {
  if (Object.hasOwn(overrides, modelId)) return modelId;
  return Object.keys(overrides).find(key => modelIdentityKeys(key, namespacePrefix).has(modelId)) || modelId;
}

export function modelMetadataOverrides(value: unknown): ModelMetadataOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => (
    entry && typeof entry === 'object' && !Array.isArray(entry)
  ))) as ModelMetadataOverrides;
}

export function imageCapabilities(
  override: Record<string, unknown> = {}, declarations: ImageCapabilityDeclarations = {}, feature = '',
): ImageCapabilities {
  const saved = override.image_capabilities as Partial<ImageCapabilities> | undefined;
  const legacy = override.source && override.revision
    ? Array.isArray(override.endpoint_variants) ? override.endpoint_variants
      : ['image_generations', 'image_edits'].includes(String(override.endpoint_variant)) ? [override.endpoint_variant] : null
    : null;
  const enabled = (capability: ImageCapability, endpoint: string) => typeof saved?.[capability] === 'boolean'
    ? saved[capability] : legacy ? legacy.includes(endpoint)
      : declarations[capability]?.supported ?? (capability === 'image_generation' && feature === 'image_generation');
  return { image_generation: enabled('image_generation', 'image_generations'), image_editing: enabled('image_editing', 'image_edits') };
}

export function updateImageCapabilities(
  overrides: ModelMetadataOverrides, modelId: string, existingKey: string, capabilities: ImageCapabilities,
): ModelMetadataOverrides {
  const existing = overrides[existingKey] || {};
  const next = { ...overrides };
  delete next[existingKey];
  // Preserve prices, context, response format and legacy route identity.
  return { ...next, [modelId]: { ...existing, image_capabilities: capabilities } };
}

/** Saving captures initial image values once; later directory refreshes cannot replace them. */
export function saveImageCapabilities(
  overrides: ModelMetadataOverrides, selectedIds: string[], models: CapabilityModel[], namespacePrefix: string,
): ModelMetadataOverrides {
  let next = overrides;
  for (const selectedId of selectedIds) {
    const modelId = upstreamModelId(selectedId, namespacePrefix);
    const model = models.find(item => modelIdentityKeys(item.model_id, namespacePrefix).has(modelId));
    const key = imageCapabilityOverrideKey(next, modelId, namespacePrefix);
    const override = next[key];
    const capabilities = imageCapabilities(override, model?.image_capability_declarations, model?.feature);
    if (override?.image_capabilities || override?.endpoint_variants
      || ['image_generations', 'image_edits'].includes(String(override?.endpoint_variant))
      || model?.feature === 'image_generation' || Object.values(capabilities).some(Boolean)) {
      next = updateImageCapabilities(next, modelId, key, capabilities);
    }
  }
  return next;
}

export type EditableModelFeature = 'text' | 'vision' | 'embedding' | 'image_generation';
export const EDITABLE_MODEL_FEATURES: EditableModelFeature[] = ['text', 'vision', 'embedding', 'image_generation'];

export function modelFeature(override: Record<string, unknown> = {}, declarations: ImageCapabilityDeclarations = {}, feature = ''): string {
  if (Object.values(imageCapabilities(override, declarations, feature)).some(Boolean)) return 'image_generation';
  return EDITABLE_MODEL_FEATURES.includes(override.feature as EditableModelFeature) ? String(override.feature) : feature;
}

export function updateModelFeature(
  overrides: ModelMetadataOverrides, modelId: string, existingKey: string, feature: EditableModelFeature,
): ModelMetadataOverrides {
  const next = updateImageCapabilities(overrides, modelId, existingKey, {
    image_generation: feature === 'image_generation', image_editing: false,
  });
  return { ...next, [modelId]: { ...next[modelId], feature, source: 'operator_admin', revision: 'model-capabilities-v1' } };
}
