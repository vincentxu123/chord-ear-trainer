import { getExcerptStatus, type ExcerptProgress } from '../store/progress';
import type { SongProgressFilter } from '../store/settings';
import type { SongClipManifestEntry } from './types';
import { matchesSongDifficulty, type SongDifficulty } from './difficulty';

export interface SongSelectionOptions {
  difficulty: SongDifficulty;
  selectedArtists: string[] | null;
  progressFilter: SongProgressFilter;
}

export interface ArtistSummary {
  artist: string;
  songCount: number;
  excerptCount: number;
}

export interface ProgressSummary {
  unseen: number;
  needsPractice: number;
  mastered: number;
}

export function filterSongEntries(
  entries: SongClipManifestEntry[],
  options: SongSelectionOptions,
  records: Record<string, ExcerptProgress>,
): SongClipManifestEntry[] {
  return entries.filter((entry) => {
    if (!matchesSongDifficulty(entry.chords, options.difficulty)) return false;
    if (options.selectedArtists !== null && !options.selectedArtists.includes(entry.artist)) {
      return false;
    }
    if (
      options.progressFilter === 'learning' &&
      getExcerptStatus(entry.id, records) === 'mastered'
    ) {
      return false;
    }
    return true;
  });
}

export function summarizeProgress(
  entries: SongClipManifestEntry[],
  records: Record<string, ExcerptProgress>,
): ProgressSummary {
  return entries.reduce<ProgressSummary>(
    (summary, entry) => {
      const status = getExcerptStatus(entry.id, records);
      summary[status === 'needs-practice' ? 'needsPractice' : status] += 1;
      return summary;
    },
    { unseen: 0, needsPractice: 0, mastered: 0 },
  );
}

export function summarizeArtists(entries: SongClipManifestEntry[]): ArtistSummary[] {
  const artists = new Map<string, { titles: Set<string>; excerptCount: number }>();
  for (const entry of entries) {
    const current = artists.get(entry.artist) ?? { titles: new Set<string>(), excerptCount: 0 };
    current.titles.add(entry.title);
    current.excerptCount += 1;
    artists.set(entry.artist, current);
  }

  return [...artists.entries()]
    .map(([artist, summary]) => ({
      artist,
      songCount: summary.titles.size,
      excerptCount: summary.excerptCount,
    }))
    .sort((a, b) => a.artist.localeCompare(b.artist));
}
