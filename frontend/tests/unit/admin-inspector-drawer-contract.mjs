import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const source = readFileSync(resolve(frontendRoot, 'src/components/admin/AdminInspectorDrawer.tsx'), 'utf8');

assert.match(source, /createPortal[\s\S]*data-ui="admin-inspector-drawer"/, 'inspector drawer must use one shared portal primitive');
assert.match(source, /role="dialog"[\s\S]*aria-modal="true"[\s\S]*aria-labelledby/, 'drawer must expose modal dialog semantics');
assert.match(source, /event\.key === 'Escape'[\s\S]*event\.key !== 'Tab'/, 'drawer must close on Escape and trap keyboard focus');
assert.match(source, /previouslyFocused[\s\S]*previouslyFocused\?\.focus\(\)/, 'drawer must restore the invoking control');
assert.match(source, /document\.body\.style\.overflow = 'hidden'[\s\S]*previousOverflow/, 'drawer must bound background scrolling');
assert.match(source, /sm:max-w-\[32rem\]/, 'PC drawer must stay narrow while mobile uses the full viewport');
assert.doesNotMatch(source, /<form|onSubmit|saveLabel|saving/, 'read-only inspector drawer must not own mutation controls');

console.log('admin_inspector_drawer_contract: ok');
