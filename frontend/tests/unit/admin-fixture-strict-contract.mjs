import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';
const fixture = readFileSync(fromFrontendRoot('tests/e2e/helpers/admin-operator-fixture.ts'), 'utf8');
assert.doesNotMatch(fixture, /!options\.unhandledAdminRequests\s*\|\|/, 'no implicit successful empty responses');
assert.match(fixture, /allowedEmptyAdminRequests\?\.includes\(requestKey\)/, 'empty responses need exact request authorization');
assert.match(fixture, /status: 501/);
assert.match(fixture, /throw new Error\(`Unhandled Admin fixture request:/, 'unobserved missing endpoints must fail the browser test');
console.log('admin_fixture_strict_contract: ok');
