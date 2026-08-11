import { toAbsoluteChord, toRoman } from '../theory/chords';
import { GIVEN_SLOT_COUNT, useSession } from '../store/session';

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

  const mode = exercise.mode;
  const renderSlot = (i: number, compact = false) => {
    const answer = answers[i];
    const slot = result?.perSlot[i];
    const isGiven = i < GIVEN_SLOT_COUNT;
    const isActive = phase === 'answering' && !isGiven && i === activeSlot;
    const isPlaying = i === playingIndex;

    let tone = 'border-slate-600 bg-slate-800 text-slate-200';
    if (isGiven && phase !== 'revealed') {
      tone = 'border-slate-500 bg-slate-700/80 text-slate-100';
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
        onClick={() => {
          if (!isGiven) setActiveSlot(i);
        }}
        disabled={phase !== 'answering' || isGiven}
        className={`relative ${compact ? 'h-16 min-w-0 flex-1 text-lg sm:h-20 sm:w-16 sm:flex-none sm:text-xl' : 'h-24 w-20 text-2xl'} rounded-xl border-2 font-bold transition ${tone} ${
          isPlaying ? 'ring-4 ring-amber-400' : ''
        } ${isGiven ? 'cursor-default' : ''}`}
      >
        <span className="block">{answer ? toRoman(answer, mode) : '·'}</span>
        {exercise.song && answer && (
          <span className="block text-[10px] font-medium text-slate-400">
            {toAbsoluteChord(answer, exercise.key)}
          </span>
        )}
        {isGiven && phase === 'answering' && (
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            given
          </span>
        )}
        {slot && !slot.correct && (
          <span className="mt-1 block text-xs font-medium text-green-300">
            {toRoman(slot.expected, mode)}
          </span>
        )}
        {phase === 'answering' && answer && !isGiven && (
          <span
            role="button"
            onClick={(event) => {
              event.stopPropagation();
              clearSlot(i);
            }}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-xs text-slate-300 hover:bg-slate-700"
          >
            ×
          </span>
        )}
      </button>
    );
  };

  if (exercise.song) {
    let cursor = 0;
    const measures = exercise.song.measureChordCounts.map((count, measureOffset) => {
      const indices = Array.from({ length: count }, (_, chordOffset) => cursor + chordOffset);
      cursor += count;
      return { number: exercise.song!.startMeasure + measureOffset, indices };
    });
    return (
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
        {measures.map((measure) => (
          <div key={measure.number} className="min-w-0 rounded-xl border border-slate-700 bg-slate-800/40 p-2 sm:p-3">
            <p className="mb-1.5 truncate text-center text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:mb-2 sm:text-[10px] sm:tracking-widest">
              Measure {measure.number}
            </p>
            <div className="flex justify-center gap-1 sm:gap-2">
              {measure.indices.map((i) => renderSlot(i, true))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {exercise.progression.chords.map((_, i) => renderSlot(i))}
    </div>
  );
}
