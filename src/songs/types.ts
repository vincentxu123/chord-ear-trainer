import type { Chord, Mode } from '../theory/types';

export interface SongClipManifestEntry {
  collection?: 'manual' | 'rotation';
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
