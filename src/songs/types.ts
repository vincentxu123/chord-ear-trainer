import type { Chord, Mode } from '../theory/types';

export interface SongClipManifestEntry {
  collection?: 'manual' | 'rotation';
  // Runtime metadata supplied by the library loader, not written to manifests.
  libraryVersion?: string;
  id: string;
  file: string;
  instrumentalFile?: string;
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
  version: string;
  totalBytes?: number;
  refreshedAt?: string;
  sourceCount?: number;
  clips: SongClipManifestEntry[];
}
