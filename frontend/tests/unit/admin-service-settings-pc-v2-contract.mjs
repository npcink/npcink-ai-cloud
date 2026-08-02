import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const page = readFileSync(fromFrontendRoot('src/app/admin/service-settings/page.tsx'), 'utf8');
const i18n = readFileSync(fromFrontendRoot('src/lib/i18n.ts'), 'utf8');

assert.match(page, /const activeStateNotice = \(activeGroupDirty \|\| activeValidationIssues\.length > 0 \|\| error\)/, 'dirty, validation, and failure state must share one active-group notice');
for (const panel of ['portal', 'qq', 'email', 'payment']) {
  const start = page.indexOf(`id="service-settings-${panel}"`);
  assert.ok(start >= 0, `${panel} panel must exist`);
  const nextPanel = page.indexOf('{activeTab ===', start);
  const workbenchEnd = page.indexOf('</AdminSettingsWorkbench>', start);
  const end = nextPanel >= 0 && nextPanel < workbenchEnd ? nextPanel : workbenchEnd;
  const panelSource = page.slice(start, end);
  assert.match(panelSource, /\{activeStateNotice\}/, `${panel} feedback must stay inside its active panel`);
}

assert.match(
  page,
  /AdminSettingsWorkbench[\s\S]*AdminConfigurationTable[\s\S]*density="compact"/,
  'service settings must use the shared compact settings directory and semantic configuration table'
);
assert.match(
  page,
  /AdminCredentialField[\s\S]*qqCredentialRevealed[\s\S]*emailCredentialRevealed[\s\S]*alipayPrivateKeyRevealed/,
  'stored service credentials must use explicit shared replacement fields'
);

assert.match(page, /activeTab === 'portal' && activeGroupDirty[\s\S]*unsaved_short[\s\S]*activeTab === 'payment' && activeGroupDirty/, 'the active category tab must expose unsaved state');
assert.match(page, /onClick=\{restoreActiveGroup\}[\s\S]*restore_saved_values/, 'the local rollback action must clearly restore saved values');
assert.match(page, /data-ui="service-settings-high-risk"[\s\S]*payment_high_risk_title[\s\S]*payment_high_risk_desc/, 'payment credentials and callback identity must carry an explicit high-risk warning');
assert.match(page, /if \(loading && !data\)[\s\S]*AdminRouteSkeleton/, 'initial loading must preserve the admin route shell');
assert.match(page, /if \(!data\)[\s\S]*BackofficeDiagnosticNotice[\s\S]*onRetry=\{\(\) => void loadSettings\(\)\}/, 'initial failure must preserve the shell and retry only the bounded read');
assert.match(
  page,
  /emailPreviewOpen[\s\S]*contentMode="contained"[\s\S]*email-preview-workspace-scroll[\s\S]*overflow-y-auto overscroll-contain[\s\S]*lg:overflow-hidden[\s\S]*email-preview-settings-scroll[\s\S]*lg:overflow-auto[\s\S]*email-preview-content-scroll/,
  'email preview must disable workbench-body scrolling, use one mobile workspace scroller, and keep desktop scrolling inside non-nested split panes'
);
assert.doesNotMatch(
  page,
  /emailPreviewOpen[\s\S]*h-\[calc\(100vh-10rem\)\]/,
  'email preview must not size a nested child independently from the contained workbench'
);

for (const key of [
  'admin.service_settings.unsaved_short',
  'admin.service_settings.restore_saved_values',
  'admin.service_settings.load_shell_desc',
  'admin.service_settings.payment_high_risk_title',
  'admin.service_settings.payment_high_risk_desc',
]) {
  const occurrences = Array.from(i18n.matchAll(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g'))).length;
  assert.equal(occurrences, 2, `${key} must exist in English and Simplified Chinese`);
}

console.log('admin_service_settings_pc_v2_contract: ok');
