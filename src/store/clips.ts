import { create } from 'zustand';
import type { Exercise } from '../theory/types';
import type { ClipManifest, ClipManifestEntry } from '../clips/types';
import { clipToExercise } from '../clips/exercise';

export type ClipLibraryStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

interface ClipStore {
  status: ClipLibraryStatus;
  entries: ClipManifestEntry[];
  load: () => Promise<void>;
}

const CLIPS_BASE = `${import.meta.env.BASE_URL}clips/`;

// Loads public/clips/manifest.json once at startup. 'unavailable' means the
// manifest is missing or empty — i.e. no clip library has been generated yet.
export const useClips = create<ClipStore>((set, get) => ({
  status: 'idle',
  entries: [],

  load: async () => {
    const { status } = get();
    if (status === 'loading' || status === 'ready') return;
    set({ status: 'loading' });
    try {
      const res = await fetch(`${CLIPS_BASE}manifest.json`);
      if (!res.ok) throw new Error(`manifest fetch failed: ${res.status}`);
      const manifest = (await res.json()) as ClipManifest;
      const entries = manifest.clips ?? [];
      set({ entries, status: entries.length ? 'ready' : 'unavailable' });
    } catch {
      set({ entries: [], status: 'unavailable' });
    }
  },
}));

let lastClipId: string | null = null;

// Random clip exercise, avoiding an immediate repeat of the previous clip.
// Returns null when the library isn't loaded (callers fall back to synth).
export function pickClipExercise(): Exercise | null {
  const { entries } = useClips.getState();
  if (!entries.length) return null;
  const pool = entries.length > 1 ? entries.filter((e) => e.id !== lastClipId) : entries;
  const entry = pool[Math.floor(Math.random() * pool.length)]!;
  lastClipId = entry.id;
  return clipToExercise(entry, CLIPS_BASE);
}
