import type { SupplierConnection } from './types';

export type SupplierGroup = {
  key: string;
  displayName: string;
  isOllama: boolean;
  connections: SupplierConnection[];
};

// These are the existing M4 execution and Site Knowledge preview identities.
// Group presentation only: provider/connection IDs, models and writes stay intact.
const M4_OLLAMA_PROVIDERS = new Set(['ollama-m4', 'ollama-m4-embedding']);

function ollamaEndpoint(connection: SupplierConnection): string | null {
  if (!M4_OLLAMA_PROVIDERS.has(connection.provider_id)
    || connection.kind !== 'openai_compatible') return null;
  try {
    const url = new URL(connection.base_url);
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function groupModelSuppliers(connections: SupplierConnection[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const connection of connections) {
    const endpoint = ollamaEndpoint(connection);
    const key = endpoint ? `ollama-m4:${endpoint}` : `connection:${connection.connection_id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        displayName: endpoint ? 'Ollama M4' : connection.display_name,
        isOllama: endpoint !== null,
        connections: [],
      };
      groups.set(key, group);
    }
    group.connections.push(connection);
  }
  return [...groups.values()];
}

export function supplierGroupNeedsAttention(group: SupplierGroup): boolean {
  return group.connections.some(connection => connection.enabled
    && (connection.attention_required ?? connection.status !== 'ready'));
}

export function supplierGroupReady(group: SupplierGroup): boolean {
  const enabled = group.connections.filter(connection => connection.enabled);
  return enabled.length > 0 && enabled.every(connection => connection.status === 'ready'
    && !connection.attention_required);
}
