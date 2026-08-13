#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  RECORDINGS_DIR,
  VENV_ROOT,
  capture,
  run,
  venvPython,
} from './node_helpers.mjs';

function pythonCandidates() {
  if (process.env.RECORDINGS_PYTHON) {
    return [[process.env.RECORDINGS_PYTHON, []]];
  }
  return process.platform === 'win32'
    ? [['py', ['-3.13']], ['py', ['-3.12']], ['py', ['-3.11']], ['python', []]]
    : [['python3.13', []], ['python3.12', []], ['python3.11', []], ['python3', []]];
}

function findPython() {
  for (const [command, prefix] of pythonCandidates()) {
    const result = capture(command, [
      ...prefix,
      '-c',
      'import sys; print(".".join(map(str, sys.version_info[:3]))); raise SystemExit(sys.version_info < (3, 11))',
    ]);
    if (result.status === 0) {
      return { command, prefix, version: result.stdout.trim() };
    }
  }
  throw new Error(
    'Python 3.11+ was not found. Install it, or set RECORDINGS_PYTHON to its executable.',
  );
}

try {
  if (!existsSync(venvPython())) {
    const python = findPython();
    console.log(`Creating .venv-recordings with ${python.command} ${python.version}...`);
    run(python.command, [...python.prefix, '-m', 'venv', VENV_ROOT]);
  } else {
    console.log('Reusing .venv-recordings.');
  }

  const python = venvPython();
  run(python, ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(python, ['-m', 'pip', 'install', 'setuptools<81', 'Cython']);
  run(python, [
    '-m',
    'pip',
    'install',
    '-r',
    path.join(RECORDINGS_DIR, 'requirements.txt'),
    '-r',
    path.join(RECORDINGS_DIR, 'requirements-btc.txt'),
  ]);
  run(python, ['-m', 'pip', 'install', '--no-build-isolation', 'madmom==0.16.1']);
  console.log('\nRecording environment installed. Running diagnostics...');
  run(process.execPath, [path.join(RECORDINGS_DIR, 'doctor_recordings.mjs')]);
} catch (error) {
  console.error(`Recording setup failed: ${error.message}`);
  process.exit(1);
}
