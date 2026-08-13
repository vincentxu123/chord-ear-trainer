import { useClips } from '../store/clips';
import { useSettings, type SoundSource } from '../store/settings';
import { useSongs } from '../store/songs';

const MODES: { id: SoundSource; label: string }[] = [
  { id: 'synth', label: 'Piano' },
  { id: 'clips', label: 'Generated' },
  { id: 'songs', label: 'Real Music' },
];

export function ModeSelector() {
  const soundSource = useSettings((state) => state.soundSource);
  const setSoundSource = useSettings((state) => state.setSoundSource);
  const clipStatus = useClips((state) => state.status);
  const songStatus = useSongs((state) => state.status);

  const unavailable = (mode: SoundSource) =>
    (mode === 'clips' && clipStatus !== 'ready') ||
    (mode === 'songs' && songStatus !== 'ready');

  return (
    <section aria-labelledby="mode-heading">
      <h2 id="mode-heading" className="mb-2 text-sm font-semibold text-slate-300">
        Mode
      </h2>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-700 bg-slate-800/70 p-1.5">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === soundSource}
            onClick={() => setSoundSource(id)}
            disabled={unavailable(id)}
            className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 ${
              id === soundSource
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
