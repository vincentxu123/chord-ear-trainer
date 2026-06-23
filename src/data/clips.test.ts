import { describe, it, expect } from 'vitest';
import { clipToExercise } from './clips';
import type { ClipRecord } from '../theory/types';

const clip: ClipRecord = {
  id: 'clip-x',
  title: 'Test',
  source: 'generated',
  audioPath: '/clips/clip-x.mp3',
  key: 'C',
  mode: 'major',
  chords: [
    { rootPc: 0, quality: 'maj' },
    { rootPc: 7, quality: 'maj' },
  ],
  chordTimesSec: [0, 3.5],
  durationSec: 7,
  verified: true,
};

describe('clipToExercise', () => {
  it('maps a clip record to a generated exercise', () => {
    const ex = clipToExercise(clip);
    expect(ex.source).toBe('generated');
    expect(ex.key).toBe('C');
    expect(ex.mode).toBe('major');
    expect(ex.audioPath).toBe('/clips/clip-x.mp3');
    expect(ex.chordTimesSec).toEqual([0, 3.5]);
    expect(ex.progression.chords).toEqual(clip.chords);
  });

  it('defaults the playback window to the full clip', () => {
    const ex = clipToExercise(clip);
    expect(ex.startSec).toBe(0);
    expect(ex.endSec).toBe(7);
  });
});
