import { useSession } from '../store/session';

interface ControlsProps {
  onPlay: () => void;
  onStop: () => void;
  onSkip: () => void;
  onNext: () => void;
  isPlaying: boolean;
  isLoading: boolean;
  hasPlayed: boolean;
}

export function Controls({
  onPlay,
  onStop,
  onSkip,
  onNext,
  isPlaying,
  isLoading,
  hasPlayed,
}: ControlsProps) {
  const phase = useSession((s) => s.phase);
  const answers = useSession((s) => s.answers);
  const submit = useSession((s) => s.submit);
  const allFilled = answers.length > 0 && answers.every((a) => a !== null);

  let playLabel = hasPlayed ? 'Replay' : 'Play';
  if (isLoading) playLabel = 'Loading…';

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {isPlaying ? (
        <button
          onClick={onStop}
          className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-500"
        >
          Stop
        </button>
      ) : (
        <button
          onClick={onPlay}
          disabled={isLoading}
          className="rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {playLabel}
        </button>
      )}

      {phase === 'answering' && (
        <>
          <button
            onClick={submit}
            disabled={!allFilled}
            className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
          >
            Submit
          </button>
          <button
            onClick={onSkip}
            className="rounded-lg border border-slate-600 bg-slate-800 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-700"
          >
            Skip
          </button>
        </>
      )}

      {phase === 'revealed' && (
        <button
          onClick={onNext}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500"
        >
          Next
        </button>
      )}
    </div>
  );
}
