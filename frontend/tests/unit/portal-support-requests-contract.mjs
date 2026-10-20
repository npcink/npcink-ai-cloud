import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const portalNavbarPath = resolve(root, 'src/components/portal/PortalNavbar.tsx');
const portalSupportPagePath = resolve(root, 'src/app/portal/support/page.tsx');
const portalSupportDetailPagePath = resolve(root, 'src/app/portal/support/[requestId]/page.tsx');
const portalBillingPagePath = resolve(root, 'src/app/portal/billing/page.tsx');
const portalPackagePanelPath = resolve(root, 'src/components/portal/PortalPackageChangePanel.tsx');
const portalClientPath = resolve(root, 'src/lib/portal-client.ts');
const adminLayoutPath = resolve(root, 'src/app/admin/layout.tsx');
const adminSupportPagePaths = [
  resolve(root, 'src/app/admin/support-requests/page.tsx'),
  resolve(root, 'src/features/admin/support-requests/api.ts'),
  resolve(root, 'src/features/admin/support-requests/directory-model.ts'),
  resolve(root, 'src/features/admin/support-requests/SupportRequestsWorkspace.tsx'),
];
const adminSupportDetailPagePath = resolve(root, 'src/app/admin/support-requests/[requestId]/page.tsx');
const adminProxyPath = resolve(root, 'src/app/api/admin/[...path]/route.ts');
const i18nPath = resolve(root, 'src/lib/i18n.ts');

const portalNavbarSource = readFileSync(portalNavbarPath, 'utf8');
const portalSupportPageSource = readFileSync(portalSupportPagePath, 'utf8');
const portalSupportDetailPageSource = readFileSync(portalSupportDetailPagePath, 'utf8');
const portalBillingPageSource = readFileSync(portalBillingPagePath, 'utf8');
const portalPackagePanelSource = readFileSync(portalPackagePanelPath, 'utf8');
const portalClientSource = readFileSync(portalClientPath, 'utf8');
const adminLayoutSource = readFileSync(adminLayoutPath, 'utf8');
const adminSupportPageSource = adminSupportPagePaths
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
const adminSupportDetailPageSource = readFileSync(adminSupportDetailPagePath, 'utf8');
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
  /listError[\s\S]*listErrorCode[\s\S]*formError/,
  'Portal support must keep list recovery separate from ticket submission errors'
);
assert.match(
  portalSupportPageSource,
  /portal\.site_selection_required[\s\S]*PortalEmptyState[\s\S]*support_context_required_action/,
  'Portal support must provide a bounded recovery path when account context requires site selection'
);
assert.match(
  portalSupportPageSource,
  /handleSiteChange\(event\.target\.value\)[\s\S]*id="portal-support-site-selector"|id="portal-support-site-selector"[\s\S]*handleSiteChange\(event\.target\.value\)/,
  'Portal support must keep site context in the ticket-list toolbar instead of spending a header row on it'
);
assert.match(
  portalSupportPageSource,
  /formatPortalWriteErrorMessage/,
  'Portal support writes must distinguish an unconfirmed result from a definitive save failure'
);
assert.match(
  portalSupportPageSource,
  /<Modal[\s\S]*data-portal-support="new-ticket-dialog"/,
  'Portal ticket creation must open in a focused dialog instead of displacing ticket history'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="ticket-guide"[\s\S]*support_guide_categories[\s\S]*support_guide_response/,
  'Portal support must show problem category and response guidance under the title group'
);
assert.match(
  portalSupportPageSource,
  /primaryAction=\{[\s\S]*support_request_new_action/,
  'Portal submit-ticket action must sit in the title info group via primaryAction'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="status-filters"/,
  'Portal ticket status filters must remain available but demoted to a secondary control group'
);

