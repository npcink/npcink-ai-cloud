import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fromFrontendRoot } from './_paths.mjs';

const frontendRoot = fromFrontendRoot('.');
const repositoryRoot = fromFrontendRoot('..');
const adminRoot = fromFrontendRoot('src/app/admin');
const adminComponentsRoot = fromFrontendRoot('src/components/admin');
const backofficeComponentsRoot = fromFrontendRoot('src/components/backoffice');
const manifest = JSON.parse(readFileSync(fromFrontendRoot('admin-ui-manifest.json'), 'utf8'));
const standardSource = readFileSync(join(repositoryRoot, 'docs/cloud-admin-ui-standard-v1.md'), 'utf8');
const architectureSource = readFileSync(join(repositoryRoot, 'docs/cloud-admin-information-architecture-v2.md'), 'utf8');
const agentsSource = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8');
const pullRequestTemplateSource = readFileSync(join(repositoryRoot, '.github/pull_request_template.md'), 'utf8');
const globalStylesSource = readFileSync(fromFrontendRoot('src/app/globals.css'), 'utf8');
const tailwindConfigSource = readFileSync(fromFrontendRoot('tailwind.config.ts'), 'utf8');
const layoutSource = readFileSync(fromFrontendRoot('src/app/admin/layout.tsx'), 'utf8');
const workbenchSource = readFileSync(fromFrontendRoot('src/components/admin/AdminWorkbenchDialog.tsx'), 'utf8');
const configurationTableSource = readFileSync(fromFrontendRoot('src/components/admin/AdminConfigurationTable.tsx'), 'utf8');
const emptyStateSource = readFileSync(fromFrontendRoot('src/components/admin/AdminEmptyState.tsx'), 'utf8');
const backofficeScaffoldSource = readFileSync(fromFrontendRoot('src/components/backoffice/BackofficeScaffold.tsx'), 'utf8');
const providerPageSource = readFileSync(fromFrontendRoot('src/app/admin/ai-resources/page.tsx'), 'utf8');
const providerTableSource = readFileSync(fromFrontendRoot('src/components/admin/SupplierConnectionTables.tsx'), 'utf8');
const externalServicesPageSource = readFileSync(fromFrontendRoot('src/app/admin/external-services/page.tsx'), 'utf8');
const subscriptionsPageSource = readFileSync(fromFrontendRoot('src/app/admin/subscriptions/page.tsx'), 'utf8');
const subscriptionDetailPageSource = readFileSync(fromFrontendRoot('src/app/admin/subscriptions/[subscriptionId]/page.tsx'), 'utf8');
const troubleshootingPageSource = readFileSync(fromFrontendRoot('src/app/admin/troubleshooting/page.tsx'), 'utf8');
const vectorSettingsPageSource = readFileSync(fromFrontendRoot('src/app/admin/vector-settings/page.tsx'), 'utf8');
const runtimeProfilesPageSource = readFileSync(fromFrontendRoot('src/app/admin/runtime-profiles/page.tsx'), 'utf8');
const serviceSettingsPageSource = readFileSync(fromFrontendRoot('src/app/admin/service-settings/page.tsx'), 'utf8');
const creditPacksPageSource = readFileSync(fromFrontendRoot('src/app/admin/credit-packs/page.tsx'), 'utf8');
const siteCompliancePageSource = readFileSync(fromFrontendRoot('src/app/admin/site-compliance/page.tsx'), 'utf8');
const unifiedOperationalHeaderSources = [
  ['overview', 'src/app/admin/page.tsx'],
  ['accounts', 'src/app/admin/accounts/page.tsx'],
  ['account detail', 'src/app/admin/accounts/[accountId]/page.tsx'],
  ['AI resources', 'src/app/admin/ai-resources/page.tsx'],
  ['AI advisor', 'src/app/admin/ai-advisor/page.tsx'],
  ['coverage', 'src/app/admin/coverage/page.tsx'],
  ['plans', 'src/app/admin/plans/page.tsx'],
  ['site detail', 'src/app/admin/sites/[siteId]/page.tsx'],
  ['subscriptions', 'src/app/admin/subscriptions/page.tsx'],
  ['subscription detail', 'src/app/admin/subscriptions/[subscriptionId]/page.tsx'],
  ['support queue', 'src/features/admin/support-requests/SupportRequestsWorkspace.tsx'],
  ['support detail', 'src/app/admin/support-requests/[requestId]/page.tsx'],
  ['external services', 'src/app/admin/external-services/page.tsx'],
  ['troubleshooting', 'src/app/admin/troubleshooting/page.tsx'],
  ['agent feedback', 'src/app/admin/agent-feedback/page.tsx'],
  ['media observability', 'src/app/admin/media-observability/page.tsx'],
  ['plugin observability', 'src/app/admin/plugin-observability/page.tsx'],
  ['vector observability', 'src/app/admin/vector-observability/page.tsx'],
].map(([name, path]) => [name, readFileSync(fromFrontendRoot(path), 'utf8')]);

function listFiles(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path, predicate);
    return entry.isFile() && predicate(path) ? [path] : [];
  });
}

function routeForPage(path) {
  const routePart = relative(adminRoot, path)
    .split(sep)
    .slice(0, -1)
    .join('/');
  return routePart ? `/admin/${routePart}` : '/admin';
}

assert.equal(manifest.version, 7, 'admin UI manifest version must be explicit');
assert.match(
  tailwindConfigSource,
  /\.\/src\/features\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}/,
  'Tailwind must compile utility classes owned by feature modules'
);
assert.equal(manifest.referenceRoute, '/admin/ai-resources', 'the accepted provider queue must remain the reference route');
assert.equal(manifest.routes[manifest.referenceRoute], 'queue', 'the reference route must remain a queue page');
assert.deepEqual(
  manifest.referenceRoutes,
  {
    queue: '/admin/ai-resources',
    configuration: '/admin/external-services',
    diagnostic: '/admin/troubleshooting',
  },
  'accepted reference routes must cover the queue, configuration, and diagnostic models'
);
assert.deepEqual(
  manifest.pageModels,
  ['overview', 'queue', 'detail', 'configuration', 'diagnostic', 'authentication'],
  'the executable manifest must keep the six accepted page models'
);

const actualRoutes = listFiles(adminRoot, (path) => path.endsWith(`${sep}page.tsx`))
  .map(routeForPage)
  .sort();
const manifestRoutes = Object.keys(manifest.routes).sort();
const architectureRoutes = new Map(
  architectureSource
    .split('\n')
    .map((line) => line.match(/^\| `([^`]+)` \| [^|]+ \| `([^`]+)` \|/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]])
);
assert.deepEqual(
  manifestRoutes,
  actualRoutes,
  'every admin page must be classified exactly once in frontend/admin-ui-manifest.json'
);

for (const [route, pageModel] of Object.entries(manifest.routes)) {
  assert.ok(manifest.pageModels.includes(pageModel), `${route} uses unsupported page model ${pageModel}`);
  assert.equal(
    architectureRoutes.get(route),
    pageModel,
    `${route} must keep the same page model in the executable manifest and authoritative IA matrix`
  );
}

assert.deepEqual(
  manifest.geometry,
  {
    sidebarExpandedPx: 208,
    sidebarCollapsedPx: 64,
    workbenchMaxWidthPx: 1152,
    workbenchCompactMaxWidthPx: 960,
  },
  'accepted PC geometry must change through a reviewed manifest update'
);
assert.deepEqual(
  manifest.surfacePolicy,
  {
    configurationTableBoundary: 'header-only',
    dataTableBoundary: 'rows',
    dialogBoundary: 'solid',
    formControlBoundary: 'solid',
    dashedBoundaryPrimitive: 'AdminEmptyState',
  },
  'admin surface boundaries must change through a reviewed manifest update'
);
assert.match(
  globalStylesSource,
  /--admin-sidebar-expanded:\s*13rem[\s\S]*--admin-sidebar-collapsed:\s*4rem[\s\S]*--admin-workbench-max-width:\s*72rem[\s\S]*--admin-workbench-compact-max-width:\s*60rem/,
  'accepted PC dimensions must be implemented as shared CSS tokens'
);
assert.match(
  globalStylesSource,
  /\[data-density="compact"\] \.input \{[\s\S]*height: var\(--admin-compact-control-height\)[\s\S]*border-radius: var\(--admin-compact-radius\)[\s\S]*padding-block: 0\.25rem[\s\S]*line-height: 1\.25rem[\s\S]*\[data-density="compact"\] select\.input \{[\s\S]*padding-right: 2rem[\s\S]*\[data-density="compact"\] \.input:focus \{[\s\S]*box-shadow: 0 0 0 1px/,
  'compact controls must reduce height, padding, radius, select inset, and focus ring together'
);
assert.match(layoutSource, /admin-sidebar[\s\S]*admin-shell-content/, 'the admin shell must consume shared geometry classes');
assert.doesNotMatch(
  layoutSource,
  /(?:w-52|w-60|lg:pl-52|lg:pl-60)/,
  'the admin shell must not repeat accepted sidebar width literals'
);
assert.match(
  workbenchSource,
  /data-ui="admin-workbench-dialog"[\s\S]*aria-modal="true"[\s\S]*admin-workbench-dialog/,
  'shared workbench dialog must own geometry and accessible modal behavior'
);
assert.doesNotMatch(
  workbenchSource,
  /max-w-(?:4xl|5xl|6xl)|max-w-\[(?:960|1152)px\]/,
  'shared workbench width must come from the admin token'
);
assert.match(
  workbenchSource,
  /grid min-h-0 flex-1 auto-rows-max content-start gap-3 overflow-y-auto/,
  'workbench sections must keep natural row height and scroll instead of overlapping under dense data'
);
assert.match(
  workbenchSource,
  /data-ui="admin-workbench-close"[\s\S]*?'h-9 w-9 rounded-lg'/,
  'the shared workbench close action must remain a quiet ghost control'
);
assert.doesNotMatch(
  workbenchSource,
  /data-ui="admin-workbench-close"[\s\S]*?rounded-full border border-slate-200/,
  'the shared workbench close action must not add another circular framed surface'
);

for (const primitive of [
  'AdminActionMenu',
  'AdminConfigurationTable',
  'AdminDataTableFrame',
  'AdminEmptyState',
  'AdminWorkbenchDialog',
  'AdminCredentialField',
  'AdminSettingsWorkbench',
  'AdminSettingsDisclosure',
]) {
  const primitivePath = fromFrontendRoot(`src/components/admin/${primitive}.tsx`);
  assert.ok(statSync(primitivePath).isFile(), `${primitive} must remain a shared admin primitive`);
  assert.ok(standardSource.includes(`\`${primitive}\``), `${primitive} must remain documented in the UI standard`);
}

assert.match(
  providerPageSource,
  /AdminConfigurationTable[\s\S]*AdminCredentialField[\s\S]*rowId="image-response-format"[\s\S]*rowId="image-output-hosts"/,
  'the reference provider editor must reuse configuration-table and credential primitives'
);
assert.match(
  providerPageSource,
  /data-ui="model-visibility-toolbar"[\s\S]*data-ui="model-maintenance-table"[\s\S]*rowId="manual-model-add"[\s\S]*data-ui="model-clear-all-confirm"/,
  'the reference provider editor must keep model controls in one stable toolbar and in-flow maintenance table'
);
assert.doesNotMatch(
  providerPageSource,
  /model_visibility_more_operations[\s\S]*sm:absolute sm:right-0 sm:z-30/,
  'the reference provider editor must not cover model rows with a floating maintenance panel'
);
assert.match(
  providerTableSource,
  /AdminDataTableFrame[\s\S]*data-ui="model-supplier-table"[\s\S]*<thead[\s\S]*<tbody/,
  'the reference queue must reuse the shared semantic table frame'
);
assert.match(
  externalServicesPageSource,
  /AdminDataTableFrame[\s\S]*data-ui="external-service-table"[\s\S]*<thead[\s\S]*<tbody/,
  'the reference configuration page must reuse the shared semantic table frame'
);
assert.match(
  serviceSettingsPageSource,
  /AdminSettingsWorkbench[\s\S]*AdminConfigurationTable[\s\S]*AdminCredentialField[\s\S]*AdminWorkbenchDialog/,
  'the compact service settings reference must reuse directory, table, credential, and workbench primitives'
);
assert.match(
  externalServicesPageSource,
  /AdminWorkbenchDialog[\s\S]*AdminConfigurationTable[\s\S]*AdminCredentialField/,
  'the reference configuration page must reuse workbench, configuration-table, and credential primitives'
);
assert.match(
  backofficeScaffoldSource,
  /export function BackofficePageHeader[\s\S]*descriptionDisplay="hint"[\s\S]*actionPlacement="header"[\s\S]*contentClassName="px-4 py-3 md:px-4 md:py-3"[\s\S]*summaryClassName="px-4 py-2\.5 md:px-4 md:py-2\.5"[\s\S]*<BackofficeSummaryStrip[\s\S]*density="compact"[\s\S]*export function BackofficeConfigurationHeader[\s\S]*<BackofficePageHeader/,
  'the shared page header must own compact geometry, hint disclosure, action placement, and summary density while keeping the configuration alias'
);
for (const [name, source] of [
  ['vector settings', vectorSettingsPageSource],
  ['runtime profiles', runtimeProfilesPageSource],
  ['credit packs', creditPacksPageSource],
  ['service settings', serviceSettingsPageSource],
  ['site compliance', siteCompliancePageSource],
]) {
  assert.match(source, /<BackofficeConfigurationHeader/, `${name} must use the shared configuration header`);
  assert.doesNotMatch(source, /<BackofficePrimaryPanel/, `${name} must not fork configuration-header geometry`);
  assert.match(source, /summaryItems=\{(?:\[|metrics)/, `${name} must project its readiness facts through the shared summary slot`);
}
assert.match(
  externalServicesPageSource,
  /<BackofficePageHeader[\s\S]*secondaryAction=\{<Link href="\/admin\/troubleshooting"[\s\S]*summaryItems=\{\[/,
  'external services must use the shared page header and keep diagnostics secondary to row-level configuration work'
);
for (const [name, source] of unifiedOperationalHeaderSources) {
  assert.match(source, /<BackofficePageHeader/, `${name} must use the shared top-level page header`);
}
assert.match(
  standardSource,
  /Every non-authentication Admin route uses `BackofficePageHeader`[\s\S]*`BackofficeConfigurationHeader` remains the[\s\S]*compatibility alias[\s\S]*Use\s+`BackofficeLayer` only for a section inside the page/,
  'the Admin UI standard must distinguish the page header from nested section headers'
);
assert.match(
  vectorSettingsPageSource,
  /<BackofficeConfigurationHeader[\s\S]*secondaryAction=\{[\s\S]*href="\/admin\/vector-observability"[\s\S]*summaryItems=\{\[/,
  'vector settings must keep diagnostics secondary to configuration work'
);
assert.match(
  runtimeProfilesPageSource,
  /data-page-model="configuration"[\s\S]*<BackofficeConfigurationHeader[\s\S]*secondaryAction=\{[\s\S]*href="\/admin\/ai-resources"[\s\S]*primaryAction=\{[\s\S]*saveProfiles\(\)[\s\S]*summaryItems=\{\[[\s\S]*summaryAside=/,
  'runtime profiles must declare its page model and keep supplier navigation secondary to the one save action'
);
assert.match(
  configurationTableSource,
  /data-ui="admin-configuration-table"[\s\S]*data-boundary="header-only"[\s\S]*className="overflow-hidden"[\s\S]*<table[\s\S]*<thead[\s\S]*<tbody/,
  'the shared short configuration table must retain a header boundary without a repeated outer frame'
);
assert.doesNotMatch(
  configurationTableSource,
  /rounded-lg border border-slate-200/,
  'the shared configuration table must not restore a default rounded outer frame'
);
assert.doesNotMatch(
  configurationTableSource,
  /\bdivide-y\b/,
  'the shared short configuration table must use whitespace instead of body row dividers'
);
assert.match(
  emptyStateSource,
  /data-ui="admin-empty-state"[\s\S]*data-surface-state="empty"[\s\S]*border-dashed/,
  'the shared empty-state primitive must own the approved dashed boundary'
);

const dashedBoundaryFiles = [
  ...listFiles(adminRoot, (path) => path.endsWith('.tsx')),
  ...listFiles(adminComponentsRoot, (path) => path.endsWith('.tsx')),
  ...listFiles(backofficeComponentsRoot, (path) => path.endsWith('.tsx')),
]
  .filter((path) => /border-dashed/.test(readFileSync(path, 'utf8')))
  .map((path) => relative(frontendRoot, path).split(sep).join('/'))
  .sort();
assert.deepEqual(
  dashedBoundaryFiles,
  ['src/components/admin/AdminEmptyState.tsx'],
  'dashed Admin boundaries are reserved for the shared semantic empty-state primitive'
);

const routeLocalDialogFiles = listFiles(adminRoot, (path) => path.endsWith('.tsx'))
  .filter((path) => /role="dialog"|aria-modal="true"|fixed inset-0/.test(readFileSync(path, 'utf8')))
  .map((path) => relative(frontendRoot, path).split(sep).join('/'))
  .sort();
const allowedLegacyDialogs = [...manifest.legacyRouteLocalDialogs].sort();
assert.deepEqual(
  routeLocalDialogFiles,
  allowedLegacyDialogs,
  'new route-local dialogs are forbidden; migrate an existing exception instead of growing the list'
);

const routeLocalCredentialFiles = listFiles(adminRoot, (path) => path.endsWith('.tsx'))
  .filter((path) => /type=(?:{"password"}|"password"|'password')/.test(readFileSync(path, 'utf8')))
  .map((path) => relative(frontendRoot, path).split(sep).join('/'))
  .sort();
const allowedLegacyCredentials = [...manifest.legacyRouteLocalCredentials].sort();
assert.deepEqual(
  routeLocalCredentialFiles,
  allowedLegacyCredentials,
  'new route-local credential fields are forbidden; use AdminCredentialField and reduce the legacy list'
);

for (const requiredEntry of [
  'docs/cloud-admin-ui-standard-v1.md',
  'frontend/admin-ui-manifest.json',
  'pnpm run check:admin-ui',
  'pnpm run check:admin-ui:visual',
  'border-dashed',
]) {
  assert.ok(agentsSource.includes(requiredEntry), `AGENTS.md must require ${requiredEntry}`);
}
for (const requiredPullRequestField of [
  'Page model:',
  'Shared primitives reused:',
  'Low-frequency detail moved behind:',
  'pnpm run check:admin-ui',
]) {
  assert.ok(
    pullRequestTemplateSource.includes(requiredPullRequestField),
    `pull request template must require ${requiredPullRequestField}`
  );
}

console.log(
  `admin_ui_governance_contract: ok (${actualRoutes.length} routes, ${allowedLegacyDialogs.length} legacy dialogs, ${allowedLegacyCredentials.length} legacy credential surfaces)`
);
