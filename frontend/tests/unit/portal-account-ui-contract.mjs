import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const clientPath = resolve(FRONTEND_ROOT, 'src/lib/portal-client.ts');
const navbarPath = resolve(FRONTEND_ROOT, 'src/components/portal/PortalNavbar.tsx');
const accountPagePath = resolve(FRONTEND_ROOT, 'src/app/portal/account/page.tsx');

const clientSource = readFileSync(clientPath, 'utf8');
const navbarSource = readFileSync(navbarPath, 'utf8');
const accountSource = readFileSync(accountPagePath, 'utf8');

assert.doesNotMatch(
  clientSource,
  /export type ProductIdentityType\b/,
  'the unused ProductIdentityType compatibility alias must stay removed'
);

assert.match(
  clientSource,
  /getIdentityProviders\(\)/,
  'portal client must expose identity provider status'
);

assert.match(
  clientSource,
  /'\/auth\/identity-providers'/,
  'portal client must call the identity provider status endpoint'
);

assert.match(
  clientSource,
  /intent: 'bind'/,
  'QQ bind start must use bind intent instead of login intent'
);

assert.match(
  clientSource,
  /'\/auth\/qq\/unbind'/,
  'portal client must expose QQ unbind'
);

assert.match(
  clientSource,
  /requestEmailChangeCode[\s\S]*'\/account\/email-change\/request'/,
  'portal client must expose the authenticated email-change request endpoint'
);

assert.match(
  clientSource,
  /verifyEmailChangeCode[\s\S]*'\/account\/email-change\/verify'/,
  'portal client must expose the authenticated email-change verification endpoint'
);

assert.match(
  navbarSource,
  /href:\s*['"]\/portal\/account['"]/,
  'portal navigation must include the account center'
);
assert.match(
  navbarSource,
  /primaryNavItems[\s\S]*href:\s*['"]\/portal\/account['"]/,
  'account center must stay in the primary portal navigation'
);

assert.match(
  accountSource,
  /function normalizePortalContact[\s\S]*const contactEmail = normalizePortalContact\(session\?\.email\)/,
  'account center must derive its customer-readable contact only from the explicit session email'
);

assert.doesNotMatch(
  accountSource,
  /resolvePortalContactEmail|session\?\.(?:principal_id|account_id|site_admin_ref)|session\.(?:principal_id|account_id|site_admin_ref)/,
  'account center must not restore principal, account, or legacy contact fallbacks'
);

assert.match(
  accountSource,
  /data-portal-account="login-security"[\s\S]*data-portal-account="contact-info"/,
  'account center must merge sign-in and contact into one login-security surface'
);
assert.match(
  accountSource,
  /<PortalWorkspaceHeader[\s\S]*currentPage="account"[\s\S]*actionsPlacement="title-end"[\s\S]*href="\/portal\/audit"/,
  'account center must use title-end recent activity as its header action'
);
assert.doesNotMatch(
  accountSource,
  /<PortalPrimaryPanel/,
  'account center must not restore the oversized standalone primary panel'
);
assert.match(
  accountSource,
  /portal\.account\.login_security_title[\s\S]*portal\.account\.email_login_desc[\s\S]*!qqProvider\?\.configured && !qqProvider\?\.bound[\s\S]*other-login-unavailable[\s\S]*other_login_methods_title/,
  'account center must use one login-security card and keep unavailable optional login methods as a quiet flat note'
);
assert.doesNotMatch(
  accountSource,
  /other-login-unavailable[\s\S]*<details|other_login_methods_title[\s\S]*<details/,
  'unavailable other login methods must not use a disclosure fold when only one option exists'
);

assert.match(
  accountSource,
  /portalClient\.requestEmailChangeCode[\s\S]*portalClient\.verifyEmailChangeCode/,
  'account center must support self-service verified email changes'
);
assert.match(
  accountSource,
  /<Modal[\s\S]*data-portal-account="email-change-dialog"/,
  'account center must keep verified email changes in a focused dialog'
);

assert.doesNotMatch(
  accountSource,
  /Ask the operator to update the contact email|请先让操作员更新联系人信息/,
  'account center must not tell users to ask an operator for normal email changes'
);

assert.doesNotMatch(
  accountSource,
  /data-portal-account="support-details"/,
  'customer account page must not render an internal support details disclosure'
);

assert.doesNotMatch(
  accountSource,
  /session\.(account_id|role|principal_id)|BackofficeIdentifier|maskSupportIdentifier/,
  'customer account page must not expose internal account, role, or principal identifiers'
);

assert.doesNotMatch(
  accountSource,
  /label:\s*t\('portal\.account\.email_label'[\s\S]*value:\s*accountEmail/,
  'top account summary must not show the raw principal-derived account value'
);

assert.match(
  accountSource,
  /portalClient\.startQqBind/,
  'account center must start QQ binding through the shared client'
);

assert.match(
  accountSource,
  /portalClient\.unbindQqLogin/,
  'account center must support QQ unbinding through the shared client'
);
assert.match(
  accountSource,
  /unbindQqLogin\(\)[\s\S]*setStatus\('idle'\)[\s\S]*window\.location\.assign\('\/portal\/login\?reason=qq_unbound'\)/,
  'QQ unbind must treat revoked-session sign-in as the success path'
);

assert.match(
  accountSource,
  /PortalAccountCommercePanels[\s\S]*surface="account"|surface="account"[\s\S]*PortalAccountCommercePanels/,
  'account center must host payment-order commerce with surface=account'
);
assert.match(
  accountSource,
  /data-portal-account="billing-commerce"/,
  'account center keeps the billing-commerce mount region for payment orders'
);

const commerceSource = readFileSync(resolve(FRONTEND_ROOT, 'src/components/portal/PortalAccountCommercePanels.tsx'), 'utf8');
const paymentHistorySource = readFileSync(resolve(FRONTEND_ROOT, 'src/components/portal/PortalPaymentOrderHistory.tsx'), 'utf8');
assert.doesNotMatch(
  commerceSource,
  /data-portal-account="package-summary"|data-portal-account="upgrade-package"/,
  'account commerce must not render the plan summary row or Upgrade package CTA'
);
assert.doesNotMatch(
  commerceSource,
  /data-portal-account="goto-billing"|portal\.account\.goto_billing/,
  'account commerce must not keep Open Package / 前往套餐'
);
assert.match(
  commerceSource,
  /surface === 'account'[\s\S]*paymentOrdersCard/,
  'account surface renders payment orders only'
);
assert.match(
  commerceSource,
  /surface === 'billing'[\s\S]*id="package-options"[\s\S]*activeCommercialDialog === 'package'/,
  'billing surface hosts the package dialog without an account summary row'
);
assert.doesNotMatch(
  commerceSource,
  /portal\.usage\.credit_pack_buy_action[\s\S]*portal\.package\.trial_entry_action|portal\.package\.trial_entry_action[\s\S]*portal\.usage\.credit_pack_buy_action/,
  'account commerce must not bring back buy-credits / trial CTA stack on the account surface'
);
assert.match(
  paymentHistorySource,
  /data-portal-account="payment-orders-empty"/,
  'account payment empty state must be a muted one-line, not a fat accordion'
);
assert.match(
  paymentHistorySource,
  /accountHasOrders[\s\S]*statusGroup === 'all'[\s\S]*payment-orders-empty|statusGroup === 'all'[\s\S]*accountHasOrders[\s\S]*payment-orders-empty/,
  'full-panel wipe empty state only when the account has no orders on the all tab'
);
assert.match(
  paymentHistorySource,
  /data-portal-account="payment-orders-status-filter"/,
  'status filter must live in the status column header (and mobile fallback)'
);
assert.doesNotMatch(
  paymentHistorySource,
  /role="tablist"/,
  'payment order status tabs move into the status column filter'
);
assert.match(
  paymentHistorySource,
  /payment_orders_filter_empty/,
  'filtered empty keeps an in-panel empty line'
);

console.log('portal_account_ui_contract: ok');

