import { normalizeObservationWindow, observationCapability, observationWindows } from '@/features/admin/observability/window';

export type AdminNavigationItem = {
  href: string;
  labelKey: string;
  fallback: string;
};

export const observationNavigation: readonly AdminNavigationItem[] = [
  { href: '/admin/usage-statistics', labelKey: 'admin.nav_usage_statistics', fallback: 'Usage statistics' },
  { href: '/admin/plugin-observability', labelKey: 'admin.nav_plugin_observability', fallback: 'Plugin observability' },
  { href: '/admin/media-observability', labelKey: 'admin.nav_media_observability', fallback: 'Media observability' },
  { href: '/admin/vector-observability', labelKey: 'admin.nav_vector_observability', fallback: 'Vector observability' },
  { href: '/admin/usage-statistics?view=quality', labelKey: 'admin.troubleshooting.quality_link', fallback: 'Editorial quality evidence' },
];

export const diagnosticNavigation: readonly AdminNavigationItem[] = [
  { href: '/admin/troubleshooting', labelKey: 'admin.nav_runtime_diagnostics', fallback: 'Runtime diagnostics' },
  { href: '/admin/audit', labelKey: 'admin.audit_workspace.title', fallback: 'Audit evidence' },
  { href: '/admin/agent-feedback', labelKey: 'admin.nav_agent_feedback', fallback: 'Agent feedback quality' },
  { href: '/admin/ai-advisor', labelKey: 'admin.ai_advisor.title', fallback: 'Operations Advisor' },
];

const pathOf = (href: string) => href.split('?')[0];

export function adminSecondaryParentHref(pathname: string): string | null {
  if (observationNavigation.some(item => pathOf(item.href) === pathname)) return '/admin/usage-statistics';
  if (diagnosticNavigation.some(item => pathOf(item.href) === pathname)) return '/admin/troubleshooting';
  return null;
}

type ScopeParams = Pick<URLSearchParams, 'get'>;
function destinationWindows(href: string): readonly number[] {
  const capability = observationCapability(href);
  return capability ? observationWindows(capability) : [];
}

function resolvedWindow(href: string, current: string | null): number {
  const capability = observationCapability(href)!;
  return normalizeObservationWindow(current, 336, capability);
}

export function adminNavigationWindowAdjusted(href: string, params: ScopeParams): boolean {
  const current = Number(params.get('window'));
  const supported = destinationWindows(href);
  return current > 0 && supported.length > 0 && !supported.includes(current);
}

export function adminNavigationWindowHint(href: string, params: ScopeParams, locale: string): string | undefined {
  if (!adminNavigationWindowAdjusted(href, params)) return undefined;
  const hours = resolvedWindow(href, params.get('window'));
  return locale === 'zh-CN'
    ? `目标页面不支持当前时间窗，将使用近 ${hours / 24} 天。`
    : `This page does not support the current window; it opens with the last ${hours / 24} days.`;
}

/** Transfer only scope fields actually consumed by the destination. */
export function adminScopedNavigationHref(href: string, params: ScopeParams): string {
  const [route, query] = href.split('?');
  const next = new URLSearchParams(query);
  const supported = destinationWindows(href);
  if (supported.length) {
    next.set('window', String(resolvedWindow(href, params.get('window'))));
    const site = params.get('site') || params.get('site_id');
    if (site) next.set('site', site);
  }
  if (route === '/admin/plugin-observability' && params.get('plugin')) next.set('plugin', params.get('plugin')!);
  if ((route === '/admin/troubleshooting' || (route === '/admin/usage-statistics' && next.get('view') !== 'quality')) && params.get('function')) next.set('function', params.get('function')!);
  if (route === '/admin/ai-advisor') {
    const site = params.get('site') || params.get('site_id');
    if (site) next.set('site', site);
    const scope = params.get('scope');
    if (scope && ['operations', 'runtime', 'commercial', 'routing'].includes(scope)) next.set('scope', scope);
  }
  if (route === '/admin/audit') {
    const site = params.get('site') || params.get('site_id');
    if (site) next.set('site_id', site);
    for (const key of ['created_from', 'created_to']) {
      if (params.get(key)) next.set(key, params.get(key)!);
    }
  }
  return next.size ? `${route}?${next}` : route;
}
