import { create } from 'zustand';
import type { Exercise } from '../theory/types';
import { songClipToExercise } from '../songs/exercise';
import type { SongClipManifest, SongClipManifestEntry } from '../songs/types';
import { filterSongEntries, type SongSelectionOptions } from '../songs/selection';
import { useProgress } from './progress';

export type SongLibraryStatus = 'idle' | 'loading' | 'ready' | 'unavailable';
export type OfflineLibraryStatus =
  | 'checking'
  | 'not-downloaded'
  | 'partial'
  | 'downloading'
  | 'ready'
  | 'error';

interface SongStore {
  status: SongLibraryStatus;
  entries: SongClipManifestEntry[];
  version: string;
  totalBytes: number;
  cachedIds: Set<string>;
  cachedCount: number;
  offlineStatus: OfflineLibraryStatus;
  offlineError: string | null;
  load: () => Promise<void>;
  downloadOffline: () => Promise<void>;
  removeOffline: () => Promise<void>;
}

const SONGS_BASE = `${import.meta.env.BASE_URL}song-clips/`;
export const SONG_CACHE_NAME = 'song-clips-offline-v1';
const SONG_METADATA_CACHE_NAME = 'song-library-metadata-v1';

export function songClipUrl(file: string, version: string): string {
  return `${SONGS_BASE}${file}?library=${encodeURIComponent(version)}`;
}

function cacheSupported(): boolean {
  return typeof caches !== 'undefined';
}

function entryAudioFiles(entry: SongClipManifestEntry): string[] {
  return entry.instrumentalFile ? [entry.file, entry.instrumentalFile] : [entry.file];
}

async function cachedSongIds(
  entries: SongClipManifestEntry[],
  version: string,
): Promise<Set<string>> {
  if (!cacheSupported()) return new Set();
  const cache = await caches.open(SONG_CACHE_NAME);
  const matches = await Promise.all(
    entries.map(async (entry) => {
      const cached = await Promise.all(
        entryAudioFiles(entry).map((file) => cache.match(songClipUrl(file, version))),
      );
      return cached.every(Boolean) ? entry.id : null;
    }),
  );
  return new Set(matches.filter((id): id is string => id !== null));
}

function offlineStatusFor(cachedCount: number, totalCount: number): OfflineLibraryStatus {
  if (totalCount > 0 && cachedCount === totalCount) return 'ready';
  if (cachedCount > 0) return 'partial';
  return 'not-downloaded';
}

export const useSongs = create<SongStore>((set, get) => ({
  status: 'idle',
  entries: [],
  version: '',
  totalBytes: 0,
  cachedIds: new Set(),
  cachedCount: 0,
  offlineStatus: 'checking',
  offlineError: null,

  load: async () => {
    const { status } = get();
    if (status === 'loading' || status === 'ready') return;
    set({ status: 'loading', offlineStatus: 'checking', offlineError: null });
    try {
      const response = await fetch(`${SONGS_BASE}manifest.json`);
      if (!response.ok) throw new Error(`song manifest fetch failed: ${response.status}`);
      const cacheableResponse = response.clone();
      const manifest = (await response.json()) as SongClipManifest;
      const entries = manifest.clips ?? [];
      const version = manifest.version ?? 'unversioned';
      if (cacheSupported()) {
        try {
          const metadataCache = await caches.open(SONG_METADATA_CACHE_NAME);
          await metadataCache.put(`${SONGS_BASE}manifest.json`, cacheableResponse);
        } catch {
          // Online practice should still work if browser storage is unavailable.
        }
      }
      const cachedIds = await cachedSongIds(entries, version);
      set({
        entries,
        version,
        totalBytes: manifest.totalBytes ?? 0,
        cachedIds,
        cachedCount: cachedIds.size,
        offlineStatus: offlineStatusFor(cachedIds.size, entries.length),
        status: entries.length ? 'ready' : 'unavailable',
      });
    } catch {
      set({
        entries: [],
        cachedIds: new Set(),
        cachedCount: 0,
        status: 'unavailable',
        offlineStatus: 'error',
        offlineError: 'The Real Music library could not be loaded.',
      });
    }
  },

  downloadOffline: async () => {
    const { entries, version } = get();
    if (!entries.length || !cacheSupported()) {
      set({
        offlineStatus: 'error',
        offlineError: 'Offline downloads are not supported in this browser.',
      });
      return;
    }

    set({ offlineStatus: 'downloading', offlineError: null });
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        await navigator.storage.persist();
      }
      const cache = await caches.open(SONG_CACHE_NAME);
      let cursor = 0;
      let completed = 0;
      const downloadedIds = new Set<string>();

      const worker = async () => {
        while (cursor < entries.length) {
          const entry = entries[cursor++];
          if (!entry) return;
          for (const file of entryAudioFiles(entry)) {
            const url = songClipUrl(file, version);
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`download failed: ${response.status}`);
            await cache.put(url, response.clone());
          }
          downloadedIds.add(entry.id);
          completed += 1;
          set({ cachedIds: new Set(downloadedIds), cachedCount: completed });
        }
      };

      await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
      const expectedUrls = new Set(
        entries.flatMap((entry) =>
          entryAudioFiles(entry).map(
            (file) => new URL(songClipUrl(file, version), window.location.href).href,
          ),
        ),
      );
      const cachedRequests = await cache.keys();
      await Promise.all(
        cachedRequests
          .filter((request) => !expectedUrls.has(request.url))
          .map((request) => cache.delete(request)),
      );
      set({
        cachedIds: downloadedIds,
        cachedCount: downloadedIds.size,
        offlineStatus: 'ready',
      });
    } catch {
      const cachedIds = await cachedSongIds(entries, version);
      set({
        cachedIds,
        cachedCount: cachedIds.size,
        offlineStatus: 'error',
        offlineError: 'Download interrupted. Try again to finish the library.',
      });
    }
  },

  removeOffline: async () => {
    if (cacheSupported()) await caches.delete(SONG_CACHE_NAME);
    set({
      cachedIds: new Set(),
      cachedCount: 0,
      offlineStatus: 'not-downloaded',
      offlineError: null,
    });
  },
}));

let lastSongClipId: string | null = null;

export function pickSongExercise(options: SongSelectionOptions): Exercise | null {
  const { entries, version, cachedIds } = useSongs.getState();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const availableEntries = offline
    ? entries.filter((entry) => cachedIds.has(entry.id))
    : entries;
  const matchingEntries = filterSongEntries(
    availableEntries,
    options,
    useProgress.getState().records,
  );
  if (!matchingEntries.length) return null;
  const pool =
    matchingEntries.length > 1
      ? matchingEntries.filter((entry) => entry.id !== lastSongClipId)
      : matchingEntries;
  const entry = pool[Math.floor(Math.random() * pool.length)]!;
  lastSongClipId = entry.id;
  return songClipToExercise(
    entry,
    SONGS_BASE,
    Boolean(options.instrumentalOnly),
    version || undefined,
  );
}

export function getSongExerciseById(id: string, instrumental: boolean): Exercise | null {
  const { entries, version } = useSongs.getState();
  const found = entries.find((candidate) => candidate.id === id);
  return found
    ? songClipToExercise(found, SONGS_BASE, instrumental, version || undefined)
    : null;
}
