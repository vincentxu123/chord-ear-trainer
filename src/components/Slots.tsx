import { toAbsoluteChord, toRoman } from '../theory/chords';
import { GIVEN_SLOT_COUNT, useSession } from '../store/session';
import { useSettings } from '../store/settings';

export function Slots() {
  const showAbsoluteChordNames = useSettings((s) => s.showAbsoluteChordNames);
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
    const isActive = i === activeSlot;
    const isPlaying = i === playingIndex;
    const incorrectSlot = slot && !slot.correct ? slot : null;
    const size = compact
      ? incorrectSlot
        ? 'h-24 min-w-0 flex-1 sm:h-28 sm:w-20 sm:flex-none'
        : 'h-16 min-w-0 flex-1 sm:h-20 sm:w-16 sm:flex-none'
      : incorrectSlot
        ? 'h-32 w-24'
        : 'h-24 w-20';

    let tone = 'border-slate-600 bg-slate-800 text-slate-200';
    if (isGiven && phase !== 'revealed') {
      tone = 'border-slate-500 bg-slate-700/80 text-slate-100';
    } else if (slot) {
      tone = slot.correct
        ? 'border-green-500 bg-green-900/40 text-green-200'
        : 'border-red-500 bg-red-900/40 text-red-200';
    }

    return (
      <button
        key={i}
        type="button"
        onClick={() => setActiveSlot(i)}
        aria-label={
          incorrectSlot && answer
            ? `Your answer: ${toRoman(answer, mode)}, ${toAbsoluteChord(answer, exercise.key)}. Correct answer: ${toRoman(incorrectSlot.expected, mode)}, ${toAbsoluteChord(incorrectSlot.expected, exercise.key)}.`
            : undefined
        }
        className={`relative ${size} ${compact ? 'text-lg sm:text-xl' : 'text-2xl'} overflow-hidden rounded-xl border-2 font-bold transition ${tone} ${
          isPlaying
            ? 'ring-4 ring-amber-400'
            : isActive
              ? 'ring-4 ring-sky-400'
              : ''
        }`}
      >
        {incorrectSlot && answer ? (
          <span className="grid h-full grid-rows-2">
            <span className="flex flex-col justify-center bg-red-950/35 px-1 py-1">
              <span className="block text-[8px] font-semibold uppercase leading-none tracking-wide text-red-200/70 sm:text-[9px]">
                Your answer
              </span>
              <span className="mt-1 block text-base leading-none text-red-100 sm:text-lg">
                {toRoman(answer, mode)}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold leading-none text-red-200 sm:text-xs">
                {toAbsoluteChord(answer, exercise.key)}
              </span>
            </span>
            <span className="flex flex-col justify-center border-t border-green-400/40 bg-green-950/70 px-1 py-1">
              <span className="block text-[8px] font-semibold uppercase leading-none tracking-wide text-green-300/75 sm:text-[9px]">
                Correct answer
              </span>
              <span className="mt-1 block text-base leading-none text-green-100 sm:text-lg">
                {toRoman(incorrectSlot.expected, mode)}
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold leading-none text-green-300 sm:text-xs">
                {toAbsoluteChord(incorrectSlot.expected, exercise.key)}
              </span>
            </span>
          </span>
        ) : (
          <>
            <span className="block">{answer ? toRoman(answer, mode) : '·'}</span>
            {exercise.song && answer && showAbsoluteChordNames && (
              <span className="block text-[10px] font-medium text-slate-400">
                {toAbsoluteChord(answer, exercise.key)}
              </span>
            )}
          </>
        )}
        {isGiven && phase === 'answering' && (
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            given
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
