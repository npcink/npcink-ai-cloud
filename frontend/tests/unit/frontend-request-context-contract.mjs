import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const readSource = (path) => readFileSync(resolve(FRONTEND_ROOT, path), 'utf8');

const layoutSource = readSource('src/app/admin/layout.tsx');
const pluginSource = readSource('src/app/admin/plugin-observability/page.tsx');
const troubleshootingSource = readSource('src/app/admin/troubleshooting/page.tsx');

assert.match(
  layoutSource,
  /error instanceof ApiError[\s\S]*error\.statusCode === 401[\s\S]*error\.statusCode === 403[\s\S]*window\.location\.replace/,
  'Admin session bootstrap must redirect only for explicit authentication or authorization failures'
);
assert.match(
  layoutSource,
  /\.catch\(\(error: unknown\) => \{[\s\S]*window\.location\.replace[\s\S]*\}\);/,
  'Admin session bootstrap must fail closed and preserve the current route after a non-auth transport failure'
);
assert.doesNotMatch(
  layoutSource,
  /catch \(\(error: unknown\) => \{[\s\S]*setAdminSessionReady\(true\)/,
  'Admin session bootstrap must not unlock the protected shell after a non-auth transport failure'
);

for (const [label, source] of [
  ['plugin observability', pluginSource],
  ['runtime troubleshooting', troubleshootingSource],
]) {
  assert.match(
    source,
    /requestAbortRef\.current\?\.abort\(\)[\s\S]*new AbortController\(\)[\s\S]*signal: controller\.signal/,
    `${label} must cancel the obsolete request before starting its replacement`
  );
  assert.match(
    source,
    /sequence !== requestSequenceRef\.current[\s\S]*return/,
    `${label} must reject stale responses even when cancellation races with completion`
  );
  assert.match(
    source,
    /return \(\) => \{\s*requestSequenceRef\.current \+= 1;\s*requestAbortRef\.current\?\.abort\(\);\s*\}/,
    `${label} cleanup must invalidate and abort the active request`
  );
}

console.log('frontend_request_context_contract: ok');
