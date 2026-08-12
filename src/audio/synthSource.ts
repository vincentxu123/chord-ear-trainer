import * as Tone from 'tone';
import type { Chord, Exercise } from '../theory/types';
import { chordToNotes } from '../theory/voicing';

export interface PlayCallbacks {
  onChord?: (index: number) => void;
  onEnd?: () => void;
}

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
      baseUrl: `${import.meta.env.BASE_URL}piano-samples/`,
      release: 1,
    }).connect(this.reverb);
    this.ready = Tone.loaded();
  }

  async play(
    exercise: Exercise,
    tempoBpm: number,
    cb: PlayCallbacks = {},
    startIndex = 0,
  ): Promise<void> {
    await Tone.start();
    await this.ready;
    this.stop();

    const { chords, beatsPerChord } = exercise.progression;
    const transport = Tone.getTransport();
    const draw = Tone.getDraw();
    transport.bpm.value = tempoBpm;
    const ticksPerChord = beatsPerChord * transport.PPQ;
    const chordSeconds = beatsPerChord * (60 / tempoBpm);

    const firstChord = Math.max(0, Math.min(startIndex, chords.length - 1));
    chords.slice(firstChord).forEach((chord, offset) => {
      const index = firstChord + offset;
      const notes = chordToNotes(chord, exercise.key);
      transport.schedule((time) => {
        this.sampler.triggerAttackRelease(notes, chordSeconds * 0.95, time);
        if (cb.onChord) draw.schedule(() => cb.onChord!(index), time);
      }, `${offset * ticksPerChord}i`);
    });

    transport.schedule((time) => {
      if (cb.onEnd) draw.schedule(() => cb.onEnd!(), time);
    }, `${(chords.length - firstChord) * ticksPerChord}i`);
    transport.start();
  }

  async playChord(chord: Chord, key: string): Promise<void> {
    await Tone.start();
    await this.ready;
    this.sampler.triggerAttackRelease(chordToNotes(chord, key), 1.4);
  }

  async playNote(note: string, duration = 1.4): Promise<void> {
    await Tone.start();
    await this.ready;
    this.sampler.triggerAttackRelease(note, duration);
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.position = 0;
  }
}
