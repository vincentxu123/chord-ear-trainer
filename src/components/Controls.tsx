import { useSession } from '../store/session';

interface ControlsProps {
  onPlay: () => void;
  onReplay: () => void;
  onStop: () => void;
  onSkip: () => void;
  isPlaying: boolean;
  isLoading: boolean;
}

export function Controls({
  onPlay,
  onReplay,
  onStop,
  onSkip,
  isPlaying,
  isLoading,
}: ControlsProps) {
  const phase = useSession((s) => s.phase);
  const answers = useSession((s) => s.answers);
  const submit = useSession((s) => s.submit);
  const allFilled = answers.length > 0 && answers.every((a) => a !== null);

  const buttonClass =
    'flex h-12 w-12 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {isPlaying ? (
        <button
          onClick={onStop}
          aria-label="Stop"
          title="Stop"
          className={`${buttonClass} bg-red-600 text-white hover:bg-red-500`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
        </button>
      ) : (
        <button
          onClick={onPlay}
          disabled={isLoading}
          aria-label="Play from selected chord"
          title="Play from selected chord"
          className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-500`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
            <path d="m8 5 11 7-11 7V5z" />
          </svg>
        </button>
      )}

      <button
        onClick={onReplay}
        disabled={isLoading}
        aria-label="Replay from beginning"
        title="Replay from beginning"
        className={`${buttonClass} border border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>

      <button
        onClick={submit}
        disabled={phase !== 'answering' || !allFilled}
        aria-label="Submit answers"
        title="Submit answers"
        className={`${buttonClass} bg-green-600 text-white hover:bg-green-500`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 4 4L19 6" />
        </svg>
      </button>

      <button
        onClick={onSkip}
        aria-label={phase === 'revealed' ? 'Next exercise' : 'Skip exercise'}
        title={phase === 'revealed' ? 'Next exercise' : 'Skip exercise'}
        className={`${buttonClass} border border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-500 hover:bg-slate-700`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
          <path d="m5 5 10 7-10 7V5zm11 0h3v14h-3V5z" />
        </svg>
      </button>
    </div>
  );
}
