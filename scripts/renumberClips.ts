/**
 * Renumber public/clips so IDs/files are sequential clip-0001… with no gaps.
 * (Gaps appear when QC rejects consume IDs during generation.)
 *
 * Usage: npx tsx scripts/renumberClips.ts
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClipManifest } from '../src/clips/types';

const CLIPS_DIR = path.resolve(fileURLToPath(import.meta.url), '../../public/clips');
const MANIFEST_PATH = path.join(CLIPS_DIR, 'manifest.json');

async function main(): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')) as ClipManifest;
  const clips = manifest.clips;
  if (!clips.length) {
    console.log('No clips to renumber.');
    return;
  }

  console.log(`Renumbering ${clips.length} clip(s)…`);

  const temps: string[] = [];

  // Phase 1: move to temp names so we never overwrite a still-needed file.
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    const temp = `__renum_${String(i + 1).padStart(4, '0')}.mp3`;
    await fs.rename(path.join(CLIPS_DIR, clip.file), path.join(CLIPS_DIR, temp));
    temps.push(temp);
  }

  // Phase 2: sequential final names + manifest ids.
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]!;
    const id = `clip-${String(i + 1).padStart(4, '0')}`;
    const file = `${id}.mp3`;
    await fs.rename(path.join(CLIPS_DIR, temps[i]!), path.join(CLIPS_DIR, file));
    clip.id = id;
    clip.file = file;
  }

  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const mp3s = (await fs.readdir(CLIPS_DIR)).filter((f) => f.endsWith('.mp3')).sort();
  console.log(`Done. IDs: ${clips[0]!.id} … ${clips[clips.length - 1]!.id}`);
  console.log(`MP3 files: ${mp3s.length} (${mp3s[0]} … ${mp3s[mp3s.length - 1]})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
