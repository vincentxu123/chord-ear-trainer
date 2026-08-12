import { toRoman } from '../theory/chords';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';

export function Feedback() {
  const showAbsoluteChordNames = useSettings((s) => s.showAbsoluteChordNames);
  const result = useSession((s) => s.result);
  const exercise = useSession((s) => s.exercise);
  if (!result || !exercise) return null;

  const perfect = result.correctCount === result.total;
  const solution = exercise.progression.chords
    .map((c) => toRoman(c, exercise.mode))
    .join(' – ');

  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${perfect ? 'text-green-400' : 'text-amber-400'}`}>
        {result.correctCount} / {result.total} correct
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Solution: <span className="font-semibold text-slate-200">{solution}</span>
        {(!exercise.song || showAbsoluteChordNames) && (
          <> in {exercise.key} {exercise.mode}</>
        )}
      </p>
    </div>
  );
}
