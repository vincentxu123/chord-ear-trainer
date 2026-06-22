import { toRoman } from '../theory/chords';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';

export function AnswerPad() {
  const allowedChords = useSettings((s) => s.allowedChords);
  const selectChord = useSession((s) => s.selectChord);
  const phase = useSession((s) => s.phase);
  const disabled = phase !== 'answering';

  const chords = [...allowedChords].sort((a, b) => a.rootPc - b.rootPc);

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {chords.map((chord) => (
        <button
          key={`${chord.rootPc}:${chord.quality}`}
          onClick={() => selectChord(chord)}
          disabled={disabled}
          className="min-w-16 rounded-lg bg-slate-700 px-4 py-3 text-lg font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {toRoman(chord)}
        </button>
      ))}
    </div>
  );
}
