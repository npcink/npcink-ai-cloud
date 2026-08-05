import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

type ResultStatus = 'pass' | 'fail' | 'review_required' | 'not_applicable' | 'unmeasured';
type PageModel = 'overview' | 'queue' | 'detail' | 'configuration' | 'diagnostic' | 'authentication';
type VisualEnvironment = 'local' | 'm4_candidate' | 'm4_accepted';
type HumanAcceptance = 'pending' | 'not_required' | 'accepted' | 'rejected';

export type AdminVisualResult = {
  id: string;
  status: ResultStatus;
  evidence: string;
};

type BrowserEvidence = {
  consoleErrors: string[];
  networkFailures: string[];
};

type VisualManifest = {
  routes: Record<string, PageModel>;
  viewport: { width: number; height: number };
  visualGovernance: {
    rules: Array<{ id: string }>;
    pilotRoutes: Record<string, {
      pageModel: PageModel;
      requiredStates: string[];
      workingSurface: string;
    }>;
  };
};

const repositoryRoot = resolve(process.cwd(), '..');
const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'admin-ui-manifest.json'), 'utf8')
) as VisualManifest;

const routeSpecificRuleIds = [
  'single-primary-action',
  'textual-status',
  'action-object-proximity',
  'distinct-interaction-states',
  'dialog-focus-recovery',
  'context-stability',
] as const;

const visualReviewItems = [
  'five-second scan identifies the page object, current state, and next action',
  'normal state stays quiet while blocking or abnormal state carries stronger visual weight',
  'alignment and spacing explain groups without unnecessary card surfaces',
  'low-frequency technical detail does not displace the default working surface',
  'table, directory, and inspector follow a natural scan order',
];

export function observeAdminBrowserEvidence(page: Page): BrowserEvidence {
  const evidence: BrowserEvidence = { consoleErrors: [], networkFailures: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => evidence.consoleErrors.push(error.message));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText || 'unknown request failure';
    evidence.networkFailures.push(`${request.method()} ${request.url()} - ${reason}`);
  });
  return evidence;
}

function sourceEvidence() {
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  // Keep this exact command label searchable by the governance contract: git status --porcelain.
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trimEnd();
  const dirtyPaths = status
    ? status.split('\n').map((line) => line.slice(3).trim()).filter(Boolean).sort()
    : [];
  return {
    source_revision: sourceRevision,
    source_dirty: dirtyPaths.length > 0,
    source_dirty_paths: dirtyPaths,
  };
}

function result(id: string, passed: boolean, passEvidence: string, failEvidence: string): AdminVisualResult {
  return {
    id,
    status: passed ? 'pass' : 'fail',
    evidence: passed ? passEvidence : failEvidence,
  };
}

export async function writeAdminVisualReceipt({
  page,
  testInfo,
  route,
  pageModel,
  testedStates,
  pageTitle,
  workingSurface,
  browserEvidence,
  expectedConsoleErrors = [],
  routeRuleResults,
  interactionResults,
  environment = 'local',
  humanAcceptance = 'pending',
  artifactId,
}: {
  page: Page;
  testInfo: TestInfo;
  route: string;
  pageModel: PageModel;
  testedStates: string[];
  pageTitle: Locator;
  workingSurface: Locator;
  browserEvidence: BrowserEvidence;
  expectedConsoleErrors?: RegExp[];
  routeRuleResults: AdminVisualResult[];
  interactionResults: AdminVisualResult[];
  environment?: VisualEnvironment;
  humanAcceptance?: HumanAcceptance;
  artifactId?: string;
}) {
  const pilot = manifest.visualGovernance.pilotRoutes[route];
  if (!pilot) throw new Error(`${route} is not declared as an Admin visual pilot route`);

  await page.setViewportSize(manifest.viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await workingSurface.waitFor({ state: 'visible' });

  const viewport = page.viewportSize();
  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const pageTitleCount = await pageTitle.count();
  const workingSurfaceBox = await workingSurface.boundingBox();
  const unexpectedConsoleErrors = browserEvidence.consoleErrors.filter((message) => (
    !expectedConsoleErrors.some((pattern) => pattern.test(message))
  ));
  const unexpectedNetworkFailures = browserEvidence.networkFailures.filter((failure) => (
    !failure.endsWith(' - net::ERR_ABORTED')
  ));

  const automaticRuleResults: AdminVisualResult[] = [
    result(
      'declared-page-model',
      manifest.routes[route] === pageModel && pilot.pageModel === pageModel,
      `${route} is declared as ${pageModel} in both route and visual governance maps`,
      `${route} page model does not match ${pageModel}`
    ),
    result(
      'pc-viewport',
      viewport?.width === manifest.viewport.width && viewport?.height === manifest.viewport.height,
      `viewport is ${manifest.viewport.width} x ${manifest.viewport.height}`,
      `viewport was ${viewport?.width || 0} x ${viewport?.height || 0}`
    ),
    result(
      'horizontal-overflow',
      layout.scrollWidth <= layout.clientWidth + 1,
      `document scroll width ${layout.scrollWidth}px fits ${layout.clientWidth}px`,
      `document scroll width ${layout.scrollWidth}px exceeds ${layout.clientWidth}px`
    ),
    result(
      'single-page-title',
      pageTitleCount === 1 && await pageTitle.isVisible(),
      'route-specific page title locator resolves to one visible heading',
      `route-specific page title locator resolves to ${pageTitleCount} headings`
    ),
    result(
      'working-surface-first-viewport',
      Boolean(workingSurfaceBox && workingSurfaceBox.y >= 0 && workingSurfaceBox.y < manifest.viewport.height),
      `working surface starts at ${Math.round(workingSurfaceBox?.y ?? 0)}px`,
      `working surface starts outside the first viewport at ${Math.round(workingSurfaceBox?.y ?? -1)}px`
    ),
  ];

  const routeRuleMap = new Map(routeRuleResults.map((item) => [item.id, item]));
  const orderedRouteRuleResults = routeSpecificRuleIds.map((id) => (
    routeRuleMap.get(id) || { id, status: 'unmeasured' as const, evidence: 'route-specific browser evidence was not supplied' }
  ));
  const runtimeRule = result(
    'browser-runtime-errors',
    unexpectedConsoleErrors.length === 0 && unexpectedNetworkFailures.length === 0,
    'no unexplained browser console error or failed request was observed',
    `${unexpectedConsoleErrors.length} unexplained console errors and ${unexpectedNetworkFailures.length} failed requests were observed`
  );
  const ruleResults = [...automaticRuleResults, ...orderedRouteRuleResults, runtimeRule];

  const requiredStatesMissing = pilot.requiredStates.filter((state) => !testedStates.includes(state));
  if (artifactId && !/^[a-z0-9-]+$/.test(artifactId)) {
    throw new Error('visual receipt artifactId must contain only lowercase letters, numbers, and hyphens');
  }
  const artifactSuffix = artifactId ? `-${artifactId}` : '';
  const screenshotPath = testInfo.outputPath(`admin-visual-receipt${artifactSuffix}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });

  const receipt = {
    schema_version: 1,
    route,
    page_model: pageModel,
    ...sourceEvidence(),
    environment,
    viewport,
    tested_states: [...new Set(testedStates)].sort(),
    rule_results: ruleResults,
    screenshot_paths: [basename(screenshotPath)],
    interaction_results: interactionResults,
    console_errors: unexpectedConsoleErrors,
    network_failures: unexpectedNetworkFailures,
    review_required_items: visualReviewItems,
    human_acceptance: humanAcceptance,
    generated_at: new Date().toISOString(),
  };
  const receiptPath = testInfo.outputPath(`admin-visual-receipt${artifactSuffix}.json`);
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await testInfo.attach(`admin-visual-receipt${artifactSuffix}`, { path: receiptPath, contentType: 'application/json' });
  await testInfo.attach(`admin-visual-receipt-screenshot${artifactSuffix}`, { path: screenshotPath, contentType: 'image/png' });

  const blockingRuleResults = ruleResults.filter((item) => item.status === 'fail' || item.status === 'unmeasured');
  const blockingInteractions = interactionResults.filter((item) => item.status === 'fail' || item.status === 'unmeasured');
  expect(requiredStatesMissing, 'visual receipt must cover every manifest-required state').toEqual([]);
  expect(ruleResults.map((item) => item.id), 'visual receipt must preserve the manifest rule order').toEqual(
    manifest.visualGovernance.rules.map((item) => item.id)
  );
  expect(blockingRuleResults, 'hard visual rules must be measured and pass or be explicitly not applicable').toEqual([]);
  expect(blockingInteractions, 'required interactions must be measured and pass or be explicitly not applicable').toEqual([]);

  return receipt;
}
