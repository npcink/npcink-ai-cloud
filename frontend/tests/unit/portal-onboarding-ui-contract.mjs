import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const source = readFileSync(resolve(process.cwd(), 'src/app/portal/page.tsx'), 'utf8');
const connectSource = readFileSync(
  resolve(process.cwd(), 'src/components/portal/PortalSiteConnectPanel.tsx'),
  'utf8'
);
const sitesSource = readFileSync(
  resolve(process.cwd(), 'src/components/portal/PortalSitesWorkspace.tsx'),
  'utf8'
);

assert.match(source, /homeState = primaryOperationFocusItem \? 'attention' : hasVisibleSites \? 'daily' : 'setup'/);
assert.doesNotMatch(source, /setupChecklistItems|onboarding_package_title/, 'first use must not duplicate connection instructions or require a package review');
assert.doesNotMatch(
  source,
  /onboarding_qq_|getIdentityProviders|currentSiteActiveKeyCount|getSiteDiagnostics/,
  'Portal home onboarding must not load identity, key, or diagnostic detail'
);
assert.doesNotMatch(
  source,
  /sites\s*\[\s*0\s*\]|const selectedSite\s*=\s*(?:getVisiblePortalSites|session\??\.sites)/,
  'home composition must not infer or mutate current account/site context'
);
assert.match(source, /filter\(\(site\) => portalSiteNeedsAttention\(site\)\)/);
assert.match(source, /\/portal\/sites\/\$\{encodeURIComponent\(site\.site_id\)\}#service-status/);
assert.equal((sitesSource.match(/data-portal-sites="connect-guide"/g) || []).length, 1);
for (const step of ['connection_step_open', 'connection_step_plugin', 'connection_step_confirm']) {
  assert.match(sitesSource, new RegExp(`portal\\.home\\.${step}`));
}
assert.doesNotMatch(source, /localStorage|sessionStorage/);

const connectClientCalls = Array.from(
  connectSource.matchAll(/portalClient\s*\.\s*([A-Za-z0-9_]+)\s*\(/g),
  (match) => match[1]
);
assert.deepEqual(
  connectClientCalls,
  ['createAddonConnection'],
  'site connection panel must expose only the WordPress addon handoff'
);
assert.doesNotMatch(
  connectSource,
  /createSite|connect_site_heading|connect_site_desc|connect_site_action|type="url"/,
  'manual self-create UI and calls must stay deleted'
);
assert.match(
  connectSource,
  /if \(!hasAddonConnectionContext\)[\s\S]*return;[\s\S]*createAddonConnection/,
  'addon connection must fail closed before requesting Cloud when handoff context is incomplete'
);
assert.match(
  sitesSource,
  /addonConnectMode[\s\S]*portalClient\.listAddonConnectionAccounts\(\)[\s\S]*accounts=\{addonAccounts\}/,
  'WordPress addon handoff must load candidates from the dedicated addon account endpoint'
);
assert.match(
  connectSource,
  /useState\(''\)[\s\S]*accounts\.some\([\s\S]*account\.account_id === selectedAccountId[\s\S]*account_id: selectedAccountId/,
  'addon binding must require an explicit eligible account selection'
);
assert.match(
  connectSource,
  /soleAccount[\s\S]*type="radio"[\s\S]*checked=\{selectedAccountId === soleAccount\.account_id\}/,
  'a sole eligible account must still require one explicit ownership confirmation'
);
assert.match(
  connectSource,
  /onRetryAccounts[\s\S]*portal\.connect_site_account_recovery_desc[\s\S]*portal\.connect_site_context_expired_desc/,
  'addon binding failures must offer an actionable retry or WordPress restart path'
);
assert.match(
  connectSource,
  /portal\.connect_site_ownership_title[\s\S]*portal\.connect_site_ownership_desc/,
  'addon binding must explain account-owned Free service and cross-account cooldown before submission'
);
assert.doesNotMatch(
  `${sitesSource}\n${connectSource}`,
  /(?:addonAccounts|accounts|candidates)\s*(?:\?\.)?\s*\[\s*0\s*\]|(?:addonAccounts|accounts|candidates)\.at\(\s*0\s*\)/,
  'addon binding must never auto-select the first candidate'
);

console.log('portal_onboarding_ui_contract: ok');
