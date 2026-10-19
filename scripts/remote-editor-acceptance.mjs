#!/usr/bin/env node
// Operator-run, single-draft UI acceptance. No Cloud/WP installation or config writes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = 'npcink-single-draft-acceptance';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();

export function targetConfig(raw) {
  assert.deepEqual(Object.keys(raw).sort(), ['expected_slug', 'post_id', 'site_url', 'target_marker']);
  const url = new URL(raw.site_url);
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
    && url.pathname === '/', 'HTTPS origin only; no credentials or application path');
  assert(Number.isSafeInteger(raw.post_id) && raw.post_id > 0, 'Exact positive draft ID required');
  assert(/^npcink-acceptance-[a-z0-9-]+$/.test(raw.expected_slug), 'Dedicated acceptance slug required');
  assert(/^NPCINK_ACCEPTANCE_[A-Z0-9_]+$/.test(raw.target_marker), 'Dedicated paragraph marker required');
  return { ...raw, site_url: url.origin };
}

export function restPath(url) {
  const u = new URL(url);
  const path = u.searchParams.get('rest_route') || u.pathname.replace(/^\/wp-json(?=\/)/, '');
  return decodeURIComponent(path);
}

export class RequestBoundary {
  constructor(target, mode) {
    this.target = target;
    this.mode = mode;
    this.phase = 'reading';
    this.abilityRequests = 0;
    this.saveRequests = 0;
    this.blocked = 0;
    this.violations = 0;
    this.saveContent = null;
    this.saveTitle = null;
  }
  allow(url, method, body = null) {
    const reject = (critical = false) => {
      this.blocked += 1;
      if (critical) this.violations += 1;
      return false;
    };
    const u = new URL(url);
    if (u.origin !== this.target.site_url || !['https:'].includes(u.protocol)) return reject(true);
    const path = restPath(url);
    const ability = /\/wp-abilities\/v1\/abilities\/.*\/run$/.test(path);
    if (ability) {
      if (this.mode !== 'execute' || this.phase !== 'generating' || method !== 'POST'
        || path !== '/wp-abilities/v1/abilities/ai/content-resizing/run'
        || this.abilityRequests !== 0 || body?.input?.action !== 'rephrase'
        || Number(body?.input?.post_id) !== this.target.post_id) return reject(true);
      this.abilityRequests += 1;
      return true;
    }
    if (['GET', 'HEAD'].includes(method)) {
      // Do not allow generative GET shortcuts or unrelated REST/plugin RPCs.
      if (/\/(?:run|execute|generate|test|verify)(?:\/|$)/i.test(path)) return reject(true);
      if (u.pathname.startsWith('/wp-json/') || u.searchParams.has('rest_route')) {
        return /^\/(?:wp\/v2|wp-block-editor\/v1|wp-abilities\/v1)(?:\/|$)/.test(path)
          || reject();
      }
      return true;
    }
    if (this.mode === 'login' && u.pathname === '/wp-login.php' && method === 'POST'
      && (!u.searchParams.has('action') || u.searchParams.get('action') === 'login')) return true;
    if (this.mode === 'execute' && this.phase === 'saving' && method === 'POST'
      && path === `/wp/v2/posts/${this.target.post_id}` && this.saveRequests === 0
      && body?.content === this.saveContent && (body.status === undefined || body.status === 'draft')
      && (body.title === undefined || body.title === this.saveTitle)
      && (body.slug === undefined || body.slug === this.target.expected_slug)) {
      this.saveRequests += 1;
      return true;
    }
    return reject(/^\/wp\/v2\/posts(?:\/|$)/.test(path));
  }
}

export function privateSessionPath(path, writing = false) {
  assert(isAbsolute(path), 'Session path must be absolute');
  const destination = resolve(path);
  let parent = dirname(destination);
  while (!existsSync(parent) && dirname(parent) !== parent) parent = dirname(parent);
  const gitDestination = resolve(realpathSync(parent), relative(parent, destination));
  let repo;
  try {
    repo = execFileSync('git', ['-C', parent, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* External protected directories are supported. */ }
  if (repo) {
    execFileSync('git', ['-C', repo, 'check-ignore', '--quiet', '--', relative(repo, gitDestination)],
      { stdio: 'ignore' });
    try {
      execFileSync('git', ['-C', repo, 'ls-files', '--error-unmatch', '--', relative(repo, gitDestination)],
        { stdio: 'ignore' });
      assert.fail('Session file must never be tracked');
    } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
  }
  if (writing) assert(!existsSync(destination), 'Login refuses to overwrite an existing session');
  else {
    const stat = lstatSync(destination);
    assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,
      'Session must be a private regular file (chmod 600)');
  }
  return destination;
}

export function readSession(path, target) {
  const state = JSON.parse(readFileSync(privateSessionPath(path), 'utf8'));
  assert(Array.isArray(state.cookies) && Array.isArray(state.origins), 'Invalid browser session');
  const host = new URL(target.site_url).hostname;
  assert(state.cookies.every((cookie) => String(cookie.domain).replace(/^\./, '') === host)
    && state.origins.every((origin) => origin.origin === target.site_url),
  'Session must contain only the selected WordPress origin');
  return state;
}

export async function loadBrowser(root = join(ROOT, 'frontend')) {
  const require = createRequire(import.meta.url);
  const modulePath = require.resolve('@playwright/test', { paths: [resolve(root)] });
  const api = await import(pathToFileURL(modulePath).href);
  const chromium = api.chromium || api.default.chromium;
  assert(existsSync(chromium.executablePath()), 'Installed Chromium required; no automatic download');
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'SYSTEMROOT']
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  return { chromium, env };
}

async function visible(locators, timeoutMs = 10000) {
  for (let attempt = 0; attempt < Math.ceil(timeoutMs / 100); attempt += 1) {
    for (const locator of locators) if (await locator.first().isVisible().catch(() => false)) return locator.first();
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error('required_editor_control_unavailable');
}

async function snapshot(page, target) {
  return page.evaluate(async ({ post_id, target_marker }) => {
    const wp = window.wp;
    const editor = wp.data.select('core/editor');
    const blockEditor = wp.data.select('core/block-editor');
    const persisted = await wp.apiFetch({ path: `/wp/v2/posts/${post_id}?context=edit`, method: 'GET' });
    const clean = (block) => ({ name: block.name, attributes: block.attributes,
      innerBlocks: (block.innerBlocks || []).map(clean) });
    const current = blockEditor.getBlocks();
    const candidates = current.filter((block) => block.name === 'core/paragraph'
      && String(block.attributes?.content).includes(target_marker));
    return { id: editor.getCurrentPostId(), status: persisted.status, slug: persisted.slug,
      title: persisted.title.raw, content: persisted.content.raw, modified: persisted.modified_gmt,
      persistedBlocks: wp.blocks.parse(persisted.content.raw).map(clean),
      editorBlocks: current.map(clean), dirty: editor.isEditedPostDirty(),
      targetId: candidates.length === 1 ? candidates[0].clientId : null };
  }, target);
}

export function validateDraft(before, target) {
  assert(before.id === target.post_id && before.status === 'draft'
    && before.slug === target.expected_slug && !before.dirty, 'Exact clean dedicated draft required');
  assert(before.targetId && before.editorBlocks.length >= 3
    && before.editorBlocks.every((block) => block.name === 'core/paragraph'),
  'One marked target and at least two sentinel paragraphs required');
  assert.deepEqual(before.editorBlocks, before.persistedBlocks, 'Editor differs from the persisted draft');
}

const stored = (s) => ({ title: s.title, content: s.content, status: s.status, modified: s.modified });

export async function editorFlow(context, target, mode, { transport, screenshotDir, timeoutMs = 90000 } = {}) {
  const boundary = new RequestBoundary(target, mode);
  const evidence = { mode, complete: false, production_accepted: false, post_id: target.post_id,
    site_origin: target.site_url, evidence_kind: transport ? 'browser_dom_stub' : 'remote_wordpress_ui',
    stage: 'open_editor',
    ability_requests: 0, draft_save_requests: 0, billing_status: 'not_verified' };
  await context.route('**/*', async (route) => {
    const request = route.request();
    let body;
    try { body = request.postDataJSON(); } catch { body = null; }
    if (!boundary.allow(request.url(), request.method(), body)) return route.abort('blockedbyclient');
    return transport ? transport(route) : route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  const page = await context.newPage();
  page.setDefaultTimeout(Math.min(timeoutMs, 15000));
  const control = (locators) => visible(locators, Math.min(timeoutMs, 10000));
  try {
    await page.goto(`${target.site_url}/wp-admin/post.php?post=${target.post_id}&action=edit`);
    assert(new URL(page.url()).origin === target.site_url, 'Unexpected editor redirect');
    await page.waitForFunction(() => window.wp?.data?.select('core/editor')?.getCurrentPostId());
    await page.evaluate((key) => window.wp.data.dispatch('core/editor').lockPostAutosaving(key), LOCK);
    const before = await snapshot(page, target);
    evidence.stage = 'validate_draft';
    validateDraft(before, target);
    evidence.before_sha256 = hash(stored(before));
    if (mode === 'preflight') {
      assert(boundary.abilityRequests === 0 && boundary.saveRequests === 0 && boundary.violations === 0,
        'Unexpected request attempt during read-only preflight');
      evidence.complete = true;
      evidence.real_provider_workflow = 'not_run';
      return evidence;
    }
    await page.evaluate((id) => window.wp.data.dispatch('core/block-editor').selectBlock(id), before.targetId);
    evidence.stage = 'rephrase';
    const frame = page.frameLocator('iframe[name="editor-canvas"], iframe.wp-block-editor-iframe__iframe').first();
    await (await control([page.locator(`[data-block="${before.targetId}"]`),
      frame.locator(`[data-block="${before.targetId}"]`)])).click();
    await (await control([page.locator('button:has(.ai-content-resizing-toolbar__icon)'),
      frame.locator('button:has(.ai-content-resizing-toolbar__icon)')])).click();
    const labels = await page.evaluate(() => ({ rephrase: window.wp.i18n.__('Rephrase', 'ai'),
      accept: window.wp.i18n.__('Accept', 'ai') }));
    const rephrase = await control([page.getByRole('menuitem', { name: labels.rephrase, exact: true }),
      frame.getByRole('menuitem', { name: labels.rephrase, exact: true })]);
    boundary.phase = 'generating';
    await rephrase.click();
    const modal = await control([page.locator('.ai-content-resizing-modal'), frame.locator('.ai-content-resizing-modal')]);
    evidence.stage = 'review';
    const panels = modal.locator('.ai-content-resizing-modal__panel');
    assert(await panels.count() === 2, 'Expected Original/Suggested review panels');
    const suggested = panels.nth(1).locator('.ai-content-resizing-modal__text:not(.ai-content-resizing-modal__loading)');
    await suggested.waitFor({ state: 'visible', timeout: timeoutMs });
    const suggestion = text(await suggested.innerText());
    const original = text(await panels.first().locator('.ai-content-resizing-modal__text--original').innerText());
    assert(suggestion && suggestion !== original, 'Empty or unchanged rewrite');
    assert(boundary.abilityRequests === 1 && boundary.violations === 0, 'Unexpected generation attempt');
    assert.deepEqual(stored(await snapshot(page, target)), stored(before), 'Post changed before adoption');
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'review.png') });
    evidence.stage = 'adopt';
    await modal.getByRole('button', { name: labels.accept, exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
    const adopted = await snapshot(page, target);
    assert.deepEqual(stored(adopted), stored(before), 'Post changed before explicit save');
    const targetIndex = before.editorBlocks.findIndex((block) => String(block.attributes.content).includes(target.target_marker));
    assert(adopted.editorBlocks.length === before.editorBlocks.length, 'Block count changed');
    assert(adopted.editorBlocks[targetIndex].attributes.content !== before.editorBlocks[targetIndex].attributes.content,
      'Adoption did not replace the selected paragraph');
    const adoptedText = await page.evaluate((index) => {
      const element = document.createElement('div');
      element.innerHTML = window.wp.data.select('core/block-editor').getBlocks()[index].attributes.content;
      return element.textContent;
    }, targetIndex);
    assert(text(adoptedText) === suggestion, 'Adoption differs from the reviewed suggestion');
    for (let i = 0; i < before.editorBlocks.length; i += 1) {
      if (i !== targetIndex) assert.deepEqual(adopted.editorBlocks[i], before.editorBlocks[i], 'Neighbor changed');
    }
    boundary.saveContent = await page.evaluate(() => window.wp.data.select('core/editor').getEditedPostContent());
    boundary.saveTitle = before.title;
    boundary.phase = 'saving';
    evidence.stage = 'save';
    assert(boundary.violations === 0, 'Unexpected write attempt before saving');
    await (await control([page.locator('.editor-post-save-draft'),
      page.getByRole('button', { name: /^(Save draft|Save|保存草稿|保存)$/i })])).click();
    await page.waitForFunction(() => {
      const editor = window.wp.data.select('core/editor');
      return !editor.isSavingPost() && !editor.isEditedPostDirty() && !editor.didPostSaveRequestFail();
    }, null, { timeout: Math.min(timeoutMs, 45000) });
    boundary.phase = 'reading';
    const saved = await snapshot(page, target);
    assert(saved.status === 'draft' && saved.slug === target.expected_slug && saved.title === before.title
      && saved.content === boundary.saveContent, 'Saved draft does not match adoption');
    assert.deepEqual(saved.persistedBlocks, adopted.editorBlocks, 'Persisted blocks differ from adoption');
    evidence.stage = 'reload';
    await page.reload();
    await page.waitForFunction(() => window.wp?.data?.select('core/editor')?.getCurrentPostId());
    const reopened = await snapshot(page, target);
    assert.deepEqual(stored(reopened), stored(saved), 'Reload lost the saved content');
    assert(!reopened.dirty && reopened.status === 'draft', 'Reload state is not a clean draft');
    assert(boundary.abilityRequests === 1 && boundary.saveRequests === 1 && boundary.violations === 0,
      'Unexpected request attempt; no retry allowed');
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'saved.png') });
    evidence.complete = true;
    evidence.stage = 'complete';
    evidence.after_sha256 = hash(stored(saved));
    evidence.real_provider_workflow = transport ? 'not_run' : 'one_wordpress_request_billing_unverified';
    return evidence;
  } catch (error) {
    error.acceptanceEvidence = evidence;
    throw error;
  } finally {
    evidence.ability_requests = boundary.abilityRequests;
    evidence.draft_save_requests = boundary.saveRequests;
    evidence.blocked_requests = boundary.blocked;
    evidence.boundary_violations = boundary.violations;
    // Closing the isolated context releases the editor; no unlock/autosave/network cleanup write.
    await page.close().catch(() => {});
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { values: v } = parseArgs({ args: argv, options: {
    target: { type: 'string' }, 'allow-origin': { type: 'string' }, session: { type: 'string' },
    'playwright-root': { type: 'string' }, plan: { type: 'boolean' }, login: { type: 'boolean' },
    preflight: { type: 'boolean' }, execute: { type: 'boolean' },
    'allow-real-workflow': { type: 'boolean' }, 'allow-draft-write': { type: 'boolean' },
    screenshots: { type: 'boolean' },
  } });
  const target = targetConfig(JSON.parse(readFileSync(v.target, 'utf8')));
  const modes = ['plan', 'login', 'preflight', 'execute'].filter((key) => v[key]);
  assert(modes.length <= 1, 'Select one mode');
  const mode = modes[0] || 'plan';
  if (mode === 'plan') {
    console.log(JSON.stringify({ mode, target, real_provider_workflow: 'not_run',
      wordpress_write: 'not_run', required: ['exact allow-origin', 'private WordPress browser session',
        'existing dedicated draft', 'explicit workflow and draft-write flags for execute'],
      production_accepted: false }, null, 2));
    return;
  }
  assert(v['allow-origin'] === target.site_url, 'Exact --allow-origin required');
  if (mode === 'execute') assert(v['allow-real-workflow'] && v['allow-draft-write'],
    'Execute requires separate real-workflow and dedicated-draft write authorization');
  const statePath = privateSessionPath(v.session, mode === 'login');
  const state = mode !== 'login' ? readSession(statePath, target) : null;
  const source = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    driver_sha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')) };
  const { chromium, env } = await loadBrowser(v['playwright-root']);
  const browser = await chromium.launch({ headless: mode !== 'login', env });
  let context;
  let output;
  try {
    context = await browser.newContext({ serviceWorkers: 'block',
      ...(state ? { storageState: state } : {}) });
    if (mode === 'login') {
      const policy = new RequestBoundary(target, mode);
      await context.route('**/*', (route) => policy.allow(route.request().url(), route.request().method())
        ? route.continue() : route.abort('blockedbyclient'));
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const page = await context.newPage();
      await page.goto(`${target.site_url}/wp-login.php`);
      console.log('Log in in the protected browser; do not paste credentials into the terminal.');
      await page.waitForURL(`${target.site_url}/wp-admin/**`, { timeout: 300000 });
      const state = await context.storageState();
      mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
      writeFileSync(statePath, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
      console.log('Private WordPress session saved; no draft or Provider request executed.');
      return;
    }
    const parent = join(ROOT, '.tmp/business-editor');
    mkdirSync(parent, { recursive: true, mode: 0o700 });
    output = mkdtempSync(join(parent, 'run-'));
    const result = await editorFlow(context, target, mode, { screenshotDir: v.screenshots ? output : null });
    writeFileSync(join(output, 'receipt.json'), JSON.stringify({ ...result, source }, null, 2));
    console.log(`Editor ${mode} complete; receipt: ${join(output, 'receipt.json')}`);
  } catch (error) {
    if (output) writeFileSync(join(output, 'receipt.json'), JSON.stringify({
      ...error.acceptanceEvidence, complete: false, production_accepted: false,
      source,
      failure: 'editor_acceptance_failed_no_retry',
    }, null, 2));
    throw new Error('Editor acceptance failed; inspect the private receipt. No automatic retry.');
  } finally { await context?.close(); await browser.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Editor acceptance stopped. Check target, session and receipt; no automatic retry.'); process.exitCode = 1; });
}
