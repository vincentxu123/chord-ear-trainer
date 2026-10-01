import { useSettings } from '../store/settings';
import { useSongs } from '../store/songs';

export function MusicCollections() {
  const collection = useSettings((state) => state.songCollection);
  const setCollection = useSettings((state) => state.setSongCollection);
  const setSelectedArtists = useSettings((state) => state.setSelectedArtists);
  const setSongDifficulty = useSettings((state) => state.setSongDifficulty);
  const entries = useSongs((state) => state.entries);
  const refreshedAt = useSongs((state) => state.rotationRefreshedAt);
  const rotating = entries.filter((entry) => entry.collection === 'rotation');
  const manual = entries.filter((entry) => entry.collection !== 'rotation');
  const refreshDate = refreshedAt
    ? new Date(refreshedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const selectCollection = (next: 'manual' | 'rotation') => {
    if (next === collection) return;
    setSelectedArtists(null);
    setSongDifficulty('all');
    setCollection(next);
  };

  return (
    <section aria-label="Real Music collections" className="w-full">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Real Music</h2>
        <a
          href="https://music.youtube.com/playlist?list=RDCLAK5uy_k5n4srrEB1wgvIjPNTXS9G1ufE9WQxhnA"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
        >
          RELEASED ↗
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          aria-pressed={collection === 'rotation'}
          onClick={() => selectCollection('rotation')}
          disabled={rotating.length === 0}
          className={`min-h-24 rounded-xl border p-3 text-left transition sm:p-4 ${
            collection === 'rotation'
              ? 'border-amber-400 bg-amber-400/15 shadow-[0_0_0_1px_rgba(251,191,36,.25)]'
              : 'border-slate-700 bg-slate-800/60 hover:border-amber-400/60'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white">Fresh rotation</span>
            <span className="text-xl text-amber-300" aria-hidden="true">↻</span>
          </span>
          <span className="mt-2 block text-xs text-slate-300">
            {rotating.length ? `${rotating.length} excerpts · biweekly${refreshDate ? ` · ${refreshDate}` : ''}` : 'Coming soon'}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={collection === 'manual'}
          onClick={() => selectCollection('manual')}
          disabled={manual.length === 0}
          className={`min-h-24 rounded-xl border p-3 text-left transition sm:p-4 ${
            collection === 'manual'
              ? 'border-sky-400 bg-sky-400/10 shadow-[0_0_0_1px_rgba(56,189,248,.2)]'
              : 'border-slate-700 bg-slate-800/60 hover:border-sky-400/60'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white">Songbook</span>
            <span className="text-lg text-sky-300" aria-hidden="true">♫</span>
          </span>
          <span className="mt-2 block text-xs text-slate-300">{manual.length} excerpts · always available</span>
        </button>
      </div>
    </section>
  );
}
