import {
  useSettings,
  TEMPO_MIN,
  TEMPO_MAX,
  LENGTH_MIN,
  LENGTH_MAX,
  type SoundSource,
} from '../store/settings';
import { useClips } from '../store/clips';

export function SettingsPanel() {
  const soundSource = useSettings((s) => s.soundSource);
  const tempoBpm = useSettings((s) => s.tempoBpm);
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const setSoundSource = useSettings((s) => s.setSoundSource);
  const setTempo = useSettings((s) => s.setTempo);
  const setLength = useSettings((s) => s.setLength);
  const setRandomizeKey = useSettings((s) => s.setRandomizeKey);
  const setIncludeChromatic = useSettings((s) => s.setIncludeChromatic);
  const setIncludeDiminished = useSettings((s) => s.setIncludeDiminished);
  const clipStatus = useClips((s) => s.status);
  const clipCount = useClips((s) => s.entries.length);

  const clipMode = soundSource === 'clips';
  const clipsAvailable = clipStatus === 'ready';

  const lengths = Array.from(
    { length: LENGTH_MAX - LENGTH_MIN + 1 },
    (_, i) => LENGTH_MIN + i,
  );

  const sources: { id: SoundSource; label: string; disabled?: boolean }[] = [
    { id: 'synth', label: 'Piano' },
    { id: 'clips', label: 'Real music', disabled: !clipsAvailable },
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
      </div>

      <div className={clipMode ? 'opacity-40' : ''}>
        <label className="flex justify-between text-sm font-medium text-slate-300">
          <span>Tempo</span>
          <span className="text-slate-400">
            {clipMode ? 'set by the recording' : `${tempoBpm} BPM`}
          </span>
        </label>
        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={tempoBpm}
          disabled={clipMode}
          onChange={(e) => setTempo(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div className={clipMode ? 'opacity-40' : ''}>
        <span className="text-sm font-medium text-slate-300">Chords</span>
        <div className="mt-2 flex gap-2">
          {lengths.map((n) => (
            <button
              key={n}
              onClick={() => setLength(n)}
              disabled={clipMode}
              className={`h-9 w-9 rounded-lg text-sm font-semibold transition disabled:cursor-not-allowed ${
                n === progressionLength && !clipMode
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {clipMode && (
          <p className="mt-1 text-xs text-slate-400">Set by the clip (4 chords).</p>
        )}
      </div>

      <div className={clipMode ? 'opacity-40' : ''}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={randomizeKey}
            disabled={clipMode}
            onChange={(e) => setRandomizeKey(e.target.checked)}
            className="h-4 w-4"
          />
          Randomize key each round
        </label>
        {!randomizeKey && !clipMode && (
          <p className="mt-1 pl-6 text-xs text-slate-400">Defaults to C major.</p>
        )}
        {clipMode && (
          <p className="mt-1 pl-6 text-xs text-slate-400">Each clip has its own key.</p>
        )}
      </div>

      <div className={clipMode ? 'opacity-40' : ''}>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={clipMode ? false : includeChromatic}
            disabled={clipMode}
            onChange={(e) => setIncludeChromatic(e.target.checked)}
            className="h-4 w-4"
          />
          Include chromatic chords
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={clipMode ? false : includeDiminished}
            disabled={clipMode}
            onChange={(e) => setIncludeDiminished(e.target.checked)}
            className="h-4 w-4"
          />
          Include diminished chords (vii° / ii°)
        </label>
        {clipMode && (
          <p className="mt-1 pl-6 text-xs text-slate-400">
            Current clips are diatonic only.
          </p>
        )}
      </div>
    </div>
  );
}
