#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { RECORDINGS_DIR, run, venvPython } from './node_helpers.mjs';

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error('Usage: node run_python.mjs SCRIPT.py [ARGS...]');
  process.exit(2);
}

const python = venvPython();
if (!existsSync(python)) {
  console.error('Recording environment is missing. Run: npm run songs:setup');
  process.exit(1);
}
run(python, [path.join(RECORDINGS_DIR, script), ...args]);
