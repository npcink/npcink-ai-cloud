import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const client = fs.readFileSync(fromFrontendRoot('src/lib/portal-client.ts'), 'utf8');
const journey = fs.readFileSync(fromFrontendRoot('src/lib/portal-customer-journey.ts'), 'utf8');
const boundary = fs.readFileSync(fromFrontendRoot('src/components/portal/PortalSessionBoundary.tsx'), 'utf8');
const connect = fs.readFileSync(fromFrontendRoot('src/components/portal/PortalSiteConnectPanel.tsx'), 'utf8');

assert.match(client, /\/sites\/\$\{siteId\}\/customer-journey\/events/);
assert.match(client, /contract_version: 'customer_journey_event\.v1'/);
assert.match(journey, /surface: 'portal'/);
assert.match(journey, /window\.sessionStorage/);
assert.match(journey, /catch \{/);
assert.match(boundary, /'login', 'succeeded'/);
assert.match(connect, /'site_connect',\s*'succeeded'/);
for (const forbidden of ['pathname', 'location.href', 'document.', 'innerHTML', 'prompt:', 'content:', 'email:']) {
  assert.equal(journey.includes(forbidden), false, `journey reporter must omit ${forbidden}`);
}

console.log('[ok] Portal customer journey uses a closed site-scoped metadata contract and never blocks product actions.');
