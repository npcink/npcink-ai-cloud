import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const commerceSource = readFileSync(resolve('src/components/portal/PortalAccountCommercePanels.tsx'), 'utf8');
const clientSource = readFileSync(resolve('src/lib/portal-client.ts'), 'utf8');
const i18nSource = readFileSync(resolve('src/lib/i18n.ts'), 'utf8');

assert.match(commerceSource, /activeCommercialDialog === 'trial'/);
assert.match(commerceSource, /portal\.package\.trial_dialog_title/);
assert.match(commerceSource, /trial\?\.allowed_tiers/);
assert.match(commerceSource, /trialState === 'eligible'/);
assert.match(commerceSource, /trialState === 'active'/);
assert.match(commerceSource, /trialState === 'used'/);
assert.match(commerceSource, /trialState === 'blocked'/);
assert.match(
  commerceSource,
  /trial\?\.available === true[\s\S]*'eligible'[\s\S]*'unavailable'/,
  'missing trial evidence must not be presented as an eligible trial'
);
assert.doesNotMatch(commerceSource, /canTrialTier/);
assert.equal(
  (commerceSource.match(/handleStartPlanTrial\(/g) || []).length,
  1,
  'trial mutation should be invoked only from the trial dialog'
);

assert.match(clientSource, /state\?: 'eligible' \| 'active' \| 'used' \| 'blocked' \| 'unavailable'/);
assert.match(clientSource, /allowed_tiers\?: Array<'plus' \| 'pro'>/);
assert.match(i18nSource, /'portal\.package\.paid_offer_desc': '\{\{amount\}\}\/月。'/);
assert.match(i18nSource, /'portal\.package\.trial_shared_desc'/);
assert.match(i18nSource, /'portal\.package\.trial_blocked_desc'/);

console.log('portal_trial_eligibility_contract: ok');
