export type ProviderPreset = {
  id: string;
  label: string;
  providerId: string;
  kind: string;
  displayName: string;
  baseUrl: string;
  websiteUrl?: string;
  statusUrl?: string;
  docsUrl?: string;
  capabilityIds: string;
  runtimeProfileIds: string;
  modelIds: string;
};

export type ProviderExternalLinkItem = {
  key: 'website' | 'status' | 'docs';
  labelKey: string;
  fallback: string;
  href: string;
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai_compatible', label: 'OpenAI Compatible', providerId: 'openai',
    kind: 'openai_compatible', displayName: 'OpenAI Compatible',
    baseUrl: 'https://api.openai.com/v1', websiteUrl: 'https://openai.com/',
    statusUrl: 'https://status.openai.com/', docsUrl: 'https://developers.openai.com/api/docs',
    capabilityIds: 'text_generation, image_generation',
    runtimeProfileIds: 'text.ai, text.free-gpt55, grok-imagine-image-quality', modelIds: '',
  },
  {
    id: 'newapi', label: 'New API / One API', providerId: 'newapi', kind: 'openai_compatible',
    displayName: 'New API channel', baseUrl: 'https://api.example.com/v1',
    websiteUrl: 'https://www.newapi.ai/en', docsUrl: 'https://www.newapi.ai/en/docs',
    capabilityIds: 'text_generation, image_generation',
    runtimeProfileIds: 'text.ai, text.free-gpt55, grok-imagine-image-quality', modelIds: '',
  },
  {
    id: 'deepseek', label: 'DeepSeek', providerId: 'deepseek', kind: 'openai_compatible',
    displayName: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    websiteUrl: 'https://www.deepseek.com/', statusUrl: 'https://status.deepseek.com/',
    docsUrl: 'https://api-docs.deepseek.com/', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: 'deepseek-v4-flash, deepseek-v4-pro',
  },
  {
    id: 'kimi', label: 'Kimi', providerId: 'kimi', kind: 'openai_compatible',
    displayName: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', websiteUrl: 'https://www.kimi.com/',
    docsUrl: 'https://platform.kimi.com/docs/api/overview', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: 'kimi-k2.6',
  },
  {
    id: 'doubao', label: 'Doubao / Volcengine Ark', providerId: 'doubao', kind: 'openai_compatible',
    displayName: 'Doubao / Volcengine Ark', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    websiteUrl: 'https://www.volcengine.com/product/ark',
    docsUrl: 'https://docs.volcengine.com/docs/82379/1795150', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: 'doubao-seed-2-0-lite-260215',
  },
  {
    id: 'xiaomi_mimo', label: 'Xiaomi MiMo', providerId: 'xiaomi_mimo', kind: 'openai_compatible',
    displayName: 'Xiaomi MiMo', baseUrl: 'https://api.xiaomimimo.com/v1',
    websiteUrl: 'https://mimo.mi.com/', docsUrl: 'https://mimo.mi.com/docs/quick-start/first-api-call',
    capabilityIds: 'text_generation', runtimeProfileIds: 'text.ai', modelIds: 'mimo-v2.5-pro',
  },
  {
    id: 'longcat', label: 'LongCat / Meituan', providerId: 'longcat', kind: 'openai_compatible',
    displayName: 'LongCat / Meituan', baseUrl: 'https://api.longcat.chat/openai/v1',
    websiteUrl: 'https://longcat.chat/', docsUrl: 'https://longcat.chat/platform/docs/APIDocs.html',
    capabilityIds: 'text_generation', runtimeProfileIds: 'text.ai', modelIds: 'LongCat-2.0',
  },
  {
    id: 'qwen', label: 'Qwen / Alibaba Cloud Model Studio', providerId: 'qwen', kind: 'openai_compatible',
    displayName: 'Qwen / Alibaba Cloud Model Studio',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    websiteUrl: 'https://www.aliyun.com/product/bailian',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/base-url', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: 'qwen3.6-plus',
  },
  {
    id: 'hunyuan', label: 'Hunyuan / Tencent TokenHub', providerId: 'hunyuan', kind: 'openai_compatible',
    displayName: 'Hunyuan / Tencent TokenHub', baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    websiteUrl: 'https://cloud.tencent.com/product/hunyuan',
    docsUrl: 'https://cloud.tencent.com/document/product/1729/131925', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: 'hy3-preview',
  },
  {
    id: 'zhipu_glm', label: 'Zhipu GLM', providerId: 'zhipu_glm', kind: 'openai_compatible',
    displayName: 'Zhipu GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    websiteUrl: 'https://www.bigmodel.cn/',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',
    capabilityIds: 'text_generation', runtimeProfileIds: 'text.ai', modelIds: 'glm-5.1',
  },
  {
    id: 'anthropic', label: 'Anthropic', providerId: 'anthropic', kind: 'anthropic',
    displayName: 'Anthropic', baseUrl: 'https://api.anthropic.com',
    websiteUrl: 'https://www.anthropic.com/', statusUrl: 'https://status.claude.com/',
    docsUrl: 'https://platform.claude.com/docs', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: 'claude-3-5-sonnet-latest',
  },
  {
    id: 'openrouter', label: 'OpenRouter', providerId: 'openrouter', kind: 'openrouter',
    displayName: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
    websiteUrl: 'https://openrouter.ai/', statusUrl: 'https://status.openrouter.ai/',
    docsUrl: 'https://openrouter.ai/docs', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: '',
  },
  {
    id: 'siliconflow', label: 'SiliconFlow', providerId: 'siliconflow', kind: 'siliconflow',
    displayName: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1',
    websiteUrl: 'https://www.siliconflow.com/',
    docsUrl: 'https://docs.siliconflow.com/en/userguide/introduction',
    capabilityIds: 'text_generation, embedding', runtimeProfileIds: 'text.ai, embed.default', modelIds: '',
  },
  {
    id: 'minimax', label: 'MiniMax', providerId: 'minimax', kind: 'minimax',
    displayName: 'MiniMax', baseUrl: '', websiteUrl: 'https://www.minimax.io/',
    statusUrl: 'https://status.minimax.io/', docsUrl: 'https://platform.minimax.io/docs',
    capabilityIds: 'text_generation, image_generation, audio_generation, video_generation',
    runtimeProfileIds: '', modelIds: '',
  },
  {
    id: 'ollama', label: 'Ollama', providerId: 'ollama', kind: 'openai_compatible',
    displayName: 'Ollama', baseUrl: 'http://localhost:11434/v1', websiteUrl: 'https://ollama.com/',
    docsUrl: 'https://docs.ollama.com/api/openai-compatibility',
    capabilityIds: 'text_generation, embedding', runtimeProfileIds: 'text.ai, embed.default', modelIds: '',
  },
  {
    id: 'custom', label: 'Custom', providerId: 'custom', kind: 'openai_compatible',
    displayName: 'Custom provider', baseUrl: '', capabilityIds: 'text_generation',
    runtimeProfileIds: 'text.ai', modelIds: '',
  },
];

export function providerPresetById(presetId: string): ProviderPreset {
  return PROVIDER_PRESETS.find((preset) => preset.id === presetId) || PROVIDER_PRESETS[0];
}

export function externalUrlValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function providerExternalLinkItems(values: {
  websiteUrl?: unknown;
  statusUrl?: unknown;
  docsUrl?: unknown;
}): ProviderExternalLinkItem[] {
  return [
    { key: 'website' as const, labelKey: 'provider_link_website', fallback: 'Website', href: externalUrlValue(values.websiteUrl) },
    { key: 'status' as const, labelKey: 'provider_link_status', fallback: 'Status', href: externalUrlValue(values.statusUrl) },
    { key: 'docs' as const, labelKey: 'provider_link_docs', fallback: 'Docs', href: externalUrlValue(values.docsUrl) },
  ].filter((item) => item.href);
}

export function providerReferenceLinksForForm(form: ProviderConnectionForm): ProviderPreset | Record<string, never> {
  const preset = providerPresetById(form.providerPreset);
  return preset.id === 'custom' ? {} : preset;
}

export function providerReferenceLinksForConnection(connection: SupplierConnection): {
  websiteUrl?: unknown;
  statusUrl?: unknown;
  docsUrl?: unknown;
} {
  const explicitLinks = {
    websiteUrl: connection.metadata?.website_url,
    statusUrl: connection.metadata?.status_url,
    docsUrl: connection.metadata?.docs_url,
  };
  if (providerExternalLinkItems(explicitLinks).length) return explicitLinks;

  const preset = providerPresetById(inferProviderPreset(connection));
  if (preset.id === 'custom') return {};
  if (
    preset.id === 'openai_compatible'
    && connection.provider_id.toLowerCase() !== 'openai'
    && !isExactOpenAIBaseUrl(connection.base_url)
  ) return {};
  return preset;
}

function isExactOpenAIBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'api.openai.com';
  } catch {
    return false;
  }
}

export function connectionExternalLinkItems(connection: SupplierConnection): ProviderExternalLinkItem[] {
  return providerExternalLinkItems(providerReferenceLinksForConnection(connection));
}

function providerHostname(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

function matchesProviderHostname(hostname: string, allowedDomains: string[]): boolean {
  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

export function inferProviderPreset(connection: SupplierConnection): string {
  const kind = connection.kind.toLowerCase();
  const providerId = connection.provider_id.toLowerCase();
  const hostname = providerHostname(connection.base_url);
  const identityText = `${connection.provider_id} ${connection.display_name} ${connection.base_url}`.toLowerCase();
  if (identityText.includes('ollama') || connection.base_url.includes(':11434')) return 'ollama';
  if (providerId.includes('newapi')) return 'newapi';
  if (providerId.includes('deepseek') || matchesProviderHostname(hostname, ['deepseek.com'])) return 'deepseek';
  if (providerId.includes('kimi') || providerId.includes('moonshot') || matchesProviderHostname(hostname, ['moonshot.cn'])) return 'kimi';
  if (providerId.includes('doubao') || providerId.includes('volcengine') || matchesProviderHostname(hostname, ['volces.com'])) return 'doubao';
  if (providerId.includes('xiaomi_mimo') || providerId === 'mimo' || matchesProviderHostname(hostname, ['xiaomimimo.com'])) return 'xiaomi_mimo';
  if (providerId.includes('longcat') || providerId.includes('meituan') || matchesProviderHostname(hostname, ['longcat.chat'])) return 'longcat';
  if (providerId.includes('qwen') || providerId.includes('dashscope') || matchesProviderHostname(hostname, ['dashscope.aliyuncs.com', 'maas.aliyuncs.com'])) return 'qwen';
  if (providerId.includes('hunyuan') || providerId.includes('tencent') || matchesProviderHostname(hostname, ['tencentmaas.com', 'hunyuan.cloud.tencent.com'])) return 'hunyuan';
  if (providerId.includes('zhipu') || providerId.includes('glm') || matchesProviderHostname(hostname, ['bigmodel.cn'])) return 'zhipu_glm';
  if (kind === 'anthropic') return 'anthropic';
  if (kind === 'openrouter') return 'openrouter';
  if (kind === 'siliconflow') return 'siliconflow';
  if (kind === 'minimax' || kind === 'audio_provider' || kind === 'minimax_audio') return 'minimax';
  if (kind === 'openai_compatible') return 'openai_compatible';
  return 'custom';
}

export function defaultReferenceProviderId(providerId: string, presetId: string): string {
  const normalizedProviderId = providerId.trim().toLowerCase();
  if (normalizedProviderId && normalizedProviderId !== 'custom') return normalizedProviderId;
  const presetProviderId = providerPresetById(presetId).providerId.trim().toLowerCase();
  return presetProviderId === 'custom' ? 'openai' : presetProviderId;
}

export function canChooseReferenceProvider(presetId: string): boolean {
  return ['openai_compatible', 'newapi', 'openrouter', 'custom'].includes(presetId);
}

export function referenceProviderLabel(providerId: string): string {
  const normalizedProviderId = providerId.trim().toLowerCase();
  const preset = PROVIDER_PRESETS.find((item) => item.providerId === normalizedProviderId);
  return preset?.label || normalizedProviderId || 'OpenAI';
}

function uniqueList(values: string[]): string[] {
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (item && !normalized.includes(item)) normalized.push(item);
  }
  return normalized;
}

function modelProviderPrefix(modelId: string): string {
  const normalizedModelId = modelId.trim().toLowerCase();
  const slashIndex = normalizedModelId.indexOf('/');
  if (slashIndex <= 0) return '';
  return normalizedModelId.slice(0, slashIndex);
}

export function inferReferenceProviderFromModelIds(modelIds: string[], fallbackProviderId: string): string {
  const normalizedFallback = fallbackProviderId.trim().toLowerCase();
  const prefixes = uniqueList(modelIds.map(modelProviderPrefix).filter(Boolean));
  return prefixes.length === 1 ? prefixes[0] : normalizedFallback || 'openai';
}

export function referenceProviderForConnection(connection: SupplierConnection): string {
  const presetId = inferProviderPreset(connection);
  const fallbackProviderId = defaultReferenceProviderId(connection.provider_id, presetId);
  if (!canChooseReferenceProvider(presetId)) return fallbackProviderId;
  return inferReferenceProviderFromModelIds(connection.model_ids || [], fallbackProviderId);
}
import type { SupplierConnection } from './types';
import type { ProviderConnectionForm } from './provider-workbench-state';
