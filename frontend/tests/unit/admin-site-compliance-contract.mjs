import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(
  resolve(process.cwd(), 'src/app/admin/site-compliance/page.tsx'),
  'utf8'
);
const layout = readFileSync(resolve(process.cwd(), 'src/app/admin/layout.tsx'), 'utf8');

assert.match(
  layout,
  /href: '\/admin\/site-compliance'[\s\S]*?labelKey: 'admin\.nav_site_compliance'/,
  'admin navigation must expose the site compliance workspace'
);

assert.match(
  page,
  /createApiClient\(\{[\s\S]*?idempotencyPrefix: 'admin_site_compliance'/,
  'site compliance must use the strict shared ApiClient'
);

assert.match(
  page,
  /'\/api\/admin\/site-compliance\/draft'[\s\S]*?method: 'PUT'/,
  'draft saving must use the bounded PUT endpoint'
);

assert.match(
  page,
  /'\/api\/admin\/site-compliance\/publish'[\s\S]*?method: 'POST'/,
  'publication must use the explicit publish endpoint'
);

assert.match(
  page,
  /dirty \|\|[\s\S]*?!validation\?\.ready_to_publish/,
  'publication must remain disabled for unsaved or blocked drafts'
);

assert.match(
  page,
  /closest\('a\[href\]'\)[\s\S]*?beforeunload[\s\S]*?<ConfirmModal/,
  'unsaved compliance edits must be protected for browser and admin navigation'
);

assert.doesNotMatch(
  page,
  /client_secret|smtp_password|private_key|access_token/,
  'site compliance must never collect or render credential values'
);
