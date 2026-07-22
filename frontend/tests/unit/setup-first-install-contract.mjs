import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const setupPagePath = resolve(root, 'src/app/setup/page.tsx');
const wizardPath = resolve(root, 'src/components/setup/SetupWizard.tsx');
const setupProxyPath = resolve(root, 'src/app/api/setup/_shared.ts');
const setupRoutePath = resolve(root, 'src/app/api/setup/[...path]/route.ts');
const globalProxyPath = resolve(root, 'src/proxy.ts');
const envPath = resolve(root, 'src/lib/env.ts');
const serverEnvPath = resolve(root, 'src/lib/server-env.ts');
const oldBootstrapPath = resolve(root, 'src/app/admin/auth/bootstrap/route.ts');

for (const path of [setupPagePath, wizardPath, setupProxyPath, setupRoutePath, globalProxyPath]) {
  assert.equal(existsSync(path), true, `missing first-install frontend file: ${path}`);
}
assert.equal(existsSync(oldBootstrapPath), false, 'retired bootstrap login BFF must be deleted');

const wizard = readFileSync(wizardPath, 'utf8');
const setupProxy = readFileSync(setupProxyPath, 'utf8');
const setupRoute = readFileSync(setupRoutePath, 'utf8');
const globalProxy = readFileSync(globalProxyPath, 'utf8');
const env = readFileSync(envPath, 'utf8');
const serverEnv = readFileSync(serverEnvPath, 'utf8');

for (const endpoint of ['state', 'session', 'database/test', 'install']) {
  assert.match(setupProxy, new RegExp(`path: '${endpoint.replace('/', '\\/')}'`));
}
assert.match(setupProxy, /const SETUP_ROUTE_RULES: readonly SetupRouteRule\[\] = \[/);
assert.match(setupProxy, /SETUP_SESSION_COOKIE = 'npcink_setup_session'/);
assert.match(setupProxy, /headers\.set\('Cookie', `\$\{SETUP_SESSION_COOKIE\}=\$\{setupCookie\}`\)/);
assert.match(setupProxy, /cookieName === SETUP_SESSION_COOKIE/);
assert.doesNotMatch(setupProxy, /rule\.requiresSession && !request\.cookies/);
assert.doesNotMatch(setupProxy, /getInternalAuthToken|NPCINK_CLOUD_INTERNAL_AUTH_TOKEN|Authorization/);
assert.doesNotMatch(setupProxy, /x-forwarded-for|X-Forwarded-For/i);
assert.match(setupProxy, /request\.headers\.get\('x-real-ip'\)/);
assert.match(setupProxy, /rule\.forwardsIdempotencyKey && !request\.headers\.get\('idempotency-key'\)/);
assert.match(setupProxy, /body\.byteLength > 512 \* 1024/);
assert.match(setupProxy, /rule\.path === 'state'[\s\S]*503,[\s\S]*'setup\.state_unavailable'/);
assert.match(setupRoute, /export async function GET/);
assert.match(setupRoute, /export async function POST/);
assert.doesNotMatch(setupRoute, /PUT|PATCH|DELETE/);

assert.match(globalProxy, /await readInstallationState\(\)/);
assert.match(globalProxy, /setup\.installation_required/);
assert.match(globalProxy, /setup\.already_complete/);
assert.match(globalProxy, /setup\.state_unavailable/);
assert.match(globalProxy, /SETUP_API_RULES\.has\(setupRouteKey\)/);
assert.match(globalProxy, /pathname === '\/health\/live'/);
assert.match(globalProxy, /pathname === '\/health\/ready'/);
assert.match(globalProxy, /pathname === '\/setup\/'/);
assert.match(globalProxy, /installationState === 'complete'/);
assert.match(globalProxy, /let completedInstallationObserved = false/);
assert.match(globalProxy, /completedInstallationObserved = true/);
assert.match(globalProxy, /if \(completedInstallationObserved\) \{[\s\S]*installationState: 'complete'/);
assert.doesNotMatch(globalProxy, /installation state.*pending/i);
assert.match(readFileSync(resolve(root, 'src/lib/setup.ts'), 'utf8'), /envelope\.status !== 'ok'/);
assert.match(readFileSync(resolve(root, 'src/lib/setup.ts'), 'utf8'), /envelope\.error_code !== ''/);

for (const forbiddenStorage of ['localStorage', 'sessionStorage']) {
  assert.doesNotMatch(wizard, new RegExp(`\\b${forbiddenStorage}\\b`), `setup secrets must not use ${forbiddenStorage}`);
}
assert.doesNotMatch(wizard, /console\.(?:log|info|warn|error)/);
assert.match(wizard, /type=\{isSetupCodeVisible \? 'text' : 'password'\}/);
assert.match(wizard, /autoComplete="new-password"/);
assert.match(wizard, /idempotencyKey: installIdempotencyKey\.current/);
assert.match(wizard, /setSetupCode\(''\)/);
assert.match(wizard, /setDatabase\(EMPTY_DATABASE\)/);
assert.match(wizard, /window\.location\.assign\('\/admin\/login'\)/);
assert.doesNotMatch(wizard, /setNextUrl|location\.assign\(nextUrl\)/);
assert.match(wizard, /data-setup-installation-state=\{installationComplete \? 'complete' : 'pending'\}/);
assert.match(wizard, /installationComplete[\s\S]*setup\.install_complete_status/);
assert.match(wizard, /I saved this admin key|setup\.admin_key_saved_confirm/);

assert.match(env, /NPCINK_CLOUD_INTERNAL_AUTH_TOKEN_FILE/);
assert.match(env, /CLOUD_PUBLIC_BASE_URL must use HTTPS/);
assert.doesNotMatch(env, /node:fs|readFileSync/);
assert.match(env, /Plaintext NPCINK_CLOUD_INTERNAL_AUTH_TOKEN is not allowed/);
assert.match(env, /NPCINK_CLOUD_DEV_ADMIN_KEY is not allowed/);
assert.match(serverEnv, /readFileSync\(tokenFile, 'utf8'\)\.trim\(\)/);
assert.match(serverEnv, /if \(isNonDevelopmentEnvironment\(\)\) \{[\s\S]*Cloud frontend internal authentication is unavailable/);

console.log('setup_first_install_contract: ok');
