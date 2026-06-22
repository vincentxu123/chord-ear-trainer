import type { Chord, Progression } from '../theory/types';

// Diatonic major-key chords, named for readable progression authoring.
const I: Chord = { rootPc: 0, quality: 'maj' };
const ii: Chord = { rootPc: 2, quality: 'min' };
const iii: Chord = { rootPc: 4, quality: 'min' };
const IV: Chord = { rootPc: 5, quality: 'maj' };
const V: Chord = { rootPc: 7, quality: 'maj' };
const vi: Chord = { rootPc: 9, quality: 'min' };

// Chromatic / borrowed chords (only reachable when includeChromatic is on).
const II: Chord = { rootPc: 2, quality: 'maj' };
const bIII: Chord = { rootPc: 3, quality: 'maj' };
const III: Chord = { rootPc: 4, quality: 'maj' };
const iv: Chord = { rootPc: 5, quality: 'min' };
const bVI: Chord = { rootPc: 8, quality: 'maj' };
const VI: Chord = { rootPc: 9, quality: 'maj' };
const bVII: Chord = { rootPc: 10, quality: 'maj' };

function prog(id: string, name: string, chords: Chord[]): Progression {
  return { id, name, chords, beatsPerChord: 4 };
}

// Common pop progressions, grouped by length so any chosen length has options.
export const PROGRESSIONS: Progression[] = [
  // length 2
  prog('I-IV', 'I-IV', [I, IV]),
  prog('I-V', 'I-V', [I, V]),
  prog('ii-V', 'ii-V', [ii, V]),
  prog('IV-V', 'IV-V', [IV, V]),
  prog('vi-IV', 'vi-IV', [vi, IV]),
  prog('I-vi', 'I-vi', [I, vi]),

  // length 3
  prog('I-IV-V', 'I-IV-V', [I, IV, V]),
  prog('I-V-vi', 'I-V-vi', [I, V, vi]),
  prog('ii-V-I', 'ii-V-I', [ii, V, I]),
  prog('vi-IV-V', 'vi-IV-V', [vi, IV, V]),
  prog('I-vi-IV', 'I-vi-IV', [I, vi, IV]),
  prog('I-vi-V', 'I-vi-V', [I, vi, V]),

  // length 4
  prog('I-V-vi-IV', 'I-V-vi-IV', [I, V, vi, IV]),
  prog('vi-IV-I-V', 'vi-IV-I-V', [vi, IV, I, V]),
  prog('I-vi-IV-V', 'I-vi-IV-V', [I, vi, IV, V]),
  prog('I-V-vi-iii', 'I-V-vi-iii', [I, V, vi, iii]),
  prog('ii-V-I-vi', 'ii-V-I-vi', [ii, V, I, vi]),
  prog('I-IV-vi-V', 'I-IV-vi-V', [I, IV, vi, V]),

  // length 5
  prog('I-V-vi-iii-IV', 'I-V-vi-iii-IV', [I, V, vi, iii, IV]),
  prog('I-V-vi-IV-V', 'I-V-vi-IV-V', [I, V, vi, IV, V]),
  prog('vi-IV-I-V-vi', 'vi-IV-I-V-vi', [vi, IV, I, V, vi]),
  prog('I-vi-IV-V-I', 'I-vi-IV-V-I', [I, vi, IV, V, I]),

  // length 6
  prog('I-V-vi-iii-IV-I', 'I-V-vi-iii-IV-I', [I, V, vi, iii, IV, I]),
  prog('I-V-vi-IV-ii-V', 'I-V-vi-IV-ii-V', [I, V, vi, IV, ii, V]),
  prog('I-IV-vi-V-IV-I', 'I-IV-vi-V-IV-I', [I, IV, vi, V, IV, I]),
  prog('I-vi-IV-V-vi-IV', 'I-vi-IV-V-vi-IV', [I, vi, IV, V, vi, IV]),

  // chromatic / borrowed (only used when includeChromatic is on)
  prog('I-bVII', 'I-bVII', [I, bVII]),
  prog('I-bIII-IV', 'I-bIII-IV', [I, bIII, IV]),
  prog('I-II-V', 'I-II-V', [I, II, V]),
  prog('I-bVII-IV-I', 'I-bVII-IV-I', [I, bVII, IV, I]),
  prog('I-III-vi-IV', 'I-III-vi-IV', [I, III, vi, IV]),
  prog('I-VI-ii-V', 'I-VI-ii-V', [I, VI, ii, V]),
  prog('I-V-bVI-bVII', 'I-V-bVI-bVII', [I, V, bVI, bVII]),
  prog('I-IV-iv-I', 'I-IV-iv-I', [I, IV, iv, I]),
  prog('I-bVII-IV-I-V', 'I-bVII-IV-I-V', [I, bVII, IV, I, V]),
  prog('I-III-vi-IV-V-I', 'I-III-vi-IV-V-I', [I, III, vi, IV, V, I]),
];
