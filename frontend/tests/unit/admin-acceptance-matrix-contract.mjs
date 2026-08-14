import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fromFrontendRoot } from './_paths.mjs';

const manifest = JSON.parse(readFileSync(fromFrontendRoot('admin-ui-manifest.json'), 'utf8'));
const matrix = JSON.parse(readFileSync(fromFrontendRoot('admin-acceptance-matrix.json'), 'utf8'));
const allowedEvidenceTiers = new Set(['route_smoke', 'focused_behavior', 'pilot_visual']);

assert.equal(matrix.version, 1, 'Admin acceptance matrix version must be explicit');
assert.deepEqual(
  matrix.viewport,
  manifest.viewport,
  'Admin acceptance viewport must stay aligned with the UI manifest'
);
assert.deepEqual(
  matrix.evidenceTiers,
  [...allowedEvidenceTiers],
  'Admin acceptance evidence tiers must remain explicit and ordered'
);
assert.equal(matrix.routes.length, 25, 'Admin acceptance matrix must cover the reviewed 25-route inventory');

const manifestRoutes = Object.entries(manifest.routes).sort(([left], [right]) => left.localeCompare(right));
const matrixRoutes = matrix.routes
  .map((route) => [route.routePattern, route.pageModel])
  .sort(([left], [right]) => left.localeCompare(right));

assert.deepEqual(matrixRoutes, manifestRoutes, 'Admin acceptance matrix must match the manifest routes and page models exactly');
assert.equal(
  new Set(matrix.routes.map((route) => route.smokePath)).size,
  matrix.routes.length,
  'Every Admin route must have one unique concrete smoke path'
);

for (const route of matrix.routes) {
  assert.match(route.routePattern, /^\/admin(?:\/|$)/, `${route.routePattern} must remain inside the Admin surface`);
  assert.match(route.smokePath, /^\/admin(?:\/|\?|$)/, `${route.routePattern} must use an Admin smoke path`);
  assert.doesNotMatch(route.smokePath, /\[[^\]]+\]/, `${route.routePattern} must resolve dynamic segments`);
  assert.ok(allowedEvidenceTiers.has(route.evidenceTier), `${route.routePattern} must declare a supported evidence tier`);
  assert.ok(Array.isArray(route.focusedSpecs), `${route.routePattern} must declare focusedSpecs`);

  if (route.evidenceTier !== 'route_smoke') {
    assert.ok(route.focusedSpecs.length > 0, `${route.routePattern} must retain focused behavior evidence`);
  }

  for (const spec of route.focusedSpecs) {
    assert.match(spec, /^tests\/e2e\/admin-.+\.spec\.ts$/, `${route.routePattern} focused evidence must be an Admin Playwright spec`);
    assert.ok(existsSync(resolve(fromFrontendRoot('.'), spec)), `${route.routePattern} focused evidence is missing: ${spec}`);
  }

  for (const request of route.allowedEmptyAdminRequests || []) {
    assert.match(
      request,
      /^GET \/api\/admin\/[A-Za-z0-9_?&=./%-]+$/,
      `${route.routePattern} empty-response request must be an exact Admin GET request`
    );
  }
}

for (const pilotRoute of Object.keys(manifest.visualGovernance.pilotRoutes)) {
  const route = matrix.routes.find((candidate) => candidate.routePattern === pilotRoute);
  assert.ok(route, `${pilotRoute} visual pilot must exist in the Admin acceptance matrix`);
  assert.equal(route.evidenceTier, 'pilot_visual', `${pilotRoute} visual pilot must retain pilot_visual evidence`);
  assert.ok(route.focusedSpecs.length > 0, `${pilotRoute} visual pilot must point to an existing focused browser spec`);
}

const loginRoute = matrix.routes.find((route) => route.routePattern === '/admin/login');
assert.equal(loginRoute.expectedLandingPath, '/admin', 'Authenticated login smoke must declare its redirect landing path');

console.log(`admin_acceptance_matrix_contract: ok (${matrix.routes.length}/${manifestRoutes.length} routes)`);
