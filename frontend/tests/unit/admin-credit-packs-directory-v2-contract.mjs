import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const source = readFileSync(resolve(frontendRoot, 'src/app/admin/credit-packs/page.tsx'), 'utf8');
const defaultSurfaceStart = source.indexOf('<BackofficePageStack className="space-y-5">');
const editorStart = source.indexOf('<AdminWorkbenchDialog', defaultSurfaceStart);
const defaultSurface = source.slice(defaultSurfaceStart, editorStart);
const editorSurface = source.slice(editorStart);

assert.match(source, /usePathname[\s\S]*useRouter[\s\S]*searchParams\.get\('status'\)[\s\S]*searchParams\.get\('focus'\)/, 'Credit pack filter and focus must be URL-backed');
assert.match(source, /requestActiveRef[\s\S]*requestSequenceRef[\s\S]*hasLoadedRef[\s\S]*if \(requestActiveRef\.current\) return/, 'Credit pack reads must deduplicate Strict Mode requests and reject stale replacement');
assert.match(defaultSurface, /BackofficeLayer[\s\S]*BackofficeSummaryStrip[\s\S]*AdminDataTableFrame[\s\S]*data-ui="credit-pack-directory-row"/, 'The default surface must use compact orientation and one comparison table');
assert.doesNotMatch(defaultSurface, /<input|<textarea/, 'The default credit pack directory must be read-only until one pack enters edit mode');
assert.doesNotMatch(defaultSurface, /common\.save|handleSaveDraft/, 'The default header and directory must not expose an ambiguous save-all action');
assert.match(editorSurface, /open=\{Boolean\(draft\)\}[\s\S]*isDraftDirty[\s\S]*handleSaveDraft[\s\S]*AdminConfigurationTable/, 'The shared workbench must use a configuration table and save only an explicitly changed selected pack');
assert.match(source, /items\.map\(\(item\) => item\.pack_id === draft\.pack_id \? normalizeItem\(draft\) : normalizeItem\(item\)\)[\s\S]*saveCatalog\(nextItems\)/, 'One-pack editing must preserve the atomic complete-catalog PATCH contract');
assert.match(source, /useToast\(\)[\s\S]*toast\.success/, 'Successful pack updates must use non-shifting global Toast feedback');
assert.match(source, /credit_packs_edit_boundary[\s\S]*future customer purchases only[\s\S]*Existing payment orders and package entitlement remain unchanged/, 'The workbench must explain purchase snapshot and ownership boundaries');
assert.doesNotMatch(source, /BackofficePrimaryPanel|BackofficeMetricStrip|BackofficeStackCard/, 'The credit pack configuration page must not regress to a hero metric panel or editable card wall');
assert.doesNotMatch(source, /from '@\/components\/ui\/Modal'|<Modal/, 'Credit pack editing must not use a route-local generic modal');

console.log('admin_credit_packs_directory_v2_contract: ok');
