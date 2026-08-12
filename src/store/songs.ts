import { create } from 'zustand';
import type { Exercise } from '../theory/types';
import { songClipToExercise } from '../songs/exercise';
import { matchesSongDifficulty, type SongDifficulty } from '../songs/difficulty';
import type { SongClipManifest, SongClipManifestEntry } from '../songs/types';

export type SongLibraryStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

interface SongStore {
  status: SongLibraryStatus;
  entries: SongClipManifestEntry[];
  load: () => Promise<void>;
}

const SONGS_BASE = `${import.meta.env.BASE_URL}song-clips/`;

export const useSongs = create<SongStore>((set, get) => ({
  status: 'idle',
  entries: [],

  load: async () => {
    const { status } = get();
    if (status === 'loading' || status === 'ready') return;
    set({ status: 'loading' });
    try {
      const response = await fetch(`${SONGS_BASE}manifest.json`);
      if (!response.ok) throw new Error(`song manifest fetch failed: ${response.status}`);
      const manifest = (await response.json()) as SongClipManifest;
      const entries = manifest.clips ?? [];
      set({ entries, status: entries.length ? 'ready' : 'unavailable' });
    } catch {
      set({ entries: [], status: 'unavailable' });
    }
  },
}));

let lastSongClipId: string | null = null;

export function pickSongExercise(difficulty: SongDifficulty = 'all'): Exercise | null {
  const { entries } = useSongs.getState();
  const matchingEntries = entries.filter((entry) =>
    matchesSongDifficulty(entry.chords, difficulty),
  );
  if (!matchingEntries.length) return null;
  const pool =
    matchingEntries.length > 1
      ? matchingEntries.filter((entry) => entry.id !== lastSongClipId)
      : matchingEntries;
  const entry = pool[Math.floor(Math.random() * pool.length)]!;
  lastSongClipId = entry.id;
  return songClipToExercise(entry, SONGS_BASE);
}
