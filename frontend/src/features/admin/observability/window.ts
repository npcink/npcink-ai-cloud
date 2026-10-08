import capabilities from './window-capabilities.json';

export type ObservationWindow = 24 | 72 | 168 | 336 | 720 | 2160;
export type ObservationCapability = keyof typeof capabilities;
export const OBSERVATION_WINDOWS = capabilities.runtime.hours as ObservationWindow[];
const knownWindows = [...new Set(Object.values(capabilities).flatMap(capability => capability.hours))];

export function observationCapability(href: string): ObservationCapability | null {
  const [route, query] = href.split('?');
  if (route === '/admin/usage-statistics') {
    const params = new URLSearchParams(query);
    if (params.get('view') === 'quality') return 'quality';
    return params.get('group') === 'plugins' ? 'pluginHistory' : 'runtime';
  }
  const routes: Record<string, ObservationCapability> = {
    '/admin/troubleshooting': 'runtime', '/admin/plugin-observability': 'plugin',
    '/admin/media-observability': 'media', '/admin/vector-observability': 'vector',
    '/admin/agent-feedback': 'feedback',
  };
  return routes[route] ?? null;
}

export function observationWindows(capability: ObservationCapability): readonly ObservationWindow[] {
  return capabilities[capability].hours as ObservationWindow[];
}

/** Known unsupported windows narrow to the nearest supported scope; unknown input uses the default. */
export function normalizeObservationWindow(value: string | null, fallback?: ObservationWindow, capability: ObservationCapability = 'runtime'): ObservationWindow {
  const supported = observationWindows(capability);
  const hours = Number(value);
  if (supported.includes(hours as ObservationWindow)) return hours as ObservationWindow;
  if (knownWindows.includes(hours)) return (supported.filter(window => window <= hours).at(-1) ?? supported[0]);
  return fallback && supported.includes(fallback) ? fallback : capabilities[capability].defaultHours as ObservationWindow;
}
