#!/usr/bin/env node
'use strict';

const { init, update } = require('../src/index');

const command = process.argv[2];
const root = process.cwd();

async function main() {
  if (command === 'init') return init(root);
  if (command === 'update') return update(root);
  console.error('Usage: uacp <init|update>');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(`uacp: ${error.message}`);
  process.exitCode = 1;
});
