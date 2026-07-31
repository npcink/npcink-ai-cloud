import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const source = readFileSync(
  fromFrontendRoot('src/app/admin/troubleshooting/page.tsx'),
  'utf8'
);

assert.match(
  source,
  /<BackofficePageStack[\s\S]*data-page-model="diagnostic"[\s\S]*max-w-screen-2xl/,
  'runtime diagnostics must keep a bounded diagnostic page canvas'
);
assert.match(
  source,
  /data-ui="runtime-diagnostic-toolbar"[\s\S]*WINDOW_OPTIONS\.map[\s\S]*data-ui="diagnostic-source-freshness"[\s\S]*admin\.troubleshooting\.refresh/,
  'time window, source freshness, and refresh must stay in one compact toolbar'
);
assert.doesNotMatch(
  source,
  /aside=\{<BackofficeStatusBadge label=\{conclusionLabel\}/,
  'the header must not duplicate the page-level diagnostic conclusion'
);
assert.match(
  source,
  /data-ui="runtime-diagnostic-conclusion"[\s\S]*conclusionLabel[\s\S]*conclusionSummary/,
  'the page must keep one explicit, non-truncated runtime conclusion'
);

const workspaceStart = source.indexOf('data-ui="runtime-diagnostic-workspace"');
const queueStart = source.indexOf('<AdminDataTableFrame', workspaceStart);
const qualityStart = source.indexOf('<EditorAssistQualityPanel', queueStart);
const inspectorStart = source.indexOf('<AdminWorkbenchDialog', qualityStart);
const workspaceSource = source.slice(workspaceStart);
assert.ok(workspaceStart >= 0 && inspectorStart > workspaceStart, 'the diagnostic workspace and inspector must exist');
assert.ok(
  queueStart > workspaceStart && qualityStart > queueStart && inspectorStart > qualityStart,
  'the full-width primary lane must remain continuous before the on-demand inspector drawer'
);
assert.match(
  workspaceSource,
  /className="grid grid-cols-\[minmax\(0,1fr\)\] items-start gap-3"/,
  'the diagnostic workspace must keep one full-width primary column'
);
assert.match(
  source.slice(inspectorStart),
  /open=\{Boolean\(selectedIssue\)\}[\s\S]*presentation="drawer"/,
  'selected anomaly detail must use the shared on-demand drawer presentation'
);
assert.match(
  workspaceSource,
  /<EditorAssistQualityPanel[\s\S]*id="evidence-lanes"[\s\S]*id="runtime-evidence"/,
  'quality, evidence lanes, and runtime guidance must stay in the continuous desktop primary column'
);
assert.match(
  workspaceSource,
  /max-h-\[var\(--admin-diagnostic-queue-max-height\)\][\s\S]*<table[\s\S]*data-ui="runtime-diagnostic-table"/,
  'the bounded anomaly queue must remain a semantic table with the shared height token'
);

const inspectorSource = source.slice(inspectorStart);
assert.match(
  inspectorSource,
  /common\.read_only[\s\S]*admin\.troubleshooting\.open_evidence/,
  'the inspector must expose the read-only posture before its one primary action'
);
assert.doesNotMatch(
  inspectorSource.split('</AdminWorkbenchDialog>')[0],
  /admin\.troubleshooting\.boundary/,
  'the long ownership boundary must stay behind the runtime evidence disclosure'
);
assert.match(
  source,
  /const selectedIssue = issues\.find\(\(issue\) => issue\.code === focusedIssueCode\) \|\| null/,
  'the inspector must stay closed until an explicit URL-backed row selection exists'
);
assert.match(
  workspaceSource,
  /id="runtime-evidence"[\s\S]*admin\.troubleshooting\.boundary/,
  'the runtime evidence disclosure must own the complete diagnostic boundary copy'
);

console.log('admin_runtime_diagnostics_layout_contract: ok');
