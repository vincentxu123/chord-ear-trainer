// Triad qualities. Diminished is opt-in (it completes the diatonic set: vii° in
// major, ii° in minor); augmented is not supported yet.
export type Quality = 'maj' | 'min' | 'dim';

// Tonal context of a round. Affects which chords are diatonic, how chords are
// labeled as Roman numerals, and the key label — not the audio itself.
export type Mode = 'major' | 'minor';

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

// Pre-rendered audio backing an exercise (e.g. a generated music clip). The
// bpm is the recording's tempo: it drives slot-highlight timing during
// playback, not playback speed.
export interface ExerciseMedia {
  url: string;
  bpm: number;
  durationSec: number;
}

// One concrete playable instance of a progression, shared by the engine and
// every AudioSource implementation.
export interface Exercise {
  progression: Progression;
  key: string; // absolute tonic: randomized for synth, fixed for media
  mode: Mode;
  source: AudioSourceKind;
  styleId?: string;
  media?: ExerciseMedia;
}
