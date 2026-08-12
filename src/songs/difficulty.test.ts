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

  it('rates up to 3 unique chords as easy', () => {
    expect(rateSongDifficulty([chord(0), chord(5), chord(7)])).toBe('easy');
  });

  it('rates 4 or 5 unique chords as medium', () => {
    expect(rateSongDifficulty([chord(0), chord(2), chord(4), chord(5)])).toBe('medium');
    expect(rateSongDifficulty([chord(0), chord(2), chord(4), chord(5), chord(7)])).toBe(
      'medium',
    );
  });

  it('rates 6 or more unique chords as hard', () => {
    const chords = [0, 2, 4, 5, 7, 9].map((rootPc) => chord(rootPc));
    expect(rateSongDifficulty(chords)).toBe('hard');
  });

  it('lets the all filter include every difficulty', () => {
    expect(matchesSongDifficulty([chord(0), chord(5)], 'all')).toBe(true);
    expect(matchesSongDifficulty([chord(0), chord(5)], 'hard')).toBe(false);
  });
});
