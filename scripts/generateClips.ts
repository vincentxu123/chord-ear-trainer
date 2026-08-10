/**
 * Generate real-music practice clips with MusicGen-Chord on Replicate.
 *
 * After each generation, lv-chordia validates that the audio matches the
 * requested progression (100% root and 100% quality across all bars). Only
 * passing clips are added to public/clips/ + manifest.json; rejects are discarded.
 *
 * Usage:
 *   Put REPLICATE_API_TOKEN=r8_... in .env, then:
 *   npm run clips:generate -- --count 3
 *   npm run clips:generate -- --accept 93
 *   npm run clips:generate -- --count 3 --dry-run
 *   npm run clips:generate -- --style "piano pop ballad, expressive piano"
 *
 * --count N   run N generation attempts (rejects still consume an attempt)
 * --accept N  keep going until N clips pass QC (preferred for library targets)
 *
 * Requires the QC venv (.venv-qc with lv-chordia). See ARCHITECTURE.md.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

// Load .env from the repo root; environment variables already set in the
// shell take precedence. Fine if the file doesn't exist.
try {
  process.loadEnvFile(path.resolve(fileURLToPath(import.meta.url), '../../.env'));
} catch {
  /* no .env file */
}
import { randomClipSpec, type ClipSpec } from '../src/clips/spec';
import { toRoman } from '../src/theory/chords';
import type { ClipManifest, ClipManifestEntry } from '../src/clips/types';

// Pinned version of sakemin/musicgen-chord so results stay reproducible;
// override via env when the model publishes a newer version.
const MODEL_VERSION =
  process.env.MUSICGEN_CHORD_VERSION ??
  'c940ab4308578237484f90f010b2b3871bf64008e95f26f4d567529ad019a3d6';

const API_BASE = 'https://api.replicate.com/v1';
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 20 * 60_000; // cold boots can take several minutes
const MIN_ROOT_MATCH = 1.0;
const MIN_QUALITY_MATCH = 1.0;

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..');
const CLIPS_DIR = path.join(REPO_ROOT, 'public/clips');
const MANIFEST_PATH = path.join(CLIPS_DIR, 'manifest.json');
const QC_SCRIPT = path.join(REPO_ROOT, 'scripts/qcClips.py');

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

interface QcResult {
  pass: boolean;
  root_match: number;
  root_hits: number;
  total_bars: number;
  quality_match: number;
  quality_hits: number;
}

function describe(spec: ClipSpec): string {
  const romans = spec.chords.map((c) => toRoman(c, spec.mode)).join(' ');
  return `${spec.key} ${spec.mode} | ${romans} | ${spec.textChords.split(' ').slice(0, 4).join(' ')} | ${spec.bpm} BPM | ${spec.durationSec}s | ${spec.style}`;
}

async function loadManifest(): Promise<ClipManifest> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as ClipManifest;
  } catch {
    return { clips: [] };
  }
}

async function saveManifest(manifest: ClipManifest): Promise<void> {
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function maxClipNumber(manifest: ClipManifest): number {
  return manifest.clips.reduce((acc, c) => {
    const n = Number(c.id.replace(/^clip-/, ''));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveQcPython(): Promise<string> {
  const candidates = [
    path.join(REPO_ROOT, '.venv-qc/Scripts/python.exe'),
    path.join(REPO_ROOT, '.venv-qc/bin/python'),
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error(
    'QC Python venv not found. Create it once:\n' +
      '  python -m venv .venv-qc\n' +
      '  .venv-qc\\Scripts\\activate\n' +
      '  pip install lv-chordia',
  );
}

function runQc(python: string, audioPath: string, entry: ClipManifestEntry): Promise<QcResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [
        QC_SCRIPT,
        '--audio',
        audioPath,
        '--entry-json',
        JSON.stringify(entry),
        '--min-root-match',
        String(MIN_ROOT_MATCH),
        '--min-quality-match',
        String(MIN_QUALITY_MATCH),
        '--json',
      ],
      { cwd: REPO_ROOT, windowsHide: true },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      // Filter noisy pydub/ffmpeg warnings from stderr for the error path.
      const errText = stderr
        .split(/\r?\n/)
        .filter((line) => line && !line.includes('RuntimeWarning') && !line.includes('Inference:'))
        .join('\n')
        .trim();
      try {
        const lines = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const line = lines[lines.length - 1];
        if (!line) {
          reject(new Error(`QC produced no JSON output (exit ${code}). ${errText}`));
          return;
        }
        resolve(JSON.parse(line) as QcResult);
      } catch (err) {
        reject(
          new Error(
            `QC returned unreadable output (exit ${code}): ${stdout.trim() || errText || String(err)}`,
          ),
        );
      }
    });
  });
}

async function replicateFetch(pathname: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Replicate ${pathname} failed (${res.status}): ${await res.text()}`);
  }
  return res;
}

async function generateClip(spec: ClipSpec, seed: number): Promise<ArrayBuffer> {
  const create = await replicateFetch('/predictions', {
    method: 'POST',
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        model_version: 'stereo-chord-large',
        prompt: spec.style,
        text_chords: spec.textChords,
        bpm: spec.bpm,
        time_sig: '4/4',
        duration: spec.durationSec,
        // Slightly above default (1.0) so the chord bed stays more obvious.
        chroma_coefficient: 1.4,
        output_format: 'mp3',
        seed,
      },
    }),
  });
  let prediction = (await create.json()) as Prediction;

  const deadline = Date.now() + TIMEOUT_MS;
  while (prediction.status === 'starting' || prediction.status === 'processing') {
    if (Date.now() > deadline) throw new Error(`Prediction ${prediction.id} timed out`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const poll = await replicateFetch(`/predictions/${prediction.id}`);
    prediction = (await poll.json()) as Prediction;
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  if (prediction.status !== 'succeeded') {
    throw new Error(`Prediction ${prediction.id} ${prediction.status}: ${prediction.error}`);
  }
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url) throw new Error(`Prediction ${prediction.id} succeeded but returned no output`);

  const audio = await fetch(url);
  if (!audio.ok) throw new Error(`Clip download failed (${audio.status}): ${url}`);
  return audio.arrayBuffer();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      count: { type: 'string' },
      accept: { type: 'string' },
      style: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'skip-qc': { type: 'boolean', default: false },
    },
  });
  const dryRun = values['dry-run'];
  const skipQc = values['skip-qc'];
  const acceptTarget = values.accept != null ? Number(values.accept) : null;
  const attemptBudget =
    values.count != null
      ? Number(values.count)
      : acceptTarget != null
        ? acceptTarget * 3 // safety cap if QC rejects heavily
        : 1;

  if (values.count != null && values.accept != null) {
    throw new Error('Use either --count or --accept, not both.');
  }
  if (acceptTarget != null && (!Number.isInteger(acceptTarget) || acceptTarget < 1)) {
    throw new Error(`--accept must be a positive integer, got "${values.accept}"`);
  }
  if (!Number.isInteger(attemptBudget) || attemptBudget < 1) {
    throw new Error(`--count must be a positive integer, got "${values.count}"`);
  }
  if (!dryRun && !process.env.REPLICATE_API_TOKEN) {
    throw new Error(
      'REPLICATE_API_TOKEN is not set. Create a token at https://replicate.com/account/api-tokens\n' +
        'and put it in a .env file at the repo root.',
    );
  }

  const qcPython = dryRun || skipQc ? null : await resolveQcPython();

  await fs.mkdir(CLIPS_DIR, { recursive: true });
  const manifest = await loadManifest();
  const startingCount = manifest.clips.length;
  if (acceptTarget != null) {
    console.log(
      `Manifest has ${startingCount} clip(s). Accepting ${acceptTarget} more (max ${attemptBudget} attempts)...`,
    );
  } else {
    console.log(`Manifest has ${startingCount} clip(s). Generating ${attemptBudget} more...`);
  }
  if (!dryRun && !skipQc) {
    console.log(
      `QC enabled: keep only clips with root >= ${MIN_ROOT_MATCH * 100}% ` +
        `and quality >= ${MIN_QUALITY_MATCH * 100}%.\n`,
    );
  } else {
    console.log('');
  }

  let accepted = 0;
  let rejected = 0;
  let failures = 0;
  let attempts = 0;
  let clipNumber = maxClipNumber(manifest);

  while (attempts < attemptBudget && (acceptTarget == null || accepted < acceptTarget)) {
    attempts++;
    const spec = randomClipSpec(values.style);
    const id = `clip-${String(++clipNumber).padStart(4, '0')}`;
    const progress =
      acceptTarget != null
        ? `accepted ${accepted}/${acceptTarget}, attempt ${attempts}/${attemptBudget}`
        : `${attempts}/${attemptBudget}`;
    console.log(`[${progress}] ${id}: ${describe(spec)}`);

    if (dryRun) {
      if (acceptTarget != null) accepted++;
      continue;
    }

    const seed = Math.floor(Math.random() * 2 ** 31);
    const file = `${id}.mp3`;
    const filePath = path.join(CLIPS_DIR, file);
    try {
      const audio = await generateClip(spec, seed);
      await fs.writeFile(filePath, Buffer.from(audio));

      const entry: ClipManifestEntry = {
        id,
        file,
        key: spec.key,
        mode: spec.mode,
        bpm: spec.bpm,
        beatsPerChord: spec.beatsPerChord,
        durationSec: spec.durationSec,
        chords: spec.chords,
        style: spec.style,
        seed,
      };

      if (!skipQc && qcPython) {
        process.stdout.write('    QC… ');
        const qc = await runQc(qcPython, filePath, entry);
        const rootPct = `${(qc.root_match * 100).toFixed(0)}%`;
        const qualPct = `${(qc.quality_match * 100).toFixed(0)}%`;
        const summary =
          `root ${qc.root_hits}/${qc.total_bars} (${rootPct})  ` +
          `quality ${qc.quality_hits}/${qc.total_bars} (${qualPct})`;
        if (!qc.pass) {
          await fs.unlink(filePath);
          rejected++;
          console.log(`REJECTED ${summary} — discarded, not added to library`);
          continue;
        }
        console.log(`PASS ${summary}`);
      }

      manifest.clips.push(entry);
      await saveManifest(manifest);
      accepted++;
      console.log(`    saved public/clips/${file} (${(audio.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failures++;
      await fs.unlink(filePath).catch(() => undefined);
      console.error(`    FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — nothing was generated.');
  } else {
    console.log(
      `\nDone: ${accepted} accepted, ${rejected} rejected by QC, ${failures} failed (${attempts} attempts).`,
    );
    console.log(`Library now has ${manifest.clips.length} clip(s) (was ${startingCount}).`);
    if (acceptTarget != null && accepted < acceptTarget) {
      console.error(
        `Stopped early: only accepted ${accepted}/${acceptTarget} before hitting the attempt cap (${attemptBudget}).`,
      );
    }
  }
  // Hard failures, zero keeps, or unmet --accept target fail the process.
  if (
    failures > 0 ||
    (!dryRun && accepted === 0) ||
    (acceptTarget != null && accepted < acceptTarget)
  ) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
