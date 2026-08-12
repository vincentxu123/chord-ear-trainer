import { describe, expect, it } from 'vitest';
import type { Chord } from '../theory/types';
import {
  countUniqueChords,
  matchesSongDifficulty,
  rateSongDifficulty,
} from './difficulty';

const chord = (rootPc: number, quality: Chord['quality'] = 'maj'): Chord => ({
  rootPc,
  quality,
});

describe('song difficulty', () => {
  it('counts repeated chords only once', () => {
    expect(countUniqueChords([chord(0), chord(5), chord(0), chord(5)])).toBe(2);
  });

  it('rates up to 3 unique chords as beginner', () => {
    expect(rateSongDifficulty([chord(0), chord(5), chord(7)])).toBe('beginner');
  });

  it('rates 4 or more unique chords as advanced', () => {
    expect(rateSongDifficulty([chord(0), chord(2), chord(4), chord(5)])).toBe('advanced');
    const chords = [0, 2, 4, 5, 7, 9].map((rootPc) => chord(rootPc));
    expect(rateSongDifficulty(chords)).toBe('advanced');
  });

  it('lets the all filter include every difficulty', () => {
    expect(matchesSongDifficulty([chord(0), chord(5)], 'all')).toBe(true);
    expect(matchesSongDifficulty([chord(0), chord(5)], 'advanced')).toBe(false);
  });
});
