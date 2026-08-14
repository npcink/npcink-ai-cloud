export function modelIdentityKeys(modelId: string, providerId: string): Set<string> {
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
