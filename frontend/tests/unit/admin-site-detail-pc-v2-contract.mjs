import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(process.cwd(), 'src/app/admin/sites/[siteId]/page.tsx'), 'utf8');
const i18n = readFileSync(resolve(process.cwd(), 'src/lib/i18n.ts'), 'utf8');

assert.match(page, /BackofficeDisclosure[\s\S]*admin\.site_detail\.advanced_operational_evidence[\s\S]*admin\.site_detail\.operational_detail_title/, 'commercial, runtime, usage, and billing evidence must be advanced detail');
assert.match(page, /siteRuntimeExplanationText\(item\.explain_text, t\)/, 'known runtime explanations must be localized before default display');
assert.doesNotMatch(page, /href=\{site\.related_surfaces\.audit_href\}/, 'site detail must not expose the raw audit API as a primary link');
assert.doesNotMatch(page, /href="\/admin\/subscriptions"/, 'site detail must not expose an unscoped duplicate coverage link');
assert.match(
  page,
  /\/api\/admin\/sites\/\$\{encodeURIComponent\(site\.site_id\)\}\/relink-cooldown/,
  'site detail must update the bounded site relink endpoint'
);
for (const action of ["'clear'", "'reset'", "'set'"]) {
  assert.match(page, new RegExp(`handleRelinkCooldownUpdate\\(${action}\\)`), `site detail must expose the ${action} relink action`);
}
assert.match(
  page,
  /setConfirmRelinkClearOpen\(true\)[\s\S]*<ConfirmModal[\s\S]*relink_clear_confirm_desc[\s\S]*handleRelinkCooldownUpdate\('clear'\)/,
  'immediate cross-account relink must require an explicit operator confirmation'
);
assert.match(
  page,
  /site\.status === 'archived' &&\s*site\.site_relink_policy\?\.ownership_released_at/,
  'site relink controls must remain unavailable until ownership has been released'
);

const primaryStart = page.indexOf('<BackofficePrimaryPanel');
const primaryEnd = page.indexOf('</BackofficePrimaryPanel>', primaryStart);
const primarySource = page.slice(primaryStart, primaryEnd);
assert.doesNotMatch(primarySource, /<h2[^>]*>\{postureTitle\}<\/h2>[\s\S]*admin\.site_detail\.summary_desc/, 'site posture conclusion must not be duplicated in the summary strip');
assert.doesNotMatch(primarySource, /href=\{`\/admin\/accounts\/\$\{site\.account_id\}`\}/, 'site header must not duplicate the current follow-up action');

for (const key of [
  'admin.site_detail.advanced_operational_evidence',
  'admin.site_detail.runtime_explanation_ok',
  'admin.site_detail.runtime_explanation_callback',
  'admin.site_detail.runtime_explanation_queued',
  'admin.site_detail.runtime_explanation_guard',
  'admin.site_detail.relink_policy_title',
  'admin.site_detail.relink_clear_now',
  'admin.site_detail.relink_clear_confirm_action',
  'admin.site_detail.relink_clear_confirm_desc',
  'admin.site_detail.relink_clear_confirm_title',
  'admin.site_detail.relink_reset_default',
  'admin.site_detail.relink_save_date',
]) {
  const occurrences = Array.from(i18n.matchAll(new RegExp(`'${key.replaceAll('.', '\\.')}':`, 'g'))).length;
  assert.equal(occurrences, 2, `${key} must exist in English and Simplified Chinese`);
}
