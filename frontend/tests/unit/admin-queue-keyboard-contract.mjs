import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const read = path => readFileSync(fromFrontendRoot(path), 'utf8');
const hook = read('src/features/admin/useAdminQueueKeyboard.ts');
const hint = read('src/components/admin/AdminQueueKeyboardHint.tsx');
const supportWorkspace = read('src/features/admin/support-requests/SupportRequestsWorkspace.tsx');
const subscriptionsPage = read('src/app/admin/subscriptions/page.tsx');
const workspaceNavigation = read('src/components/admin/AdminWorkspaceNavigation.tsx');
const navigationCatalog = read('src/features/admin/navigation.ts');
const i18n = read('src/lib/i18n.ts');

assert.match(hook, /event\.key === 'j' \|\| event\.key === 'k'/, 'queues need j/k movement');
assert.match(hook, /event\.key === 'Enter'/, 'queues need Enter to open the focused record');
assert.match(hook, /event\.key === 'Escape'/, 'queues need Escape to clear focus');
assert.match(hook, /isTypingTarget\(event\.target\)/, 'queue shortcuts must not fire while an operator is typing');
assert.match(hook, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/, 'queue shortcuts must not hijack modified key presses');
assert.match(hook, /hasBlockingDialog\(\)/, 'queue shortcuts must yield to blocking dialogs');
assert.match(hook, /hasOpenQueueDrawer\(\)/, 'Escape must stay with the open queue drawer');
assert.match(hook, /admin-context-drawer[\s\S]*admin-inspector-drawer|admin-inspector-drawer[\s\S]*admin-context-drawer/, 'both queue drawers keep their own focus and Escape behavior');
assert.doesNotMatch(hook, /document\.addEventListener\('(?:pointerdown|click)'/, 'unrelated pointer actions must not turn keyboard selection into an inspector');
assert.match(hook, /const inspect = \(id: string\)[\s\S]*kind: 'inspect', id[\s\S]*onFocus\(id\)/, 'explicit inspection must select the requested record');
assert.match(hook, /focusedId !== selectionIntent\.id/, 'a pending inspection must suppress the previous record until its target focus commits');
for (const consumer of [supportWorkspace, subscriptionsPage]) {
  assert.match(consumer, /const \{ keyboardFocus, inspect \} = useAdminQueueKeyboard/, 'both queue consumers must use explicit inspection ownership');
}
assert.match(supportWorkspace, /inspect\(item\.request_id\)/, 'ticket Inspect must use explicit inspection');
assert.match(subscriptionsPage, /inspect\(subscription\.subscription_id\)/, 'subscription Inspect must use explicit inspection');

assert.match(hint, /data-ui="admin-queue-keyboard-hint"/, 'the keyboard hint needs a stable surface marker');
for (const key of ['admin.queue_keyboard_label', 'admin.queue_keyboard_move', 'admin.queue_keyboard_open', 'admin.queue_keyboard_close']) {
  assert.match(hint, new RegExp(key.replaceAll('.', '\\.')), `keyboard hint must translate ${key}`);
  assert.ok((i18n.match(new RegExp(`'${key.replaceAll('.', '\\.')}'`, 'g')) || []).length >= 2, `${key} needs both locales`);
}

assert.match(supportWorkspace, /useAdminQueueKeyboard\(\{/, 'ticket queue must use the shared queue keyboard hook');
assert.match(supportWorkspace, /itemIds: items\.map\(\(item\) => item\.request_id\)/, 'ticket keyboard order must follow the rendered queue');
assert.match(supportWorkspace, /onOpen: \(requestId\) => router\.push\(supportRequestDetailHref\(requestId\)\)/, 'Enter on a ticket must open its detail with return context');
assert.match(supportWorkspace, /headerActions=\{<AdminQueueKeyboardHint \/>\}/, 'ticket queue must show the keyboard hint');
assert.match(supportWorkspace, /open=\{Boolean\(selectedRequest\) && !editRequest && !keyboardFocus\}/, 'keyboard selection must not let the ticket drawer take Enter');

assert.match(subscriptionsPage, /useAdminQueueKeyboard\(\{/, 'subscription queue must use the shared queue keyboard hook');
assert.match(subscriptionsPage, /itemIds: queuedSubscriptions\.map\(\(subscription\) => subscription\.subscription_id\)/, 'subscription keyboard order must follow the rendered queue');
assert.match(subscriptionsPage, /onOpen: \(subscriptionId\) => router\.push\(subscriptionDetailHref\(subscriptionId\)\)/, 'Enter on a subscription must open its detail with return context');
assert.match(subscriptionsPage, /<AdminQueueKeyboardHint \/>/, 'subscription queue must show the keyboard hint');
assert.match(subscriptionsPage, /open=\{Boolean\(selectedSubscription\) && !keyboardFocus\}/, 'keyboard selection must not let the subscription drawer take Enter');

assert.doesNotMatch(navigationCatalog, /noteKey: 'admin\.commercial_freeze_hint'/, 'operator-resumed commercial development must not display the retired freeze notice');
assert.match(workspaceNavigation, /group\.noteKey/, 'workspace navigation must render the group note when present');
assert.match(workspaceNavigation, /data-ui="admin-workspace-navigation-note"/, 'the freeze note needs a stable surface marker');
assert.match(i18n, /'admin\.commercial_freeze_hint':[\s\S]*?Phase 1[\s\S]*?development freeze/, 'the English freeze note must state Phase 1 development freeze');
assert.match(i18n, /'admin\.commercial_freeze_hint':\s*\n?\s*'Phase 1 开发冻结/, 'the Chinese freeze note must state Phase 1 development freeze');
assert.match(i18n, /仍有?可正常读取和运营/, 'the Chinese freeze note must keep existing commercial reads operational');

console.log('admin_queue_keyboard_contract: ok (j/k/Enter/Esc wired for both queues; retired commercial freeze notice hidden)');
