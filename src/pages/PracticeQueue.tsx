import { useProgress, getExcerptStatus, type ExcerptStatus } from '../store/progress';
import { useSettings, type SongProgressFilter } from '../store/settings';
import { useSongs } from '../store/songs';
import { filterSongEntries } from '../songs/selection';
import type { SongClipManifestEntry } from '../songs/types';

const QUEUE_OPTIONS: { id: SongProgressFilter; label: string }[] = [
  { id: 'learning', label: 'Learn' },
  { id: 'all', label: 'Review all' },
];

const STATUSES: {
  status: ExcerptStatus;
  label: string;
  textClassName: string;
  className: string;
}[] = [
  {
    status: 'unseen',
    label: 'New',
    textClassName: 'text-sky-200',
    className: 'bg-sky-950/30',
  },
  {
    status: 'needs-practice',
    label: 'Failed',
    textClassName: 'text-red-200',
    className: 'bg-red-950/30',
  },
  {
    status: 'mastered',
    label: 'Completed',
    textClassName: 'text-green-200',
    className: 'bg-green-950/30',
  },
];

export function PracticeQueue() {
  const entries = useSongs((state) => state.entries);
  const records = useProgress((state) => state.records);
  const resetProgress = useProgress((state) => state.reset);
  const songDifficulty = useSettings((state) => state.songDifficulty);
  const selectedArtists = useSettings((state) => state.selectedArtists);
  const instrumentalSongs = useSettings((state) => state.instrumentalSongs);
  const songProgressFilter = useSettings((state) => state.songProgressFilter);
  const setSongProgressFilter = useSettings((state) => state.setSongProgressFilter);

  const matchingEntries = filterSongEntries(
    entries,
    {
      difficulty: songDifficulty,
      selectedArtists,
      progressFilter: 'all',
      instrumentalOnly: instrumentalSongs,
    },
    records,
  );
  const groupedEntries = Object.fromEntries(
    STATUSES.map(({ status: sectionStatus }) => [
      sectionStatus,
      matchingEntries.filter((entry) => getExcerptStatus(entry.id, records) === sectionStatus),
    ]),
  ) as Record<ExcerptStatus, SongClipManifestEntry[]>;
  const learningCount = groupedEntries.unseen.length + groupedEntries['needs-practice'].length;

  const handleResetProgress = () => {
    if (
      typeof window !== 'undefined' &&
      window.confirm('Reset all excerpt progress? This cannot be undone.')
    ) {
      resetProgress();
    }
  };

  return (
    <section
      aria-labelledby="queue-heading"
      className="w-full rounded-xl border border-slate-700 bg-slate-800/50 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="queue-heading" className="text-base font-semibold text-white">
          Practice queue
        </h2>
        <button
          type="button"
          onClick={handleResetProgress}
          disabled={!Object.keys(records).length}
          className="text-xs font-medium text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-900/50 p-1">
        {QUEUE_OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === songProgressFilter}
            onClick={() => setSongProgressFilter(id)}
            className={`min-h-10 rounded-md px-2 py-2 text-sm font-semibold transition ${
              id === songProgressFilter
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            {label}
            <span className="ml-1 text-xs opacity-70">
              {id === 'learning' ? learningCount : matchingEntries.length}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        {STATUSES.map((item) => (
          <div
            key={item.status}
            className={`rounded-md px-2 py-2 text-slate-400 ${item.className}`}
          >
            <span className={`block text-base font-semibold ${item.textClassName}`}>
              {groupedEntries[item.status].length}
            </span>
            {item.label}
          </div>
        ))}
      </div>
    </section>
  );
}
