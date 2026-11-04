import { describe, expect, it } from 'vitest';
import { classifyBrowserInventory, isNextPrefetchCancellation, type BrowserInventory, type NetworkEvidence } from '../e2e/helpers/browser-event-inventory';
const request: NetworkEvidence = { id: 1, url: 'http://127.0.0.1:4393/admin/accounts?_rsc=fixture', method: 'GET', resourceType: 'fetch', navigation: false,
  headers: { rsc: '1', 'next-router-prefetch': '1', 'next-router-segment-prefetch': '/_tree' }, startedAt: 1, documentUrl: 'http://127.0.0.1:4393/admin/plans' };
const failed = { ...request, at: 2, failure: 'net::ERR_ABORTED' };
const inventory = (): BrowserInventory => ({ pageerror: [], consoleError: [], requestfailed: [failed], httpFailures: [], injectedFailures: [], requests: [request], lifecycle: [] });
describe('candidate collector cancellation boundaries', () => {
  it('classifies only complete explicit Next RSC prefetch evidence and retains the raw event', () => {
    const raw = inventory(); const result = classifyBrowserInventory(raw);
    expect(result.requestfailed[0].classification).toBe('next-rsc-prefetch-cancelled');
    expect(raw.requestfailed).toEqual([failed]); expect(result.unexpected.requestfailed).toEqual([]);
  });
  it.each([
    { url: 'http://127.0.0.1:4393/api/admin/plans/pro?_rsc=fixture' },
    { url: 'http://127.0.0.1:4393/_next/static/chunks/essential.js?_rsc=fixture', resourceType: 'script' },
    { url: 'http://other.test/admin/accounts?_rsc=fixture' },
    { method: 'PATCH' }, { resourceType: 'document', navigation: true }, { resourceType: 'script' },
    { headers: {} }, { headers: { rsc: '1' } }, { headers: { rsc: '1', 'next-router-prefetch': '1' } },
    { headers: { rsc: '1', 'next-router-prefetch': '0', 'next-router-segment-prefetch': '/_tree' } },
    { headers: { rsc: '1', 'next-router-prefetch': '1', 'next-router-segment-prefetch': 'unproven' } },
    { headers: { 'next-router-prefetch': '1', 'next-router-segment-prefetch': '/_tree' } },
    { failure: 'net::ERR_CONNECTION_RESET' }, { failure: 'ERR_ABORTED' }, { failure: null },
    { url: 'http://127.0.0.1:4393/admin/accounts' }, { url: '/relative-only' }, { documentUrl: 'invalid-document' },
  ])('keeps unproven or business/JS/navigation failures unexpected %#', patch => {
    const event = { ...failed, ...patch }; expect(isNextPrefetchCancellation(event)).toBe(false);
    const raw = inventory(); raw.requestfailed = [event]; expect(classifyBrowserInventory(raw).unexpected.requestfailed).toEqual([event]);
  });
  it('binds an intentional error to one request and exact failure code, never its URL alone', () => {
    const raw = inventory(); raw.requestfailed = [{ ...failed, url: '/business', id: 2, failure: 'net::ERR_CONNECTION_RESET' }, { ...failed, id: 3, headers: {} }];
    raw.injectedFailures = [{ requestId: 2, reason: 'exact injected reset', failure: 'net::ERR_CONNECTION_RESET' }];
    expect(classifyBrowserInventory(raw).unexpected.requestfailed).toEqual([raw.requestfailed[1]]);
    raw.requestfailed[0].failure = 'net::ERR_FAILED'; expect(classifyBrowserInventory(raw).unexpected.requestfailed).toHaveLength(2);
  });
  it('classifies declared HTTP injection while preserving undeclared HTTP and arbitrary console failures', () => {
    const raw = inventory();
    raw.httpFailures = [{ ...request, at: 3, status: 422 }];
    raw.injectedFailures = [{ requestId: 1, reason: 'declared validation fixture', status: 422 }];
    raw.consoleError = [{ at: 4, url: request.url, text: 'Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)' }];
    expect(classifyBrowserInventory(raw).unexpected.httpFailures).toEqual([]);
    expect(classifyBrowserInventory(raw).unexpected.consoleError).toEqual([]);
    raw.httpFailures.push({ ...request, id: 2, at: 5, status: 422 });
    raw.consoleError.push({ at: 6, url: request.url, text: 'Application failed with 422' });
    expect(classifyBrowserInventory(raw).unexpected.httpFailures).toHaveLength(1);
    expect(classifyBrowserInventory(raw).unexpected.consoleError).toHaveLength(1);
  });
  it('never clears HTTP, console or page errors solely because a prefetch cancellation exists', () => {
    const raw = inventory(); raw.pageerror = [{ at: 3, message: 'critical script failed' }];
    raw.httpFailures = [{ ...request, at: 3, status: 503 }]; raw.consoleError = [{ at: 4, url: request.url, text: 'other 503 error' }];
    const unexpected = classifyBrowserInventory(raw).unexpected;
    expect(unexpected.pageerror).toHaveLength(1); expect(unexpected.consoleError).toHaveLength(1); expect(unexpected.httpFailures).toHaveLength(1);
  });
});
