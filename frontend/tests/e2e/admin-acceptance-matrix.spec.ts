import { expect, test, type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test';
import { installRouteAcceptanceMocks } from './helpers/admin-route-fixtures';
import acceptanceMatrix from '../../admin-acceptance-matrix.json' with { type: 'json' };
import { installAdminMocks } from './helpers/admin-operator-fixture';

type RouteAcceptance = (typeof acceptanceMatrix.routes)[number];

function installBrowserFailureCapture(page: Page) {
  const failures: string[] = [];
  const canceledReads: Array<{ url: string; failure: string }> = [];
  const successfulReads = new Set<string>();

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request: Request) => {
    const reason = request.failure()?.errorText || 'unknown request failure';
    const requestUrl = new URL(request.url());
    const isExpectedAbort = reason === 'net::ERR_ABORTED' && (
      request.resourceType() === 'document' || requestUrl.searchParams.has('_rsc')
    );
    const failure = `requestfailed: ${request.method()} ${request.url()} (${reason})`;
    if (reason === 'net::ERR_ABORTED' && request.method() === 'GET' && requestUrl.pathname.startsWith('/api/admin/')) {
      // React development remounts cancel obsolete query reads. Require a
      // successful replacement of the exact URL; an unrecovered abort still fails.
      canceledReads.push({ url: request.url(), failure });
    } else if (!isExpectedAbort) failures.push(failure);
  });
  page.on('response', (response: Response) => {
    if (response.status() >= 500) failures.push(`response: ${response.status()} ${response.url()}`);
    if (response.ok() && response.request().method() === 'GET') successfulReads.add(response.url());
  });

  return () => [...failures, ...canceledReads.filter(read => !successfulReads.has(read.url)).map(read => read.failure)];
}


async function expectDesktopRouteBaseline(page: Page, route: RouteAcceptance) {
  await expect(page.locator('main')).toBeVisible();
  await expect.poll(async () => page.locator('h1:visible').count()).toBe(1);

  if ('expectedLandingPath' in route) {
    await expect(page).toHaveURL(new RegExp(`${route.expectedLandingPath.replaceAll('/', '\\/')}/?$`));
  } else {
    await expect(page).toHaveURL(new RegExp(`${route.smokePath.split('?')[0].replaceAll('/', '\\/')}(?:\\?|$)`));
  }

  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(dimensions.documentWidth, `${route.routePattern} must not overflow the desktop viewport`).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1
  );

  // Check route ownership independently of the shell's resolver. A new route
  // must have a real parent instead of silently falling back to Overview.
  const contextualParents: Record<string, string> = {
    '/admin/accounts/[accountId]': '/admin/accounts',
    '/admin/sites/[siteId]': '/admin/accounts',
    '/admin/subscriptions/[subscriptionId]': '/admin/subscriptions',
    '/admin/support-requests/[requestId]': '/admin/accounts',
    '/admin/support-requests': '/admin/accounts',
    '/admin/coverage': '/admin/subscriptions',
    '/admin/plans': '/admin/subscriptions',
    '/admin/credit-packs': '/admin/subscriptions',
    '/admin/economics': '/admin/subscriptions',
    '/admin/external-services': '/admin/ai-resources',
    '/admin/vector-settings': '/admin/ai-resources',
    '/admin/site-compliance': '/admin/service-settings',
    '/admin/plugin-observability': '/admin/usage-statistics',
    '/admin/media-observability': '/admin/usage-statistics',
    '/admin/vector-observability': '/admin/usage-statistics',
    '/admin/audit': '/admin/troubleshooting',
    '/admin/agent-feedback': '/admin/troubleshooting',
    '/admin/ai-advisor': '/admin/troubleshooting',
    '/admin/login': '/admin',
  };
  const parent = contextualParents[route.routePattern] || route.routePattern;
  const activeNav = page.locator('[data-ui="admin-primary-nav"] a[aria-current="page"]');
  await expect(activeNav).toHaveCount(1);
  await expect(activeNav).toHaveAttribute('href', parent);
  await expect(page.locator('[data-ui="admin-route-breadcrumb"]')).toHaveCount(0);

  if (!route.routePattern.includes('[') && route.routePattern !== '/admin/login') {
    // Active pages are discoverable; a paused bookmark must stay withdrawn.
    await page.getByRole('button', { name: /打开快速跳转|Open quick switcher/i }).click();
    const command = page.getByRole('dialog');
    const entry = command.locator(`a[href="${route.routePattern}"]`);
    if (route.routePattern === '/admin/ai-advisor') await expect(entry).toHaveCount(0);
    else await expect(entry).toBeVisible();
    await page.keyboard.press('Escape');
  }
}

test.describe('current-master Admin route acceptance matrix', () => {
  test.use({ viewport: acceptanceMatrix.viewport });

  for (const route of acceptanceMatrix.routes) {
    test(`${route.routePattern} is reachable with one page title and no desktop overflow`, async ({ page }) => {
      const browserFailures = installBrowserFailureCapture(page);
      const unhandledAdminRequests: string[] = [];
      const allowedEmptyAdminRequests = 'allowedEmptyAdminRequests' in route
        ? route.allowedEmptyAdminRequests
        : [];
      await installAdminMocks(page, { allowedEmptyAdminRequests, unhandledAdminRequests });
      await installRouteAcceptanceMocks(page, route.routePattern);

      await page.goto(route.smokePath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      await expectDesktopRouteBaseline(page, route);

      expect(browserFailures(), `${route.routePattern} emitted unexplained browser failures`).toEqual([]);
      expect(unhandledAdminRequests, `${route.routePattern} made unhandled Admin API requests`).toEqual([]);
    });
  }
});
