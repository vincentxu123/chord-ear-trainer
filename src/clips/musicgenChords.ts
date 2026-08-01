import { Note } from 'tonal';
import type { Chord, Quality } from '../theory/types';

// Flat spellings to match the KEYS list in theory/voicing.ts. MusicGen-Chord
// accepts both 'b' and '#' accidentals.
const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// MusicGen-Chord syntax: a bare root is major; other qualities follow a colon.
const QUALITY_SUFFIX: Record<Quality, string> = { maj: '', min: ':min', dim: ':dim' };

// Resolve a relative chord against an absolute tonic into a MusicGen-Chord
// token, e.g. ({rootPc: 9, quality: 'min'}, 'C') -> "A:min".
export function chordToMusicgenToken(chord: Chord, key: string): string {
  // Note.chroma yields NaN (not null/undefined) for unparseable names.
  const keyPc = Note.chroma(key);
  if (typeof keyPc !== 'number' || !Number.isInteger(keyPc)) {
    throw new Error(`Invalid key: ${key}`);
  }
  const name = PC_NAMES[(keyPc + chord.rootPc) % 12]!;
  return `${name}${QUALITY_SUFFIX[chord.quality]}`;
}

// One space-separated token per bar; the progression is repeated `passes`
// times so the model plays it through that many times.
export function progressionToTextChords(chords: Chord[], key: string, passes = 2): string {
  const bar = chords.map((c) => chordToMusicgenToken(c, key)).join(' ');
  return Array.from({ length: passes }, () => bar).join(' ');
}

// Exact length of `passes` runs of the progression (may be fractional).
export function exactClipDurationSec(
  chordCount: number,
  beatsPerChord: number,
  bpm: number,
  passes = 2,
): number {
  return passes * chordCount * beatsPerChord * (60 / bpm);
}

// Integer seconds to request from MusicGen (ceil so the file covers a full
// two passes). Playback should stop at exactClipDurationSec to avoid a
// partial third loop caused by the padded second.
export function clipDurationSec(
  chordCount: number,
  beatsPerChord: number,
  bpm: number,
  passes = 2,
): number {
  return Math.ceil(exactClipDurationSec(chordCount, beatsPerChord, bpm, passes));
}
