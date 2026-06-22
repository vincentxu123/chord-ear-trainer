import type { Chord } from './types';

// Default practice pool: the 6 diatonic major/minor triads of a major key.
// (The diminished vii° is excluded — major/minor only in v1.)
export const DIATONIC_MAJOR: Chord[] = [
  { rootPc: 0, quality: 'maj' }, // I
  { rootPc: 2, quality: 'min' }, // ii
  { rootPc: 4, quality: 'min' }, // iii
  { rootPc: 5, quality: 'maj' }, // IV
  { rootPc: 7, quality: 'maj' }, // V
  { rootPc: 9, quality: 'min' }, // vi
];

// Common out-of-key (chromatic) major/minor chords added when includeChromatic
// is on: secondary-dominant-style majors and borrowed chords.
export const CHROMATIC_COMMON: Chord[] = [
  { rootPc: 2, quality: 'maj' }, // II   (V/V)
  { rootPc: 3, quality: 'maj' }, // bIII (borrowed)
  { rootPc: 4, quality: 'maj' }, // III  (V/vi)
  { rootPc: 5, quality: 'min' }, // iv   (borrowed)
  { rootPc: 8, quality: 'maj' }, // bVI  (borrowed)
  { rootPc: 9, quality: 'maj' }, // VI   (V/ii)
  { rootPc: 10, quality: 'maj' }, // bVII (borrowed)
];

// Pool used when chromatic chords are enabled.
export const CHROMATIC_POOL: Chord[] = [...DIATONIC_MAJOR, ...CHROMATIC_COMMON];

export function chordsEqual(a: Chord, b: Chord): boolean {
  return a.rootPc === b.rootPc && a.quality === b.quality;
}

export function isChromatic(c: Chord): boolean {
  return !DIATONIC_MAJOR.some((d) => chordsEqual(d, c));
}

// Stable identity string for scoring/stats (Roman labels are ambiguous for
// chromatic chords, so we key on rootPc + quality instead).
export function chordKey(c: Chord): string {
  return `${c.rootPc}:${c.quality}`;
}

const DEGREE_LABELS = [
  'I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII',
];

// Best-effort Roman-numeral label for display. Uppercase = major, lowercase =
// minor; chromatic roots get an accidental prefix.
export function toRoman(c: Chord): string {
  const base = DEGREE_LABELS[((c.rootPc % 12) + 12) % 12];
  return c.quality === 'min' ? base.replace(/[IV]+/, (s) => s.toLowerCase()) : base;
}
