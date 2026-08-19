#!/usr/bin/env node
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
