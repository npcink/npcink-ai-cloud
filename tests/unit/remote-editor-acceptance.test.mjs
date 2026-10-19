import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { editorFlow, loadBrowser, main, privateSessionPath, readSession, RequestBoundary,
  restPath, targetConfig, validateDraft } from '../../scripts/remote-editor-acceptance.mjs';

const target = targetConfig({ site_url: 'https://wordpress.example.test', post_id: 42,
  expected_slug: 'npcink-acceptance-fixture', target_marker: 'NPCINK_ACCEPTANCE_TARGET' });
const ability = target.site_url + '/wp-json/wp-abilities/v1/abilities/ai/content-resizing/run';
const save = target.site_url + '/wp-json/wp/v2/posts/42';
const input = { input: { post_id: 42, action: 'rephrase' } };

test('target cannot contain secrets, another path or an ordinary article slug', () => {
  for (const change of [{ site_url: 'http://wordpress.example.test' }, { site_url: target.site_url + '/wp-admin/' },
    { site_url: 'https://user:secret@wordpress.example.test' }, { post_id: 0 },
    { expected_slug: 'ordinary-article' }, { target_marker: 'private source text' }, { password: 'secret' }]) {
    assert.throws(() => targetConfig({ ...target, ...change }));
  }
});

test('preflight blocks model requests, saves, batch writes and external traffic', () => {
  const p = new RequestBoundary(target, 'preflight');
  for (const [url, method, body] of [[ability, 'POST', input], [ability, 'GET'], [save, 'POST', {}],
    [target.site_url + '/wp-json/batch/v1', 'POST', {}], ['https://provider.example.test/v1/chat', 'POST', {}],
    [target.site_url + '/wp-json/npcink/v1/runtime/execute', 'GET']]) assert.equal(p.allow(url, method, body), false);
  assert.equal(p.abilityRequests, 0); assert.equal(p.saveRequests, 0);
});

test('execution admits one exact rephrase and blocks retries or other abilities', () => {
  const p = new RequestBoundary(target, 'execute');
  assert.equal(p.allow(ability, 'POST', input), false);
  p.phase = 'generating';
  assert.equal(p.allow(ability, 'POST', { input: { ...input.input, post_id: 43 } }), false);
  assert.equal(p.allow(ability, 'POST', { input: { ...input.input, action: 'expand' } }), false);
  assert.equal(p.allow(ability.replace('content-resizing', 'title-generation'), 'POST', input), false);
  assert.equal(p.allow(ability, 'POST', input), true);
  assert.equal(p.allow(ability, 'POST', input), false);
  assert.equal(p.abilityRequests, 1);
});

test('save cannot publish, change title, save another post, autosave or save twice', () => {
  const p = new RequestBoundary(target, 'execute');
  p.phase = 'saving'; p.saveContent = 'reviewed'; p.saveTitle = 'unchanged';
  for (const [url, body] of [[save, { content: 'unreviewed' }], [save, { content: 'reviewed', status: 'publish' }],
    [save, { content: 'reviewed', title: 'changed' }], [save + '/autosaves', { content: 'reviewed' }],
    [save.replace('/42', '/43'), { content: 'reviewed' }]]) assert.equal(p.allow(url, 'POST', body), false);
  assert.equal(p.allow(save, 'POST', { content: 'reviewed', status: 'draft', title: 'unchanged' }), true);
  assert.equal(p.allow(save, 'POST', { content: 'reviewed' }), false);
  assert.equal(p.saveRequests, 1);
});

test('plain permalinks use the same ability boundary', () => {
  const url = target.site_url + '/?rest_route=' + encodeURIComponent('/wp-abilities/v1/abilities/ai/content-resizing/run');
  assert.equal(restPath(url), '/wp-abilities/v1/abilities/ai/content-resizing/run');
  const p = new RequestBoundary(target, 'preflight');
  assert.equal(p.allow(url, 'POST', input), false);
});

test('login only allows a same-origin login and cannot post drafts or register users', () => {
  const p = new RequestBoundary(target, 'login');
  assert.equal(p.allow(target.site_url + '/wp-login.php', 'POST'), true);
  assert.equal(p.allow(target.site_url + '/wp-login.php?action=register', 'POST'), false);
  assert.equal(p.allow(save, 'POST', {}), false);
});

test('draft admission rejects wrong identity, published or dirty content and missing markers', () => {
  const blocks = [0, 1, 2].map(() => ({ name: 'core/paragraph', attributes: { content: 'fixture' } }));
  const valid = { id: 42, status: 'draft', slug: target.expected_slug, dirty: false,
    targetId: 'block-1', editorBlocks: blocks, persistedBlocks: blocks };
  assert.doesNotThrow(() => validateDraft(valid, target));
  for (const change of [{ id: 43 }, { status: 'publish' }, { dirty: true }, { targetId: null },
    { slug: 'ordinary' }, { editorBlocks: blocks.slice(1) }, { persistedBlocks: [] }]) {
    assert.throws(() => validateDraft({ ...valid, ...change }, target));
  }
});

test('private session cannot be tracked or placed in a new unignored Git directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'npcink-session-test-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    assert.throws(() => privateSessionPath(join(dir, 'new', 'session.json'), true));
    writeFileSync(join(dir, '.gitignore'), '.private/\n');
    mkdirSync(join(dir, '.private'));
    const path = join(dir, '.private', 'session.json');
    assert.equal(privateSessionPath(path, true), path);
    writeFileSync(path, JSON.stringify({ cookies: [], origins: [] }), { mode: 0o600 });
    assert.deepEqual(readSession(path, target), { cookies: [], origins: [] });
    writeFileSync(path, JSON.stringify({ cookies: [{ domain: 'cloud.example.test' }], origins: [] }));
    assert.throws(() => readSession(path, target));
    execFileSync('git', ['-C', dir, 'add', '-f', '.private/session.json']);
    assert.throws(() => privateSessionPath(path));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing execution authorizations fail before browser loading or session reads', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'npcink-plan-test-'));
  try {
    const path = join(dir, 'target.json'); writeFileSync(path, JSON.stringify(target));
    await assert.rejects(main(['--target', path, '--execute', '--allow-origin', target.site_url]),
      /separate real-workflow/);
    await assert.rejects(main(['--target', path, '--execute', '--allow-real-workflow', '--allow-draft-write']),
      /allow-origin/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Opt-in local DOM fixture; every admitted request is fulfilled in-process.
// No WordPress, Cloud, Provider, SSH, M4 or production connection is made.
if (process.env.NPCINK_EDITOR_TEST_PLAYWRIGHT_ROOT) {
  test('browser substitute proves the loop and stops on wrong drafts, missing controls, save failure or retry', async () => {
    const { chromium, env } = await loadBrowser(process.env.NPCINK_EDITOR_TEST_PLAYWRIGHT_ROOT);
    const browser = await chromium.launch({ env });
    try {
      for (const scenario of ['preflight', 'execute', 'wrong-draft', 'no-ai-control', 'save-failure', 'repeat']) {
        let abilities = 0, writes = 0;
        const blocks = [
          { name: 'core/paragraph', attributes: { content: 'Sentinel before' }, innerBlocks: [] },
          { name: 'core/paragraph', attributes: { content: 'NPCINK_ACCEPTANCE_TARGET original paragraph.' }, innerBlocks: [] },
          { name: 'core/paragraph', attributes: { content: 'Sentinel after' }, innerBlocks: [] },
        ];
        let post = { id: 42, slug: scenario === 'wrong-draft' ? 'ordinary' : target.expected_slug,
          status: 'draft', title: { raw: 'Fixture' }, content: { raw: JSON.stringify(blocks) }, modified_gmt: 'fixture-before' };
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const transport = async (route) => {
          const path = restPath(route.request().url());
          if (path === '/wp-admin/post.php') {
            let html = readFileSync(new URL('../fixtures/business-editor.html', import.meta.url), 'utf8');
            if (scenario === 'no-ai-control') html = html.replace('class="ai-content-resizing-toolbar__icon"', 'class="fixture-absent"');
            return route.fulfill({ contentType: 'text/html', body: html });
          }
          if (path === '/wp-abilities/v1/abilities/ai/content-resizing/run') {
            abilities += 1; return route.fulfill({ json: { output: 'One clear rewritten paragraph.', retry: scenario === 'repeat' } });
          }
          assert.equal(path, '/wp/v2/posts/42', 'Unexpected fixture request');
          if (route.request().method() === 'POST') {
            writes += 1; const body = route.request().postDataJSON();
            if (scenario === 'save-failure') return route.fulfill({ status: 503, json: { code: 'fixture_failure' } });
            post = { ...post, content: { raw: body.content }, modified_gmt: 'fixture-after' };
          }
          return route.fulfill({ json: post });
        };
        try {
          if (scenario === 'wrong-draft') {
            await assert.rejects(editorFlow(context, target, 'execute', { transport }), /dedicated draft/);
          } else if (scenario === 'no-ai-control') {
            await assert.rejects(editorFlow(context, target, 'preflight', { transport, timeoutMs: 1200 }), /unavailable/);
          } else if (['save-failure', 'repeat'].includes(scenario)) {
            await assert.rejects(editorFlow(context, target, 'execute', { transport, timeoutMs: 1200 }));
          } else {
            const result = await editorFlow(context, target, scenario, { transport });
            assert.equal(result.complete, true); assert.equal(result.production_accepted, false);
            assert.equal(result.evidence_kind, 'browser_dom_stub');
            assert.equal(result.real_provider_workflow, 'not_run');
            assert.equal(result.ability_requests, abilities); assert.equal(result.draft_save_requests, writes);
          }
          assert.equal(abilities, ['execute', 'save-failure', 'repeat'].includes(scenario) ? 1 : 0);
          assert.equal(writes, ['execute', 'save-failure'].includes(scenario) ? 1 : 0);
          assert.equal(post.status, 'draft');
          assert.equal(JSON.parse(post.content.raw)[0].attributes.content, 'Sentinel before');
          assert.equal(JSON.parse(post.content.raw)[2].attributes.content, 'Sentinel after');
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  });
}
