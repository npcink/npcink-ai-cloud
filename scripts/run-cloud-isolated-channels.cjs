#!/usr/bin/env node
// Four historical exclusions, exercised against a disposable local Next frontend.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const lanes = ['pending-install', 'complete-install', 'metadata', 'optional-mobile'];
const selected = process.argv.slice(2);
if (!selected.length) selected.push(...lanes);
if (selected.some((lane) => !lanes.includes(lane)) || new Set(selected).size !== selected.length) {
  throw new Error(`Choose distinct channels: ${lanes.join(', ')}`);
}
const output = path.resolve(process.env.NPCINK_CLOUD_ISOLATED_OUTPUT
  || path.join(frontend, 'test-results', `isolated-channels-${Date.now()}`));
// Claim a new receipt directory before resolving dependencies or writing inputs.
// Never reuse even an empty directory, file, or symlink from an earlier attempt.
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(output);
const http = require('node:http');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { responseFor } = require('./lib/isolated-channel-mock.cjs');
const { captureInputs, inputPolicy } = require('./lib/isolated-channel-inputs.cjs');
const next = require.resolve('next/dist/bin/next', { paths: [frontend] });
const playwright = require.resolve('@playwright/test/cli', { paths: [frontend] });
const guard = path.join(__dirname, 'lib/isolated-channel-guard.cjs');
const ownedChildren = new Set();
const ownedMocks = new Set();
async function cleanup() {
  await Promise.allSettled([...ownedChildren].map(stop));
  await Promise.all([...ownedMocks].map((server) => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  })));
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await cleanup();
  process.exit(signal === 'SIGINT' ? 130 : 143);
});
const write = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const rows = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
// Do not inherit backend credentials or a remote frontend URL from the shell.
const cleanEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT']
  .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const baseEnv = {
  ...cleanEnv, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_ENV: 'test',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
    || path.join(cleanEnv.HOME, '.local/share/magick-ai-playwright'),
  NPCINK_CLOUD_INTERNAL_AUTH_TOKEN: 'isolated-test-token',
  NPCINK_CLOUD_INTERNAL_AUTH_TOKEN_FILE: path.join(output, 'no-real-token-file'),
  NPCINK_CLOUD_DEV_ADMIN_KEY: 'isolated-test-admin-key',
};
async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function launch(args, env, logfile) {
  const fd = fs.openSync(logfile, 'wx');
  const child = spawn(process.execPath, args, { cwd: frontend, env, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  ownedChildren.add(child);
  child.once('exit', () => ownedChildren.delete(child));
  child.done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  return child;
}
async function bounded(child, milliseconds) {
  let timer;
  try {
    return await Promise.race([child.done, new Promise((_, reject) => {
      timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Child deadline exceeded')); }, milliseconds);
    })]);
  } catch (error) {
    await stop(child);
    throw error;
  } finally { clearTimeout(timer); }
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await child.done; } finally { clearTimeout(timeout); }
}
async function waitForFrontend(origin, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Frontend exited before ready');
    // TCP readiness avoids calling a health handler that could forward upstream.
    const ready = await new Promise((resolve) => {
      const socket = net.connect(Number(new URL(origin).port), '127.0.0.1');
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('error', () => resolve(false));
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Frontend readiness deadline exceeded');
}
async function runLane(lane) {
  const directory = path.join(output, lane);
  fs.mkdirSync(directory);
  const mockLog = path.join(directory, 'upstream-mock.jsonl');
  const mock = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    let reply = responseFor(lane, request.method, pathname);
    if (reply && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.admin_key !== baseEnv.NPCINK_CLOUD_DEV_ADMIN_KEY || body.redirect !== '/admin/ai-advisor') reply = null;
    }
    const status = reply ? 200 : 405;
    fs.appendFileSync(mockLog, `${JSON.stringify({ method: request.method, pathname, status, synthetic: true })}\n`);
    response.writeHead(status, { 'content-type': 'application/json', ...reply?.headers });
    response.end(JSON.stringify({ status: reply ? 'ok' : 'error', error_code: reply ? '' : 'isolated.unexpected_upstream',
      message: 'isolated synthetic upstream', data: reply?.data || {}, meta: { trace_id: 'isolated', revision: 'fixture-v1' } }));
  });
  ownedMocks.add(mock);
  mock.listen(0, '127.0.0.1');
  await once(mock, 'listening');
  const mockPort = mock.address().port;
  const frontPort = await freePort();
  const origin = `http://127.0.0.1:${frontPort}`;
  const env = {
    ...baseEnv, CLOUD_API_BASE_URL: `http://127.0.0.1:${mockPort}`, CLOUD_PUBLIC_BASE_URL: origin,
    NPCINK_CLOUD_SETUP_STATE_OVERRIDE: lane === 'pending-install' ? 'pending' : 'complete',
    NPCINK_CLOUD_FRONTEND_BASE_URL: origin, NPCINK_CLOUD_PORTAL_MOBILE_VISUAL: lane === 'optional-mobile' ? '1' : '0',
    NPCINK_ISOLATED_CHANNEL: lane, NPCINK_ISOLATED_OUTPUT: directory, NPCINK_ISOLATED_ORIGIN: origin,
    NPCINK_ISOLATED_PORTS: JSON.stringify([frontPort, mockPort]),
    NPCINK_ISOLATED_NETWORK_LOG: path.join(directory, 'node-network.jsonl'),
    NODE_OPTIONS: `--require=${guard}`,
  };
  write(path.join(directory, 'binding.json'), { lane, origin, mockOrigin: env.CLOUD_API_BASE_URL,
    setupState: env.NPCINK_CLOUD_SETUP_STATE_OVERRIDE, syntheticLoginPost: lane === 'metadata' });
  let server, runner, execution;
  try {
    server = launch([path.join(frontend, '.next/standalone/frontend/server.js')], {
      HOSTNAME: '127.0.0.1', PORT: String(frontPort),
      ...env, NPCINK_ISOLATED_SERVER_LOG: path.join(directory, 'frontend-http.jsonl'),
    }, path.join(directory, 'frontend.log'));
    await waitForFrontend(origin, server);
    runner = launch([playwright, 'test', '-c', 'playwright.isolated-channels.config.ts'], env, path.join(directory, 'test.log'));
    execution = await bounded(runner, 150000);
  } catch (error) {
    execution = { code: 1, error: error.message };
  } finally {
    await stop(runner);
    await stop(server);
    mock.closeAllConnections();
    await new Promise((resolve) => mock.close(resolve));
    ownedMocks.delete(mock);
  }
  const reportFile = path.join(directory, 'playwright.json');
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : {};
  const upstream = rows(mockLog);
  const frontendHttp = rows(path.join(directory, 'frontend-http.jsonl'));
  const network = rows(env.NPCINK_ISOLATED_NETWORK_LOG);
  const browser = rows(path.join(directory, 'browser.jsonl'));
  const violations = [];
  if (execution.code !== 0 || report.stats?.expected !== 1 || report.stats?.skipped !== 0
    || report.stats?.unexpected !== 0 || report.stats?.flaky !== 0 || report.errors?.length) violations.push('original-test-not-passed');
  if (network.length || upstream.some((row) => row.status !== 200) || browser.some((row) => row.blocked.length)) violations.push('unexpected-network');
  const mockPosts = upstream.filter((row) => row.method === 'POST');
  if (lane === 'metadata') {
    if (mockPosts.length !== 1 || mockPosts[0].pathname !== '/admin/auth/login') violations.push('missing-exact-mock-login');
    for (const pathname of ['/admin/session', '/internal/service/admin/ai-resources',
      '/internal/service/admin/agent-workflow-metadata', '/internal/service/admin/media-observability']) {
      if (!upstream.some((row) => row.method === 'GET' && row.pathname === pathname)) violations.push(`missing-read:${pathname}`);
    }
  } else if (upstream.length) violations.push('upstream-must-be-unused');
  if (lane === 'pending-install') {
    for (const pathname of ['/api/setup/session', '/api/setup/database/test', '/api/setup/install']) {
      if (!browser.flatMap((row) => row.requests).some((row) => row.method === 'POST' && row.pathname === pathname && row.status === 200)
        || frontendHttp.some((row) => row.pathname === pathname)) violations.push(`not-browser-fixture:${pathname}`);
    }
  }
  const cleaned = (!server || server.exitCode !== null || server.signalCode !== null)
    && (!runner || runner.exitCode !== null || runner.signalCode !== null) && !mock.listening;
  if (!cleaned) violations.push('cleanup-incomplete');
  const result = { lane, execution, stats: report.stats, violations, passed: !violations.length,
    frontendRequests: frontendHttp.length, frontendPosts: frontendHttp.filter((row) => row.method === 'POST'),
    upstreamRequests: upstream.length, mockPosts, nodeGuardEvents: network.length,
    cleaned };
  write(path.join(directory, 'result.json'), result);
  console.log(`${lane}: ${result.passed ? 'PASS' : 'FAIL'} (${directory})`);
  return result;
}
(async () => {
  // Always build current source; no reuse of a historical compiled frontend.
  const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  write(path.join(output, 'input-policy.json'), inputPolicy);
  const before = captureInputs(root);
  write(path.join(output, 'inputs-before.json'), before);
  const build = launch([next, 'build', '--webpack'], { ...baseEnv,
    CLOUD_API_BASE_URL: 'http://127.0.0.1:1', CLOUD_PUBLIC_BASE_URL: 'http://127.0.0.1:1',
    NPCINK_CLOUD_SETUP_STATE_OVERRIDE: 'complete',
  }, path.join(output, 'build.log'));
  const buildResult = await bounded(build, 240000);
  await stop(build);
  if (buildResult.code !== 0) throw new Error(`Build failed: ${JSON.stringify(buildResult)}`);
  write(path.join(output, 'build.json'), { source, buildResult,
    buildId: fs.readFileSync(path.join(frontend, '.next/BUILD_ID'), 'utf8').trim(), compiler: 'webpack', environment: 'test' });
  const standalone = path.join(frontend, '.next/standalone/frontend');
  fs.cpSync(path.join(frontend, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  if (fs.existsSync(path.join(frontend, 'public'))) fs.cpSync(path.join(frontend, 'public'), path.join(standalone, 'public'), { recursive: true });
  const results = [];
  for (const lane of selected) results.push(await runLane(lane));
  const after = captureInputs(root);
  write(path.join(output, 'inputs-after.json'), after);
  const inputsUnchanged = JSON.stringify(before) === JSON.stringify(after);
  write(path.join(output, 'result.json'), { source, results, inputsUnchanged, inputPolicyVersion: inputPolicy.version,
    passed: inputsUnchanged && results.every((result) => result.passed),
    scope: 'Local synthetic channels; no M4, production, real install, Provider or human acceptance proof.' });
  process.exitCode = inputsUnchanged && results.every((result) => result.passed) ? 0 : 1;
})().catch(async (error) => { await cleanup(); console.error(error); process.exitCode = 1; });
