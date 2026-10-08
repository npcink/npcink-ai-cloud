import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = readFileSync(fromFrontendRoot('src/components/ui/Modal.tsx'), 'utf8');
const dialogHookSource = readFileSync(
  fromFrontendRoot('src/hooks/useDialogFocusManagement.ts'),
  'utf8'
);
const siteDrawerSource = readFileSync(
  fromFrontendRoot('src/components/portal/PortalSiteInspectorDrawer.tsx'),
  'utf8'
);
const usageSource = readFileSync(fromFrontendRoot('src/app/portal/usage/page.tsx'), 'utf8');

assert.match(source, /previousActiveElementRef/, 'modal must remember the trigger that held focus');
assert.match(
  source,
  /previousActiveElementRef\.current\?\.focus\(\)/,
  'modal must return focus to its trigger after close'
);
assert.match(source, /event\.key !== 'Tab'/, 'modal must implement Tab-key containment');
assert.match(source, /event\.shiftKey[\s\S]*lastElement\.focus\(\)/, 'modal must wrap Shift+Tab to the last control');
assert.match(source, /firstElement\.focus\(\)/, 'modal must wrap Tab to the first control');
assert.match(source, /aria-modal="true"/, 'modal must remain exposed as an ARIA modal dialog');
assert.match(source, /tabIndex=\{-1\}/, 'modal container must be programmatically focusable');
assert.match(source, /const titleId = useId\(\)/, 'modal titles must use instance-safe IDs');
assert.match(source, /previousOverflow[\s\S]*document\.body\.style\.overflow = previousOverflow/, 'modal must restore the prior scroll state');
assert.match(dialogHookSource, /previousFocus\?\.focus\(\)/, 'custom dialogs must restore trigger focus');
assert.match(dialogHookSource, /event\.key !== 'Tab'/, 'custom dialogs must contain Tab focus');
assert.match(siteDrawerSource, /useDialogFocusManagement/, 'site inspector must use shared focus management');
assert.match(usageSource, /creditBucketDrawerRef[\s\S]*creditEventDrawerRef/, 'usage detail drawers must use shared focus management');

console.log('modal_keyboard_accessibility_contract: ok');
