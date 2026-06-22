import { describe, it, expect } from 'vitest';
import { chordToNotes, randomKey, KEYS } from './voicing';
import { toRoman, chordsEqual, DIATONIC_MAJOR } from './chords';

describe('chordToNotes', () => {
  it('renders a I major triad in C', () => {
    expect(chordToNotes({ rootPc: 0, quality: 'maj' }, 'C')).toEqual(['C3', 'E3', 'G3']);
  });

  it('renders a vi minor triad in C', () => {
    expect(chordToNotes({ rootPc: 9, quality: 'min' }, 'C')).toEqual(['A3', 'C4', 'E4']);
  });

  it('transposes with the key', () => {
    const [root] = chordToNotes({ rootPc: 0, quality: 'maj' }, 'D');
    expect(root).toBe('D3');
  });
});

describe('toRoman', () => {
  it('labels the diatonic major-key chords', () => {
    expect(DIATONIC_MAJOR.map(toRoman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi']);
  });
});

describe('randomKey', () => {
  it('returns a supported key', () => {
    expect(KEYS).toContain(randomKey());
  });
});

describe('chordsEqual', () => {
  it('matches identity and rejects differences', () => {
    expect(chordsEqual({ rootPc: 7, quality: 'maj' }, { rootPc: 7, quality: 'maj' })).toBe(true);
    expect(chordsEqual({ rootPc: 7, quality: 'maj' }, { rootPc: 7, quality: 'min' })).toBe(false);
  });
});
