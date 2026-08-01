import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const page = readFileSync(
  resolve(frontendRoot, 'src/app/admin/site-compliance/page.tsx'),
  'utf8'
);
const layout = readFileSync(resolve(frontendRoot, 'src/app/admin/layout.tsx'), 'utf8');

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
  /<BackofficeConfigurationHeader[\s\S]*?summaryItems=\{\[[\s\S]*?data-ui="site-compliance-workbench"[\s\S]*?data-ui="site-compliance-directory"[\s\S]*?data-ui="site-compliance-active-panel"/,
  'site compliance must use the shared compact configuration header and one continuous directory/workbench surface'
);

assert.match(
  page,
  /activeSection === 'operator'[\s\S]*?activeSection === 'refund'[\s\S]*?activeSection === 'retention'[\s\S]*?activeSection === 'third_parties'[\s\S]*?activeSection === 'review'/,
  'long-form compliance editors must render as mutually exclusive working sections'
);

assert.match(
  page,
  /dataUi="site-compliance-validation-table"[\s\S]*?dataUi="site-compliance-qq-review-table"[\s\S]*?Check technical details[\s\S]*?QQ external submission steps[\s\S]*?dataUi="site-compliance-version-table"/,
  'publish checks, QQ readiness, low-frequency external steps, and version history must use explicit compact surfaces'
);

assert.match(
  page,
  /data-ui="site-compliance-publish-row"[\s\S]*?className=\{secondaryButtonClassName\}[\s\S]*?data-ui="site-compliance-save-row"[\s\S]*?className=\{primaryButtonClassName\}/,
  'publication must remain a secondary action in checks while save is the editable workbench primary action'
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
