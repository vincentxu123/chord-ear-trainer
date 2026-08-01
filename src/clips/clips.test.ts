import { describe, expect, it } from 'vitest';
import {
  chordToMusicgenToken,
  clipDurationSec,
  exactClipDurationSec,
  progressionToTextChords,
} from './musicgenChords';
import { randomClipSpec, CLIP_CHORD_COUNT } from './spec';
import { clipToExercise } from './exercise';
import { chordsEqual, DIATONIC_MAJOR, DIATONIC_MINOR } from '../theory/chords';
import type { ClipManifestEntry } from './types';
import type { Chord } from '../theory/types';

describe('chordToMusicgenToken', () => {
  it('renders qualities in MusicGen syntax', () => {
    expect(chordToMusicgenToken({ rootPc: 0, quality: 'maj' }, 'C')).toBe('C');
    expect(chordToMusicgenToken({ rootPc: 9, quality: 'min' }, 'C')).toBe('A:min');
    expect(chordToMusicgenToken({ rootPc: 11, quality: 'dim' }, 'C')).toBe('B:dim');
  });

  it('resolves relative roots against the key, wrapping the octave', () => {
    expect(chordToMusicgenToken({ rootPc: 5, quality: 'maj' }, 'Bb')).toBe('Eb');
    expect(chordToMusicgenToken({ rootPc: 7, quality: 'maj' }, 'A')).toBe('E');
    expect(chordToMusicgenToken({ rootPc: 10, quality: 'maj' }, 'E')).toBe('D');
  });

  it('rejects invalid keys', () => {
    expect(() => chordToMusicgenToken({ rootPc: 0, quality: 'maj' }, 'X')).toThrow();
  });
});

describe('progressionToTextChords', () => {
  const IVviIV: Chord[] = [
    { rootPc: 0, quality: 'maj' },
    { rootPc: 7, quality: 'maj' },
    { rootPc: 9, quality: 'min' },
    { rootPc: 5, quality: 'maj' },
  ];

  it('emits one token per bar, repeated per pass', () => {
    expect(progressionToTextChords(IVviIV, 'C', 2)).toBe('C G A:min F C G A:min F');
    expect(progressionToTextChords(IVviIV, 'G', 1)).toBe('G D E:min C');
  });
});

describe('clipDurationSec', () => {
  it('covers all passes, rounded up to whole seconds for the model', () => {
    // 2 passes * 4 chords * 4 beats = 32 beats at 96 BPM = 20s exactly
    expect(exactClipDurationSec(4, 4, 96, 2)).toBe(20);
    expect(clipDurationSec(4, 4, 96, 2)).toBe(20);
    // 32 beats at 90 BPM = 21.33s -> request 22, play exactly 21.33
    expect(exactClipDurationSec(4, 4, 90, 2)).toBeCloseTo(21.333, 2);
    expect(clipDurationSec(4, 4, 90, 2)).toBe(22);
  });
});

describe('randomClipSpec', () => {
  it('produces valid diatonic 4-chord specs within the model limits', () => {
    for (let i = 0; i < 200; i++) {
      const spec = randomClipSpec();
      expect(spec.chords).toHaveLength(CLIP_CHORD_COUNT);
      const pool = spec.mode === 'major' ? DIATONIC_MAJOR : DIATONIC_MINOR;
      for (const chord of spec.chords) {
        expect(pool.some((p) => chordsEqual(p, chord))).toBe(true);
      }
      const tonic: Chord = { rootPc: 0, quality: spec.mode === 'major' ? 'maj' : 'min' };
      expect(spec.chords.some((c) => chordsEqual(c, tonic))).toBe(true);
      expect(spec.durationSec).toBeLessThanOrEqual(30); // model generation ceiling
      expect(spec.textChords.split(' ')).toHaveLength(CLIP_CHORD_COUNT * spec.passes);
    }
  });

  it('uses the provided style override and appends harmony-clarity cues', () => {
    const style = randomClipSpec('my style').style;
    expect(style.startsWith('my style')).toBe(true);
    expect(style).toContain('prominent loud bass line');
  });
});

describe('clipToExercise', () => {
  const entry: ClipManifestEntry = {
    id: 'clip-0001',
    file: 'clip-0001.mp3',
    key: 'Eb',
    mode: 'major',
    bpm: 92,
    beatsPerChord: 4,
    durationSec: 21,
    chords: [
      { rootPc: 0, quality: 'maj' },
      { rootPc: 9, quality: 'min' },
      { rootPc: 5, quality: 'maj' },
      { rootPc: 7, quality: 'maj' },
    ],
    style: 'indie rock',
  };

  it('maps a manifest entry to a playable exercise', () => {
    const exercise = clipToExercise(entry, '/clips/');
    expect(exercise.source).toBe('generated');
    expect(exercise.key).toBe('Eb');
    expect(exercise.mode).toBe('major');
    expect(exercise.progression.chords).toEqual(entry.chords);
    expect(exercise.progression.beatsPerChord).toBe(4);
    expect(exercise.media).toEqual({ url: '/clips/clip-0001.mp3', bpm: 92, durationSec: 21 });
  });
});
