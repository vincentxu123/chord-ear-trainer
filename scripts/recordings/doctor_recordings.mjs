#!/usr/bin/env node

import { existsSync } from 'node:fs';
import path from 'node:path';
import { capture, venvPython } from './node_helpers.mjs';

let failed = false;

function result(label, ok, detail) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
}

for (const executable of ['ffmpeg', 'ffprobe']) {
  const check = capture(executable, ['-version']);
  result(executable, check.status === 0, check.status === 0 ? 'available' : 'install FFmpeg');
}

const python = venvPython();
result('.venv-recordings', existsSync(python), python);

if (existsSync(python)) {
  const diagnostics = capture(python, [
    '-c',
    [
      'import importlib.util, json, sys',
      'import torch',
      'modules = ["torch", "torchaudio", "demucs", "beat_this", "lv_chordia", "librosa", "yt_dlp", "transformers", "huggingface_hub", "madmom"]',
      'missing = [name for name in modules if importlib.util.find_spec(name) is None]',
      'device = "cuda" if torch.cuda.is_available() else "cpu"',
      'if device == "cpu" and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():',
      '    try:',
      '        torch.ones(1, device="mps")',
      '    except RuntimeError:',
      '        pass',
      '    else:',
      '        device = "mps"',
      'print(json.dumps({"python": sys.version.split()[0], "torch": torch.__version__, "device": device, "missing": missing}))',
    ].join('\n'),
  ]);
  if (diagnostics.status === 0) {
    const info = JSON.parse(diagnostics.stdout.trim());
    result('Python', true, info.python);
    result('PyTorch', true, `${info.torch}; recommended device: ${info.device}`);
    result('recording packages', info.missing.length === 0, info.missing.length ? `missing ${info.missing.join(', ')}` : 'all imports available');
  } else {
    result('recording packages', false, diagnostics.stderr.trim() || 'import check failed');
  }
}

console.log('\nModel weights download lazily on the first song run and use user-level caches.');
console.log('Activate manually only when needed:');
console.log(process.platform === 'win32'
  ? '  .venv-recordings\\Scripts\\activate'
  : '  source .venv-recordings/bin/activate');

process.exit(failed ? 1 : 0);
