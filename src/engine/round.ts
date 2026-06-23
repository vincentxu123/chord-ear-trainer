import type { Chord, Exercise, Mode, Progression } from '../theory/types';
import { chordsEqual, isChromatic, chordPool } from '../theory/chords';
import { randomKey } from '../theory/voicing';
import type { PracticeSettings } from '../store/settings';

export interface SlotResult {
  expected: Chord;
  given: Chord | null;
  correct: boolean;
}

export interface AttemptResult {
  perSlot: SlotResult[];
  correctCount: number;
  total: number;
}

// Every chord in the pool is equally likely, so IV/V/vi appear as often as any
// other chord.
function pickRandom(items: Chord[]): Chord {
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickNextChord(pool: Chord[], previous: Chord): Chord {
  const choices = pool.length > 1 ? pool.filter((c) => !chordsEqual(c, previous)) : pool;
  return pickRandom(choices);
}

function tonicChord(mode: Mode): Chord {
  return { rootPc: 0, quality: mode === 'minor' ? 'min' : 'maj' };
}

function buildChords(pool: Chord[], length: number): Chord[] {
  const chords: Chord[] = [pickRandom(pool)];
  for (let i = 1; i < length; i++) {
    chords.push(pickNextChord(pool, chords[i - 1]!));
  }
  return chords;
}

// Guarantee the tonic (I / i) appears somewhere — not necessarily first.
function ensureTonic(chords: Chord[], mode: Mode): void {
  const tonic = tonicChord(mode);
  if (chords.some((c) => chordsEqual(c, tonic))) return;
  chords[Math.floor(Math.random() * chords.length)] = tonic;
}

// Guarantee at least one out-of-key chord when chromatic mode is on, replacing
// a random non-tonic slot with a chromatic chord that differs from its neighbors.
function ensureChromatic(chords: Chord[], pool: Chord[], mode: Mode): void {
  if (chords.some((c) => isChromatic(c, mode))) return;
  const choices = pool.filter((c) => isChromatic(c, mode));
  if (!choices.length) return;
  const tonic = tonicChord(mode);
  const nonTonic = chords.map((_, i) => i).filter((i) => !chordsEqual(chords[i]!, tonic));
  const slots = nonTonic.length ? nonTonic : chords.map((_, i) => i);
  const slot = slots[Math.floor(Math.random() * slots.length)]!;
  let replacement = pickRandom(choices);
  let guard = 0;
  while (
    guard++ < 20 &&
    ((chords[slot - 1] && chordsEqual(replacement, chords[slot - 1]!)) ||
      (chords[slot + 1] && chordsEqual(replacement, chords[slot + 1]!)))
  ) {
    replacement = pickRandom(choices);
  }
  chords[slot] = replacement;
}

export function generateRound(settings: PracticeSettings): Exercise {
  const mode: Mode = Math.random() < 0.5 ? 'major' : 'minor';
  const pool = chordPool(mode, settings.includeChromatic, settings.includeDiminished);
  const chords = buildChords(pool, settings.progressionLength);
  ensureTonic(chords, mode);
  if (settings.includeChromatic) ensureChromatic(chords, pool, mode);
  const progression: Progression = {
    id: `random-${Date.now()}`,
    name: '',
    chords,
    beatsPerChord: 4,
  };
  const key = settings.randomizeKey ? randomKey() : 'C';
  return { progression, key, mode, source: 'synth' };
}

export function scoreAttempt(
  answer: (Chord | null)[],
  progression: Progression,
): AttemptResult {
  const perSlot: SlotResult[] = progression.chords.map((expected, i) => {
    const given = answer[i] ?? null;
    return { expected, given, correct: given != null && chordsEqual(given, expected) };
  });
  return {
    perSlot,
    correctCount: perSlot.filter((s) => s.correct).length,
    total: perSlot.length,
  };
}
