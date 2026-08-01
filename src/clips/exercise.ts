import type { Exercise } from '../theory/types';
import type { ClipManifestEntry } from './types';

// Turn a manifest entry into a playable exercise. baseUrl is the public URL
// of the clips directory (trailing slash included).
export function clipToExercise(entry: ClipManifestEntry, baseUrl: string): Exercise {
  return {
    progression: {
      id: entry.id,
      name: '',
      chords: entry.chords,
      beatsPerChord: entry.beatsPerChord,
    },
    key: entry.key,
    mode: entry.mode,
    source: 'generated',
    styleId: entry.style,
    media: {
      url: `${baseUrl}${entry.file}`,
      bpm: entry.bpm,
      durationSec: entry.durationSec,
    },
  };
}
