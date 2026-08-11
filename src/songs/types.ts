import type { Chord, Mode } from '../theory/types';

export interface SongClipManifestEntry {
  id: string;
  file: string;
  title: string;
  artist: string;
  startMeasure: number;
  endMeasure: number;
  key: string;
  mode: Mode;
  bpm: number;
  durationSec: number;
  chords: Chord[];
  cueTimesSec: number[];
  measureChordCounts: number[];
}

export interface SongClipManifest {
  clips: SongClipManifestEntry[];
}
