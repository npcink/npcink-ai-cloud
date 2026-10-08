import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';
const read = p => readFileSync(fromFrontendRoot(p), 'utf8');
const backend = read('../app/domain/advisor/service.py');
const presentation = read('src/features/admin/ai-advisor/advisor-presentation.ts');
const actions = new Set([...backend.matchAll(/_action\("([^"]+)"\)/g)].map(m => m[1]));
for (const code of actions) assert.ok(presentation.includes(`${code}:`), `missing backend action mapping: ${code}`);
const translations = read('src/lib/i18n.ts');
for (const copy of new Set([...presentation.matchAll(/copy: '([^']+)'/g)].map(m => m[1]))) {
  for (const suffix of ['', '_detail']) {
    const key = `admin.ai_advisor.action_${copy}${suffix}`;
    assert.equal(translations.split(`'${key}':`).length - 1, 2, `${key} needs both locales`);
  }
}
for (const key of ['last_24h', 'last_7d']) assert.equal(translations.split(`'admin.ai_resources.provider_health_window_${key}':`).length - 1, 2);
console.log(`advisor_action_contract: ok (${actions.size} backend codes, two locales)`);
