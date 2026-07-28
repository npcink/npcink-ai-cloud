import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const home = read('src/app/page.tsx');
const login = read('src/app/portal/login/page.tsx');
const register = read('src/app/portal/register/page.tsx');
const health = read('src/app/api/health/route.ts');
const publicShell = read('src/components/public/PublicSiteShell.tsx');
const publicNavigation = read('src/lib/public-navigation.ts');
const help = read('src/app/help/page.tsx');
const publicHeaderNavigation = publicNavigation
  .split('export const PUBLIC_HEADER_NAV_ITEMS = ')[1]
  .split('export const PUBLIC_FOOTER_NAV_ITEMS = ')[0];
const publicFooterNavigation = publicNavigation.split('export const PUBLIC_FOOTER_NAV_ITEMS = ')[1];
const publicStatus = read('src/components/public/PublicStatusSummary.tsx');
const legacyFooter = read('src/components/ui/Footer.tsx');
const legacyNavbar = read('src/components/ui/Navbar.tsx');
const proxy = read('src/proxy.ts');

for (const [name, source] of [
  ['home', home],
  ['public shell', publicShell],
  ['legacy footer', legacyFooter],
  ['legacy navbar', legacyNavbar],
]) {
  assert.doesNotMatch(
    source,
    /href=["']\/admin\/login["']/,
    `${name} must not advertise the operator login on a public surface`
  );
}

assert.doesNotMatch(home, /<QqLoginButton/, 'home must keep one primary CTA instead of duplicating the login form');
assert.match(home, /href="\/portal\/register"/, 'home must keep a clear registration CTA');
assert.match(
  home,
  /注册页支持 QQ 快捷登录[\s\S]*WordPress Addon[\s\S]*激活 Free 服务/,
  'home must explain that registration creates the account before addon-verified Free activation'
);
assert.match(login, /<QqLoginButton/, 'login must expose the QQ login entry');
assert.match(register, /<QqLoginButton/, 'registration must expose the QQ login entry');
assert.match(proxy, /X-Robots-Tag[\s\S]*noindex/, 'admin responses must opt out of indexing');

assert.match(health, /status: 'healthy'/, 'machine health must retain a stable status field');
assert.match(health, /checked_at:/, 'machine health must expose its check time');
assert.match(home, /<PublicStatusSummary/, 'home must expose a public service-status summary');
assert.match(publicStatus, /fetch\('\/api\/health'/, 'home status must reuse the minimal public health endpoint');
assert.match(publicStatus, /href="\/status"/, 'home status must link to the full status page');
assert.match(publicStatus, /aria-busy=/, 'home status must expose its checking state without changing layout');
assert.match(publicNavigation, /href: '\/status'/, 'public navigation must link to the full status page');
assert.match(publicHeaderNavigation, /href: '\/help'/, 'header navigation must retain the frequently used help link');
assert.doesNotMatch(publicHeaderNavigation, /href: '\/status'/, 'header navigation must leave secondary status in the footer');
assert.match(publicFooterNavigation, /href: '\/status'/, 'footer navigation must retain the operational status link');
assert.doesNotMatch(publicFooterNavigation, /href: '\/help'/, 'footer navigation must not duplicate the header help link');
assert.match(help, /<details key=\{item\.question\}/, 'help FAQs must use native disclosure semantics');
assert.match(help, /<summary[\s\S]*item\.question/, 'each FAQ question must be the full disclosure trigger');
assert.doesNotMatch(help, /<details[^>]* open/, 'help FAQs must be collapsed by default');
assert.match(publicShell, /PUBLIC_HEADER_NAV_ITEMS/, 'desktop and mobile navigation must use the shared header config');
assert.match(publicShell, /PUBLIC_FOOTER_NAV_ITEMS/, 'footer navigation must use the shared footer config');
assert.doesNotMatch(publicShell, /const navItems =/, 'public navigation must not drift into a page-local menu');
assert.doesNotMatch(
  publicNavigation,
  /\/admin|\/api|fetch\(/,
  'public navigation config must remain fixed frontend detail, not a control-plane registry'
);
assert.doesNotMatch(
  health,
  /process\.uptime|npm_package_version|NODE_ENV/,
  'public machine health must not expose runtime internals'
);

console.log('public_onboarding_surface_contract: ok');
