import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const errorSource = readFileSync(resolve(root, 'src/lib/portal-error.ts'), 'utf8');
const i18nSource = readFileSync(resolve(root, 'src/lib/i18n.ts'), 'utf8');
const clientSource = readFileSync(resolve(root, 'src/lib/portal-client.ts'), 'utf8');

assert.match(
  errorSource,
  /service\.site_relink_cooldown_active[\s\S]*formatDate[\s\S]*retry_after_at/,
  'Portal must render the structured Cloud retry date for a cross-account cooldown'
);
assert.match(
  errorSource,
  /service\.portal_site_conflict[\s\S]*service\.site_cross_account_relink_disabled/,
  'Portal must distinguish active ownership from a disabled cross-account policy'
);
assert.match(
  clientSource,
  /ownership_released_at\?: string[\s\S]*relink_cooldown_until\?: string/,
  'customer site projection must retain only the bounded release timestamps'
);
assert.doesNotMatch(
  `${errorSource}\n${clientSource}`,
  /previous_account_(?:id|email|name)|owner_(?:email|name)/,
  'customer relink notices must not expose the previous account identity'
);

for (const key of [
  'error.portal_site_owned_by_another_account',
  'error.portal_site_relink_cooldown_active',
  'error.portal_site_cross_account_relink_disabled',
  'portal.connect_site_ownership_desc',
  'portal.remove_site_confirm_with_date',
  'portal.site_remove_success_with_date',
]) {
  assert.equal(
    i18nSource.split(`'${key}'`).length - 1,
    2,
    `${key} must exist once in English and once in zh-CN`
  );
}

console.log('portal_site_relink_notices_contract: ok');
