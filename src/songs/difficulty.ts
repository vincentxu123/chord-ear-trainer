import type { Chord } from '../theory/types';

export type SongDifficulty = 'all' | 'easy' | 'medium' | 'hard';
export type RatedSongDifficulty = Exclude<SongDifficulty, 'all'>;

export function countUniqueChords(chords: Chord[]): number {
  return new Set(chords.map((chord) => `${chord.rootPc}:${chord.quality}`)).size;
}

export function rateSongDifficulty(chords: Chord[]): RatedSongDifficulty {
  const uniqueChordCount = countUniqueChords(chords);
  if (uniqueChordCount <= 3) return 'easy';
  if (uniqueChordCount <= 5) return 'medium';
  return 'hard';
}

export function matchesSongDifficulty(
  chords: Chord[],
  difficulty: SongDifficulty,
): boolean {
  return difficulty === 'all' || rateSongDifficulty(chords) === difficulty;
}
