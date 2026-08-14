import { toAbsoluteChord, toRoman } from '../theory/chords';
import { synth } from '../audio/synth';
import { GIVEN_SLOT_COUNT, useSession } from '../store/session';
import { useSettings } from '../store/settings';

function AnswerStatusIcon({ correct }: { correct: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
        correct ? 'bg-green-400/20 text-green-300' : 'bg-red-400/20 text-red-300'
      }`}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
        {correct ? (
          <path d="m3 8 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="m4 4 8 8m0-8-8 8" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

export function Slots() {
  const playChordOnSelection = useSettings((s) => s.playChordOnSelection);
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
        ? 'h-20 min-w-0 flex-1 sm:h-24 sm:w-20 sm:flex-none'
        : 'h-16 min-w-0 flex-1 sm:h-20 sm:w-16 sm:flex-none'
      : incorrectSlot
        ? 'h-28 w-24'
        : 'h-24 w-20';

    let tone = 'border-slate-600 bg-slate-800 text-slate-200';
    if (isGiven && phase !== 'revealed') {
      tone = 'border-slate-500 bg-slate-700/80 text-slate-100';
    } else if (slot) {
      tone = slot.correct
        ? 'border-green-500 bg-green-900/40 text-green-200'
        : 'border-slate-600 bg-slate-900 text-slate-200';
    }

    return (
      <button
        key={i}
        type="button"
        onClick={() => {
          setActiveSlot(i);
          const auditionChord =
            phase === 'revealed' ? exercise.progression.chords[i] : answer;
          if ((phase === 'revealed' || playChordOnSelection) && auditionChord) {
            void synth.playChord(auditionChord, exercise.key);
          }
        }}
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
            <span className="flex items-center justify-center gap-1.5 bg-red-950/35 px-1 py-1">
              <AnswerStatusIcon correct={false} />
              <span className="min-w-0">
                <span className="block text-base leading-none text-red-100 sm:text-lg">
                  {toRoman(answer, mode)}
                </span>
                <span className="mt-0.5 block text-[10px] font-semibold leading-none text-red-200 sm:text-xs">
                  {toAbsoluteChord(answer, exercise.key)}
                </span>
              </span>
            </span>
            <span className="flex items-center justify-center gap-1.5 border-t border-slate-600 bg-green-950/50 px-1 py-1">
              <AnswerStatusIcon correct />
              <span className="min-w-0">
                <span className="block text-base leading-none text-green-100 sm:text-lg">
                  {toRoman(incorrectSlot.expected, mode)}
                </span>
                <span className="mt-0.5 block text-[10px] font-semibold leading-none text-green-300 sm:text-xs">
                  {toAbsoluteChord(incorrectSlot.expected, exercise.key)}
                </span>
              </span>
            </span>
          </span>
        ) : (
          <>
            <span className="block">{answer ? toRoman(answer, mode) : '·'}</span>
            {answer && (
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
