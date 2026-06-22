import {
  useSettings,
  TEMPO_MIN,
  TEMPO_MAX,
  LENGTH_MIN,
  LENGTH_MAX,
} from '../store/settings';

export function SettingsPanel() {
  const tempoBpm = useSettings((s) => s.tempoBpm);
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const setTempo = useSettings((s) => s.setTempo);
  const setLength = useSettings((s) => s.setLength);
  const setRandomizeKey = useSettings((s) => s.setRandomizeKey);
  const setIncludeChromatic = useSettings((s) => s.setIncludeChromatic);

  const lengths = Array.from(
    { length: LENGTH_MAX - LENGTH_MIN + 1 },
    (_, i) => LENGTH_MIN + i,
  );

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
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
          onChange={(e) => setTempo(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </div>

      <div>
        <span className="text-sm font-medium text-slate-300">Chords</span>
        <div className="mt-2 flex gap-2">
          {lengths.map((n) => (
            <button
              key={n}
              onClick={() => setLength(n)}
              className={`h-9 w-9 rounded-lg text-sm font-semibold transition ${
                n === progressionLength
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <input
            type="checkbox"
            checked={randomizeKey}
            onChange={(e) => setRandomizeKey(e.target.checked)}
            className="h-4 w-4"
          />
          Randomize key each round
        </label>
        {!randomizeKey && (
          <p className="mt-1 pl-6 text-xs text-slate-400">Defaults to C major.</p>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
        <input
          type="checkbox"
          checked={includeChromatic}
          onChange={(e) => setIncludeChromatic(e.target.checked)}
          className="h-4 w-4"
        />
        Include chromatic chords
      </label>
    </div>
  );
}
