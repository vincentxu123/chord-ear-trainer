import { useState } from 'react';
import {
  useSettings,
  TEMPO_MIN,
  TEMPO_MAX,
  LENGTH_MIN,
  LENGTH_MAX,
  type SongProgressFilter,
  type SoundSource,
} from '../store/settings';
import { useClips } from '../store/clips';
import { useSongs } from '../store/songs';
import { matchesSongDifficulty, type SongDifficulty } from '../songs/difficulty';
import {
  filterSongEntries,
  summarizeArtists,
  summarizeProgress,
} from '../songs/selection';
import { useProgress } from '../store/progress';

const SONG_DIFFICULTIES: { id: SongDifficulty; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'advanced', label: 'Advanced' },
];

const SONG_PROGRESS_FILTERS: { id: SongProgressFilter; label: string }[] = [
  { id: 'learning', label: 'Learn' },
  { id: 'all', label: 'Review all' },
];

export function SettingsPanel() {
  const [artistsExpanded, setArtistsExpanded] = useState(false);
  const [artistQuery, setArtistQuery] = useState('');
  const soundSource = useSettings((s) => s.soundSource);
  const tempoBpm = useSettings((s) => s.tempoBpm);
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const songDifficulty = useSettings((s) => s.songDifficulty);
  const songProgressFilter = useSettings((s) => s.songProgressFilter);
  const selectedArtists = useSettings((s) => s.selectedArtists);
  const playChordOnSelection = useSettings((s) => s.playChordOnSelection);
  const setSoundSource = useSettings((s) => s.setSoundSource);
  const setTempo = useSettings((s) => s.setTempo);
  const setLength = useSettings((s) => s.setLength);
  const setRandomizeKey = useSettings((s) => s.setRandomizeKey);
  const setIncludeChromatic = useSettings((s) => s.setIncludeChromatic);
  const setIncludeDiminished = useSettings((s) => s.setIncludeDiminished);
  const setSongDifficulty = useSettings((s) => s.setSongDifficulty);
  const setSongProgressFilter = useSettings((s) => s.setSongProgressFilter);
  const setSelectedArtists = useSettings((s) => s.setSelectedArtists);
  const setPlayChordOnSelection = useSettings((s) => s.setPlayChordOnSelection);
  const clipStatus = useClips((s) => s.status);
  const songStatus = useSongs((s) => s.status);
  const songEntries = useSongs((s) => s.entries);
  const progressRecords = useProgress((s) => s.records);
  const resetProgress = useProgress((s) => s.reset);

  const clipMode = soundSource === 'clips';
  const songMode = soundSource === 'songs';
  const mediaMode = clipMode || songMode;
  const clipsAvailable = clipStatus === 'ready';
  const songsAvailable = songStatus === 'ready';

  const artistSummaries = summarizeArtists(songEntries);
  const normalizedArtistQuery = artistQuery.trim().toLocaleLowerCase();
  const visibleArtistSummaries = normalizedArtistQuery
    ? artistSummaries.filter(({ artist }) =>
        artist.toLocaleLowerCase().includes(normalizedArtistQuery),
      )
    : artistSummaries;
  const allArtists = artistSummaries.map((summary) => summary.artist);
  const currentSongEntries = filterSongEntries(
    songEntries,
    {
      difficulty: songDifficulty,
      selectedArtists,
      progressFilter: 'all',
    },
    progressRecords,
  );
  const progressSummary = summarizeProgress(currentSongEntries, progressRecords);
  const learningCount = progressSummary.unseen + progressSummary.needsPractice;
  const selectedArtistCount =
    selectedArtists === null
      ? allArtists.length
      : allArtists.filter((artist) => selectedArtists.includes(artist)).length;

  const toggleArtist = (artist: string) => {
    const current = selectedArtists ?? allArtists;
    const next = current.includes(artist)
      ? current.filter((selected) => selected !== artist)
      : [...current, artist];
    setSelectedArtists(next.length === allArtists.length ? null : next);
  };

  const handleResetProgress = () => {
    if (
      typeof window !== 'undefined' &&
      window.confirm('Reset all excerpt progress? This cannot be undone.')
    ) {
      resetProgress();
    }
  };

  const lengths = Array.from(
    { length: LENGTH_MAX - LENGTH_MIN + 1 },
    (_, i) => LENGTH_MIN + i,
  );

  const sources: { id: SoundSource; label: string; disabled?: boolean }[] = [
    { id: 'synth', label: 'Piano' },
    { id: 'clips', label: 'Generated', disabled: !clipsAvailable },
    { id: 'songs', label: 'Real Music', disabled: !songsAvailable },
  ];

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <div>
        <span className="text-sm font-medium text-slate-300">Sound source</span>
        <div className="mt-2 flex gap-2">
          {sources.map(({ id, label, disabled }) => (
            <button
              key={id}
              onClick={() => setSoundSource(id)}
              disabled={disabled}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                id === soundSource
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {songMode && (
        <div>
          <span className="text-sm font-medium text-slate-300">Difficulty</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SONG_DIFFICULTIES.map(({ id, label }) => {
              const count = songEntries.filter((entry) =>
                matchesSongDifficulty(entry.chords, id),
              ).length;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={id === songDifficulty}
                  onClick={() => setSongDifficulty(id)}
                  disabled={count === 0}
                  className={`rounded-lg px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    id === songDifficulty
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {label}
                  <span className="ml-1 text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {songMode && (
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-300">Practice queue</span>
            <button
              type="button"
              onClick={handleResetProgress}
              disabled={!Object.keys(progressRecords).length}
              className="text-xs font-medium text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset
            </button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-900/50 p-1">
            {SONG_PROGRESS_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === songProgressFilter}
                onClick={() => setSongProgressFilter(id)}
                className={`rounded-md px-2 py-2 text-sm font-semibold transition ${
                  id === songProgressFilter
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {label}
                <span className="ml-1 text-xs opacity-70">
                  {id === 'learning' ? learningCount : currentSongEntries.length}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-slate-900/40 px-2 py-1.5 text-slate-400">
              <span className="block font-semibold text-slate-200">{progressSummary.unseen}</span>
              New
            </div>
            <div className="rounded-md bg-red-950/25 px-2 py-1.5 text-red-300/80">
              <span className="block font-semibold text-red-200">{progressSummary.needsPractice}</span>
              Retry
            </div>
            <div className="rounded-md bg-green-950/25 px-2 py-1.5 text-green-300/80">
              <span className="block font-semibold text-green-200">{progressSummary.mastered}</span>
              Mastered
            </div>
          </div>
        </div>
      )}

      {songMode && (
        <div>
          <button
            type="button"
            aria-expanded={artistsExpanded}
            onClick={() => setArtistsExpanded((expanded) => !expanded)}
            className="flex w-full items-center justify-between gap-3 rounded-lg text-left text-slate-300 transition hover:text-white"
          >
            <span>
              <span className="block text-sm font-medium">Artists</span>
              <span className="mt-1 block text-xs text-slate-400">
                {selectedArtistCount} of {allArtists.length} selected
              </span>
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`h-5 w-5 shrink-0 transition-transform ${artistsExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {artistsExpanded && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Search artists</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="8.5" cy="8.5" r="5" />
                    <path d="m12.5 12.5 4 4" strokeLinecap="round" />
                  </svg>
                  <input
                    type="search"
                    value={artistQuery}
                    onChange={(event) => setArtistQuery(event.target.value)}
                    placeholder="Search artists"
                    className="w-full rounded-md border border-slate-600 bg-slate-900/60 py-1.5 pl-8 pr-2 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-sky-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setSelectedArtists(null)}
                  disabled={!allArtists.length || selectedArtists === null}
                  className="shrink-0 rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedArtists([])}
                  disabled={!allArtists.length || selectedArtistCount === 0}
                  className="shrink-0 rounded border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  None
                </button>
              </div>
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/40 p-2">
                {visibleArtistSummaries.length ? (
                  visibleArtistSummaries.map(({ artist, songCount, excerptCount }) => {
                    const selected = selectedArtists === null || selectedArtists.includes(artist);
                    return (
                      <label
                        key={artist}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-200 hover:bg-slate-800"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleArtist(artist)}
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">{artist}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {songCount} {songCount === 1 ? 'song' : 'songs'} · {excerptCount}{' '}
                          {excerptCount === 1 ? 'excerpt' : 'excerpts'}
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-2 py-2 text-xs text-slate-400">
                    {artistSummaries.length ? 'No matching artists.' : 'No artists are available.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={playChordOnSelection}
            onChange={(event) => setPlayChordOnSelection(event.target.checked)}
            className="h-4 w-4"
          />
          Play piano sound when selecting a chord
        </label>
      </div>

      <div className={mediaMode ? 'opacity-40' : ''}>
        <label className="flex justify-between text-sm font-medium text-slate-300">
          <span>Tempo</span>
          <span className="text-slate-400">
            {mediaMode ? 'set by the recording' : `${tempoBpm} BPM`}
          </span>
        </label>
        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={tempoBpm}
          disabled={mediaMode}
          onChange={(e) => setTempo(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div className={mediaMode ? 'opacity-40' : ''}>
        <span className="text-sm font-medium text-slate-300">Chords</span>
        <div className="mt-2 flex gap-2">
          {lengths.map((n) => (
            <button
              key={n}
              onClick={() => setLength(n)}
              disabled={mediaMode}
              className={`h-9 w-9 rounded-lg text-sm font-semibold transition disabled:cursor-not-allowed ${
                n === progressionLength && !mediaMode
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={mediaMode ? 'opacity-40' : ''}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={randomizeKey}
            disabled={mediaMode}
            onChange={(e) => setRandomizeKey(e.target.checked)}
            className="h-4 w-4"
          />
          Randomize key each round
        </label>
      </div>

      <div className={mediaMode ? 'opacity-40' : ''}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={mediaMode ? false : includeChromatic}
            disabled={mediaMode}
            onChange={(e) => setIncludeChromatic(e.target.checked)}
            className="h-4 w-4"
          />
          Include chromatic chords
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={mediaMode ? false : includeDiminished}
            disabled={mediaMode}
            onChange={(e) => setIncludeDiminished(e.target.checked)}
            className="h-4 w-4"
          />
          Include diminished chords (vii° / ii°)
        </label>
      </div>
    </div>
  );
}
