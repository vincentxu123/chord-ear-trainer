import {
  useSettings,
  TEMPO_MIN,
  TEMPO_MAX,
  LENGTH_MIN,
  LENGTH_MAX,
  type SoundSource,
} from '../store/settings';
import { useClips } from '../store/clips';
import { useSongs } from '../store/songs';
import {
  matchesSongDifficulty,
  type SongDifficulty,
} from '../songs/difficulty';

const SONG_DIFFICULTIES: { id: SongDifficulty; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

export function SettingsPanel() {
  const soundSource = useSettings((s) => s.soundSource);
  const tempoBpm = useSettings((s) => s.tempoBpm);
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const songDifficulty = useSettings((s) => s.songDifficulty);
  const setSoundSource = useSettings((s) => s.setSoundSource);
  const setTempo = useSettings((s) => s.setTempo);
  const setLength = useSettings((s) => s.setLength);
  const setRandomizeKey = useSettings((s) => s.setRandomizeKey);
  const setIncludeChromatic = useSettings((s) => s.setIncludeChromatic);
  const setIncludeDiminished = useSettings((s) => s.setIncludeDiminished);
  const setSongDifficulty = useSettings((s) => s.setSongDifficulty);
  const clipStatus = useClips((s) => s.status);
  const clipCount = useClips((s) => s.entries.length);
  const songStatus = useSongs((s) => s.status);
  const songEntries = useSongs((s) => s.entries);

  const clipMode = soundSource === 'clips';
  const songMode = soundSource === 'songs';
  const mediaMode = clipMode || songMode;
  const clipsAvailable = clipStatus === 'ready';
  const songsAvailable = songStatus === 'ready';
  const matchingSongCount = songEntries.filter((entry) =>
    matchesSongDifficulty(entry.chords, songDifficulty),
  ).length;

  const lengths = Array.from(
    { length: LENGTH_MAX - LENGTH_MIN + 1 },
    (_, i) => LENGTH_MIN + i,
  );

  const sources: { id: SoundSource; label: string; disabled?: boolean }[] = [
    { id: 'synth', label: 'Piano' },
    { id: 'clips', label: 'Generated', disabled: !clipsAvailable },
    { id: 'songs', label: 'Jay Chou', disabled: !songsAvailable },
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
        {clipMode && (
          <p className="mt-1 text-xs text-slate-400">
            Playing from {clipCount} generated clip{clipCount === 1 ? '' : 's'}.
          </p>
        )}
        {songMode && (
          <p className="mt-1 text-xs text-slate-400">
            Playing from {matchingSongCount} of {songEntries.length} validated four-measure excerpts.
          </p>
        )}
      </div>

      {songMode && (
        <div>
          <span className="text-sm font-medium text-slate-300">Difficulty</span>
          <div className="mt-2 grid grid-cols-4 gap-2">
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
          <p className="mt-1 text-xs text-slate-400">
            Easy: up to 3 unique chords · Medium: 4–5 · Hard: 6+
          </p>
        </div>
      )}

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
        {mediaMode && (
          <p className="mt-1 text-xs text-slate-400">
            {songMode ? 'Set by the four-measure excerpt.' : 'Set by the clip (4 chords).'}
          </p>
        )}
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
        {!randomizeKey && !mediaMode && (
          <p className="mt-1 pl-6 text-xs text-slate-400">Defaults to C major.</p>
        )}
        {mediaMode && (
          <p className="mt-1 pl-6 text-xs text-slate-400">Each recording has its own key.</p>
        )}
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
        {mediaMode && (
          <p className="mt-1 pl-6 text-xs text-slate-400">
            {songMode ? 'Vocabulary follows the excerpt.' : 'Current clips are diatonic only.'}
          </p>
        )}
      </div>
    </div>
  );
}
