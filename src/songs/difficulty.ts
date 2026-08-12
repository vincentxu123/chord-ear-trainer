import type { Chord } from '../theory/types';

export type SongDifficulty = 'all' | 'beginner' | 'advanced';
export type RatedSongDifficulty = Exclude<SongDifficulty, 'all'>;

export function countUniqueChords(chords: Chord[]): number {
  return new Set(chords.map((chord) => `${chord.rootPc}:${chord.quality}`)).size;
}

export function rateSongDifficulty(chords: Chord[]): RatedSongDifficulty {
  const uniqueChordCount = countUniqueChords(chords);
  return uniqueChordCount <= 3 ? 'beginner' : 'advanced';
}

export function matchesSongDifficulty(
  chords: Chord[],
  difficulty: SongDifficulty,
): boolean {
  return difficulty === 'all' || rateSongDifficulty(chords) === difficulty;
}
