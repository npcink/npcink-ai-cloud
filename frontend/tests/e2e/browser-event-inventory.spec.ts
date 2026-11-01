import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { collectBrowserEvents } from './helpers/browser-event-inventory';

test('collector controls retain real browser positive and negative network evidence', async ({ page }, info) => {
  const collector = collectBrowserEvents(page);
  await page.route('**/collector-controls', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>collector controls</title><main>Mock-only network controls</main>' }));
  await page.goto('/collector-controls');
  const origin = new URL(page.url()).origin;
  const prefetch = { rsc: '1', 'next-router-prefetch': '1', 'next-router-segment-prefetch': '/_tree' };
  // Same-origin test routes abort before reaching any business backend.
  await page.route('**/admin/collector-control**', route => route.abort(route.request().url().includes('reset') ? 'connectionreset' : 'aborted'));
  await page.route('**/api/admin/collector-control**', route => route.abort('aborted'));
  await page.route('**/_next/static/chunks/collector-essential.js', route => route.abort('failed'));
  const fetchControl = async (path: string, headers = {}, method = 'GET') => {
    const count = collector.raw.requestfailed.length;
    await page.evaluate(async ({ path, headers, method }) => { await fetch(path, { headers, method }).catch(() => {}); }, { path, headers, method });
    await expect.poll(() => collector.raw.requestfailed.length).toBe(count + 1);
    return collector.classify().requestfailed.at(-1)!;
  };
  const proven = await fetchControl('/admin/collector-control?_rsc=positive', prefetch);
  expect(proven.classification).toBe('next-rsc-prefetch-cancelled');
  expect(proven.event.resourceType).toBe('fetch'); expect(proven.event.method).toBe('GET');
  expect(proven.event.headers).toEqual(prefetch);
  expect((await fetchControl('/api/admin/collector-control?_rsc=business', prefetch)).classification).toBe('unexpected');
  expect((await fetchControl('/api/admin/collector-control', {}, 'PATCH')).classification).toBe('unexpected');
  expect((await fetchControl('/admin/collector-control?_rsc=no-markers')).classification).toBe('unexpected');
  expect((await fetchControl('/admin/collector-control?_rsc=partial', { rsc: '1' })).classification).toBe('unexpected');
  expect((await fetchControl('/admin/collector-control?reset=1&_rsc=reset', prefetch)).classification).toBe('unexpected');
  await page.evaluate(() => new Promise<void>(resolve => {
    const script = document.createElement('script'); script.src = '/_next/static/chunks/collector-essential.js';
    script.onerror = () => resolve(); document.head.append(script);
  }));
  await expect.poll(() => collector.raw.requestfailed.length).toBe(7);
  const script = collector.classify().requestfailed.at(-1)!;
  expect(script.event.resourceType).toBe('script'); expect(script.classification).toBe('unexpected');
  expect(await page.evaluate(() => 'criticalScriptLoaded' in window)).toBe(false);
  await page.goto(`${origin}/admin/collector-control?_rsc=document`).catch(() => {});
  await expect.poll(() => collector.raw.requestfailed.length).toBe(8);
  const navigation = collector.classify().requestfailed.at(-1)!;
  expect(navigation.event.navigation).toBe(true); expect(navigation.classification).toBe('unexpected');
  expect(collector.classify().unexpected.requestfailed).toHaveLength(7);
  const root = process.env.NPCINK_PLAN_EVIDENCE || info.outputDir;
  await mkdir(root, { recursive: true }); const path = `${root}/collector-browser-controls.json`;
  await writeFile(path, JSON.stringify({ raw: collector.raw, classified: collector.classify(), expectedNegativeControls: 7 }, null, 2));
  await info.attach('positive-and-negative-controls', { path, contentType: 'application/json' });
});

test('collector reload synchronization finishes old document prefetch and scripts without exempting JS failures', async ({ page }, info) => {
  const collector = collectBrowserEvents(page);
  await page.route('**/collector-reload', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>reload control</title><main>Old-document side work</main>' }));
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/admin/collector-side-work**', async route => { await held; await route.fulfill({ contentType: 'text/plain', body: 'prefetch completed' }); });
  await page.route('**/_next/static/chunks/collector-side-work.js', async route => { await held; await route.fulfill({ contentType: 'application/javascript', body: 'window.collectorSideWorkFinished = true' }); });
  await page.goto('/collector-reload');
  await page.evaluate(() => {
    void fetch('/admin/collector-side-work?_rsc=side', { headers: { rsc: '1', 'next-router-prefetch': '1', 'next-router-segment-prefetch': '/_tree' } });
    const script = document.createElement('script'); script.src = '/_next/static/chunks/collector-side-work.js'; document.head.append(script);
  });
  await expect.poll(() => collector.raw.requests.filter(request => request.url.includes('collector-side-work')).length).toBe(2);
  let settled = false;
  const settle = collector.beforeReload().then(() => { settled = true; });
  expect(settled).toBe(false); release(); await settle;
  expect(await page.evaluate(() => (window as Window & { collectorSideWorkFinished?: boolean }).collectorSideWorkFinished)).toBe(true);
  await page.reload();
  expect(collector.raw.requestfailed).toEqual([]); expect(collector.classify().unexpected.requestfailed).toEqual([]);
  expect(collector.raw.lifecycle.find(event => event.event === 'explicit-reload-settle-start')!.activeRequestIds).toHaveLength(2);
  expect(collector.raw.lifecycle.find(event => event.event === 'explicit-reload-ready')!.activeRequestIds).toEqual([]);
  expect(collector.raw.requests.filter(request => request.url.includes('collector-side-work')).every(request => request.finishedAt && request.responseStatus === 200)).toBe(true);
  const root = process.env.NPCINK_PLAN_EVIDENCE || info.outputDir;
  await mkdir(root, { recursive: true }); const path = `${root}/collector-reload-control.json`;
  await writeFile(path, JSON.stringify({ raw: collector.raw, classified: collector.classify() }, null, 2));
  await info.attach('reload-lifecycle-control', { path, contentType: 'application/json' });
});
