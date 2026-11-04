#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const tls = require('node:tls');
const { once } = require('node:events');
const { responseFor } = require('./lib/isolated-channel-mock.cjs');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-isolated-guard-'));
  const networkLog = path.join(directory, 'network.jsonl');
  const serverLog = path.join(directory, 'server.jsonl');
  const server = http.createServer((_, response) => response.writeHead(204).end());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  process.env.NPCINK_ISOLATED_PORTS = JSON.stringify([port]);
  process.env.NPCINK_ISOLATED_NETWORK_LOG = networkLog;
  process.env.NPCINK_ISOLATED_SERVER_LOG = serverLog;
  process.env.NPCINK_ISOLATED_CHANNEL = 'complete-install';
  require('./lib/isolated-channel-guard.cjs');
  try {
    const request = (pathname, method) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: pathname, method }, (res) => {
        res.resume(); res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject); req.end();
    });
    assert.equal(await request('/setup', 'GET'), 204);
    assert.equal(await request('/api/setup/session', 'POST'), 204, 'complete gate probe reaches frontend');
    assert.equal(await request('/api/setup/install', 'POST'), 405, 'unmocked real install cannot reach handler');
    process.env.NPCINK_ISOLATED_CHANNEL = 'pending-install';
    assert.equal(await request('/api/setup/session', 'POST'), 405, 'pending business POST must be mocked');
    assert.equal(await request('/api/health', 'POST'), 204, 'pending gate probe reaches frontend');
    assert.throws(() => net.connect({ host: 'example.invalid', port }), /denied Node connection/);
    assert.throws(() => net.connect({ host: '127.0.0.1', port: port + 1 }), /denied Node connection/);
    assert.throws(() => net.connect({ path: '/tmp/isolated-no-socket' }), /denied Node connection/);
    assert.throws(() => tls.connect({ host: 'example.invalid', port: 443 }), /denied TLS/);
    assert.equal(responseFor('pending-install', 'POST', '/setup/v1/install'), null);
    assert.equal(responseFor('complete-install', 'POST', '/admin/auth/login'), null);
    assert.equal(responseFor('metadata', 'POST', '/internal/service/admin/provider-connections'), null);
    assert.equal(responseFor('metadata', 'GET', '/unknown'), null);
    const events = fs.readFileSync(networkLog, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.filter((row) => row.kind === 'denied-connect').length, 3);
    assert.equal(events.filter((row) => row.kind === 'denied-tls').length, 1);
    assert.equal(events.filter((row) => row.kind === 'denied-frontend-write').length, 2);
    console.log('PASS: loopback allowlist, TLS/Unix/other-port denial, gate probes and unmocked-write denial');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
