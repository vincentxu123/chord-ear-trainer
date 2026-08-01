/**
 * Generate real-music practice clips with MusicGen-Chord on Replicate.
 *
 * The chord progression is an INPUT to the model, so each clip's answer key is
 * known by construction — no audio analysis needed. Clips + manifest land in
 * public/clips/ and the app's "Real music" mode picks them up automatically.
 *
 * Usage:
 *   Put REPLICATE_API_TOKEN=r8_... in .env (see .env.example), then:
 *   npm run clips:generate -- --count 3
 *   npm run clips:generate -- --count 3 --dry-run
 *   npm run clips:generate -- --style "piano pop ballad, expressive piano"
 *
 * See CLIP_PIPELINE.md for the full pipeline design.
 */
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

const CLIPS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../public/clips');
const MANIFEST_PATH = path.join(CLIPS_DIR, 'manifest.json');

interface Prediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
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
      count: { type: 'string', default: '1' },
      style: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const count = Number(values.count);
  const dryRun = values['dry-run'];

  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`--count must be a positive integer, got "${values.count}"`);
  }
  if (!dryRun && !process.env.REPLICATE_API_TOKEN) {
    throw new Error(
      'REPLICATE_API_TOKEN is not set. Create a token at https://replicate.com/account/api-tokens\n' +
        'and put it in a .env file at the repo root (copy .env.example to .env).',
    );
  }

  await fs.mkdir(CLIPS_DIR, { recursive: true });
  const manifest = await loadManifest();
  console.log(`Manifest has ${manifest.clips.length} clip(s). Generating ${count} more...\n`);

  let failures = 0;
  let clipNumber = maxClipNumber(manifest);
  for (let i = 0; i < count; i++) {
    const spec = randomClipSpec(values.style);
    const id = `clip-${String(++clipNumber).padStart(4, '0')}`;
    console.log(`[${i + 1}/${count}] ${id}: ${describe(spec)}`);

    if (dryRun) continue;

    const seed = Math.floor(Math.random() * 2 ** 31);
    try {
      const audio = await generateClip(spec, seed);
      const file = `${id}.mp3`;
      await fs.writeFile(path.join(CLIPS_DIR, file), Buffer.from(audio));

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
      manifest.clips.push(entry);
      await saveManifest(manifest); // save after each clip so failures lose nothing
      console.log(`    saved public/clips/${file} (${(audio.byteLength / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failures++;
      console.error(`    FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run — nothing was generated.');
  } else {
    console.log(`\nDone: ${count - failures} succeeded, ${failures} failed.`);
    console.log(`Library now has ${manifest.clips.length} clip(s).`);
    console.log('Listen to each new clip and delete any that sound off (remove the file and its manifest entry).');
  }
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
