import { useState } from 'react';
import { synth } from '../audio/synth';

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

// Sharp key sitting after the white key at this index within an octave.
const BLACK_AFTER: Record<number, string> = { 0: 'C#', 1: 'D#', 3: 'F#', 4: 'G#', 5: 'A#' };

const START_OCTAVE = 2;
const OCTAVE_COUNT = 4; // C2 .. C6 (an extra top C is appended)

const WHITE_W = 40;
const WHITE_H = 150;
const BLACK_W = 26;
const BLACK_H = 96;

export function PianoKeyboard() {
  const [active, setActive] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);

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
          onClick={() => setVisible(true)}
          className="rounded-full border border-slate-600 bg-slate-700 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-600"
        >
          Show keyboard
        </button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-20 border-t border-slate-700 bg-slate-800/95 py-3 backdrop-blur">
      <div className="relative mx-auto mb-2 flex max-w-4xl items-center justify-center px-3 text-center text-xs text-slate-400">
        <span>
          {active ? (
            <span className="font-semibold text-sky-300">Playing {active}</span>
          ) : (
            'Click a key to hear a note'
          )}
        </span>
        <button
          type="button"
          aria-expanded="true"
          onClick={() => setVisible(false)}
          className="absolute right-3 rounded-full border border-slate-600 bg-slate-700 px-3 py-1 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-600"
        >
          Hide keyboard
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
