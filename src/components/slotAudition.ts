import type { Phase } from '../store/session';
import type { Chord } from '../theory/types';

export function getSlotAuditionChord(
  phase: Phase,
  playChordOnSelection: boolean,
  submitted: Chord | null,
  expected: Chord,
): Chord | null {
  if (phase === 'revealed') return expected;
  return phase === 'answering' && playChordOnSelection ? submitted : null;
}
