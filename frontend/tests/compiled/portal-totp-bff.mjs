// Black-box compiled transport proof. Never print request/response bodies or cookies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-totp-bff-'));
let child;
let mode = 'ok';
let origin;
let requests = 0;
let forwardingValid = true;
const backend = http.createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  requests += 1;
  forwardingValid &&= req.headers.cookie === 'portal_totp_challenge=synthetic'
    && req.headers.authorization === 'Bearer synthetic' && req.headers.origin === origin
    && (req.method === 'GET' || req.method === 'HEAD' || body === '{"code":"synthetic"}');
  if (mode === 'disconnect') { req.socket.destroy(); return; }
  if (mode === 'timeout') return;
  res.setHeader('Set-Cookie', ['portal_totp_challenge=; Max-Age=0; Path=/; HttpOnly',
    'npcink_portal_session_token=synthetic-replacement; Path=/; HttpOnly']);
  res.setHeader('Retry-After', '4');
  res.setHeader('Vary', 'Accept-Language');
  res.setHeader('Content-Type', mode === 'html' ? 'text/html' : 'application/json');
  res.statusCode = /^\d+$/.test(mode) ? Number(mode) : 200;
  res.end(mode === 'bad-json' ? '{SENSITIVE_SYNTHETIC' : mode === 'html' ? '<html>SENSITIVE_SYNTHETIC</html>'
    : JSON.stringify({ status: res.statusCode < 400 ? 'ok' : 'error', data: { sequence: requests } }));
});
const privateHeaders = (response) => {
  assert.ok(response.headers.get('cache-control') === 'private, no-store', 'private cache header');
  assert.ok(response.headers.get('pragma') === 'no-cache', 'private pragma');
  const vary = (response.headers.get('vary') || '').toLowerCase().split(',').map((part) => part.trim());
  assert.ok(vary.includes('cookie') && vary.includes('authorization'), 'private vary');
};
try {
  assert.ok(fs.existsSync(path.join(frontend, '.next/BUILD_ID')), 'compiled frontend required');
  const buildId = fs.readFileSync(path.join(frontend, '.next/BUILD_ID'), 'utf8').trim();
  fs.cpSync(path.join(frontend, '.next/standalone'), temporary, { recursive: true });
  const runtime = path.join(temporary, 'frontend');
  fs.cpSync(path.join(frontend, '.next/static'), path.join(runtime, '.next/static'), { recursive: true });
  if (fs.existsSync(path.join(frontend, 'public'))) fs.cpSync(path.join(frontend, 'public'), path.join(runtime, 'public'), { recursive: true });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const portProbe = net.createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
  const port = portProbe.address().port; await new Promise((resolve) => portProbe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  const upstream = `http://127.0.0.1:${backend.address().port}`;
  assert.ok(new URL(upstream).hostname === '127.0.0.1', 'only loopback upstream');
  child = spawn(process.execPath, [path.join(runtime, 'server.js')], { cwd: runtime, stdio: 'ignore', env: {
    PATH: process.env.PATH, HOME: process.env.HOME, HOSTNAME: '127.0.0.1', PORT: String(port),
    NEXT_PUBLIC_ENV: 'test', NPCINK_CLOUD_SETUP_STATE_OVERRIDE: 'complete', NEXT_TELEMETRY_DISABLED: '1',
    CLOUD_API_BASE_URL: upstream, CLOUD_PUBLIC_BASE_URL: origin,
  } });
  const deadline = Date.now() + 30000;
  while (true) {
    assert.ok(child.exitCode === null && Date.now() < deadline, 'compiled frontend ready');
    const ready = await new Promise((resolve) => { const socket = net.connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); }); socket.once('error', () => resolve(false)); });
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const request = (pathname, method = 'POST') => fetch(`${origin}/api/portal/${pathname}`, {
    method, redirect: 'manual', signal: AbortSignal.timeout(20000), headers: {
      Cookie: 'portal_totp_challenge=synthetic', Authorization: 'Bearer synthetic', Origin: origin,
      'Content-Type': 'application/json',
    }, ...(method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? {} : { body: '{"code":"synthetic"}' }),
  });
  let checks = 0;
  const paths = ['totp/setup/start', 'totp/setup/confirm', 'totp/status', 'totp/disable/start',
    'totp/disable/confirm', 'totp/recovery-reset/start', 'totp/recovery-reset/confirm'];
  for (const pathname of paths) for (const status of ['ok', '401', '403', '422', '429', '503']) {
    mode = status;
    const response = await request(pathname, pathname.endsWith('/status') ? 'GET' : 'POST');
    assert.ok(response.status === (status === 'ok' ? 200 : Number(status)), 'forwarded status'); privateHeaders(response);
    assert.ok(response.headers.getSetCookie().length === 2, 'all replacement and clearing cookies retained');
    assert.ok(response.headers.get('retry-after') === '4', 'upstream retry header');
    await response.arrayBuffer(); checks += 1;
  }
  for (const failure of ['bad-json', 'html', 'disconnect', 'timeout']) {
    mode = failure;
    const response = await request('totp/setup/confirm');
    assert.ok(response.status === (failure === 'timeout' ? 504 : 502), 'bounded transport failure'); privateHeaders(response);
    assert.ok(!(await response.text()).includes('SENSITIVE_SYNTHETIC'), 'no body leakage');
    assert.ok(!response.headers.has('retry-after'), 'no upstream timing on generated errors'); checks += 1;
  }
  mode = '405';
  for (const method of ['HEAD', 'OPTIONS', 'PATCH']) {
    const response = await request('totp/setup/confirm', method); privateHeaders(response);
    assert.ok(response.status === (method === 'OPTIONS' ? 204 : 405), 'private framework or proxied method rejection');
    await response.arrayBuffer(); checks += 1;
  }
  mode = 'ok';
  const lookalike = await request('totp-lookalike', 'GET');
  assert.ok(!lookalike.headers.has('pragma'), 'prefix has a path boundary'); await lookalike.arrayBuffer();
  const first = await (await request('totp/status', 'GET')).json();
  const second = await (await request('totp/status', 'GET')).json();
  assert.ok(first.data.sequence !== second.data.sequence, 'no cached factor response');
  assert.ok(forwardingValid, 'method/body/cookie/authorization/origin preserved');
  console.log(JSON.stringify({ passed: true, checks: checks + 3, buildId, compiled: true, loopback: true, cookieCount: 2 }));
} catch {
  // Deliberately do not emit Error.cause, URL credentials or response excerpts.
  console.error('FAIL: compiled TOTP BFF contract (no sensitive diagnostics)'); process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    await once(child, 'exit'); clearTimeout(timeout);
  }
  backend.closeAllConnections(); await new Promise((resolve) => backend.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
}
