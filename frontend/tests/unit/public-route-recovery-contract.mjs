import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(testDir, '../..');
const notFoundSource = fs.readFileSync(
  path.join(frontendRoot, 'src/app/not-found.tsx'),
  'utf8'
);
const errorSource = fs.readFileSync(
  path.join(frontendRoot, 'src/app/error.tsx'),
  'utf8'
);

assert.match(notFoundSource, /<PublicSiteShell>/);
assert.match(notFoundSource, /href="\/"/);
assert.match(notFoundSource, /href="\/help"/);
assert.match(notFoundSource, /href="\/portal\/login"/);
assert.match(errorSource, /onClick=\{reset\}/);
assert.match(errorSource, /error\.digest/);
assert.doesNotMatch(errorSource, /\{error\.message\}/);

console.log('public_route_recovery_contract: ok');
