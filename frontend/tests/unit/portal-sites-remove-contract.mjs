import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sitesPagePath = resolve(process.cwd(), 'src/components/portal/PortalSitesWorkspace.tsx');
const siteRecordPagePath = resolve(process.cwd(), 'src/app/portal/sites/[siteId]/page.tsx');
const portalClientPath = resolve(process.cwd(), 'src/lib/portal-client.ts');

const sitesPageSource = readFileSync(sitesPagePath, 'utf8');
const siteRecordPageSource = readFileSync(siteRecordPagePath, 'utf8');
const portalClientSource = readFileSync(portalClientPath, 'utf8');

assert.match(
  portalClientSource,
  /async removeSite\(siteId: string\)[\s\S]*\/sites\/\$\{siteId\}\/remove/,
  'portal client must expose the service-side soft-remove endpoint'
);
assert.match(
  portalClientSource,
  /async getSiteRelinkPolicy\(\)[\s\S]*\/site-relink-policy/,
  'portal client must expose the Cloud-owned read-only relink policy'
);

assert.match(
  sitesPageSource,
  /site\.allowed_actions\?\.includes\('remove_sites'\)[\s\S]*setPendingRemoveSite\(site\)/,
  'the merged service page must use each row permission projection to open the remove confirmation'
);
assert.match(
  sitesPageSource,
  /pendingRemoveSite[\s\S]*portalClient\.removeSite\(pendingRemoveSite\.site_id\)/,
  'the merged service page must wire its confirmed site to the backend remove endpoint'
);
assert.doesNotMatch(
  sitesPageSource,
  /site\.site_id === selectedSiteId|selected_context\?\.allowed_actions\.includes\('remove_sites'\)/,
  'the merged service page must not require an unrelated selected-site context before removal'
);

assert.match(
  sitesPageSource,
  /portal\.remove_site_confirm_with_date[\s\S]*portal\.remove_site_confirm_disabled_with_date/,
  'the merged service page must explain the expected cross-account date and disabled-policy state before confirming'
);

assert.match(
  sitesPageSource,
  /siteRemovalNotice[\s\S]*relink_available_at/,
  'the merged service page must show the authoritative relink date returned after removal'
);

assert.match(
  siteRecordPageSource,
  /remove_sites[\s\S]*portalClient\.removeSite/,
  '/portal/sites/[siteId] must keep the same permission-gated remove action available from the site record'
);
assert.match(
  siteRecordPageSource,
  /getSiteRelinkPolicy[\s\S]*portal\.remove_site_confirm_with_date/,
  '/portal/sites/[siteId] must use the same Cloud-owned policy for its remove confirmation'
);

assert.doesNotMatch(
  `${sitesPageSource}\n${siteRecordPageSource}\n${portalClientSource}`,
  /request\(['"]DELETE['"],\s*`?\/sites/,
  'portal site removal must remain a backend-governed soft remove, not a frontend hard delete'
);

console.log('portal_sites_remove_contract: ok');
