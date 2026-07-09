import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const portalNavbarPath = resolve(root, 'src/components/portal/PortalNavbar.tsx');
const portalSupportPagePath = resolve(root, 'src/app/portal/support/page.tsx');
const portalBillingPagePath = resolve(root, 'src/app/portal/billing/page.tsx');
const portalClientPath = resolve(root, 'src/lib/portal-client.ts');
const adminLayoutPath = resolve(root, 'src/app/admin/layout.tsx');
const adminSupportPagePath = resolve(root, 'src/app/admin/support-requests/page.tsx');
const adminProxyPath = resolve(root, 'src/app/api/admin/[...path]/route.ts');
const i18nPath = resolve(root, 'src/lib/i18n.ts');

const portalNavbarSource = readFileSync(portalNavbarPath, 'utf8');
const portalSupportPageSource = readFileSync(portalSupportPagePath, 'utf8');
const portalBillingPageSource = readFileSync(portalBillingPagePath, 'utf8');
const portalClientSource = readFileSync(portalClientPath, 'utf8');
const adminLayoutSource = readFileSync(adminLayoutPath, 'utf8');
const adminSupportPageSource = readFileSync(adminSupportPagePath, 'utf8');
const adminProxySource = readFileSync(adminProxyPath, 'utf8');
const i18nSource = readFileSync(i18nPath, 'utf8');

assert.match(
  portalNavbarSource,
  /href: '\/portal\/support'[\s\S]*portal\.nav_support_requests/,
  'Portal navigation must expose a support request tab'
);
assert.match(
  portalSupportPageSource,
  /portalClient\.listSupportRequests[\s\S]*portalClient\.createSupportRequest/,
  'Portal support page must list and create support requests through the Portal client'
);
assert.match(
  portalSupportPageSource,
  /SUPPORT_TOPICS[\s\S]*billing[\s\S]*payment[\s\S]*site[\s\S]*usage[\s\S]*account[\s\S]*general/,
  'Portal support form must expose bounded customer-support topics'
);
assert.match(
  portalBillingPageSource,
  /\/portal\/support\?new=1&topic=billing/,
  'Portal package page must open the ticket form for package or payment issues'
);
assert.doesNotMatch(
  portalBillingPageSource,
  /portal\.billing\.help_title|portal\.billing\.help_desc/,
  'Portal package page must not keep a separate help card after the ticket tab exists'
);
assert.match(
  portalClientSource,
  /async listSupportRequests[\s\S]*\/support-requests/,
  'Portal client must expose support request listing'
);
assert.match(
  portalClientSource,
  /async createSupportRequest[\s\S]*'POST', '\/support-requests'/,
  'Portal client must expose support request creation'
);
assert.match(
  adminLayoutSource,
  /href: '\/admin\/support-requests'[\s\S]*admin\.nav_support_requests/,
  'Admin navigation must expose the support request queue'
);
assert.match(
  adminSupportPageSource,
  /fetch\(`\/api\/admin\/support-requests\?\$\{params\.toString\(\)\}`/,
  'Admin support page must load the support request queue through the admin proxy'
);
assert.match(
  adminSupportPageSource,
  /\/api\/admin\/support-requests\/\$\{encodeURIComponent\(requestId\)\}[\s\S]*method: 'PATCH'/,
  'Admin support page must update ticket status through the admin proxy'
);
assert.match(
  adminProxySource,
  /PATCH[\s\S]*\^support-requests\\\/\[\^\/\]\+\$/,
  'Admin proxy must route support request status updates to the admin service namespace'
);
assert.match(
  i18nSource,
  /portal\.nav_support_requests[\s\S]*portal\.support_status_in_progress[\s\S]*admin\.nav_support_requests[\s\S]*admin\.support_status_in_progress/,
  'Support request Portal and Admin labels must be localized'
);
