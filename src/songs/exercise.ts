import type { Exercise } from '../theory/types';
import type { SongClipManifestEntry } from './types';
import { countUniqueChords, rateSongDifficulty } from './difficulty';

export function songClipToExercise(
  entry: SongClipManifestEntry,
  baseUrl: string,
  instrumental = false,
): Exercise {
  const file = instrumental && entry.instrumentalFile ? entry.instrumentalFile : entry.file;
  return {
    progression: {
      id: entry.id,
      name: `${entry.title}, measures ${entry.startMeasure}–${entry.endMeasure}`,
      chords: entry.chords,
      // Retained for the shared progression type. Recording playback uses the
      // exact cueTimesSec array instead of assuming uniform chord durations.
      beatsPerChord: 1,
    },
    key: entry.key,
    mode: entry.mode,
    source: 'recording',
    media: {
      url: `${baseUrl}${file}`,
      bpm: entry.bpm,
      durationSec: entry.durationSec,
      cueTimesSec: entry.cueTimesSec,
    },
    song: {
      title: entry.title,
      artist: entry.artist,
      startMeasure: entry.startMeasure,
      endMeasure: entry.endMeasure,
      measureChordCounts: entry.measureChordCounts,
      difficulty: rateSongDifficulty(entry.chords),
      uniqueChordCount: countUniqueChords(entry.chords),
    },
  };
}
