import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RECORDINGS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(RECORDINGS_DIR, '../..');
export const VENV_ROOT = path.join(REPO_ROOT, '.venv-recordings');

export function venvPython() {
  const candidates = process.platform === 'win32'
    ? [path.join(VENV_ROOT, 'Scripts', 'python.exe')]
    : [path.join(VENV_ROOT, 'bin', 'python3'), path.join(VENV_ROOT, 'bin', 'python')];
  return candidates.find(existsSync) ?? candidates[0];
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function capture(command, args) {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}
