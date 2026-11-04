#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

const runner = path.join(__dirname, 'run-cloud-isolated-channels.cjs');

function snapshot(target) {
  const stat = fs.lstatSync(target);
  return {
    mode: stat.mode, size: stat.size, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs,
    ...(stat.isSymbolicLink() ? { link: fs.readlinkSync(target) }
      : stat.isDirectory() ? { entries: Object.fromEntries(fs.readdirSync(target).sort()
        .map((name) => [name, snapshot(path.join(target, name))])) }
        : { bytes: fs.readFileSync(target).toString('base64') }),
  };
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-isolated-output-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const events = path.join(directory, 'events.jsonl');
  const preload = path.join(directory, 'preflight-tripwire.cjs');
  // The real runner must reject reuse before reading inputs or reaching any
  // dependency, Git, build, browser, or network operation. Fresh output is tested
  // only up to the first dependency resolution, without loading that dependency.
  fs.writeFileSync(preload, `
const fs = require('node:fs');
const Module = require('node:module');
const childProcess = require('node:child_process');
const fail = (kind) => {
  fs.appendFileSync(process.env.PREFLIGHT_EVENTS, JSON.stringify(kind) + '\\n');
  throw new Error('PREFLIGHT_TRIPWIRE:' + kind);
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (!Module.isBuiltin(request) && request !== process.argv[1]) fail('module:' + request);
  return resolve.call(this, request, ...args);
};
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  if (file !== process.argv[1]) fail('input-read');
  return read.call(this, file, ...args);
};
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[method] = () => fail('child:' + method);
}
for (const name of ['node:net', 'node:tls', 'node:http', 'node:https', 'node:dns', 'node:dgram']) {
  const api = require(name);
  for (const method of ['connect', 'createConnection', 'request', 'get', 'lookup', 'resolve', 'createSocket']) {
    if (typeof api[method] === 'function') api[method] = () => fail('network:' + name + ':' + method);
  }
}
require('node:net').Server.prototype.listen = () => fail('network:listen');
globalThis.fetch = () => fail('network:fetch');
`);
  return {
    directory,
    run(output) {
      const result = spawnSync(process.execPath, ['--require', preload, runner, 'metadata'], {
        cwd: directory, timeout: 5000, encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: process.env.HOME,
          NPCINK_CLOUD_ISOLATED_OUTPUT: output, PREFLIGHT_EVENTS: events },
      });
      assert.ifError(result.error);
      assert.equal(result.signal, null, result.stderr);
      assert.equal(result.status, 1, result.stderr);
      return { ...result, events: fs.existsSync(events)
        ? fs.readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse) : [] };
    },
  };
}

for (const kind of ['populated-directory', 'empty-directory', 'file', 'directory-symlink', 'dangling-symlink']) {
  test(`refuse existing ${kind} without changing its receipt or resolving dependencies`, (t) => {
    const context = fixture(t);
    const receipts = path.join(context.directory, 'receipts');
    fs.mkdirSync(receipts);
    const output = path.join(receipts, 'existing');
    if (kind === 'file') fs.writeFileSync(output, 'existing file\n');
    else if (kind.endsWith('symlink')) {
      const target = path.join(receipts, 'target');
      if (kind === 'directory-symlink') {
        fs.mkdirSync(target);
        fs.writeFileSync(path.join(target, 'sentinel'), 'keep linked receipt\n');
      }
      fs.symlinkSync(target, output);
    } else {
      fs.mkdirSync(output);
      if (kind === 'populated-directory') {
        fs.writeFileSync(path.join(output, 'sentinel'), Buffer.from([0, 255, 10, 13]));
        fs.writeFileSync(path.join(output, 'inputs-before.json'), '{"sealed":"old inputs"}\n');
        fs.writeFileSync(path.join(output, 'build.log'), 'old sealed build log\n');
      }
    }
    const before = snapshot(receipts);
    const result = context.run(output);
    assert.deepEqual(snapshot(receipts), before, 'receipt contents and metadata must remain unchanged');
    assert.deepEqual(result.events, [], 'reuse must stop before input reads, modules, processes or network');
    assert.match(result.stderr, /EEXIST[^\n]*mkdir/);
    assert.ok(result.stderr.includes(output), result.stderr);
    assert.equal(result.stdout, '');
  });
}

test('create missing parents and a fresh output before any dependency resolution', (t) => {
  const context = fixture(t);
  const output = path.join(context.directory, 'missing', 'parents', 'fresh');
  const result = context.run(output);
  assert.equal(fs.statSync(output).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(output), [], 'tripwire stops before any receipt or build write');
  assert.equal(result.events.length, 1);
  assert.match(result.events[0], /^module:/);
  assert.match(result.stderr, /PREFLIGHT_TRIPWIRE:module:/);
});
