import { appendFileSync } from 'node:fs';
import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

export async function captureIsolatedCheckpoint(page: Page, testInfo: TestInfo, name: string) {
  if (!process.env.NPCINK_ISOLATED_CHANNEL) return;
  const screenshot = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach(name, { path: screenshot, contentType: 'image/png' });
}

export const test = base.extend<{ isolatedChannel: void }>({
  isolatedChannel: [async ({ context, baseURL }, runTest, testInfo) => {
    if (!process.env.NPCINK_ISOLATED_CHANNEL) {
      await runTest();
      return;
    }
    const origin = new URL(baseURL || '').origin;
    expect(origin).toBe(process.env.NPCINK_ISOLATED_ORIGIN);
    expect(new URL(origin).hostname).toBe('127.0.0.1');
    const blocked: string[] = [];
    const requests: Array<{ method: string; pathname: string; status: number }> = [];
    // Page fixtures have priority. All remaining browser traffic stays on the local frontend.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        blocked.push('external-browser-request');
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    context.on('response', (response) => requests.push({
      method: response.request().method(), pathname: new URL(response.url()).pathname, status: response.status(),
    }));
    try {
      await runTest();
    } finally {
      appendFileSync(`${process.env.NPCINK_ISOLATED_OUTPUT}/browser.jsonl`,
        `${JSON.stringify({ title: testInfo.title, requests, blocked })}\n`);
      expect(blocked, 'isolated browser must not use external endpoints').toEqual([]);
    }
  }, { auto: true }],
});
