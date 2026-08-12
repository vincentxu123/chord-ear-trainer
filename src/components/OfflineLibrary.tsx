import { useSongs } from '../store/songs';

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineLibrary() {
  const entries = useSongs((state) => state.entries);
  const totalBytes = useSongs((state) => state.totalBytes);
  const cachedCount = useSongs((state) => state.cachedCount);
  const status = useSongs((state) => state.offlineStatus);
  const error = useSongs((state) => state.offlineError);
  const downloadOffline = useSongs((state) => state.downloadOffline);
  const removeOffline = useSongs((state) => state.removeOffline);
  const total = entries.length;
  const downloading = status === 'downloading';
  const ready = status === 'ready';
  const progress = total ? Math.round((cachedCount / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-200">Offline Real Music</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {ready
              ? `Ready offline · ${total} exercises`
              : downloading
                ? `Downloading ${cachedCount} of ${total}`
                : cachedCount
                  ? `${cachedCount} of ${total} saved`
                  : `${total} exercises${totalBytes ? ` · ${formatBytes(totalBytes)}` : ''}`}
          </p>
        </div>
        {ready ? (
          <button
            type="button"
            onClick={() => void removeOffline()}
            className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            disabled={downloading || total === 0}
            onClick={() => void downloadOffline()}
            className="shrink-0 rounded-md bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cachedCount ? 'Finish download' : 'Download'}
          </button>
        )}
      </div>
      {downloading && (
        <div
          role="progressbar"
          aria-label="Real Music download progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-700"
        >
          <div
            className="h-full rounded-full bg-amber-400 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
