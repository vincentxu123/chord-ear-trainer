import { useState } from 'react';
import { synth } from '../audio/synth';
import { useSettings } from '../store/settings';

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

// Sharp key sitting after the white key at this index within an octave.
const BLACK_AFTER: Record<number, string> = { 0: 'C#', 1: 'D#', 3: 'F#', 4: 'G#', 5: 'A#' };

const START_OCTAVE = 2;
const OCTAVE_COUNT = 4; // C2 .. C6 (an extra top C is appended)

const WHITE_W = 40;
const WHITE_H = 150;
const BLACK_W = 26;
const BLACK_H = 96;

function KeyboardToggleIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="10" rx="2" />
      <path d="M6 4v5m3-5v5m3-5v5m3-5v5m3-5v5M5.5 9v5m3-5v5m3-5v5m3-5v5m4-5v5" />
      <path d={expanded ? 'm9 17 3 3 3-3' : 'm9 20 3-3 3 3'} />
    </svg>
  );
}

export function PianoKeyboard() {
  const soundSource = useSettings((state) => state.soundSource);
  const [active, setActive] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const press = (note: string) => {
    setActive(note);
    void synth.playNote(note);
    window.setTimeout(() => setActive((current) => (current === note ? null : current)), 300);
  };

  const octaves = Array.from({ length: OCTAVE_COUNT }, (_, i) => START_OCTAVE + i);

  const whiteKey = (note: string) => (
    <button
      key={note}
      aria-label={note}
      onPointerDown={() => press(note)}
      className={`flex items-end justify-center rounded-b-md border border-slate-400 pb-1 text-[10px] font-medium transition-colors ${
        active === note ? 'bg-sky-300 text-sky-950' : 'bg-white text-slate-400'
      }`}
      style={{ width: WHITE_W, height: WHITE_H }}
    >
      {active === note ? note : ''}
    </button>
  );

  if (!visible) {
    return (
      <div className="sticky bottom-0 z-20 flex justify-center border-t border-slate-700 bg-slate-800/95 px-3 py-2 backdrop-blur">
        <button
          type="button"
          aria-expanded="false"
          aria-label="Show offline piano keyboard"
          title="Show offline piano keyboard"
          onClick={() => setVisible(true)}
          className="rounded-full border border-slate-600 bg-slate-700 p-2 text-slate-100 transition hover:bg-slate-600"
        >
          <KeyboardToggleIcon expanded={false} />
        </button>
        {soundSource === 'synth' && (
          <span className="ml-2 self-center text-xs text-slate-400">Offline piano</span>
        )}
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-20 border-t border-slate-700 bg-slate-800/95 py-3 backdrop-blur">
      <div className="mx-auto mb-2 flex max-w-4xl justify-end px-3">
        <button
          type="button"
          aria-expanded="true"
          aria-label="Hide piano keyboard"
          title="Hide piano keyboard"
          onClick={() => setVisible(false)}
          className="rounded-full border border-slate-600 bg-slate-700 p-2 text-slate-200 transition hover:bg-slate-600"
        >
          <KeyboardToggleIcon expanded />
        </button>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="mx-auto flex w-fit">
          {octaves.map((oct) => (
            <div key={oct} className="relative flex" style={{ width: WHITE_W * 7 }}>
              {WHITE_NOTES.map((wn) => whiteKey(`${wn}${oct}`))}
              {Object.entries(BLACK_AFTER).map(([idx, pc]) => {
                const note = `${pc}${oct}`;
                return (
                  <button
                    key={note}
                    aria-label={note}
                    onPointerDown={() => press(note)}
                    className={`absolute top-0 z-10 rounded-b-md border border-slate-950 transition-colors ${
                      active === note ? 'bg-sky-500' : 'bg-slate-900'
                    }`}
                    style={{
                      width: BLACK_W,
                      height: BLACK_H,
                      left: WHITE_W * (Number(idx) + 1) - BLACK_W / 2,
                    }}
                  />
                );
              })}
            </div>
          ))}
          {whiteKey(`C${START_OCTAVE + OCTAVE_COUNT}`)}
        </div>
      </div>
    </div>
  );
}
