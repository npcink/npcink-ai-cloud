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

assert.match(source, /setupChecklistItems/, 'home keeps a bounded first-use checklist when site setup is incomplete');
assert.match(source, /data-portal-home="setup-checklist"/);
assert.doesNotMatch(
  source,
  /homeState = primaryOperationFocusItem \? 'attention' : hasVisibleSites \? 'daily' : 'setup'|data-portal-home-state=/,
  'home must not restore the old attention/daily/setup state machine chrome'
);
assert.match(
  source,
  /shouldShowOnboardingChecklist/,
  'checklist visibility must stay gated so it does not duplicate header focus'
);
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
assert.match(source, /\/portal\/sites\/\$\{encodeURIComponent\((?:site|selectedSite)\.site_id\)\}#service-status/);
assert.ok(
  (sitesSource.match(/data-portal-sites="connect-guide"/g) || []).length >= 1,
  'sites workspace must expose the WordPress connection guide'
);
assert.ok(
  sitesSource.includes('id="portal-sites-connect-guide"'),
  'connection guide must keep a stable scroll target id'
);
assert.match(
  sitesSource,
  /data-portal-sites="connect-guide"[\s\S]*portal\.sites\.connect_hint_desc|portal\.sites\.connect_hint_desc[\s\S]*data-portal-sites="connect-guide"/,
  'connection guidance must point customers back to the WordPress addon handoff'
);
assert.doesNotMatch(
  sitesSource,
  /connectionStep|data-portal-connection-flow|connection_step_open|connection_next/,
  'sites workspace must not restore the multi-step connection wizard chrome'
);
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
