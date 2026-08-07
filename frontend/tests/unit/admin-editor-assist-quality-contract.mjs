import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(
  resolve(process.cwd(), 'src/app/admin/troubleshooting/page.tsx'),
  'utf8'
);
const panelSource = readFileSync(
  resolve(process.cwd(), 'src/components/admin/EditorAssistQualityPanel.tsx'),
  'utf8'
);
const i18nSource = readFileSync(resolve(process.cwd(), 'src/lib/i18n.ts'), 'utf8');

assert.match(
  pageSource,
  /<EditorAssistQualityPanel[\s\S]*?windowHours=\{windowHours\}/,
  'Runtime Diagnostics must host the bounded editor-assist quality section'
);
assert.match(
  panelSource,
  /\/api\/admin\/editor-assist-quality\?/,
  'the quality section must consume the explicit read-only Admin proxy route'
);
assert.match(
  panelSource,
  /<AnalyticsLineChart/,
  'the quality section must reuse the existing analytics chart component'
);
assert.match(
  panelSource,
  /TASK_OPTIONS[\s\S]*?title_generation[\s\S]*?content_summary[\s\S]*?content_rewrite/,
  'the quality section must keep the three editor-assist task filters'
);
assert.match(
  panelSource,
  /sampleStage[\s\S]*?confidence[\s\S]*?persistence[\s\S]*?actionable/,
  'the quality section must expose sample and persistence context'
);
assert.match(
  panelSource,
  /data-ui="editor-assist-quality-candidate-table"[\s\S]*<thead[\s\S]*admin\.editor_quality\.column_evidence[\s\S]*admin\.editor_quality\.column_next_action/,
  'problem candidates must render as a semantic comparison table'
);
assert.match(
  panelSource,
  /data-ui="editor-assist-quality-export"[\s\S]*downloadJson\(exportData, exportFilename\)/,
  'the quality section must export the current loaded read-only response'
);
assert.doesNotMatch(
  panelSource,
  /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/,
  'the quality section must not expose a mutation request'
);
assert.doesNotMatch(
  panelSource,
  /(?:trigger|apply|mutate)(?:Prompt|Model|Evaluation)/,
  'the quality section must not add automatic optimization controls'
);

for (const key of [
  'admin.editor_quality.title',
  'admin.editor_quality.description',
  'admin.editor_quality.sample_validation',
  'admin.editor_quality.export_json',
  'admin.editor_quality.persistence_sustained',
  'admin.editor_quality.action_validate_instrumentation',
  'admin.editor_quality.boundary',
]) {
  const occurrences = i18nSource.split(`'${key}'`).length - 1;
  assert.equal(occurrences, 2, `${key} must exist in English and Simplified Chinese`);
}

assert.equal(
  i18nSource.split("'admin.editor_quality.unmatched_rate'").length - 1,
  2,
  'the unmatched-save label must exist in both locale dictionaries'
);
assert.doesNotMatch(
  `${panelSource}\n${i18nSource}`,
  /Saved after edit|修改后保存率|admin\.editor_quality\.edited_rate/,
  'an unmatched save must not be presented as proven edited adoption'
);

console.log('[ok] editor-assist quality Admin contract passed');
