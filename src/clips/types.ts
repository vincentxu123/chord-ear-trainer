import type { Chord, Mode } from '../theory/types';

// One generated clip in public/clips/. The chords are the exercise's answer
// key, known at generation time (they were the model's input), stored in the
// app's relative {rootPc, quality} form.
export interface ClipManifestEntry {
  id: string;
  file: string; // filename relative to the manifest's directory
  key: string; // absolute tonic, e.g. "Eb"
  mode: Mode;
  bpm: number;
  beatsPerChord: number;
  durationSec: number;
  chords: Chord[];
  style: string; // the style prompt used at generation time
  seed?: number;
}

export interface ClipManifest {
  clips: ClipManifestEntry[];
}
