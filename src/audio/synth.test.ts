import { beforeEach, describe, expect, it, vi } from 'vitest';

const { constructorSpy } = vi.hoisted(() => ({
  constructorSpy: vi.fn(),
}));

vi.mock('./synthSource', () => ({
  SynthAudioSource: class {
    constructor() {
      constructorSpy();
    }
  },
}));

describe('synth initialization', () => {
  beforeEach(() => {
    constructorSpy.mockClear();
    vi.resetModules();
  });

  it('initializes the audio source before the first playback gesture', async () => {
    await import('./synth');

    expect(constructorSpy).toHaveBeenCalledOnce();
  });
});
