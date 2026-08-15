import { useState } from 'react';
import {
  useSettings,
  TEMPO_MIN,
  TEMPO_MAX,
  LENGTH_MIN,
  LENGTH_MAX,
} from '../store/settings';
import { useSongs } from '../store/songs';
import { matchesSongDifficulty, type SongDifficulty } from '../songs/difficulty';
import {
  filterSongEntries,
  summarizeArtists,
} from '../songs/selection';
import { useProgress } from '../store/progress';
import { OfflineLibrary } from './OfflineLibrary';

const SONG_DIFFICULTIES: { id: SongDifficulty; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'advanced', label: 'Advanced' },
];

export function SettingsPanel() {
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [artistsExpanded, setArtistsExpanded] = useState(false);
  const [artistQuery, setArtistQuery] = useState('');
  const soundSource = useSettings((s) => s.soundSource);
  const tempoBpm = useSettings((s) => s.tempoBpm);
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const songDifficulty = useSettings((s) => s.songDifficulty);
  const selectedArtists = useSettings((s) => s.selectedArtists);
  const playChordOnSelection = useSettings((s) => s.playChordOnSelection);
  const instrumentalSongs = useSettings((s) => s.instrumentalSongs);
  const setTempo = useSettings((s) => s.setTempo);
  const setLength = useSettings((s) => s.setLength);
  const setRandomizeKey = useSettings((s) => s.setRandomizeKey);
  const setIncludeChromatic = useSettings((s) => s.setIncludeChromatic);
  const setIncludeDiminished = useSettings((s) => s.setIncludeDiminished);
  const setSongDifficulty = useSettings((s) => s.setSongDifficulty);
  const setSelectedArtists = useSettings((s) => s.setSelectedArtists);
  const setPlayChordOnSelection = useSettings((s) => s.setPlayChordOnSelection);
  const setInstrumentalSongs = useSettings((s) => s.setInstrumentalSongs);
  const songEntries = useSongs((s) => s.entries);
  const progressRecords = useProgress((s) => s.records);

  const synthMode = soundSource === 'synth';
  const songMode = soundSource === 'songs';
  const matchingInstrumentalCount = filterSongEntries(
    songEntries,
    {
      difficulty: songDifficulty,
      selectedArtists,
      progressFilter: 'all',
      instrumentalOnly: true,
    },
    progressRecords,
  ).length;

  const artistSummaries = summarizeArtists(songEntries);
  const normalizedArtistQuery = artistQuery.trim().toLocaleLowerCase();
  const visibleArtistSummaries = normalizedArtistQuery
    ? artistSummaries.filter(({ artist }) =>
        artist.toLocaleLowerCase().includes(normalizedArtistQuery),
      )
    : artistSummaries;
  const allArtists = artistSummaries.map((summary) => summary.artist);
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

  const lengths = Array.from(
    { length: LENGTH_MAX - LENGTH_MIN + 1 },
    (_, i) => LENGTH_MIN + i,
  );

  return (
    <aside className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={panelExpanded}
        onClick={() => setPanelExpanded((expanded) => !expanded)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-left text-sm font-semibold text-white lg:hidden"
      >
        Settings
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${panelExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className={`${panelExpanded ? 'flex' : 'hidden'} flex-col gap-4 lg:flex`}>
        <section
          aria-labelledby="settings-heading"
          className="rounded-xl border border-slate-700 bg-slate-800/50 p-5"
        >
          <h2
            id="settings-heading"
            className="sr-only text-base font-semibold text-white lg:not-sr-only"
          >
            Settings
          </h2>
        <div className="mt-5 flex flex-col gap-5">

      {songMode && (
        <OfflineLibrary />
      )}

      {songMode && (
        <div>
          <span className="text-sm font-medium text-slate-300">Difficulty</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SONG_DIFFICULTIES.map(({ id, label }) => {
              const count = songEntries.filter(
                (entry) =>
                  matchesSongDifficulty(entry.chords, id) &&
                  (!instrumentalSongs || Boolean(entry.instrumentalFile)),
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
          <span className="text-sm font-medium text-slate-300">Audio</span>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-900/50 p-1">
            <button
              type="button"
              aria-pressed={!instrumentalSongs}
              onClick={() => setInstrumentalSongs(false)}
              className={`rounded-md px-2 py-2 text-sm font-semibold transition ${
                !instrumentalSongs
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              Original
            </button>
            <button
              type="button"
              aria-pressed={instrumentalSongs}
              onClick={() => setInstrumentalSongs(true)}
              disabled={matchingInstrumentalCount === 0}
              className={`rounded-md px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                instrumentalSongs
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              Instrumental
            </button>
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

          {synthMode && (
            <>
              <div>
                <label className="flex justify-between text-sm font-medium text-slate-300">
                  <span>Tempo</span>
                  <span className="text-slate-400">{tempoBpm} BPM</span>
                </label>
                <input
                  type="range"
                  min={TEMPO_MIN}
                  max={TEMPO_MAX}
                  value={tempoBpm}
                  onChange={(event) => setTempo(Number(event.target.value))}
                  className="mt-2 w-full"
                />
              </div>

              <div>
                <span className="text-sm font-medium text-slate-300">Progression length</span>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {lengths.map((length) => (
                    <button
                      key={length}
                      type="button"
                      aria-pressed={length === progressionLength}
                      onClick={() => setLength(length)}
                      className={`min-h-10 rounded-lg text-sm font-semibold transition ${
                        length === progressionLength
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {length}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={randomizeKey}
                    onChange={(event) => setRandomizeKey(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Randomize key each round
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeChromatic}
                    onChange={(event) => setIncludeChromatic(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Include chromatic chords
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeDiminished}
                    onChange={(event) => setIncludeDiminished(event.target.checked)}
                    className="h-4 w-4"
                  />
                  Include diminished chords
                </label>
              </div>
            </>
          )}

          <div className="border-t border-slate-700 pt-5">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <input
                type="checkbox"
                checked={playChordOnSelection}
                onChange={(event) => setPlayChordOnSelection(event.target.checked)}
                className="h-4 w-4"
              />
              Preview chords when selected
            </label>
          </div>
        </div>
        </section>
      </div>
    </aside>
  );
}
