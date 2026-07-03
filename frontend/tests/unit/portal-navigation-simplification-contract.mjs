import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const navbarPath = resolve(process.cwd(), 'src/components/portal/PortalNavbar.tsx');
const i18nPath = resolve(process.cwd(), 'src/lib/i18n.ts');
const navbarSource = readFileSync(navbarPath, 'utf8');
const i18nSource = readFileSync(i18nPath, 'utf8');

const primaryStart = navbarSource.indexOf('const primaryNavItems');
const primaryEnd = navbarSource.indexOf('const isActive', primaryStart);
const primarySource = navbarSource.slice(primaryStart, primaryEnd);

assert.ok(primaryStart >= 0 && primaryEnd > primaryStart, 'portal navbar must declare primary navigation');

const primaryHrefs = Array.from(primarySource.matchAll(/href:\s*'([^']+)'/g), (match) => match[1]);
assert.deepEqual(
  primaryHrefs,
  ['/portal', '/portal/usage', '/portal/sites', '/portal/account'],
  'portal primary nav must stay focused on overview, plan usage, site domain, and contact/account'
);

assert.doesNotMatch(
  primarySource,
  /\/portal\/billing|\/portal\/monitoring|\/portal\/ai-insights|\/portal\/audit/,
  'billing, monitoring, AI insight, and audit routes must not return to primary user navigation'
);

assert.doesNotMatch(
  navbarSource,
  /secondaryNavItems|portal\.nav_more|\/portal\/monitoring|\/portal\/ai-insights|\/portal\/audit/,
  'advanced support, monitoring, AI insight, and audit routes must not return to customer navigation'
);

assert.match(i18nSource, /'portal\.nav_usage': 'Plan and usage'/, 'English nav copy must merge plan and usage');
assert.match(i18nSource, /'portal\.workspace_label': 'Overview'/, 'English overview copy must name the user summary surface');
assert.match(i18nSource, /'portal\.nav_sites': 'Sites and domain'/, 'English nav copy must include domain binding');
assert.match(i18nSource, /'portal\.nav_account': 'Contact'/, 'English nav copy must emphasize contact settings');
assert.match(i18nSource, /'portal\.nav_usage': '套餐与用量'/, 'Chinese nav copy must merge plan and usage');
assert.match(i18nSource, /'portal\.workspace_label': '概览'/, 'Chinese overview copy must name the user summary surface');
assert.match(i18nSource, /'portal\.nav_sites': '站点与域名'/, 'Chinese nav copy must include domain binding');
assert.match(i18nSource, /'portal\.nav_account': '联系方式'/, 'Chinese nav copy must emphasize contact settings');

console.log('portal_navigation_simplification_contract: ok');
