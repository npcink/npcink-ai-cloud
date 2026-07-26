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
  'admin.editor_quality.persistence_sustained',
  'admin.editor_quality.action_validate_instrumentation',
  'admin.editor_quality.boundary',
]) {
  const occurrences = i18nSource.split(`'${key}'`).length - 1;
  assert.equal(occurrences, 2, `${key} must exist in English and Simplified Chinese`);
}

console.log('[ok] editor-assist quality Admin contract passed');
