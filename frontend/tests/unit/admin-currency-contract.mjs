import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const currencySource = readFileSync(resolve(frontendRoot, 'src/lib/currency.ts'), 'utf8');
const accountSource = readFileSync(
  resolve(frontendRoot, 'src/app/admin/accounts/[accountId]/page.tsx'),
  'utf8'
);

assert.match(
  currencySource,
  /export const ADMIN_CURRENCY = DEFAULT_CURRENCY/,
  'Admin currency must use the shared default platform currency'
);

assert.match(
  currencySource,
  /formatAdminCurrency[\s\S]*from: ADMIN_CURRENCY[\s\S]*to: ADMIN_CURRENCY/,
  'Admin currency formatter must treat incoming admin amounts as CNY, not convert them from USD'
);

assert.doesNotMatch(
  currencySource,
  /CNY:\s*7\.2|HKD:\s*7\.8/,
  'browser currency helpers must not own mutable accounting exchange rates'
);

assert.match(
  currencySource,
  /Client-side currency conversion is disabled[\s\S]*use a server-snapshotted accounting amount/,
  'cross-currency display must require a server-owned snapshotted amount'
);

assert.match(
  accountSource,
  /cost_cny_increment: pack\.cost_cny_increment/,
  'new operator top-ups must send an explicitly CNY-denominated cost increment'
);
