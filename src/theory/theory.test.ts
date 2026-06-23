import { describe, it, expect } from 'vitest';
import { chordToNotes, randomKey, KEYS } from './voicing';
import {
  toRoman,
  chordsEqual,
  dedupeChords,
  DIATONIC_MAJOR,
  DIATONIC_MINOR,
  chordPool,
  sortChordsForDisplay,
} from './chords';

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
    expect(DIATONIC_MAJOR.map((c) => toRoman(c, 'major'))).toEqual([
      'I', 'ii', 'iii', 'IV', 'V', 'vi',
    ]);
  });

  it('labels the diatonic minor-key chords', () => {
    expect(DIATONIC_MINOR.map((c) => toRoman(c, 'minor'))).toEqual([
      'i', 'III', 'iv', 'v', 'VI', 'VII',
    ]);
  });

  it('labels diminished triads with a degree symbol', () => {
    expect(toRoman({ rootPc: 11, quality: 'dim' }, 'major')).toBe('vii°');
    expect(toRoman({ rootPc: 2, quality: 'dim' }, 'minor')).toBe('ii°');
  });
});

describe('diminished pool', () => {
  it('adds vii° in major only when diminished is enabled', () => {
    expect(chordPool('major', false, false).map((c) => toRoman(c, 'major'))).not.toContain('vii°');
    expect(chordPool('major', false, true).map((c) => toRoman(c, 'major'))).toContain('vii°');
  });

  it('adds ii° in minor only when diminished is enabled', () => {
    expect(chordPool('minor', false, false).map((c) => toRoman(c, 'minor'))).not.toContain('ii°');
    expect(chordPool('minor', false, true).map((c) => toRoman(c, 'minor'))).toContain('ii°');
  });
});

describe('chordPool', () => {
  it('orders the full major chromatic pool by scale degree', () => {
    expect(chordPool('major', true).map((c) => toRoman(c, 'major'))).toEqual([
      'I',
      'ii',
      'II',
      'bIII',
      'iii',
      'III',
      'IV',
      'iv',
      'V',
      'bVI',
      'vi',
      'VI',
      'bVII',
    ]);
  });

  it('keeps diatonic chords in scale-degree order', () => {
    expect(sortChordsForDisplay(DIATONIC_MAJOR, 'major').map((c) => toRoman(c, 'major'))).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
    ]);
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

describe('dedupeChords', () => {
  it('removes duplicates by identity, preserving order', () => {
    const out = dedupeChords([
      { rootPc: 0, quality: 'maj' },
      { rootPc: 7, quality: 'maj' },
      { rootPc: 0, quality: 'maj' },
      { rootPc: 0, quality: 'min' },
    ]);
    expect(out).toEqual([
      { rootPc: 0, quality: 'maj' },
      { rootPc: 7, quality: 'maj' },
      { rootPc: 0, quality: 'min' },
    ]);
  });
});
