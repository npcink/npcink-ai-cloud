import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const billingSource = readFileSync(resolve('src/app/portal/billing/page.tsx'), 'utf8');
const accountSource = readFileSync(resolve('src/app/portal/account/page.tsx'), 'utf8');
const commerceSource = readFileSync(
  resolve('src/components/portal/PortalAccountCommercePanels.tsx'),
  'utf8'
);

assert.match(
  accountSource,
  /PortalAccountCommercePanels[\s\S]*surface="account"/,
  'account center hosts payment-order commerce panels'
);
assert.match(
  billingSource,
  /PortalAccountCommercePanels[\s\S]*surface="billing"/,
  'package page hosts package / credit / trial commerce dialogs'
);

for (const boundary of [
  'usePortalCommercialCatalog',
  'usePortalPaymentOrders',
  'PortalPackageChangePanel',
  'PortalCreditPackDialog',
  'PortalTrialEligibilityPanel',
  'PortalPaymentOrderHistory',
]) {
  assert.match(commerceSource, new RegExp(boundary));
}

assert.doesNotMatch(billingSource, /PortalPackageChangePanel/);
assert.doesNotMatch(billingSource, /PortalCreditPackDialog/);
assert.doesNotMatch(billingSource, /PortalTrialEligibilityPanel/);
assert.doesNotMatch(billingSource, /PortalPaymentOrderHistory/);
assert.doesNotMatch(billingSource, /portalClient\.listAccountPaymentOrders/);
assert.doesNotMatch(billingSource, /portalClient\.cancelAccountPaymentOrder/);
assert.doesNotMatch(billingSource, /function resolvePaymentOrderTitle/);
assert.doesNotMatch(billingSource, /const packageChoices/);
assert.doesNotMatch(commerceSource, /portalClient\.listAccountPaymentOrders/);
assert.doesNotMatch(commerceSource, /portalClient\.cancelAccountPaymentOrder/);
assert.doesNotMatch(commerceSource, /function resolvePaymentOrderTitle/);
assert.doesNotMatch(commerceSource, /const packageChoices/);

console.log('portal_commercial_architecture_contract: ok');
