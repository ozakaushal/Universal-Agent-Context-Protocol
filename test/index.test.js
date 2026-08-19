'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { commaList, featureName, isSensitive } = require('../src/index');

test('groups source files by their first source directory', () => {
  assert.equal(featureName('src/auth/login.ts'), 'auth');
  assert.equal(featureName('README.md'), 'readme');
});

test('uses a fallback stack when a comma-separated answer is empty', () => {
  assert.deepEqual(commaList('  ,  ', ['Node.js']), ['Node.js']);
  assert.deepEqual(commaList('Node.js, TypeScript', ['unknown']), ['Node.js', 'TypeScript']);
});

test('keeps secret-bearing filenames out of the index', () => {
  for (const file of ['.env', '.env.local', '.npmrc', 'config/secrets.json', 'app/credentials.yaml', 'src/local.settings.json', 'appsettings.Production.json', 'certs/server.pem', 'id_rsa']) {
    assert.equal(isSensitive(file), true, `expected ${file} to be excluded`);
  }
});

test('keeps ordinary source files in the index', () => {
  for (const file of ['src/secretsManager.ts', 'src/index.js', 'appsettings.json', 'docs/keys.md', 'package.json']) {
    assert.equal(isSensitive(file), false, `expected ${file} to be indexed`);
  }
});
