/** Keep authentication handoffs inside the Portal, preserving addon query state. */
export function resolvePortalReturnTo(value: string | null, fallback = '/portal'): string {
  const redirect = String(value || '').trim();
  if (!redirect.startsWith('/')) return fallback;
  try {
    const url = new URL(redirect, 'https://portal.invalid');
    if (url.origin === 'https://portal.invalid'
      && (url.pathname === '/portal' || url.pathname.startsWith('/portal/'))) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch { /* Malformed targets use the ordinary Portal landing page. */ }
  return fallback;
}
