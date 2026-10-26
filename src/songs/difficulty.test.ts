import { describe, expect, it } from 'vitest';
import manifest from '../../public/rotation-clips/manifest.json';
import type { SongClipManifestEntry } from './types';
import { songClipToExercise } from './exercise';
import { filterSongEntries } from './selection';
import { countUniqueChords, difficultyFromScore, listeningDifficultyScore, matchesSongDifficulty, rateSongDifficulty } from './difficulty';

const entries: SongClipManifestEntry[] = manifest.clips.map(entry => ({
  ...entry, collection: 'rotation', libraryVersion: manifest.version,
} as SongClipManifestEntry));

describe('listening difficulty experiment', () => {
  it('uses explicit, non-overlapping category boundaries', () => {
    expect([0, 14.999, 15, 29.999, 30, 100].map(difficultyFromScore)).toEqual([
      'beginner', 'beginner', 'medium', 'medium', 'advanced', 'advanced',
    ]);
  });

  it('covers every current rotation excerpt and uses one rating per song and mix', () => {
    for (const instrumental of [false, true]) {
      const songs = new Map<string, number>();
      const bands = new Set<string>();
      for (const entry of entries) {
        const score = listeningDifficultyScore(entry, instrumental);
        expect(score).not.toBeNull();
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
        const key = `${entry.artist}:${entry.title}`;
        if (songs.has(key)) expect(score).toBe(songs.get(key));
        songs.set(key, score!);
        bands.add(rateSongDifficulty(entry, instrumental));
      }
      expect(bands).toEqual(new Set(['beginner', 'medium', 'advanced']));
    }
  });

  it('does not reuse scores after audio revisions or corrected metadata', () => {
    const entry = entries[0]!;
    for (const stale of [
      { ...entry, libraryVersion: 'new-audio' },
      { ...entry, key: 'changed-key' },
      { ...entry, cueTimesSec: entry.cueTimesSec.map(t => t + .1) },
      { ...entry, id: 'new-excerpt' },
    ]) {
      expect(rateSongDifficulty(stale)).toBe('unrated');
      expect(matchesSongDifficulty(stale, 'all')).toBe(true);
      for (const band of ['beginner', 'medium', 'advanced'] as const) {
        expect(matchesSongDifficulty(stale, band)).toBe(false);
      }
    }
  });

  it('uses the selected mix consistently for filtering and displayed exercise labels', () => {
    const entry = entries.find(e => rateSongDifficulty(e) !== rateSongDifficulty(e, true))!;
    expect(entry).toBeDefined();
    const band = rateSongDifficulty(entry, true);
    if (band === 'unrated') throw new Error('Expected a rated instrumental');
    const options = { difficulty: band, selectedArtists: null, progressFilter: 'all' as const };
    expect(filterSongEntries([entry], options, {})).toEqual([]);
    expect(filterSongEntries([entry], { ...options, instrumentalOnly: true }, {})).toEqual([entry]);
    expect(songClipToExercise(entry, '/rotation-clips/', true).song?.difficulty).toBe(band);
  });

  it('keeps unscored Songbook on its existing chord-count system', () => {
    const entry = { ...entries[0]!, collection: 'manual' as const };
    const chords = [{ rootPc: 0, quality: 'maj' as const }, { rootPc: 7, quality: 'maj' as const }];
    expect(countUniqueChords([...chords, ...chords])).toBe(2);
    expect(rateSongDifficulty({ ...entry, chords })).toBe('beginner');
    expect(rateSongDifficulty({ ...entry, chords: [0, 2, 4, 5].map(rootPc => ({ rootPc, quality: 'maj' })) })).toBe('advanced');
  });
});
