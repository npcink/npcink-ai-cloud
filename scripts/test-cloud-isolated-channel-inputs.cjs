#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { captureInputs, inputPolicy } = require('./lib/isolated-channel-inputs.cjs');

const repository = path.resolve(__dirname, '..');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-isolated-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, content = file) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  for (const file of inputPolicy.supportFiles) write(file, fs.readFileSync(path.join(repository, file)));
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'frontend/package.json', 'frontend/tailwind.config.ts', 'frontend/postcss.config.mjs',
    'frontend/tsconfig.json', 'frontend/next.config.mjs', 'frontend/next-env.d.ts',
    'frontend/src/app/page.tsx', 'frontend/public/logo.svg']) write(file);
  write('package.json', '{}');
  write('frontend/package.json', '{}');
  write('.gitignore', '**/ignored-*\n.env*\nnode_modules/\n.next/\ntest-results/\nplaywright-report/\n*.tsbuildinfo\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('add', '.');
  return { root, write, git, capture: () => captureInputs(root) };
}

for (const config of ['tailwind.config.ts', 'postcss.config.mjs', 'tsconfig.json']) {
  test(`bind ${config} content changes`, (t) => {
    const context = fixture(t);
    const file = `frontend/${config}`;
    const before = context.capture();
    assert.ok(before[file]);
    context.write(file, 'changed effective config');
    assert.notEqual(context.capture()[file], before[file]);
  });
}

test('independent enumeration detects added tracked source and removed source', (t) => {
  const context = fixture(t);
  const before = context.capture();
  const added = 'frontend/src/app/added.tsx';
  context.write(added);
  context.git('add', added);
  fs.unlinkSync(path.join(context.root, 'frontend/src/app/page.tsx'));
  const after = context.capture();
  assert.equal(before[added], undefined);
  assert.ok(after[added]);
  assert.ok(before['frontend/src/app/page.tsx']);
  assert.equal(after['frontend/src/app/page.tsx'], undefined);
  assert.notDeepEqual(after, before);
});

for (const file of ['frontend/src/app/untracked.tsx', 'frontend/src/app/ignored-source.tsx',
  'frontend/public/ignored-image.png', 'frontend/ignored-postcss.config.cjs', '.browserslistrc']) {
  test(`include new local input ${file} regardless of Git tracking or ignores`, (t) => {
    const context = fixture(t);
    const before = context.capture();
    context.write(file, 'first bytes');
    if (file.includes('ignored-')) assert.equal(context.git('check-ignore', file), file);
    assert.equal(context.git('ls-files', '--', file), '');
    const after = context.capture();
    assert.ok(after[file]);
    assert.equal(before[file], undefined);
    context.write(file, 'changed bytes');
    assert.notEqual(context.capture()[file], after[file]);
  });
}

test('only declared generated outputs are excluded; next-env and nested source stay bound', (t) => {
  const context = fixture(t);
  const before = context.capture();
  for (const directory of inputPolicy.excludedTrees) context.write(`${directory}/output.json`, 'generated');
  context.write('frontend/tsconfig.tsbuildinfo', 'generated');
  assert.deepEqual(context.capture(), before);
  context.write('frontend/src/.next/local.ts', 'valid nested source');
  context.write('frontend/next-env.d.ts', 'changed declaration input');
  const after = context.capture();
  assert.ok(after['frontend/src/.next/local.ts']);
  assert.notEqual(after['frontend/next-env.d.ts'], before['frontend/next-env.d.ts']);
});

for (const file of ['frontend/src/linked.ts', 'frontend/public/linked', 'tsconfig.link.json']) {
  test(`reject symlink input ${file}`, (t) => {
    const context = fixture(t);
    fs.mkdirSync(path.dirname(path.join(context.root, file)), { recursive: true });
    fs.symlinkSync(path.join(context.root, 'frontend/src/app/page.tsx'), path.join(context.root, file));
    assert.throws(context.capture, /Unsupported input symlink:/);
  });
}

for (const file of ['frontend/.env.local', '.env.test']) {
  test(`reject ignored environment input ${file} even when added after first capture`, (t) => {
    const context = fixture(t);
    assert.doesNotThrow(context.capture);
    context.write(file, 'SYNTHETIC_FIXTURE=not-a-secret');
    assert.equal(context.git('check-ignore', file), file);
    assert.throws(context.capture, /Refusing local environment input:/);
  });
}

test('real runner writes the expanded pre-build binding without starting a build or network', (t) => {
  const context = fixture(t);
  context.git('-c', 'user.name=Offline Test', '-c', 'user.email=offline@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'offline fixture');
  context.write('frontend/src/app/ignored-source.tsx', 'untracked ignored input');
  context.write('frontend/public/ignored-image.png', Buffer.from([0, 255, 13]));
  const output = path.join(context.root, 'frontend/test-results/receipt');
  const preload = path.join(context.root, 'frontend/test-results/preload.cjs');
  context.write('frontend/test-results/preload.cjs', `
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const cp = require('node:child_process');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'next/dist/bin/next' || request === '@playwright/test/cli') return '/offline-never-executed.cjs';
  if (!Module.isBuiltin(request) && request !== process.argv[1] && !request.startsWith('./lib/')) {
    throw new Error('OFFLINE_UNEXPECTED_MODULE:' + request);
  }
  return resolve.call(this, request, ...args);
};
const exec = cp.execFileSync;
cp.execFileSync = function (command, args, ...rest) {
  if (command !== 'git' || JSON.stringify(args) !== JSON.stringify(['rev-parse', 'HEAD'])) {
    throw new Error('OFFLINE_UNEXPECTED_EXEC');
  }
  return exec.call(this, command, args, ...rest);
};
cp.spawn = function (command, args) {
  if (command !== process.execPath || JSON.stringify(args) !== JSON.stringify(['/offline-never-executed.cjs', 'build', '--webpack'])) {
    throw new Error('OFFLINE_UNEXPECTED_SPAWN');
  }
  throw new Error('OFFLINE_BUILD_BLOCKED');
};
for (const name of ['node:net', 'node:tls', 'node:http', 'node:https', 'node:dns', 'node:dgram']) {
  const api = require(name);
  for (const method of ['connect', 'createConnection', 'request', 'get', 'lookup', 'resolve', 'createSocket']) {
    if (typeof api[method] === 'function') api[method] = () => { throw new Error('OFFLINE_NETWORK_BLOCKED'); };
  }
}
require('node:net').Server.prototype.listen = () => { throw new Error('OFFLINE_NETWORK_BLOCKED'); };
globalThis.fetch = () => { throw new Error('OFFLINE_NETWORK_BLOCKED'); };
`);
  const result = spawnSync(process.execPath, ['--require', preload,
    path.join(context.root, 'scripts/run-cloud-isolated-channels.cjs'), 'metadata'], {
    cwd: context.root, timeout: 5000, encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NPCINK_CLOUD_ISOLATED_OUTPUT: output },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OFFLINE_BUILD_BLOCKED/);
  assert.doesNotMatch(result.stderr, /OFFLINE_(?:UNEXPECTED|NETWORK)/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, 'inputs-before.json'))), context.capture());
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'input-policy.json'))).version, 2);
  assert.equal(fs.statSync(path.join(output, 'build.log')).size, 0);
  assert.equal(fs.existsSync(path.join(output, 'result.json')), false);
});
