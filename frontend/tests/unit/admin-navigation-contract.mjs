import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromFrontendRoot } from './_paths.mjs';

const read = path => readFileSync(fromFrontendRoot(path), 'utf8');
const manifest = JSON.parse(read('admin-ui-manifest.json'));
const layout = read('src/app/admin/layout.tsx');
const catalog = read('src/features/admin/navigation.ts');
const hrefs = source => [...source.matchAll(/href:\s*'([^']+)'/g)].map(match => match[1].split('?')[0]);
const primary = new Set(hrefs(layout.slice(layout.indexOf('const navGroups'), layout.indexOf('const navItems'))));
const commands = new Set([...primary, ...hrefs(layout.slice(layout.indexOf('const contextualItems'), layout.indexOf('const normalizedCommandQuery')))]);
const families = new Set(hrefs(catalog));
const detailParents = {
  '/admin/accounts/[accountId]': '/admin/accounts',
  '/admin/sites/[siteId]': '/admin/accounts',
  '/admin/subscriptions/[subscriptionId]': '/admin/subscriptions',
  '/admin/support-requests/[requestId]': '/admin/support-requests',
};

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.tsx') ? [path] : [];
  });
}
const sources = ['src/app/admin', 'src/features/admin'].flatMap(path => sourceFiles(fromFrontendRoot(path))).map(path => ({ path, text: readFileSync(path, 'utf8') }));

for (const [route, model] of Object.entries(manifest.routes)) {
  if (model === 'authentication') continue;
  if (model === 'detail') {
    assert.ok(detailParents[route], `${route} needs an explicitly declared owning queue`);
    assert.ok(primary.has(detailParents[route]), `${route} needs a findable owning queue`);
    const prefix = route.split('/[')[0] + '/';
    const ownPage = fromFrontendRoot(`src/app${route}/page.tsx`);
    assert.ok(sources.some(source => source.path !== ownPage && ['`', "'", '"'].some(quote => source.text.includes(quote + prefix))), `${route} needs an inbound object link outside its own page`);
  } else {
    assert.ok(primary.has(route) || families.has(route), `${route} has no primary or visible family entrance`);
    assert.ok(commands.has(route), `${route} is missing from the global quick switcher`);
  }
}
for (const route of [...primary, ...families]) {
  assert.ok(route in manifest.routes, `${route} points at an undeclared page`);
}
assert.match(layout, /adminSecondaryParentHref\(pathname\)/, 'the shell must resolve family parents instead of defaulting auxiliary routes to Overview');
assert.match(layout, /AdminParentNavigationLink/, 'child pages need a clickable parent entrance');
assert.match(layout, /AdminDiagnosticNavigation/, 'diagnostic child pages need visible related entrances');
assert.match(read('src/app/admin/plugin-observability/page.tsx'), /<AdminObservabilityTabs showWindow=\{false\}/, 'plugin investigation must share tabs without duplicating time controls');
console.log(`admin_navigation_contract: ok (${Object.keys(manifest.routes).length} routes; no orphan business page)`);
