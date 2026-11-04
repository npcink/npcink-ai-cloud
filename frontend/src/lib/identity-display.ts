/** Display helpers never determine ownership or authorization. */
export function readableIdentityName(value?: string, identifier = ''): string {
  const name = value?.trim() || '';
  if (!name || name === identifier || /^(?:acct|site)[_-]/i.test(name)
    || /^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(name)) return '';
  return name;
}

export function shortIdentity(value: string): string {
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

export function siteIdentity(name: string | undefined, url: string | undefined, id: string, unnamed: string): string {
  const readable = readableIdentityName(name, id);
  if (readable) return readable;
  if (url) {
    try {
      const parsed = new URL(url);
      if (['http:', 'https:'].includes(parsed.protocol)) return parsed.host;
    } catch { /* Unusable URLs do not become names. */ }
  }
  return id ? `${unnamed} · ${shortIdentity(id)}` : unnamed;
}
