'use client';

import { useLocale } from '@/contexts/LocaleContext';
import { EDITABLE_MODEL_FEATURES, type EditableModelFeature, type ImageCapabilities } from './model-capabilities';

export function ModelCapabilityFields({ modelId, feature, capabilities, disabled, onFeatureChange, onImageChange }: {
  modelId: string;
  feature: string;
  capabilities: ImageCapabilities;
  disabled: boolean;
  onFeatureChange: (feature: EditableModelFeature) => void;
  onImageChange: (capabilities: ImageCapabilities) => void;
}) {
  const { t } = useLocale();
  return <fieldset data-ui="model-capability-fields" className="grid gap-2 border-b border-slate-200 pb-3 dark:border-slate-700" disabled={disabled}>
    <legend className="font-semibold text-slate-700 dark:text-slate-200">{t('admin.model_capabilities.edit')}</legend>
    <select className="input w-full text-xs" aria-label={`${modelId} ${t('admin.model_capabilities.type')}`}
      value={feature} onChange={event => onFeatureChange(event.target.value as EditableModelFeature)}>
      {!EDITABLE_MODEL_FEATURES.includes(feature as EditableModelFeature) ? <option value={feature}>{t('admin.model_capabilities.unknown')}</option> : null}
      {EDITABLE_MODEL_FEATURES.map(value => <option key={value} value={value}>{t(`admin.model_capabilities.${value === 'image_generation' ? 'image' : value}`)}</option>)}
    </select>
    {feature === 'image_generation' ? (['image_generation', 'image_editing'] as const).map(capability => <label key={capability} className="flex cursor-pointer items-center gap-2">
      <input type="checkbox" className="h-4 w-4" aria-label={`${modelId} ${t(`admin.image_capabilities.${capability}`)}`}
        checked={capabilities[capability]} onChange={event => onImageChange({ ...capabilities, [capability]: event.target.checked })} />
      <span>{t(`admin.image_capabilities.${capability}`)}</span>
    </label>) : null}
  </fieldset>;
}
