/** Only remove a known system namespace. Upstream IDs are case sensitive. */
export function upstreamModelId(modelId: string, namespacePrefix: string): string {
  const id = modelId.trim();
  const prefix = namespacePrefix.trim().replace(/\/+$/, '');
  return prefix && id.startsWith(`${prefix}/`) ? id.slice(prefix.length + 1) : id;
}

export function modelIdentityKeys(modelId: string, namespacePrefix: string): Set<string> {
  const id = modelId.trim();
  if (!id) return new Set();
  const rawId = upstreamModelId(id, namespacePrefix);
  const prefix = namespacePrefix.trim().replace(/\/+$/, '');
  return new Set(prefix ? [rawId, `${prefix}/${rawId}`] : [rawId]);
}
