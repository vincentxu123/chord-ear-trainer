import type { Chord } from '../theory/types';
import type { SongClipManifestEntry } from './types';
import rotationScores from './rotation-difficulty.json';

export type SongDifficulty = 'all' | 'beginner' | 'medium' | 'advanced';
export type RatedSongDifficulty = Exclude<SongDifficulty, 'all'>;
type Components = { clarity: number; pace: number; complexity: number };
type StoredScore = { identity: unknown; original: Components; instrumental?: Components };

export function difficultyFromScore(score: number): RatedSongDifficulty {
  return score < 15 ? 'beginner' : score < 30 ? 'medium' : 'advanced';
}

export function listeningDifficultyScore(entry: SongClipManifestEntry, instrumental = false): number | null {
  if (entry.collection !== 'rotation' || entry.libraryVersion !== rotationScores.libraryVersion) return null;
  const stored = (rotationScores.entries as Record<string, StoredScore>)[entry.id];
  // Audio hashes determine the library revision; compare metadata too because
  // answer-key corrections can leave that audio revision unchanged.
  const identity = {
    artist: entry.artist, title: entry.title, file: entry.file,
    instrumentalFile: entry.instrumentalFile ?? null, key: entry.key, mode: entry.mode,
    bpm: entry.bpm, durationSec: entry.durationSec, startMeasure: entry.startMeasure,
    endMeasure: entry.endMeasure, chords: entry.chords, cueTimesSec: entry.cueTimesSec,
    measureChordCounts: entry.measureChordCounts,
  };
  if (!stored || JSON.stringify(identity) !== JSON.stringify(stored.identity)) return null;
  const components = instrumental && entry.instrumentalFile ? stored.instrumental : stored.original;
  if (!components) return null;
  return .7 * (100 - components.clarity) + .2 * components.pace + .1 * components.complexity;
}

export function countUniqueChords(chords: Chord[]): number {
  return new Set(chords.map((chord) => `${chord.rootPc}:${chord.quality}`)).size;
}

export function rateSongDifficulty(entry: SongClipManifestEntry, instrumental = false): RatedSongDifficulty | 'unrated' {
  if (entry.collection === 'rotation') {
    const score = listeningDifficultyScore(entry, instrumental);
    return score === null ? 'unrated' : difficultyFromScore(score);
  }
  const uniqueChordCount = countUniqueChords(entry.chords);
  return uniqueChordCount <= 3 ? 'beginner' : 'advanced';
}

export function matchesSongDifficulty(
  entry: SongClipManifestEntry,
  difficulty: SongDifficulty,
  instrumental = false,
): boolean {
  return difficulty === 'all' || rateSongDifficulty(entry, instrumental) === difficulty;
}
