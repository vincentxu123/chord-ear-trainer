import { toRoman } from '../theory/chords';
import { ANCHOR_INDEX } from '../engine/round';
import { useSession } from '../store/session';

export function Slots() {
  const exercise = useSession((s) => s.exercise);
  const answers = useSession((s) => s.answers);
  const activeSlot = useSession((s) => s.activeSlot);
  const playingIndex = useSession((s) => s.playingIndex);
  const result = useSession((s) => s.result);
  const phase = useSession((s) => s.phase);
  const setActiveSlot = useSession((s) => s.setActiveSlot);
  const clearSlot = useSession((s) => s.clearSlot);

  if (!exercise) return null;

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {exercise.progression.chords.map((_, i) => {
        const answer = answers[i];
        const slot = result?.perSlot[i];
        const isAnchor = i === ANCHOR_INDEX;
        const isActive = phase === 'answering' && !isAnchor && i === activeSlot;
        const isPlaying = i === playingIndex;

        let tone = 'border-slate-600 bg-slate-800 text-slate-200';
        if (isAnchor) {
          tone = 'border-indigo-500 bg-indigo-900/40 text-indigo-200';
        } else if (slot) {
          tone = slot.correct
            ? 'border-green-500 bg-green-900/40 text-green-200'
            : 'border-red-500 bg-red-900/40 text-red-200';
        } else if (isActive) {
          tone = 'border-sky-400 bg-slate-800 text-white';
        }

        return (
          <button
            key={i}
            onClick={() => setActiveSlot(i)}
            disabled={phase !== 'answering' || isAnchor}
            className={`relative h-24 w-20 rounded-xl border-2 text-2xl font-bold transition ${tone} ${
              isPlaying ? 'ring-4 ring-amber-400' : ''
            }`}
          >
            <span className="block">{answer ? toRoman(answer) : '·'}</span>
            {isAnchor && (
              <span className="mt-1 block text-xs font-medium text-indigo-300">given</span>
            )}
            {slot && !slot.isAnchor && !slot.correct && (
              <span className="mt-1 block text-xs font-medium text-green-300">
                {toRoman(slot.expected)}
              </span>
            )}
            {phase === 'answering' && !isAnchor && answer && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearSlot(i);
                }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs text-slate-300 hover:bg-slate-700"
              >
                ×
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
