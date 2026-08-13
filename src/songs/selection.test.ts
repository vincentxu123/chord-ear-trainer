import { describe, expect, it } from 'vitest';
import type { Chord } from '../theory/types';
import type { ExcerptProgress } from '../store/progress';
import {
  filterSongEntries,
  summarizeArtists,
  summarizeProgress,
} from './selection';
import type { SongClipManifestEntry } from './types';

const chord = (rootPc: number, quality: Chord['quality'] = 'maj'): Chord => ({
  rootPc,
  quality,
});

const entry = (
  id: string,
  artist: string,
  title: string,
  chords: Chord[] = [chord(0), chord(5)],
): SongClipManifestEntry => ({
  id,
  file: `${id}.mp3`,
  title,
  artist,
  startMeasure: 1,
  endMeasure: 4,
  key: 'C',
  mode: 'major',
  bpm: 100,
  durationSec: 10,
  chords,
  cueTimesSec: [0, 1],
  measureChordCounts: [1, 1, 0, 0],
});

describe('song selection', () => {
  const entries = [
    entry('a-1', 'Artist A', 'Song A'),
    entry('a-2', 'Artist A', 'Song A'),
    entry('b-1', 'Artist B', 'Song B', [chord(0), chord(2), chord(4), chord(5)]),
  ];

  it('counts unique songs and excerpts by artist', () => {
    expect(summarizeArtists(entries)).toEqual([
      { artist: 'Artist A', songCount: 1, excerptCount: 2 },
      { artist: 'Artist B', songCount: 1, excerptCount: 1 },
    ]);
  });

  it('keeps wrong and unseen excerpts in the learning queue', () => {
    const records: Record<string, ExcerptProgress> = {
      'a-1': {
        attempts: 1,
        correctAttempts: 1,
        incorrectAttempts: 0,
        lastOutcome: 'correct',
        lastAttemptAt: 1,
      },
      'a-2': {
        attempts: 1,
        correctAttempts: 0,
        incorrectAttempts: 1,
        lastOutcome: 'incorrect',
        lastAttemptAt: 1,
      },
    };
    const options = {
      difficulty: 'all' as const,
      selectedArtists: ['Artist A'],
      progressFilter: 'learning' as const,
    };
    expect(filterSongEntries(entries, options, records).map((item) => item.id)).toEqual(['a-2']);
    expect(
      filterSongEntries(entries, { ...options, progressFilter: 'all' }, records).map(
        (item) => item.id,
      ),
    ).toEqual(['a-1', 'a-2']);
  });

  it('summarizes progress for the current filter context', () => {
    const records: Record<string, ExcerptProgress> = {
      'a-1': {
        attempts: 1,
        correctAttempts: 1,
        incorrectAttempts: 0,
        lastOutcome: 'correct',
        lastAttemptAt: 1,
      },
      'a-2': {
        attempts: 1,
        correctAttempts: 0,
        incorrectAttempts: 1,
        lastOutcome: 'incorrect',
        lastAttemptAt: 1,
      },
    };
    expect(summarizeProgress(entries, records)).toEqual({
      unseen: 1,
      needsPractice: 1,
      mastered: 1,
    });
  });
});
