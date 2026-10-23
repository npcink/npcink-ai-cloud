import { OPERATIONS_ADVISOR_PAUSED } from '@/features/admin/ai-advisor/availability';
import { normalizeObservationWindow, observationCapability, observationWindows } from '@/features/admin/observability/window';
import { translate } from '@/lib/i18n';

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
].filter(item => !OPERATIONS_ADVISOR_PAUSED || item.href !== '/admin/ai-advisor');

export const customerWorkspaceTabs: readonly AdminNavigationItem[] = [
  { href: '/admin/accounts', labelKey: 'admin.workspace_tab_customers', fallback: 'Customers' },
  { href: '/admin/support-requests', labelKey: 'admin.workspace_tab_tickets', fallback: 'Tickets' },
];

export const commercialWorkspaceTabs: readonly AdminNavigationItem[] = [
  { href: '/admin/coverage', labelKey: 'admin.workspace_tab_service_status', fallback: 'Service status' },
  { href: '/admin/subscriptions', labelKey: 'admin.workspace_tab_subscriptions', fallback: 'Subscriptions' },
  { href: '/admin/plans', labelKey: 'admin.workspace_tab_packages', fallback: 'Packages' },
  { href: '/admin/credit-packs', labelKey: 'admin.workspace_tab_credit_packs', fallback: 'Credit packs' },
];

export const externalCapabilityTabs: readonly AdminNavigationItem[] = [
  { href: '/admin/ai-resources', labelKey: 'admin.workspace_tab_providers', fallback: 'Model suppliers' },
  { href: '/admin/external-services', labelKey: 'admin.workspace_tab_external_services', fallback: 'Search & images' },
  { href: '/admin/vector-settings', labelKey: 'admin.workspace_tab_vector', fallback: 'Site vector service' },
];

export const systemSettingsTabs: readonly AdminNavigationItem[] = [
  { href: '/admin/service-settings', labelKey: 'admin.workspace_tab_service_settings', fallback: 'Service settings' },
  { href: '/admin/site-compliance', labelKey: 'admin.workspace_tab_compliance', fallback: 'Site compliance' },
];

export type AdminWorkspaceNavigationGroup = {
  items: readonly AdminNavigationItem[];
  noteKey?: string;
  noteFallback?: string;
};

export const workspaceNavigation: readonly AdminWorkspaceNavigationGroup[] = [
  { items: customerWorkspaceTabs },
  { items: commercialWorkspaceTabs },
  { items: externalCapabilityTabs },
  { items: systemSettingsTabs },
];

const pathOf = (href: string) => href.split('?')[0];
const matchesRoute = (href: string, pathname: string) => pathname === pathOf(href) || pathname.startsWith(`${pathOf(href)}/`);
const groupParent = (tabs: readonly AdminNavigationItem[], parent: string, pathname: string) =>
  tabs.some(item => matchesRoute(item.href, pathname)) ? parent : null;

export function adminSecondaryParentHref(pathname: string): string | null {
  if (pathname === '/admin/ai-advisor') return '/admin/troubleshooting';
  if (observationNavigation.some(item => pathOf(item.href) === pathname)) return '/admin/usage-statistics';
  if (diagnosticNavigation.some(item => pathOf(item.href) === pathname)) return '/admin/troubleshooting';
  return groupParent(customerWorkspaceTabs, '/admin/accounts', pathname)
    ?? groupParent(commercialWorkspaceTabs, '/admin/subscriptions', pathname)
    ?? groupParent(externalCapabilityTabs, '/admin/ai-resources', pathname)
    ?? groupParent(systemSettingsTabs, '/admin/service-settings', pathname);
}

export function adminWorkspaceTabForPath(pathname: string): AdminNavigationItem | null {
  for (const group of workspaceNavigation) {
    const match = group.items.find(item => matchesRoute(item.href, pathname));
    if (match) return match;
  }
  return null;
}

type ScopeParams = Pick<URLSearchParams, 'get'>;
function destinationWindows(href: string): readonly number[] {
  const capability = observationCapability(href);
  return capability ? observationWindows(capability) : [];
}

function resolvedWindow(href: string, current: string | null): number {
  const capability = observationCapability(href);
  return capability ? normalizeObservationWindow(current, undefined, capability) : 336;
}

export function adminNavigationWindowHours(href: string, params: ScopeParams): number | null {
  return observationCapability(href) ? resolvedWindow(href, params.get('window')) : null;
}

export function adminNavigationWindowAdjusted(href: string, params: ScopeParams): boolean {
  const current = Number(params.get('window'));
  const supported = destinationWindows(href);
  return current > 0 && supported.length > 0 && !supported.includes(current);
}

export function adminNavigationWindowHint(href: string, params: ScopeParams, locale: string): string | undefined {
  if (!adminNavigationWindowAdjusted(href, params)) return undefined;
  const hours = resolvedWindow(href, params.get('window'));
  return translate(locale === 'zh-CN' ? 'zh-CN' : 'en', 'admin.navigation.window_adjusted', { days: String(hours / 24) });
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
