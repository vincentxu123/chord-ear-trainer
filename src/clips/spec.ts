import type { Chord, Mode } from '../theory/types';
import { chordPool } from '../theory/chords';
import { randomKey } from '../theory/voicing';
import { buildChords, ensureTonic } from '../engine/round';
import { clipDurationSec, progressionToTextChords } from './musicgenChords';

// Everything needed for one MusicGen-Chord generation call, plus the metadata
// that becomes the clip's manifest entry.
export interface ClipSpec {
  key: string;
  mode: Mode;
  bpm: number;
  beatsPerChord: number;
  passes: number;
  chords: Chord[];
  style: string;
  textChords: string;
  durationSec: number;
}

// Appended to every style so the harmonic bed stays easy to hear for ear training.
export const HARMONY_CLARITY_SUFFIX =
  'prominent loud bass line, clear audible chord changes, bass-forward mix';

// Style prompt bank (~20 mainstream genres). Avoid extreme metal / screamed
// vocals; keep textures radio-friendly so harmony stays hearable for training.
export const CLIP_STYLES = [
  // Pop / rock
  'contemporary pop, polished synths, bright electric guitar, tight drums',
  'acoustic pop ballad, warm strummed guitars, soft drums',
  '80s synth-pop chorus, bright analog synths, punchy drums',
  'indie rock, driving drums, jangly electric guitars',
  'soft rock, clean electric guitars, steady drums, warm keys',
  'classic rock groove, crunchy electric guitars, solid drums, organ',
  // R&B / soul / funk
  'neo-soul groove, electric piano, laid-back drums',
  'smooth R&B, silky keys, soft drums, warm bass',
  'funky groove, syncopated rhythm guitar, tight drums, clavinet',
  // Jazz-adjacent (mainstream, not free jazz)
  'smooth jazz, soft saxophone, electric piano, brushed drums',
  'jazz pop, walking bass, clean guitar chords, light swing drums',
  'bossa nova, nylon-string guitar, gentle percussion, soft keys',
  // Hip-hop / electronic (softer end)
  'lo-fi chill hop, dusty keys, relaxed beat',
  'dance-pop, four-on-the-floor kick, bright synths, catchy chords',
  'house groove, deep bass, piano stabs, steady electronic drums',
  // Country / folk / singer-songwriter
  'country pop, acoustic guitar, pedal steel, steady beat',
  'folk pop, acoustic guitars, light percussion, warm harmonies',
  // Latin / caribbean / global-pop
  'reggae groove, off-beat guitar skanks',
  'latin pop, bright acoustic guitar, light percussion, warm keys',
  // Piano / cinematic-lite
  'piano pop ballad, expressive piano, subtle strings',
];

export const CLIP_CHORD_COUNT = 4;
export const CLIP_BEATS_PER_CHORD = 4;
export const CLIP_PASSES = 2;

// Keeps 2 passes of 4 bars within the model's 30-second generation ceiling
// (32 beats at 76 BPM ≈ 26s).
const BPM_MIN = 76;
const BPM_MAX = 120;

function randomInt(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// A random 4-chord diatonic progression in a random key/mode, mirroring the
// synth exercise generator's rules (no consecutive repeats, tonic guaranteed).
export function randomClipSpec(style?: string): ClipSpec {
  const mode: Mode = Math.random() < 0.5 ? 'major' : 'minor';
  const pool = chordPool(mode, false, false);
  const chords = buildChords(pool, CLIP_CHORD_COUNT);
  ensureTonic(chords, mode);
  const key = randomKey();
  const bpm = randomInt(BPM_MIN, BPM_MAX);
  return {
    key,
    mode,
    bpm,
    beatsPerChord: CLIP_BEATS_PER_CHORD,
    passes: CLIP_PASSES,
    chords,
    style: withHarmonyClarity(
      style ?? CLIP_STYLES[Math.floor(Math.random() * CLIP_STYLES.length)]!,
    ),
    textChords: progressionToTextChords(chords, key, CLIP_PASSES),
    durationSec: clipDurationSec(CLIP_CHORD_COUNT, CLIP_BEATS_PER_CHORD, bpm, CLIP_PASSES),
  };
}

function withHarmonyClarity(style: string): string {
  return style.includes(HARMONY_CLARITY_SUFFIX) ? style : `${style}, ${HARMONY_CLARITY_SUFFIX}`;
}
