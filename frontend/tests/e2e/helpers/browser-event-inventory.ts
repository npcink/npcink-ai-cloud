import type { Page, Request } from '@playwright/test';

// Only diagnostic routing/prefetch headers are retained. Never serialize the
// full request headers, bodies, Cookie or authorization values into receipts.
const headerNames = ['rsc', 'next-router-prefetch', 'next-router-segment-prefetch', 'purpose', 'sec-purpose'] as const;
export type NetworkEvidence = {
  id: number; url: string; method: string; resourceType: string; navigation: boolean;
  headers: Partial<Record<typeof headerNames[number], string>>;
  startedAt: number; documentUrl: string; finishedAt?: number; responseStatus?: number;
};
type FailedRequest = NetworkEvidence & { at: number; failure: string | null };
type HttpFailure = NetworkEvidence & { at: number; status: number };
type ConsoleError = { at: number; text: string; url: string };
type InjectedFailure = { requestId: number; reason: string; status?: number; failure?: string };
export type BrowserInventory = {
  pageerror: { at: number; message: string }[]; consoleError: ConsoleError[];
  requestfailed: FailedRequest[]; httpFailures: HttpFailure[]; injectedFailures: InjectedFailure[];
  requests: NetworkEvidence[]; lifecycle: { at: number; event: string; url: string; activeRequestIds: number[] }[];
};
export function isNextPrefetchCancellation(event: FailedRequest) {
  let url: URL, document: URL;
  try { url = new URL(event.url); document = new URL(event.documentUrl); }
  catch { return false; }
  return event.failure === 'net::ERR_ABORTED' && event.method === 'GET' && event.resourceType === 'fetch' && !event.navigation
    && url.origin === document.origin && /^\/admin(?:\/|$)/.test(url.pathname)
    && url.searchParams.has('_rsc') && event.headers.rsc === '1' && event.headers['next-router-prefetch'] === '1'
    && Boolean(event.headers['next-router-segment-prefetch']?.startsWith('/'));
}
export function classifyBrowserInventory(raw: BrowserInventory) {
  const requestfailed = raw.requestfailed.map(event => {
    const injection = raw.injectedFailures.find(fault => fault.requestId === event.id && fault.failure === event.failure);
    const prefetch = isNextPrefetchCancellation(event);
    return { event, classification: injection ? 'injected' : prefetch ? 'next-rsc-prefetch-cancelled' : 'unexpected',
      reason: injection?.reason || (prefetch ? 'Same-origin GET fetch with all explicit Next RSC prefetch headers, cancelled with net::ERR_ABORTED' : 'No proven prefetch/injection match; JS and document failures remain errors') };
  });
  const httpFailures = raw.httpFailures.map(event => ({ event, classification: raw.injectedFailures.some(fault => fault.requestId === event.id && fault.status === event.status) ? 'injected' : 'unexpected' }));
  const consoleError = raw.consoleError.map(event => {
    const injectedHttp = /^Failed to load resource: the server responded with a status of \d+/.test(event.text)
      && httpFailures.some(http => http.classification === 'injected' && http.event.url === event.url && event.text.includes(`status of ${http.event.status} `));
    const injectedNetwork = requestfailed.some(failed => failed.classification === 'injected' && failed.event.url === event.url
      && event.text === `Failed to load resource: ${failed.event.failure}`);
    return { event, classification: injectedHttp || injectedNetwork ? 'injected' : 'unexpected' };
  });
  return { requestfailed, httpFailures, consoleError, unexpected: {
    pageerror: raw.pageerror,
    consoleError: consoleError.filter(event => event.classification === 'unexpected').map(item => item.event),
    httpFailures: httpFailures.filter(event => event.classification === 'unexpected').map(item => item.event),
    requestfailed: requestfailed.filter(event => event.classification === 'unexpected').map(item => item.event),
  } };
}
export const noUnexpectedBrowserEvents = { pageerror: [], consoleError: [], httpFailures: [], requestfailed: [] };
export function collectBrowserEvents(page: Page) {
  const raw: BrowserInventory = { pageerror: [], consoleError: [], requestfailed: [], httpFailures: [], injectedFailures: [], requests: [], lifecycle: [] };
  const facts = new WeakMap<Request, NetworkEvidence>();
  const active = new Set<number>();
  let nextId = 0;
  const lifecycle = (event: string) => raw.lifecycle.push({ at: Date.now(), event, url: page.url(), activeRequestIds: [...active] });
  const evidence = (request: Request) => {
    let fact = facts.get(request);
    if (!fact) {
      const headers = request.headers();
      fact = { id: ++nextId, url: request.url(), method: request.method(), resourceType: request.resourceType(), navigation: request.isNavigationRequest(),
        headers: Object.fromEntries(headerNames.filter(name => headers[name] !== undefined).map(name => [name, headers[name]])),
        startedAt: Date.now(), documentUrl: page.url() };
      facts.set(request, fact); raw.requests.push(fact);
    }
    return fact;
  };
  page.on('request', request => active.add(evidence(request).id));
  page.on('requestfinished', request => { const fact = evidence(request); fact.finishedAt = Date.now(); active.delete(fact.id); });
  page.on('requestfailed', request => {
    const fact = evidence(request); fact.finishedAt = Date.now(); active.delete(fact.id);
    raw.requestfailed.push({ ...fact, at: Date.now(), failure: request.failure()?.errorText || null });
  });
  page.on('response', response => {
    const fact = evidence(response.request()); fact.responseStatus = response.status();
    if (response.status() >= 400) raw.httpFailures.push({ ...fact, at: Date.now(), status: response.status() });
  });
  page.on('pageerror', error => raw.pageerror.push({ at: Date.now(), message: error.message }));
  page.on('console', message => { if (message.type() === 'error') raw.consoleError.push({ at: Date.now(), text: message.text(), url: message.location().url }); });
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) lifecycle('main-frame-navigated'); });
  page.on('domcontentloaded', () => lifecycle('domcontentloaded'));
  page.on('load', () => lifecycle('load'));
  return {
    raw, classify: () => classifyBrowserInventory(raw),
    injectFailure(request: Request, reason: string, failure: { status: number } | { failure: string }) {
      raw.injectedFailures.push({ requestId: evidence(request).id, reason, ...failure });
    },
    async beforeReload() {
      lifecycle('explicit-reload-settle-start');
      // Let the old document's real prefetch/module requests finish. Do not
      // disable prefetch or waive any script cancellation/error classification.
      await page.waitForLoadState('networkidle', { timeout: 20_000 });
      if (active.size) throw new Error('Requests still active before explicit reload');
      lifecycle('explicit-reload-ready');
    },
  };
}
