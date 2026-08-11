import {
  chordKey,
  chordPool,
  isChromatic,
  sortChordsForDisplay,
  toAbsoluteChord,
  toRoman,
} from '../theory/chords';
import { synth } from '../audio/synth';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import type { Chord } from '../theory/types';

export function AnswerPad() {
  const soundSource = useSettings((s) => s.soundSource);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const exercise = useSession((s) => s.exercise);
  const selectChord = useSession((s) => s.selectChord);
  const phase = useSession((s) => s.phase);

  if (!exercise) return null;

  // Generated clips are diatonic. Real-song excerpts add any borrowed chords
  // present in the answer while keeping the normal diatonic choices available.
  const clipMode = soundSource === 'clips';
  const songMode = soundSource === 'songs';
  const mode = exercise.mode;
  const baseChords = chordPool(
    mode,
    clipMode || songMode ? false : includeChromatic,
    clipMode || songMode ? false : includeDiminished,
  );
  const chords = songMode
    ? sortChordsForDisplay(
        [...new Map([...baseChords, ...exercise.progression.chords].map((chord) => [chordKey(chord), chord])).values()],
        mode,
      )
    : baseChords;

  const handleClick = (chord: Chord) => {
    if (phase === 'answering') selectChord(chord);
    else if (phase === 'revealed') void synth.playChord(chord, exercise.key);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-slate-400">
        {phase === 'revealed'
          ? 'Click any chord to hear it and compare with the solution.'
          : 'Pick a chord for the selected slot.'}
        {(includeChromatic || songMode) && (
          <>
            {' '}
            <span className="ml-2 inline-block rounded border border-amber-500/70 bg-amber-950/70 px-2 py-0.5 text-amber-100">
              Amber
            </span>{' '}
            = out-of-key
          </>
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {chords.map((chord) => {
          const chromatic = isChromatic(chord, mode);
          return (
            <button
              key={`${chord.rootPc}:${chord.quality}`}
              onClick={() => handleClick(chord)}
              disabled={phase === 'idle'}
              className={`min-w-16 rounded-lg px-4 py-3 text-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                chromatic
                  ? 'border border-amber-500/70 bg-amber-950/70 text-amber-100 hover:bg-amber-900/80'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
            >
              <span className="block">{toRoman(chord, mode)}</span>
              {songMode && (
                <span className="mt-0.5 block text-[11px] font-medium opacity-70">
                  {toAbsoluteChord(chord, exercise.key)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
