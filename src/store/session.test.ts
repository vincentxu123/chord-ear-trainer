import { beforeEach, describe, expect, it } from 'vitest';
import type { PracticeSettings } from './settings';
import { GIVEN_SLOT_COUNT, useSession } from './session';

const settings: PracticeSettings = {
  soundSource: 'synth',
  tempoBpm: 280,
  progressionLength: 4,
  includeChromatic: false,
  includeDiminished: false,
  randomizeKey: false,
  songDifficulty: 'all',
};

describe('session playback selection', () => {
  beforeEach(() => useSession.getState().newRound(settings));

  it('selects the given first chord without blocking answer entry', () => {
    expect(useSession.getState().activeSlot).toBe(0);

    const answer = { rootPc: 7, quality: 'maj' as const };
    useSession.getState().selectChord(answer);

    const state = useSession.getState();
    expect(state.answers[GIVEN_SLOT_COUNT]).toEqual(answer);
    expect(state.activeSlot).toBe(GIVEN_SLOT_COUNT + 1);
  });
});
