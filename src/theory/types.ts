// v1 vocabulary: MAJOR and MINOR triads only — no diminished/augmented yet.
export type Quality = 'maj' | 'min';

// A chord is defined RELATIVE to the tonic: the number of semitones its root
// sits above the tonic (0-11) + its quality. This single model covers both
// diatonic and chromatic / out-of-key chords, and lets the same root carry
// either quality.
export interface Chord {
  rootPc: number; // 0-11 semitones above the tonic
  quality: Quality;
}

export interface Progression {
  id: string;
  name: string; // human label, e.g. "I-V-vi-IV"
  chords: Chord[];
  beatsPerChord: number;
}

export type AudioSourceKind = 'synth' | 'generated' | 'youtube';

// One concrete playable instance of a progression, shared by the engine and
// every AudioSource implementation.
export interface Exercise {
  progression: Progression;
  key: string; // absolute key: randomized for synth, fixed for media
  source: AudioSourceKind;
  styleId?: string;
}
