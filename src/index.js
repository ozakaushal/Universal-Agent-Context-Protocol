'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { execFileSync } = require('node:child_process');

const EXCLUDED_DIRECTORIES = new Set(['.git', '.agent', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache', '.venv', 'venv', 'vendor', 'target', '.terraform', '.svelte-kit', 'out']);
const TEXT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.css', '.scss', '.html', '.vue', '.svelte', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.rb', '.php', '.sh', '.yml', '.yaml', '.toml', '.sql']);

// Last-resort denylist for secrets that `.gitignore` does not already cover. Excluding a
// file only costs the agent some context; indexing one leaks its path and content hash.
const SENSITIVE_NAME_PATTERNS = [
  /^\.env($|\.)/i,
  /^\.(npmrc|netrc|pgpass)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|p12|pfx|jks|keystore|asc)$/i,
  /(secrets?|credentials?)[^/]*\.(json|ya?ml|toml)$/i,
  /^local\.settings\.json$/i,
  /^appsettings\.[^.]+\.json$/i
];

function exists(file) { return fs.existsSync(file); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function slash(value) { return value.split(path.sep).join('/'); }

function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}

function currentCommit(root) { return git(root, ['rev-parse', 'HEAD']) || 'uncommitted'; }

function isSensitive(relative) {
  const name = relative.split('/').pop();
  return SENSITIVE_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

// Asks git which candidates are ignored. `check-ignore` exits 1 when nothing matches, which
// execFileSync reports as a throw, so the empty result is recovered from the error object.
function ignoredFiles(root, files) {
  if (!files.length) return new Set();
  let output = '';
  try {
    output = execFileSync('git', ['check-ignore', '--stdin', '-z'], { cwd: root, encoding: 'utf8', input: files.join('\0'), stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (error) {
    if (error.status !== 1) return null;
    output = typeof error.stdout === 'string' ? error.stdout : '';
  }
  return new Set(output.split('\0').filter(Boolean).map(slash));
}

function allFiles(root) {
  const found = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) visit(path.join(directory, entry.name));
      } else if (entry.isFile()) {
        const full = path.join(directory, entry.name);
        if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(slash(path.relative(root, full)));
      }
    }
  }
  visit(root);
  const candidates = found.filter((file) => !isSensitive(file)).sort();
  const ignored = ignoredFiles(root, candidates);
  if (!ignored) return candidates;
  return candidates.filter((file) => !ignored.has(file));
}

function featureName(file) {
  const parts = file.split('/');
  const sourceIndex = parts.findIndex((part) => ['src', 'app', 'lib', 'packages', 'server', 'client'].includes(part));
  const first = sourceIndex >= 0 ? parts[sourceIndex + 1] : parts[0];
  const raw = first || 'root';
  return raw.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'root';
}

function detectStack(root) {
  const stack = [];
  const packageFile = path.join(root, 'package.json');
  if (exists(packageFile)) {
    const pkg = readJson(packageFile);
    stack.push('Node.js');
    const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (dependencies.react) stack.push('React');
    if (dependencies.next) stack.push('Next.js');
    if (dependencies.typescript || exists(path.join(root, 'tsconfig.json'))) stack.push('TypeScript');
  }
  if (exists(path.join(root, 'pyproject.toml')) || exists(path.join(root, 'requirements.txt'))) stack.push('Python');
  if (exists(path.join(root, 'go.mod'))) stack.push('Go');
  if (exists(path.join(root, 'Cargo.toml'))) stack.push('Rust');
  if (exists(path.join(root, 'pom.xml')) || exists(path.join(root, 'build.gradle'))) stack.push('Java');
  return stack.length ? stack : ['unknown'];
}

function commaList(value, fallback) {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : fallback;
}

async function askForConfiguration(root, io = { input: process.stdin, output: process.stdout }) {
  const detectedStack = detectStack(root);
  const defaults = {
    project: path.basename(root),
    stack: detectedStack,
    styling: 'Follow existing project conventions.',
    commits: 'conventional commits'
  };
  const rl = readline.createInterface(io);
  const question = async (label, fallback) => {
    const answer = await rl.question(`${label} [${fallback}]: `);
    return answer.trim() || fallback;
  };

  try {
    io.output.write('\n=== UACP project setup ===\n\n');
    io.output.write(`Detected stack: ${detectedStack.join(', ')}\n`);
    io.output.write('Press Enter to accept a suggested value.\n\n');
    const project = await question('Project name', defaults.project);
    const stackAnswer = await question('Tech stack (comma-separated)', defaults.stack.join(', '));
    const styling = await question('Styling convention', defaults.styling);
    const commits = await question('Commit convention', defaults.commits);
    const configuration = { project, stack: commaList(stackAnswer, defaults.stack), styling, commits };

    io.output.write('\n--- Configuration summary ---\n');
    io.output.write(`Project: ${configuration.project}\n`);
    io.output.write(`Tech stack: ${configuration.stack.join(', ')}\n`);
    io.output.write(`Styling: ${configuration.styling}\n`);
    io.output.write(`Commits: ${configuration.commits}\n`);
    io.output.write('Files to create: .agent/, AGENTS.md, CLAUDE.md\n');
    io.output.write('Git hook: appends a UACP block to .git/hooks/post-commit (existing content is kept)\n');
    io.output.write('Indexing: skips git-ignored files and common secret filenames; records path + SHA-256 only\n\n');
    const confirmation = (await rl.question('Generate UACP files? [Y/n]: ')).trim().toLowerCase();
    if (confirmation && confirmation !== 'y' && confirmation !== 'yes') {
      io.output.write('Setup cancelled. No files were created.\n');
      return null;
    }
    return configuration;
  } finally {
    rl.close();
  }
}

function featureDocument(name, files, commit) {
  return {
    feature: name,
    files,
    conventions: ['Keep changes scoped to this feature.', 'Run deterministic verification before marking done.'],
    status: 'not_started',
    last_verified_commit: commit,
    handoff: { goal: '', done: [], todo: [], current_diff_summary: '', next_command: '' }
  };
}

function generateAgentsMarkdown() {
  return `# Agent Context Protocol\n\nFollow these steps before and during every task:\n\n1. Read \`.agent/manifest.json\`.\n2. Run \`git status -s\`. If it shows files absent from \`.agent/index.json\`, run \`npx agent-context-protocol update\`. If \`last_synced_commit\` differs from \`git rev-parse HEAD\`, also run \`npx agent-context-protocol update\`.\n3. Look up task-relevant paths in \`.agent/index.json\` to find feature files.\n4. Load only the matched \`.agent/features/<name>.json\` files; do not load unrelated feature files.\n5. Run \`.agent/verify.sh <feature>\` before editing.\n6. After edits, rerun verification. Do not set \`status\` to \`done\` unless it passes.\n7. Update the matched feature file's \`handoff\` block before ending the session.\n`;
}

function generateVerifier() {
  return `#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const featuresDir = path.join(__dirname, 'features');
const feature = process.argv[2];

// Keeps a caller-supplied name from escaping the directory it is meant to address.
function contained(directory, candidate) {
  const resolved = path.resolve(directory, candidate);
  const base = path.resolve(directory) + path.sep;
  return resolved.startsWith(base) ? resolved : null;
}

if (!feature) { console.error('Usage: .agent/verify.sh <feature>'); process.exit(1); }

const file = contained(featuresDir, feature.endsWith('.json') ? feature : feature + '.json');
if (!file) { console.error('Invalid feature name: ' + feature); process.exit(1); }
if (!fs.existsSync(file)) { console.error('Unknown feature: ' + feature); process.exit(1); }

let data;
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch { console.error('Feature file is not valid JSON: ' + feature); process.exit(1); }
if (!data || typeof data.feature !== 'string' || !Array.isArray(data.files)) {
  console.error('Feature file is malformed: ' + feature);
  process.exit(1);
}

let failed = false;
for (const item of data.files) {
  const tracked = typeof item === 'string' ? contained(root, item) : null;
  if (!tracked) { console.error('Invalid tracked path: ' + item); failed = true; continue; }
  if (!fs.existsSync(tracked)) { console.error('Missing tracked file: ' + item); failed = true; }
}

const pkg = path.join(root, 'package.json');
if (fs.existsSync(pkg)) {
  let scripts = {};
  try { scripts = JSON.parse(fs.readFileSync(pkg, 'utf8')).scripts || {}; } catch { scripts = {}; }
  const windows = process.platform === 'win32';
  for (const name of ['lint', 'test']) {
    if (!scripts[name]) continue;
    try {
      // Windows needs a shell to launch npm.cmd at all, and a shell rules out an args
      // array (DEP0190 — arguments would be concatenated unescaped). The script name is
      // a literal from the loop above, never caller input, so the join stays safe.
      if (windows) execFileSync('npm.cmd run ' + name, { cwd: root, stdio: 'inherit', shell: true });
      else execFileSync('npm', ['run', name], { cwd: root, stdio: 'inherit' });
    } catch { failed = true; }
  }
}

if (failed) process.exit(1);
console.log('PASS ' + data.feature);
`;
}

function generateHook() {
  return `#!/bin/sh\n# UACP managed hook. Keep this block when adding local post-commit actions.\nif command -v npx >/dev/null 2>&1; then\n  npx --no-install uacp update >/dev/null 2>&1 || true\nfi\n`;
}

function sync(root, { fresh }) {
  const agent = path.join(root, '.agent');
  const featuresDir = path.join(agent, 'features');
  fs.mkdirSync(featuresDir, { recursive: true });
  const commit = currentCommit(root);
  const previous = !fresh && exists(path.join(agent, 'index.json')) ? readJson(path.join(agent, 'index.json')) : { files: {} };
  const files = allFiles(root);
  const grouped = new Map();
  const index = { last_synced_commit: commit, files: {} };
  for (const relative of files) {
    const name = featureName(relative);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(relative);
    index.files[relative] = { feature: `features/${name}.json`, hash: sha256(path.join(root, relative)) };
  }
  for (const [name, featureFiles] of grouped) {
    const target = path.join(featuresDir, `${name}.json`);
    const old = exists(target) ? readJson(target) : null;
    const document = old ? { ...old, files: featureFiles } : featureDocument(name, featureFiles, commit);
    writeJson(target, document);
  }
  for (const name of fs.readdirSync(featuresDir)) {
    if (name.endsWith('.json') && !grouped.has(name.slice(0, -5))) fs.unlinkSync(path.join(featuresDir, name));
  }
  writeJson(path.join(agent, 'index.json'), index);
  return { files: files.length, features: grouped.size, previous };
}

function installHook(root) {
  const gitDir = git(root, ['rev-parse', '--git-dir']);
  if (!gitDir) return false;
  const source = path.join(root, '.agent', 'hooks', 'post-commit');
  if (!exists(source)) return false;
  const target = path.resolve(root, gitDir, 'hooks', 'post-commit');
  const marker = '# UACP managed hook.';
  const managed = fs.readFileSync(source, 'utf8');
  const existing = exists(target) ? fs.readFileSync(target, 'utf8') : '';
  if (!existing.includes(marker)) {
    // The managed block carries its own shebang so it can stand alone in a fresh hook
    // file; when appending to a hook that already has one, drop the duplicate.
    const appended = `${existing.trimEnd()}\n\n${managed.replace(/^#![^\n]*\n/, '')}`;
    fs.writeFileSync(target, existing.trim() ? appended : managed);
  }
  try { fs.chmodSync(target, 0o755); } catch { /* Windows does not need chmod. */ }
  return true;
}

function ensureSymlink(root) {
  const target = path.join(root, 'CLAUDE.md');
  if (exists(target)) return;
  try { fs.symlinkSync('AGENTS.md', target, 'file'); }
  catch { fs.writeFileSync(target, '# See AGENTS.md\n'); }
}

async function init(root, options = {}) {
  const agent = path.join(root, '.agent');
  if (exists(agent)) throw new Error('.agent/ already exists; run `uacp update` instead.');
  const configuration = await askForConfiguration(root, options.io);
  if (!configuration) return false;
  fs.mkdirSync(path.join(agent, 'hooks'), { recursive: true });
  writeJson(path.join(agent, 'manifest.json'), { project: configuration.project, stack: configuration.stack, global_conventions: { styling: configuration.styling, commits: configuration.commits }, features_dir: '.agent/features/', index: '.agent/index.json' });
  fs.writeFileSync(path.join(agent, 'verify.sh'), generateVerifier());
  try { fs.chmodSync(path.join(agent, 'verify.sh'), 0o755); } catch { /* Windows */ }
  fs.writeFileSync(path.join(agent, 'hooks', 'post-commit'), generateHook());
  fs.writeFileSync(path.join(root, 'AGENTS.md'), generateAgentsMarkdown());
  ensureSymlink(root);
  const result = sync(root, { fresh: true });
  installHook(root);
  console.log(`Initialized UACP: ${result.files} files across ${result.features} features.`);
  return true;
}

function update(root) {
  const agent = path.join(root, '.agent');
  if (!exists(agent)) throw new Error('.agent/ does not exist; run `uacp init` first.');
  const result = sync(root, { fresh: false });
  installHook(root);
  console.log(`Updated UACP: ${result.files} files across ${result.features} features.`);
}

module.exports = { allFiles, askForConfiguration, commaList, detectStack, featureName, init, isSensitive, sync, update };
