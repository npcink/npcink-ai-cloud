import { expect, test, type ConsoleMessage, type Page, type Request, type Response } from '@playwright/test';
import { installRouteAcceptanceMocks } from './helpers/admin-route-fixtures';
import acceptanceMatrix from '../../admin-acceptance-matrix.json' with { type: 'json' };
import { installAdminMocks } from './helpers/admin-operator-fixture';

type RouteAcceptance = (typeof acceptanceMatrix.routes)[number];

function installBrowserFailureCapture(page: Page) {
  const failures: string[] = [];

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
    if (!isExpectedAbort) failures.push(`requestfailed: ${request.method()} ${request.url()} (${reason})`);
  });
  page.on('response', (response: Response) => {
    if (response.status() >= 500) failures.push(`response: ${response.status()} ${response.url()}`);
  });

  return failures;
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
    '/admin/support-requests/[requestId]': '/admin/support-requests',
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
  await expect(page.locator('[data-ui="admin-route-breadcrumb"]')).toContainText((await activeNav.innerText()).trim());

  if (!route.routePattern.includes('[') && route.routePattern !== '/admin/login') {
    // Every standalone page is findable from the global quick switcher.
    await page.getByRole('button', { name: /打开快速跳转|Open quick switcher/i }).click();
    const command = page.getByRole('dialog');
    await expect(command.locator(`a[href="${route.routePattern}"]`)).toBeVisible();
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

      expect(browserFailures, `${route.routePattern} emitted unexplained browser failures`).toEqual([]);
      expect(unhandledAdminRequests, `${route.routePattern} made unhandled Admin API requests`).toEqual([]);
    });
  }
});
