import { describe, expect, it } from 'vitest';
import type { Chord } from '../theory/types';
import { getSlotAuditionChord } from './slotAudition';

const submitted: Chord = { rootPc: 4, quality: 'min' };
const expected: Chord = { rootPc: 0, quality: 'maj' };

describe('getSlotAuditionChord', () => {
  it('plays the submitted chord while answering when previews are enabled', () => {
    expect(getSlotAuditionChord('answering', true, submitted, expected)).toBe(submitted);
  });

  it('does not play while answering when previews are disabled', () => {
    expect(getSlotAuditionChord('answering', false, submitted, expected)).toBeNull();
  });

  it('always plays the correct chord after the answer is revealed', () => {
    expect(getSlotAuditionChord('revealed', false, submitted, expected)).toBe(expected);
  });
});
