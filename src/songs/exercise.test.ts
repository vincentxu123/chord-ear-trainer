import { describe, expect, it } from 'vitest';
import { songClipToExercise } from './exercise';
import type { SongClipManifestEntry } from './types';

const entry: SongClipManifestEntry = {
  id: 'jie-kou-m009',
  file: 'jie-kou-m009.mp3',
  instrumentalFile: 'jie-kou-m009-instrumental.mp3',
  title: '借口 / Jie Kou',
  artist: '周杰倫 / Jay Chou',
  startMeasure: 9,
  endMeasure: 12,
  key: 'D',
  mode: 'major',
  bpm: 65.4,
  durationSec: 14.6,
  chords: [
    { rootPc: 0, quality: 'maj' },
    { rootPc: 9, quality: 'min' },
    { rootPc: 4, quality: 'min' },
  ],
  cueTimesSec: [0, 1.8, 3.6],
  measureChordCounts: [1, 1, 1, 0],
};

describe('songClipToExercise', () => {
  it('preserves exact recording cues and measure grouping', () => {
    const exercise = songClipToExercise(entry, '/song-clips/');
    expect(exercise.source).toBe('recording');
    expect(exercise.progression.chords).toEqual(entry.chords);
    expect(exercise.media?.cueTimesSec).toEqual(entry.cueTimesSec);
    expect(exercise.song?.measureChordCounts).toEqual(entry.measureChordCounts);
    expect(exercise.song?.difficulty).toBe('beginner');
    expect(exercise.song?.uniqueChordCount).toBe(3);
    expect(exercise.media?.url).toBe('/song-clips/jie-kou-m009.mp3');
  });

  it('uses the instrumental file without changing exercise timing', () => {
    const exercise = songClipToExercise(entry, '/song-clips/', true);

    expect(exercise.media?.url).toBe('/song-clips/jie-kou-m009-instrumental.mp3');
    expect(exercise.media?.cueTimesSec).toEqual(entry.cueTimesSec);
    expect(exercise.media?.durationSec).toBe(entry.durationSec);
  });
});
