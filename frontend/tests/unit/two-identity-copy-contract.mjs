import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const i18nSource = readFileSync(resolve(process.cwd(), 'src/lib/i18n.ts'), 'utf8');
const adminHomeSource = readFileSync(
  resolve(process.cwd(), 'src/app/admin/page.tsx'),
  'utf8'
);
const adminSiteSource = readFileSync(
  resolve(process.cwd(), 'src/app/admin/sites/[siteId]/page.tsx'),
  'utf8'
);

for (const requiredKey of [
  'admin.external_role_user',
  'portal.role_user',
  'admin.account_detail.user_site_workspace_metric',
  'admin.user_site_workspace_eyebrow',
]) {
  assert.match(
    i18nSource,
    new RegExp(`['"]${requiredKey.replaceAll('.', '\\.')}['"]`),
    `two-identity copy must define ${requiredKey}`
  );
}

for (const [surface, source] of [
  ['admin home', adminHomeSource],
  ['admin site workspace', adminSiteSource],
  ['admin and portal translations', i18nSource],
]) {
  assert.doesNotMatch(
    source,
    /\bSite Admin\b|站点管理员/,
    `${surface} must describe the Cloud identity as User, not Site Admin`
  );
}

for (const retiredKey of [
  'admin.external_role_site_admin',
  'admin.account_detail.site_admin_workspace_metric',
  'admin.site_admin_workspace_badge',
]) {
  assert.doesNotMatch(
    i18nSource,
    new RegExp(`['"]${retiredKey.replaceAll('.', '\\.')}['"]`),
    `retired Cloud identity key ${retiredKey} must stay removed`
  );
}

console.log('two_identity_copy_contract: ok');
