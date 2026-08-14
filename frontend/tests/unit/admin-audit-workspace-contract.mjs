import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const workspace = readFileSync(
  fromFrontendRoot('src/features/admin/audit/AdminAuditWorkspace.tsx'),
  'utf8'
);
const api = readFileSync(fromFrontendRoot('src/features/admin/audit/api.ts'), 'utf8');
const queries = readFileSync(fromFrontendRoot('src/features/admin/audit/queries.ts'), 'utf8');
const receipt = readFileSync(fromFrontendRoot('src/components/admin/AdminMutationReceipt.tsx'), 'utf8');
const troubleshooting = readFileSync(fromFrontendRoot('src/app/admin/troubleshooting/page.tsx'), 'utf8');

assert.match(workspace, /useSearchParams[\s\S]*FILTER_KEYS[\s\S]*offset/, 'audit filters and pagination must remain URL-owned');
assert.match(queries, /useQuery[\s\S]*keepPreviousData[\s\S]*retry: false/, 'audit remote state must use the existing bounded Admin query layer');
assert.match(api, /\/api\/admin\/audit-events\?\$\{requestKey\}/, 'the workspace must consume the governed Admin audit proxy');
assert.match(workspace, /include_payload[\s\S]*false/, 'the browser workspace must request the metadata-only audit projection');
assert.match(workspace, /AdminDataTableFrame[\s\S]*AdminInspectorDrawer/, 'audit evidence must use a semantic directory and shared inspector');
assert.match(workspace, /payload values are intentionally excluded/, 'audit payload values must stay outside the Admin workspace');
assert.doesNotMatch(workspace, /item\.payload|JSON\.stringify\([^)]*payload/, 'the audit workspace must not render audit payload values');
assert.match(receipt, /\/admin\/audit\?/, 'mutation receipts must navigate into the persistent audit workspace');
assert.match(troubleshooting, /id: 'audit'[\s\S]*href: '\/admin\/audit'/, 'runtime diagnostics must expose the bounded audit evidence lane');

console.log('admin_audit_workspace_contract: ok');
