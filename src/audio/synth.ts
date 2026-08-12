import type { Chord, Exercise } from '../theory/types';
import type { PlayCallbacks, SynthAudioSource } from './synthSource';

class LazySynthAudioSource {
  private source: SynthAudioSource | null = null;
  private loading: Promise<SynthAudioSource> | null = null;

  private async getSource(): Promise<SynthAudioSource> {
    if (this.source) return this.source;
    this.loading ??= import('./synthSource').then(({ SynthAudioSource }) => {
      this.source = new SynthAudioSource();
      return this.source;
    });
    return this.loading;
  }

  async play(
    exercise: Exercise,
    tempoBpm: number,
    callbacks: PlayCallbacks = {},
    startIndex = 0,
  ): Promise<void> {
    const source = await this.getSource();
    return source.play(exercise, tempoBpm, callbacks, startIndex);
  }

  async playChord(chord: Chord, key: string): Promise<void> {
    const source = await this.getSource();
    return source.playChord(chord, key);
  }

  async playNote(note: string, duration = 1.4): Promise<void> {
    const source = await this.getSource();
    return source.playNote(note, duration);
  }

  stop(): void {
    this.source?.stop();
  }
}

export const synth = new LazySynthAudioSource();
