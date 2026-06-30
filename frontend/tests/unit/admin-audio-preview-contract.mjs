import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const routePath = resolve(process.cwd(), 'src/app/api/admin/audio-preview/route.ts');
const workbenchPagePath = resolve(process.cwd(), 'src/app/admin/audio-workbench/page.tsx');
const abilityModelsPagePath = resolve(process.cwd(), 'src/app/admin/ability-models/page.tsx');

const routeSource = readFileSync(routePath, 'utf8');
const workbenchPageSource = readFileSync(workbenchPagePath, 'utf8');
const abilityModelsPageSource = readFileSync(abilityModelsPagePath, 'utf8');

assert.match(
  routeSource,
  /const sessionResult = await requireAdminSessionData\(request\);[\s\S]*?if \(sessionResult instanceof NextResponse\)/,
  'audio preview proxy must validate the admin session before fetching external audio'
);

assert.match(
  routeSource,
  /url\.protocol === 'https:' && ALLOWED_MINIMAX_AUDIO_HOSTS\.has\(url\.hostname\)/,
  'audio preview proxy must allowlist HTTPS MiniMax audio hosts'
);

assert.match(
  routeSource,
  /headers\.Range = range;/,
  'audio preview proxy must forward browser Range requests'
);

assert.match(
  routeSource,
  /headers\.Range = 'bytes=0-0';/,
  'audio preview proxy must avoid upstream HEAD requests against signed MiniMax URLs'
);

assert.match(
  workbenchPageSource,
  /\/api\/admin\/audio-preview\?url=\$\{encodeURIComponent\(audio\.url\)\}/,
  'audio workbench playback must use the same-origin audio preview proxy'
);

assert.match(
  abilityModelsPageSource,
  /\/api\/admin\/audio-preview\?url=\$\{encodeURIComponent\(audio\.url\)\}/,
  'ability-model audio preview playback must use the same-origin audio preview proxy'
);

assert.match(
  abilityModelsPageSource,
  /preview_instance_id: previewInstanceId/,
  'ability-model audio preview must pass the selected route candidate without saving the route'
);

console.log('admin_audio_preview_contract: ok');
