import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(frontend, 'package.json'));
const configRequire = createRequire(require.resolve('eslint-config-next'));
const typescriptRequire = createRequire(configRequire.resolve('typescript-eslint'));
const estreeRequire = createRequire(typescriptRequire.resolve('@typescript-eslint/typescript-estree'));
const { Minimatch, minimatch } = estreeRequire('minimatch');

const eslintRequire = createRequire(require.resolve('eslint'));
const legacyMinimatch = eslintRequire('minimatch');
assert.equal(legacyMinimatch('src/page.ts', '**/*.ts'), true,
  'ESLint still requires the callable minimatch 3.x CommonJS API');
assert.ok(legacyMinimatch.makeRe('**/*.ts') instanceof RegExp);

// Resolve through the consumer: a separate top-level safe copy would hide a
// vulnerable parser dependency. Keep the counterexample small even on 10.x.
const amplified = new Minimatch(Array(8).fill('**/../a/b').join('/'), {
  optimizationLevel: 2,
  braceExpandMax: 64,
});
assert.equal(amplified.set.length, 64, 'glob preprocessing must respect its expansion limit');

for (const [file, pattern, expected] of [
  ['src/page.ts', '**/*.ts', true],
  ['src/page.tsx', '**/*.ts', false],
  ['.config/page.ts', '**/*.ts', true],
  ['src/page.tsx', '**/*.{ts,tsx}', true],
  ['src/page.ts', '**/!(*.test).ts', true],
  ['src/page.test.ts', '**/!(*.test).ts', false],
  ['src/中文.ts', '**/*.ts', true],
  ['src/page.ts', 'scripts/*.ts', false],
]) {
  assert.equal(minimatch(file, pattern, { dot: true }), expected, `${file} against ${pattern}`);
}

// Exercise the parser's real allowDefaultProject path, including denial of a
// file outside the allowlist, rather than only testing minimatch in isolation.
const parser = configRequire('@typescript-eslint/parser');
const options = {
  tsconfigRootDir: frontend,
  projectService: { allowDefaultProject: ['minimatch-*.fixture.ts'] },
};
const parsed = parser.parseForESLint('const value: number = 1;', {
  ...options,
  filePath: path.join(frontend, 'minimatch-consumer.fixture.ts'),
});
assert.ok(parsed.services.program, 'an allowlisted file must receive a TypeScript program');
assert.throws(() => parser.parseForESLint('const value = 1;', {
  ...options,
  filePath: path.join(frontend, 'not-allowed.fixture.ts'),
}), /not found by the project service|allowDefaultProject/);
parser.clearCaches();

console.log('minimatch expansion bound and TypeScript parser consumer contract passed');
