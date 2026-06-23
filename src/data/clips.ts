import type { ClipRecord, Exercise } from '../theory/types';

// Loads the static clip list from public/clips.json. Swappable for a Supabase
// query later without touching the engine (see REAL_MUSIC_PROPOSAL.md §5).
export async function loadClips(): Promise<ClipRecord[]> {
  const res = await fetch('/clips.json');
  if (!res.ok) throw new Error(`Failed to load clips.json (${res.status})`);
  return (await res.json()) as ClipRecord[];
}

// Turn a clip record into the runtime Exercise the engine + AudioSource share.
export function clipToExercise(clip: ClipRecord): Exercise {
  return {
    progression: {
      id: clip.id,
      name: clip.title,
      chords: clip.chords,
      beatsPerChord: 0, // unused for media tiers; timing comes from chordTimesSec
    },
    key: clip.key,
    mode: clip.mode,
    source: 'generated',
    audioPath: clip.audioPath,
    chordTimesSec: clip.chordTimesSec,
    startSec: clip.startSec ?? 0,
    endSec: clip.endSec ?? clip.durationSec,
  };
}
