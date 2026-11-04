import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { frontendRoot } from './_paths.mjs';

const source = readFileSync(
  resolve(frontendRoot, 'src/app/admin/customer-notifications/page.tsx'),
  'utf8',
);
const i18n = readFileSync(resolve(frontendRoot, 'src/lib/i18n.ts'), 'utf8');

assert.match(source, /admin\.notices\.page_title/, 'page h1 uses Quiet page_title');
assert.match(i18n, /'admin\.notices\.page_title': 'Notices'/, 'en page title is Notices');
assert.match(i18n, /'admin\.notices\.page_title': '通知'/, 'zh page title is 通知');
assert.match(i18n, /'admin\.notices\.title': 'Notices'/, 'tab label is Notices');
assert.match(i18n, /'admin\.notices\.title': '通知'/, 'zh tab label is 通知');
assert.match(source, /data-ui="notice-compose-trigger"/, 'compose trigger is present');
assert.match(source, /aria-label=\{t\('admin\.notices\.new'\)\}/, 'compose trigger keeps accessible name');
assert.match(source, /<path d="M12 5v14" \/>/, 'compose trigger uses plus icon');
{
  const trigger = source.match(/data-ui="notice-compose-trigger"[\s\S]*?<\/button>/);
  assert.ok(trigger, 'compose trigger button closes');
  assert.match(trigger[0], /<svg[\s\S]*<\/svg>/, 'compose trigger renders an svg icon');
  assert.match(trigger[0], /\{t\('admin\.notices\.new'\)\}/, 'compose action has a visible label');
}
assert.match(source, /data-ui="notice-history-row"[\s\S]*aria-pressed/, 'history rows are selectable/pressable');
assert.match(source, /data-ui="notice-history-pager"/, 'history pager is Quiet and marked');

assert.match(source, /data-ui="notices-two-column"/, 'main area is two-column');
assert.match(source, /data-ui="notice-compose-modal"/, 'compose lives in a modal');
assert.match(source, /<Modal[\s\S]*notice-compose-modal[\s\S]*<\/Modal>/, 'compose modal wraps the form');
assert.match(source, /data-ui="notice-history-list"[\s\S]*data-ui="notice-history-metrics"/, 'history uses Quiet compact metrics rows');
assert.doesNotMatch(
  source,
  /data-ui="notice-history-metrics"[\s\S]{0,300}?justify-between/,
  'history metrics must not stretch across the row',
);
assert.doesNotMatch(
  source,
  /href="\/admin\/support-requests"[\s\S]{0,80}?workspace_tab_tickets/,
  'orphan tickets text link below the card must be removed',
);
assert.doesNotMatch(
  source,
  /import Link from 'next\/link'/,
  'page no longer needs the orphan Link import',
);
