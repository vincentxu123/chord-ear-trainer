import * as Tone from 'tone';
import type { Exercise } from '../theory/types';
import { chordToNotes } from '../theory/voicing';

interface PlayCallbacks {
  onChord?: (index: number) => void;
  onEnd?: () => void;
}

// Tier-1 AudioSource: renders a relative progression live with a sampled piano,
// driven by the user's tempo. Sampled instrument + reverb per the realism notes.
export class SynthAudioSource {
  private readonly sampler: Tone.Sampler;
  private readonly reverb: Tone.Reverb;
  private readonly ready: Promise<unknown>;

  constructor() {
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.25 }).toDestination();
    this.sampler = new Tone.Sampler({
      urls: {
        C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3',
        C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3',
        C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3',
        C5: 'C5.mp3',
      },
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      release: 1,
    }).connect(this.reverb);
    this.ready = Tone.loaded();
  }

  async play(exercise: Exercise, tempoBpm: number, cb: PlayCallbacks = {}): Promise<void> {
    await Tone.start(); // must be called from a user gesture
    await this.ready;
    this.stop();

    const { chords, beatsPerChord } = exercise.progression;
    const transport = Tone.getTransport();
    const draw = Tone.getDraw();

    // BPM drives the real-time spacing; chords are scheduled at tempo-relative
    // tick positions, so the tempo setting actually controls playback speed.
    transport.bpm.value = tempoBpm;
    const ticksPerChord = beatsPerChord * transport.PPQ;
    const chordSeconds = beatsPerChord * (60 / tempoBpm);

    chords.forEach((chord, i) => {
      const notes = chordToNotes(chord, exercise.key);
      transport.schedule((time) => {
        this.sampler.triggerAttackRelease(notes, chordSeconds * 0.95, time);
        if (cb.onChord) draw.schedule(() => cb.onChord!(i), time);
      }, `${i * ticksPerChord}i`);
    });

    transport.schedule((time) => {
      if (cb.onEnd) draw.schedule(() => cb.onEnd!(), time);
    }, `${chords.length * ticksPerChord}i`);

    transport.start();
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.position = 0;
  }

  dispose(): void {
    this.sampler.dispose();
    this.reverb.dispose();
  }
}

export const synth = new SynthAudioSource();
