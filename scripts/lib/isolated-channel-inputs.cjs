const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const inputPolicy = {
  version: 2,
  trees: ['frontend'],
  rootFiles: 'All repository-root files except the Git worktree link',
  supportFiles: [
    'scripts/run-cloud-isolated-channels.cjs',
    'scripts/lib/isolated-channel-inputs.cjs',
    'scripts/lib/isolated-channel-guard.cjs',
    'scripts/lib/isolated-channel-mock.cjs',
  ],
  excludedTrees: ['node_modules', 'frontend/node_modules', 'frontend/.next',
    'frontend/test-results', 'frontend/playwright-report'],
  excludedFiles: 'frontend/*.tsbuildinfo (generated TypeScript cache)',
  localFiles: 'Include untracked/ignored files in scope; reject symlinks, special files and .env* except .env.example',
  limits: 'Source/config/assets at two endpoints; not installed dependencies, browser/OS bytes, transient edits, or arbitrary imports outside this scope',
};

function captureInputs(root) {
  // Enumerate the filesystem anew on every call. Git ignores are not build ignores.
  const files = new Map();
  function visit(relative) {
    if (inputPolicy.excludedTrees.includes(relative)
      || /^frontend\/[^/]+\.tsbuildinfo$/.test(relative)) return;
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Unsupported input symlink: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(`${relative}/${name}`);
    } else if (stat.isFile()) {
      const name = path.basename(relative);
      if ((name === '.env' || name.startsWith('.env.')) && name !== '.env.example') {
        throw new Error(`Refusing local environment input: ${relative}`);
      }
      files.set(relative, createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'));
    } else throw new Error(`Unsupported input file type: ${relative}`);
  }
  for (const name of fs.readdirSync(root).sort()) {
    if (name === '.git' || name === 'node_modules') continue;
    const stat = fs.lstatSync(path.join(root, name));
    if (!stat.isDirectory()) visit(name);
  }
  for (const directory of inputPolicy.trees) visit(directory);
  for (const file of inputPolicy.supportFiles) visit(file);
  return Object.fromEntries([...files].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

module.exports = { captureInputs, inputPolicy };
