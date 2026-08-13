import { describe, it, expect } from 'vitest';
import { generateRound, scoreAttempt } from './round';
import { chordPool, isChromatic } from '../theory/chords';
import type { PracticeSettings } from '../store/settings';

const settings: PracticeSettings = {
  soundSource: 'synth',
  tempoBpm: 280,
  progressionLength: 4,
  includeChromatic: false,
  includeDiminished: false,
  randomizeKey: true,
  songDifficulty: 'all',
  songProgressFilter: 'learning',
  selectedArtists: null,
  playChordOnSelection: false,
};

describe('generateRound', () => {
  it('produces an exercise of the requested length from the mode pool', () => {
    const ex = generateRound(settings);
    expect(ex.progression.chords).toHaveLength(4);
    expect(ex.source).toBe('synth');
    const pool = chordPool(ex.mode, false);
    for (const chord of ex.progression.chords) {
      expect(pool.some((c) => c.rootPc === chord.rootPc && c.quality === chord.quality)).toBe(true);
    }
  });

  it('does not force the first chord to the tonic', () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const c = generateRound(settings).progression.chords[0]!;
      firsts.add(`${c.rootPc}:${c.quality}`);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('mixes major and minor modes', () => {
    const modes = new Set<string>();
    for (let i = 0; i < 80; i++) modes.add(generateRound(settings).mode);
    expect(modes.has('major')).toBe(true);
    expect(modes.has('minor')).toBe(true);
  });

  it('generates random (non-curated) progressions', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateRound(settings).progression.id.startsWith('random-')).toBe(true);
    }
  });

  it('always includes the tonic (mode-aware), though not necessarily first', () => {
    let nonTonicFirst = 0;
    for (let i = 0; i < 80; i++) {
      const ex = generateRound(settings);
      const tonicQuality = ex.mode === 'minor' ? 'min' : 'maj';
      const hasTonic = ex.progression.chords.some(
        (c) => c.rootPc === 0 && c.quality === tonicQuality,
      );
      expect(hasTonic).toBe(true);
      const first = ex.progression.chords[0]!;
      if (!(first.rootPc === 0 && first.quality === tonicQuality)) nonTonicFirst++;
    }
    expect(nonTonicFirst).toBeGreaterThan(0);
  });

  it('includes both the tonic and a chromatic chord when chromatic is on', () => {
    const chromaticSettings = { ...settings, includeChromatic: true };
    for (let i = 0; i < 80; i++) {
      const ex = generateRound(chromaticSettings);
      const tonicQuality = ex.mode === 'minor' ? 'min' : 'maj';
      expect(ex.progression.chords.some((c) => c.rootPc === 0 && c.quality === tonicQuality)).toBe(true);
      expect(ex.progression.chords.some((c) => isChromatic(c, ex.mode))).toBe(true);
    }
  });

  it('avoids back-to-back duplicate chords', () => {
    for (let i = 0; i < 50; i++) {
      const chords = generateRound(settings).progression.chords;
      for (let j = 1; j < chords.length; j++) {
        expect(chords[j]).not.toEqual(chords[j - 1]);
      }
    }
  });

  it('honors a fixed key when randomizeKey is off', () => {
    expect(generateRound({ ...settings, randomizeKey: false }).key).toBe('C');
  });

  it('only uses diatonic chords when chromatic is off', () => {
    for (let i = 0; i < 50; i++) {
      const ex = generateRound(settings);
      expect(ex.progression.chords.some((c) => isChromatic(c, ex.mode))).toBe(false);
    }
  });

  it('includes a chromatic chord every round when chromatic is on', () => {
    const chromaticSettings = { ...settings, includeChromatic: true };
    for (let i = 0; i < 50; i++) {
      const ex = generateRound(chromaticSettings);
      expect(ex.progression.chords.some((c) => isChromatic(c, ex.mode))).toBe(true);
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

  it('scores a perfect answer across all slots', () => {
    const result = scoreAttempt(progression.chords, progression);
    expect(result.correctCount).toBe(4);
    expect(result.total).toBe(4);
  });

  it('scores partial and missing answers', () => {
    const answer = [
      { rootPc: 0, quality: 'maj' as const }, // correct
      { rootPc: 9, quality: 'min' as const }, // wrong
      null, // missing
      { rootPc: 5, quality: 'maj' as const }, // correct
    ];
    const result = scoreAttempt(answer, progression);
    expect(result.correctCount).toBe(2);
    expect(result.total).toBe(4);
    expect(result.perSlot[1].correct).toBe(false);
    expect(result.perSlot[2].given).toBeNull();
  });

  it('excludes leading given slots from the score total', () => {
    const answer = [
      { rootPc: 7, quality: 'maj' as const }, // would be wrong, but given
      { rootPc: 7, quality: 'maj' as const },
      { rootPc: 9, quality: 'min' as const },
      { rootPc: 2, quality: 'min' as const }, // wrong
    ];
    const result = scoreAttempt(answer, progression, 1);
    expect(result.total).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.perSlot[0]).toEqual({
      expected: progression.chords[0],
      given: progression.chords[0],
      correct: true,
    });
  });
});
