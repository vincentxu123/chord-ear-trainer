import { describe, expect, it } from 'vitest';
import { buildWrongAnswerIssueUrl } from './reportIssue';
import type { Exercise } from './theory/types';

const exercise: Exercise = {
  progression: {
    id: 'blue-m030',
    name: 'blue, measures 30–33',
    chords: [
      { rootPc: 0, quality: 'maj' },
      { rootPc: 7, quality: 'maj' },
    ],
    beatsPerChord: 1,
  },
  key: 'E',
  mode: 'major',
  source: 'recording',
  media: {
    url: '/song-clips/blue-m030.mp3',
    bpm: 65,
    durationSec: 14.7,
    cueTimesSec: [0, 1.843],
  },
  song: {
    title: 'blue',
    artist: 'yung kai',
    startMeasure: 30,
    endMeasure: 33,
    measureChordCounts: [1, 1, 0, 0],
    difficulty: 'beginner',
    uniqueChordCount: 2,
  },
};

describe('buildWrongAnswerIssueUrl', () => {
  it('prefills the exercise answer key and the listener submission', () => {
    const url = new URL(
      buildWrongAnswerIssueUrl(
        exercise,
        [
          { rootPc: 0, quality: 'maj' },
          { rootPc: 9, quality: 'min' },
        ],
        { perSlot: [], correctCount: 0, total: 1 },
        'https://example.com/practice',
      ),
    );

    expect(url.origin + url.pathname).toBe(
      'https://github.com/vincentxu123/chord-ear-trainer/issues/new',
    );
    expect(url.searchParams.get('title')).toContain('measures 30–33');
    expect(url.searchParams.get('body')).toContain('Clip ID: `blue-m030`');
    expect(url.searchParams.get('body')).toContain('Current answer key: I (E) – V (B)');
    expect(url.searchParams.get('body')).toContain('My submitted answer: I (E) – vi (C#m)');
  });
});
