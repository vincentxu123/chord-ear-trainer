import * as Tone from 'tone';
import type { Exercise } from '../theory/types';

interface PlayCallbacks {
  onChord?: (index: number) => void;
  onEnd?: () => void;
}

// Tier-2 AudioSource: plays a pre-rendered audio clip (e.g. a Suno chorus) and
// fires onChord at the clip's annotated chord onsets so the UI highlights the
// current chord — the same callback contract as SynthAudioSource.
export class GeneratedAudioSource {
  private player: Tone.Player | null = null;
  private loadedUrl: string | null = null;

  private async ensureLoaded(url: string): Promise<void> {
    if (this.loadedUrl === url && this.player) return;
    this.player?.dispose();
    this.player = new Tone.Player().toDestination();
    await this.player.load(url); // rejects if the file is missing
    this.loadedUrl = url;
  }

  async play(exercise: Exercise, cb: PlayCallbacks = {}): Promise<void> {
    await Tone.start(); // must be called from a user gesture
    const url = exercise.audioPath;
    if (!url) throw new Error('Exercise has no audioPath');
    await this.ensureLoaded(url);
    this.stop();

    const player = this.player!;
    const start = exercise.startSec ?? 0;
    const end = exercise.endSec ?? player.buffer.duration;
    const span = Math.max(0, end - start);
    const times = exercise.chordTimesSec ?? [];

    const transport = Tone.getTransport();
    const draw = Tone.getDraw();

    // Schedule in absolute seconds (numbers are seconds in Tone); independent of BPM.
    transport.schedule((time) => player.start(time, start, span), 0);
    times.forEach((t, i) => {
      const at = Math.max(0, t - start);
      if (at <= span && cb.onChord) {
        transport.schedule((time) => draw.schedule(() => cb.onChord!(i), time), at);
      }
    });
    if (cb.onEnd) {
      transport.schedule((time) => draw.schedule(() => cb.onEnd!(), time), span);
    }
    transport.start();
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.position = 0;
    this.player?.stop();
  }

  dispose(): void {
    this.player?.dispose();
    this.player = null;
    this.loadedUrl = null;
  }
}

export const generated = new GeneratedAudioSource();
