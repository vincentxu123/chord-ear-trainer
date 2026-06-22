import { Note } from 'tonal';
import type { Chord, Quality } from './types';

// Major tonics we randomize over (flats chosen for flat keys).
export const KEYS = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

export function randomKey(): string {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

const TRIAD_INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
};

// Render a relative chord into concrete note names within a fixed register so
// playback never drifts too high/low regardless of the randomized key.
export function chordToNotes(c: Chord, key: string, baseOctave = 3): string[] {
  const tonicMidi = Note.midi(`${key}${baseOctave}`);
  if (tonicMidi == null) throw new Error(`Invalid key: ${key}`);
  const rootMidi = tonicMidi + c.rootPc;
  return TRIAD_INTERVALS[c.quality].map((semis) => Note.fromMidi(rootMidi + semis));
}
