import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickSongExercise, songClipUrl, useSongs } from './songs';
import type { SongClipManifestEntry } from '../songs/types';

const original: SongClipManifestEntry = {
  id: 'original-only',
  file: 'original-only.mp3',
  title: 'Original only',
  artist: 'Artist',
  startMeasure: 1,
  endMeasure: 4,
  key: 'C',
  mode: 'major',
  bpm: 100,
  durationSec: 10,
  chords: [
    { rootPc: 0, quality: 'maj' },
    { rootPc: 7, quality: 'maj' },
  ],
  cueTimesSec: [0, 5],
  measureChordCounts: [1, 1, 0, 0],
};

const instrumental: SongClipManifestEntry = {
  ...original,
  id: 'with-instrumental',
  file: 'with-instrumental.mp3',
  instrumentalFile: 'with-instrumental-instrumental.mp3',
};

describe('offline song URLs', () => {
  it('includes the library revision so updated audio cannot reuse a stale response', () => {
    expect(songClipUrl('example.mp3', 'revision 2')).toContain(
      'song-clips/example.mp3?library=revision%202',
    );
  });
});

describe('pickSongExercise', () => {
  beforeEach(() => {
    useSongs.setState({ status: 'ready', entries: [original, instrumental] });
  });

  it('only picks compatible entries in instrumental mode', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const exercise = pickSongExercise({
      difficulty: 'all',
      selectedArtists: null,
      progressFilter: 'all',
      instrumentalOnly: true,
    });

    expect(exercise?.progression.id).toBe('with-instrumental');
    expect(exercise?.media?.url).toContain('with-instrumental-instrumental.mp3');
    vi.restoreAllMocks();
  });
});
