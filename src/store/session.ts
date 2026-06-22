import { create } from 'zustand';
import type { Chord, Exercise } from '../theory/types';
import { generateRound, scoreAttempt, type AttemptResult } from '../engine/round';
import type { PracticeSettings } from './settings';

export type Phase = 'idle' | 'answering' | 'revealed';

interface SessionStore {
  exercise: Exercise | null;
  answers: (Chord | null)[];
  activeSlot: number;
  result: AttemptResult | null;
  phase: Phase;
  playingIndex: number | null;

  newRound: (settings: PracticeSettings) => void;
  setActiveSlot: (slot: number) => void;
  selectChord: (chord: Chord) => void;
  clearSlot: (slot: number) => void;
  submit: () => void;
  setPlayingIndex: (index: number | null) => void;
}

export const useSession = create<SessionStore>((set, get) => ({
  exercise: null,
  answers: [],
  activeSlot: 0,
  result: null,
  phase: 'idle',
  playingIndex: null,

  newRound: (settings) => {
    const exercise = generateRound(settings);
    const answers: (Chord | null)[] = Array(exercise.progression.chords.length).fill(null);
    set({
      exercise,
      answers,
      activeSlot: 0,
      result: null,
      phase: 'answering',
      playingIndex: null,
    });
  },

  setActiveSlot: (slot) => set({ activeSlot: slot }),

  selectChord: (chord) => {
    const { phase, answers, activeSlot } = get();
    if (phase !== 'answering') return;
    const next = [...answers];
    next[activeSlot] = chord;
    const nextEmpty = next.findIndex((a) => a === null);
    set({ answers: next, activeSlot: nextEmpty === -1 ? activeSlot : nextEmpty });
  },

  clearSlot: (slot) => {
    const { phase, answers } = get();
    if (phase !== 'answering') return;
    const next = [...answers];
    next[slot] = null;
    set({ answers: next, activeSlot: slot });
  },

  submit: () => {
    const { exercise, answers, phase } = get();
    if (!exercise || phase !== 'answering') return;
    if (answers.some((a) => a === null)) return;
    set({ result: scoreAttempt(answers, exercise.progression), phase: 'revealed' });
  },

  setPlayingIndex: (index) => set({ playingIndex: index }),
}));
