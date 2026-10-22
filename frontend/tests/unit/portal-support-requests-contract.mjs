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
  'Portal support must keep problem category and response guidance in a quiet title ⓘ hint'
);
assert.match(
  portalSupportPageSource,
  /actions=\{\([\s\S]*data-portal-support="header-actions"[\s\S]*data-portal-support="status-filters"[\s\S]*data-portal-support="submit-ticket"/,
  'Portal support header must keep status filters and submit icon in the title-end actions group'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="status-filters"/,
  'Portal ticket status filters must remain available but demoted to a secondary control group'
);

assert.match(
  portalSupportPageSource,
  /data-portal-support="tickets-table"[\s\S]*min-w-\[720px\]/,
  'Portal support PC tickets table must use a quieter min-width that fits quieter portal chrome'
);
assert.doesNotMatch(
  portalSupportPageSource,
  /min-w-\[980px\]/,
  'Portal support PC tickets table must not keep the wider 980px floor'
);
assert.match(
  portalSupportPageSource,
  /max-w-\[16rem\][\s\S]*max-w-\[10rem\]/,
  'Portal support PC ticket title/site cells must use the narrower max-width caps'
);
assert.doesNotMatch(
  portalSupportPageSource,
  /max-w-\[26rem\]|max-w-\[14rem\]/,
  'Portal support PC ticket title/site cells must not keep the older wider max-width caps'
);

assert.doesNotMatch(
  portalSupportPageSource,
  /data-portal-support="list-toolbar"/,
  'Portal support must not keep an in-card list toolbar row for filters'
);
assert.match(
  portalSupportPageSource,
  /PortalPageStack className="space-y-3"/,
  'Portal support page stack must use tighter title-to-list spacing'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="header-actions"[\s\S]*status-filters[\s\S]*submit-ticket/,
  'Portal support filters must sit in the header actions cluster before the submit icon'
);
assert.match(
  readFileSync(resolve(process.cwd(), 'src/components/portal/PortalWorkspaceHeader.tsx'), 'utf8'),
  /actionsPlacement === 'title-end'[\s\S]*data-portal-header-actions="title-end"/,
  'PortalWorkspaceHeader title-end actions must use a right-edge wrapper'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="submit-ticket"[\s\S]*portal\.support_request_new_action[\s\S]*PortalActionIcon id="ticket-new"/,
  'Portal submit-ticket header control must be an accessible icon button'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="view-detail"[\s\S]*PortalActionIcon id="view-detail"/,
  'Portal ticket row detail control must be an accessible icon link'
);
assert.doesNotMatch(
  portalSupportPageSource,
  /<p className="text-xs font-medium[\s\S]*portal\.support_filter_label/,
  'Portal support must not show a visible Filter by status label'
);
assert.doesNotMatch(
  portalSupportPageSource,
  /: <p className="text-sm text-slate-500">\{t\('portal\.support_account_scope_label'\)\}<\/p>/,
  'Portal support must not show a standing Account scope label on the list toolbar'
);


assert.match(
  portalSupportPageSource,
  /actionsPlacement="title-end"/,
  'Portal support header must place filters/submit at the title-end edge'
);


assert.doesNotMatch(
  portalSupportDetailPageSource,
  /common\.back/,
  'Ticket detail must not show a redundant Back action beside the breadcrumb'
);
assert.match(
  portalSupportDetailPageSource,
  /titleDisplay="sr-only"/,
  'Ticket detail must hide the large H1 when breadcrumb already shows 工单 / title'
);
assert.doesNotMatch(
  portalSupportDetailPageSource,
  /data-portal-support="ticket-description"/,
  'Ticket detail must not keep a separate description card that duplicates the first customer bubble'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="message-thread"[\s\S]*bubble-customer[\s\S]*bubble-operator/,
  'Ticket detail must render Q&A as left/right chat bubbles'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="system-line"/,
  'Ticket detail must render system status changes as thin centered lines'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="composer"[\s\S]*data-portal-support="reply-actions"[\s\S]*composer-attach[\s\S]*refresh-detail[\s\S]*support_message_reply_action/,
  'Ticket detail must use a compact composer with attach, refresh, and send'
);
assert.doesNotMatch(
  portalSupportDetailPageSource,
  /data-portal-support="reply-reopen-notice"[\s\S]*border-amber-200 bg-amber-50/,
  'Ticket detail must not keep the tall amber reopen banner'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="feedback-resolved-segment"[\s\S]*data-portal-support="feedback-rating-stars"/,
  'Close evaluation must use a resolved segment and star rating instead of wide selects'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="close-evaluation"[\s\S]*justify-end[\s\S]*support_feedback_submit_action/,
  'Close evaluation submit must be right-aligned'
);

assert.doesNotMatch(
  portalSupportPageSource,
  /data-portal-support="status-rules"/,
  'Portal support list must not keep a standing ticket-status legend card'
);
assert.match(
  portalSupportPageSource,
  /data-portal-support="ticket-guide"[\s\S]*support_guide_status_summary/,
  'Portal support must keep status meaning in the quiet title ⓘ hint'
);

assert.match(
  readFileSync(resolve(process.cwd(), 'src/components/portal/PortalWorkspaceHeader.tsx'), 'utf8'),
  /titleDisplay\?: 'visible' \| 'sr-only'/,
  'PortalWorkspaceHeader must support sr-only title for breadcrumb-led detail pages'
);


assert.match(
  portalSupportDetailPageSource,
  /statusTone\(supportRequest\.status\)[\s\S]{0,120}force|force[\s\S]{0,80}statusTone\(supportRequest\.status\)/,
  'Ticket detail status badge must force-render so resolved is never silenced'
);
assert.match(
  portalSupportPageSource,
  /statusTone\(item\.status\)[\s\S]{0,120}force/,
  'Ticket list status badges must force-render so resolved is never silenced'
);
assert.match(
  portalSupportDetailPageSource,
  /rounded-2xl[\s\S]*data-portal-support="composer-shell"|data-portal-support="composer-shell"[\s\S]*rounded-2xl/,
  'Ticket composer must use a rounded shell matching bubble radius'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="refresh-detail"[\s\S]*absolute|absolute[\s\S]*data-portal-support="refresh-detail"/,
  'Ticket refresh must sit inside the input trailing corner, not beside send'
);
assert.match(
  portalSupportDetailPageSource,
  /text-right[\s\S]*data-portal-support="reply-reopen-notice"|data-portal-support="reply-reopen-notice"[\s\S]*text-right/,
  'Reopen hint must be right-aligned under the composer send side'
);
assert.match(
  portalSupportDetailPageSource,
  /max-w-\[30rem\][\s\S]*data-portal-support="close-evaluation"/,
  'Close evaluation must use a narrow centered card (~30rem)'
);
assert.match(
  portalSupportDetailPageSource,
  /data-portal-support="feedback-resolved-segment"[\s\S]*flex-1|flex w-full[\s\S]*feedback-resolved-segment/,
  'Close evaluation segment must span the narrow card width'
);

console.log('portal_support_requests_contract: ok');
