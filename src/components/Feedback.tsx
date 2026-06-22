import { useSession } from '../store/session';

export function Feedback() {
  const result = useSession((s) => s.result);
  const exercise = useSession((s) => s.exercise);
  if (!result || !exercise) return null;

  const perfect = result.correctCount === result.total;

  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${perfect ? 'text-green-400' : 'text-amber-400'}`}>
        {result.correctCount} / {result.total} correct
      </p>
      <p className="mt-1 text-sm text-slate-400">
        Progression: <span className="font-semibold text-slate-200">{exercise.progression.name}</span>
        {' '}in {exercise.key} major
      </p>
    </div>
  );
}
