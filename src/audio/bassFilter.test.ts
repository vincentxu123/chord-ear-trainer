import { describe, expect, it } from 'vitest';
import {
  BASS_EMPHASIS_ORDER,
  BassFilterChain,
  OPEN_HZ,
  SOLO_HZ,
  bassFilterParams,
  nextBassEmphasis,
} from './bassFilter';

describe('bass emphasis', () => {
  it('cycles off, boost, solo and back to off', () => {
    expect(nextBassEmphasis('off')).toBe('boost');
    expect(nextBassEmphasis('boost')).toBe('solo');
    expect(nextBassEmphasis('solo')).toBe('off');
    expect(BASS_EMPHASIS_ORDER).toEqual(['off', 'boost', 'solo']);
  });

  it('leaves the signal untouched when off', () => {
    expect(bassFilterParams('off')).toEqual({
      shelfGainDb: 0,
      lowpassHz: OPEN_HZ,
      outputGain: 1,
    });
  });

  it('boosts the low shelf with reduced output for headroom', () => {
    const params = bassFilterParams('boost');
    expect(params.shelfGainDb).toBeGreaterThan(0);
    expect(params.lowpassHz).toBe(OPEN_HZ);
    expect(params.outputGain).toBeLessThan(1);
  });

  it('isolates the bass register with make-up gain in solo', () => {
    const params = bassFilterParams('solo');
    expect(params.lowpassHz).toBe(SOLO_HZ);
    expect(params.shelfGainDb).toBe(0);
    expect(params.outputGain).toBeGreaterThan(1);
  });

  it('falls back to off for an unknown stored value', () => {
    expect(bassFilterParams('loud' as never)).toEqual(bassFilterParams('off'));
  });

  it('keeps direct playback where Web Audio is unavailable', () => {
    const chain = new BassFilterChain();
    expect(chain.attach({} as HTMLAudioElement)).toBe(false);
    chain.setMode('boost');
    expect(chain.emphasis).toBe('boost');
    expect(chain.attach({} as HTMLAudioElement)).toBe(false);
    expect(chain.engaged).toBe(false);
  });
});
