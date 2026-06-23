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

// One concrete playable instance of a progression, shared by the engine and
// every AudioSource implementation.
export interface Exercise {
  progression: Progression;
  key: string; // absolute tonic: randomized for synth, fixed for media
  mode: Mode;
  source: AudioSourceKind;
  styleId?: string;
  // Media tiers (generated / youtube) only:
  audioPath?: string; // file URL for the GeneratedAudioSource
  chordTimesSec?: number[]; // onset of each chord within the clip
  startSec?: number; // playback window
  endSec?: number;
}

// A pre-annotated music snippet (e.g. a Suno-generated chorus) plus its verified
// relative chord progression. Produced by the offline pipeline, consumed by the
// app. See REAL_MUSIC_PROPOSAL.md §3.
export interface ClipRecord {
  id: string;
  title: string;
  source: 'generated';
  licenseNote?: string;
  audioPath: string; // served from public/, e.g. '/clips/clip-001.mp3'
  key: string; // absolute tonic (fixed — real audio can't transpose)
  mode: Mode;
  chords: Chord[]; // relative progression (rootPc + quality)
  chordTimesSec: number[]; // onset of each chord
  durationSec: number;
  startSec?: number;
  endSec?: number;
  verified: boolean;
  autoLabeled?: boolean; // labeled by the clipgen pipeline rather than by hand
  instrumental?: boolean;
}
