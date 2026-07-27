import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fromFrontendRoot } from './_paths.mjs';

const frontendRoot = fromFrontendRoot('.');
const repositoryRoot = fromFrontendRoot('..');
const adminRoot = fromFrontendRoot('src/app/admin');
const manifest = JSON.parse(readFileSync(fromFrontendRoot('admin-ui-manifest.json'), 'utf8'));
const standardSource = readFileSync(join(repositoryRoot, 'docs/cloud-admin-ui-standard-v1.md'), 'utf8');
const architectureSource = readFileSync(join(repositoryRoot, 'docs/cloud-admin-information-architecture-v2.md'), 'utf8');
const agentsSource = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8');
const pullRequestTemplateSource = readFileSync(join(repositoryRoot, '.github/pull_request_template.md'), 'utf8');
const globalStylesSource = readFileSync(fromFrontendRoot('src/app/globals.css'), 'utf8');
const layoutSource = readFileSync(fromFrontendRoot('src/app/admin/layout.tsx'), 'utf8');
const workbenchSource = readFileSync(fromFrontendRoot('src/components/admin/AdminWorkbenchDialog.tsx'), 'utf8');
const configurationTableSource = readFileSync(fromFrontendRoot('src/components/admin/AdminConfigurationTable.tsx'), 'utf8');
const providerPageSource = readFileSync(fromFrontendRoot('src/app/admin/ai-resources/page.tsx'), 'utf8');
const providerTableSource = readFileSync(fromFrontendRoot('src/components/admin/SupplierConnectionTables.tsx'), 'utf8');
const externalServicesPageSource = readFileSync(fromFrontendRoot('src/app/admin/external-services/page.tsx'), 'utf8');

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

assert.equal(manifest.version, 2, 'admin UI manifest version must be explicit');
assert.equal(manifest.referenceRoute, '/admin/ai-resources', 'the accepted provider queue must remain the reference route');
assert.equal(manifest.routes[manifest.referenceRoute], 'queue', 'the reference route must remain a queue page');
assert.deepEqual(
  manifest.referenceRoutes,
  {
    queue: '/admin/ai-resources',
    configuration: '/admin/external-services',
  },
  'accepted reference routes must cover the queue and configuration models'
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
assert.match(
  globalStylesSource,
  /--admin-sidebar-expanded:\s*13rem[\s\S]*--admin-sidebar-collapsed:\s*4rem[\s\S]*--admin-workbench-max-width:\s*72rem[\s\S]*--admin-workbench-compact-max-width:\s*60rem/,
  'accepted PC dimensions must be implemented as shared CSS tokens'
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

for (const primitive of [
  'AdminConfigurationTable',
  'AdminDataTableFrame',
  'AdminWorkbenchDialog',
  'AdminCredentialField',
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
  externalServicesPageSource,
  /AdminWorkbenchDialog[\s\S]*AdminConfigurationTable[\s\S]*AdminCredentialField/,
  'the reference configuration page must reuse workbench, configuration-table, and credential primitives'
);
assert.match(
  configurationTableSource,
  /data-ui="admin-configuration-table"[\s\S]*<table[\s\S]*<thead[\s\S]*<tbody/,
  'the shared configuration table must retain semantic table structure'
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
