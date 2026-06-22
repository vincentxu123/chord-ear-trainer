import { describe, it, expect } from 'vitest';
import { generateRound, scoreAttempt } from './round';
import { DIATONIC_MAJOR, CHROMATIC_POOL, isChromatic } from '../theory/chords';
import type { PracticeSettings } from '../store/settings';

const settings: PracticeSettings = {
  tempoBpm: 90,
  progressionLength: 4,
  includeChromatic: false,
  allowedChords: DIATONIC_MAJOR,
  randomizeKey: true,
};

describe('generateRound', () => {
  it('produces an exercise of the requested length using allowed chords', () => {
    const ex = generateRound(settings);
    expect(ex.progression.chords).toHaveLength(4);
    expect(ex.source).toBe('synth');
    for (const chord of ex.progression.chords) {
      expect(DIATONIC_MAJOR.some((c) => c.rootPc === chord.rootPc && c.quality === chord.quality)).toBe(true);
    }
  });

  it('always starts on the tonic (I)', () => {
    for (let i = 0; i < 50; i++) {
      const first = generateRound(settings).progression.chords[0];
      expect(first).toEqual({ rootPc: 0, quality: 'maj' });
    }
  });

  it('honors a fixed key when randomizeKey is off', () => {
    expect(generateRound({ ...settings, randomizeKey: false }).key).toBe('C');
  });

  it('only uses diatonic chords when chromatic is off', () => {
    for (let i = 0; i < 50; i++) {
      const ex = generateRound(settings);
      expect(ex.progression.chords.some(isChromatic)).toBe(false);
    }
  });

  it('includes a chromatic chord every round when chromatic is on', () => {
    const chromaticSettings = {
      ...settings,
      includeChromatic: true,
      allowedChords: CHROMATIC_POOL,
    };
    for (let i = 0; i < 50; i++) {
      const ex = generateRound(chromaticSettings);
      expect(ex.progression.chords.some(isChromatic)).toBe(true);
      expect(ex.progression.chords[0]).toEqual({ rootPc: 0, quality: 'maj' });
    }
  });
});

describe('scoreAttempt', () => {
  const progression = {
    id: 't',
    name: 'I-V-vi-IV',
    beatsPerChord: 4,
    chords: [
      { rootPc: 0, quality: 'maj' as const },
      { rootPc: 7, quality: 'maj' as const },
      { rootPc: 9, quality: 'min' as const },
      { rootPc: 5, quality: 'maj' as const },
    ],
  };

  it('scores a perfect answer, excluding the given anchor', () => {
    const result = scoreAttempt(progression.chords, progression);
    expect(result.correctCount).toBe(3);
    expect(result.total).toBe(3);
    expect(result.perSlot[0].isAnchor).toBe(true);
  });

  it('scores partial and missing answers', () => {
    const answer = [
      { rootPc: 0, quality: 'maj' as const }, // anchor (not scored)
      { rootPc: 9, quality: 'min' as const }, // wrong
      null, // missing
      { rootPc: 5, quality: 'maj' as const }, // correct
    ];
    const result = scoreAttempt(answer, progression);
    expect(result.correctCount).toBe(1);
    expect(result.total).toBe(3);
    expect(result.perSlot[1].correct).toBe(false);
    expect(result.perSlot[2].given).toBeNull();
  });
});
