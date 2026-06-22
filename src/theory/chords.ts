import type { Chord, Mode } from './types';

// The 6 diatonic major/minor triads of a major key (diminished vii° excluded).
export const DIATONIC_MAJOR: Chord[] = [
  { rootPc: 0, quality: 'maj' }, // I
  { rootPc: 2, quality: 'min' }, // ii
  { rootPc: 4, quality: 'min' }, // iii
  { rootPc: 5, quality: 'maj' }, // IV
  { rootPc: 7, quality: 'maj' }, // V
  { rootPc: 9, quality: 'min' }, // vi
];

// The 6 diatonic major/minor triads of a (natural) minor key (ii° excluded).
export const DIATONIC_MINOR: Chord[] = [
  { rootPc: 0, quality: 'min' }, // i
  { rootPc: 3, quality: 'maj' }, // III
  { rootPc: 5, quality: 'min' }, // iv
  { rootPc: 7, quality: 'min' }, // v
  { rootPc: 8, quality: 'maj' }, // VI
  { rootPc: 10, quality: 'maj' }, // VII
];

// Common out-of-key chords added when includeChromatic is on.
const CHROMATIC_MAJOR: Chord[] = [
  { rootPc: 2, quality: 'maj' }, // II   (V/V)
  { rootPc: 3, quality: 'maj' }, // bIII (borrowed)
  { rootPc: 4, quality: 'maj' }, // III  (V/vi)
  { rootPc: 5, quality: 'min' }, // iv   (borrowed)
  { rootPc: 8, quality: 'maj' }, // bVI  (borrowed)
  { rootPc: 9, quality: 'maj' }, // VI   (V/ii)
  { rootPc: 10, quality: 'maj' }, // bVII (borrowed)
];

const CHROMATIC_MINOR: Chord[] = [
  { rootPc: 0, quality: 'maj' }, // I   (Picardy / major tonic)
  { rootPc: 1, quality: 'maj' }, // bII (Neapolitan)
  { rootPc: 2, quality: 'maj' }, // II  (V/V)
  { rootPc: 5, quality: 'maj' }, // IV  (borrowed major subdominant)
  { rootPc: 7, quality: 'maj' }, // V   (harmonic-minor dominant)
];

// The diatonic diminished triad each mode is missing from its maj/min set:
// vii° in major, ii° in minor. Opt-in via the diminished setting.
export const DIATONIC_DIM: Record<Mode, Chord> = {
  major: { rootPc: 11, quality: 'dim' }, // vii°
  minor: { rootPc: 2, quality: 'dim' }, // ii°
};

const DIATONIC: Record<Mode, Chord[]> = { major: DIATONIC_MAJOR, minor: DIATONIC_MINOR };
const CHROMATIC: Record<Mode, Chord[]> = { major: CHROMATIC_MAJOR, minor: CHROMATIC_MINOR };

export function chordsEqual(a: Chord, b: Chord): boolean {
  return a.rootPc === b.rootPc && a.quality === b.quality;
}

// In-key chords are the 6 maj/min triads plus the diatonic diminished triad.
export function isChromatic(c: Chord, mode: Mode = 'major'): boolean {
  if (chordsEqual(c, DIATONIC_DIM[mode])) return false;
  return !DIATONIC[mode].some((d) => chordsEqual(d, c));
}

const QUALITY_ORDER: Record<Chord['quality'], number> = { min: 0, dim: 1, maj: 2 };

// Scale-degree order for the answer pad: ascending root, diatonic before
// chromatic at the same degree, then by quality (minor, diminished, major).
export function compareChordsForDisplay(a: Chord, b: Chord, mode: Mode = 'major'): number {
  if (a.rootPc !== b.rootPc) return a.rootPc - b.rootPc;
  const aChromatic = isChromatic(a, mode);
  const bChromatic = isChromatic(b, mode);
  if (aChromatic !== bChromatic) return aChromatic ? 1 : -1;
  return QUALITY_ORDER[a.quality] - QUALITY_ORDER[b.quality];
}

export function sortChordsForDisplay(chords: Chord[], mode: Mode = 'major'): Chord[] {
  return [...chords].sort((a, b) => compareChordsForDisplay(a, b, mode));
}

// The chord vocabulary for a round: the mode's diatonic triads, optionally
// widened with the diatonic diminished triad and that mode's chromatic chords.
export function chordPool(
  mode: Mode,
  includeChromatic: boolean,
  includeDiminished = false,
): Chord[] {
  const pool = [...DIATONIC[mode]];
  if (includeDiminished) pool.push(DIATONIC_DIM[mode]);
  if (includeChromatic) pool.push(...CHROMATIC[mode]);
  return sortChordsForDisplay(pool, mode);
}

// Stable identity string for scoring/stats (Roman labels are ambiguous for
// chromatic chords, so we key on rootPc + quality instead).
export function chordKey(c: Chord): string {
  return `${c.rootPc}:${c.quality}`;
}

const DEGREE_LABELS: Record<Mode, string[]> = {
  major: ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'],
  minor: ['I', 'bII', 'II', 'III', '#III', 'IV', '#IV', 'V', 'VI', '#VI', 'VII', '#VII'],
};

// Best-effort Roman-numeral label for display. Uppercase = major; lowercase =
// minor; lowercase + ° = diminished. Out-of-key roots get an accidental prefix.
export function toRoman(c: Chord, mode: Mode = 'major'): string {
  const base = DEGREE_LABELS[mode][((c.rootPc % 12) + 12) % 12]!;
  if (c.quality === 'maj') return base;
  const lowered = base.replace(/[IV]+/, (s) => s.toLowerCase());
  return c.quality === 'dim' ? `${lowered}°` : lowered;
}
