import { toAbsoluteChord, toRoman } from '../theory/chords';
import { useSession } from '../store/session';
import { buildWrongAnswerIssueUrl } from '../reportIssue';

export function Feedback() {
  const result = useSession((s) => s.result);
  const exercise = useSession((s) => s.exercise);
  const answers = useSession((s) => s.answers);
  if (!result || !exercise) return null;

  const perfect = result.correctCount === result.total;
  const solution = exercise.progression.chords
    .map((c) => `${toRoman(c, exercise.mode)} (${toAbsoluteChord(c, exercise.key)})`)
    .join(' – ');

  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${perfect ? 'text-green-400' : 'text-amber-400'}`}>
        {result.correctCount} / {result.total} correct
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Solution: <span className="font-semibold text-slate-200">{solution}</span>
        {' '}
        in {exercise.key} {exercise.mode}
      </p>
      {!perfect && exercise.song && exercise.media && (
        <a
          href={buildWrongAnswerIssueUrl(
            exercise,
            answers,
            result,
            window.location.href,
          )}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
          </svg>
          Report wrong answer
        </a>
      )}
    </div>
  );
}
