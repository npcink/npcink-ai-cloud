/** Manifest registration is also execution registration. Missing specs fail closed. */
export const adminVisualSpecPattern = /^tests\/e2e\/admin-[\w-]+\.spec\.ts$/;

export function adminVisualSpecs(manifest) {
  const pilots = Object.values(manifest.visualGovernance.pilotRoutes);
  if (!pilots.length) throw new Error('No Admin visual pilots registered');
  for (const pilot of pilots) {
    if (!adminVisualSpecPattern.test(pilot.browserSpec || '')) throw new Error('Every Admin visual pilot needs a browserSpec');
  }
  return [...new Set([...manifest.visualGovernance.supplementalSpecs, ...pilots.map(pilot => pilot.browserSpec)])];
}

export function changedAdminVisualSpecs(manifest, paths) {
  // Validate the complete registration before selecting a smaller CI lane.
  const allSpecs = adminVisualSpecs(manifest);
  const pilots = Object.entries(manifest.visualGovernance.pilotRoutes);
  const shared = paths.some(path => /^frontend\/src\/(components\/(admin|backoffice)\/|features\/admin\/|lib\/i18n\.ts$|app\/(globals\.css|admin\/layout\.tsx)$)/.test(path) || ['frontend/admin-ui-manifest.json', 'scripts/admin-visual-plan.mjs', 'scripts/run-admin-visual-checks.mjs', 'frontend/tests/e2e/helpers/admin-operator-fixture.ts', 'frontend/tests/e2e/helpers/admin-route-fixtures.ts', 'frontend/tests/e2e/helpers/admin-visual-receipt.ts'].includes(path));
  if (shared) return allSpecs;
  // Routes without a dedicated pilot still need the registered PC regression lane.
  if (paths.some(path => path.startsWith('frontend/src/app/admin/') && !pilots.some(([route]) => path.startsWith(`frontend/src/app${route}/`)))) return allSpecs;
  const supplemental = manifest.visualGovernance.supplementalSpecs.filter(spec => paths.includes(`frontend/${spec}`));
  return [...new Set([...supplemental, ...pilots.filter(([route, pilot]) => paths.some(path => path.startsWith(`frontend/src/app${route}/`) || path === `frontend/${pilot.browserSpec}`)).map(([, pilot]) => pilot.browserSpec)])];
}
