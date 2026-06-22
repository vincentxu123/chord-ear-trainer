import type { Chord, Exercise, Progression } from '../theory/types';
import { chordsEqual, isChromatic } from '../theory/chords';
import { randomKey } from '../theory/voicing';
import { PROGRESSIONS } from '../data/progressions';
import type { PracticeSettings } from '../store/settings';

export interface SlotResult {
  expected: Chord;
  given: Chord | null;
  correct: boolean;
  isAnchor: boolean;
}

export interface AttemptResult {
  perSlot: SlotResult[];
  correctCount: number;
  total: number;
}

// Every progression starts on the tonic (I). That first slot is GIVEN to the
// player as an anchor for relative listening — it is pre-filled, not scored.
export const ANCHOR_INDEX = 0;
export const TONIC: Chord = { rootPc: 0, quality: 'maj' };

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function inPool(chord: Chord, pool: Chord[]): boolean {
  return pool.some((c) => chordsEqual(c, chord));
}

// Fallback when no curated progression matches the requested length/pool.
// Always begins on the tonic; can guarantee at least one chromatic chord.
function randomProgression(settings: PracticeSettings, requireChromatic = false): Progression {
  const { allowedChords, progressionLength } = settings;
  const chords: Chord[] = [TONIC];
  for (let i = 1; i < progressionLength; i++) {
    let next = pick(allowedChords);
    while (chordsEqual(next, chords[i - 1]) && allowedChords.length > 1) {
      next = pick(allowedChords);
    }
    chords.push(next);
  }
  if (requireChromatic && !chords.some(isChromatic) && progressionLength > 1) {
    const chromaticChoices = allowedChords.filter(isChromatic);
    if (chromaticChoices.length) {
      const slot = 1 + Math.floor(Math.random() * (progressionLength - 1));
      chords[slot] = pick(chromaticChoices);
    }
  }
  return { id: `random-${Date.now()}`, name: 'Random', chords, beatsPerChord: 4 };
}

export function generateRound(settings: PracticeSettings): Exercise {
  const candidates = PROGRESSIONS.filter(
    (p) =>
      p.chords.length === settings.progressionLength &&
      chordsEqual(p.chords[0], TONIC) &&
      p.chords.every((c) => inPool(c, settings.allowedChords)),
  );

  let progression: Progression;
  if (settings.includeChromatic) {
    // Prefer progressions that actually exercise a chromatic chord.
    const chromatic = candidates.filter((p) => p.chords.some(isChromatic));
    progression = chromatic.length ? pick(chromatic) : randomProgression(settings, true);
  } else {
    progression = candidates.length ? pick(candidates) : randomProgression(settings);
  }

  const key = settings.randomizeKey ? randomKey() : 'C';
  return { progression, key, source: 'synth' };
}

export function scoreAttempt(
  answer: (Chord | null)[],
  progression: Progression,
): AttemptResult {
  const perSlot: SlotResult[] = progression.chords.map((expected, i) => {
    const isAnchor = i === ANCHOR_INDEX;
    const given = answer[i] ?? null;
    const correct = isAnchor || (given != null && chordsEqual(given, expected));
    return { expected, given, correct, isAnchor };
  });
  const scored = perSlot.filter((s) => !s.isAnchor);
  return {
    perSlot,
    correctCount: scored.filter((s) => s.correct).length,
    total: scored.length,
  };
}
