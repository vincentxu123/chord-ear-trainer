import { create } from 'zustand';
import type { Chord, Exercise } from '../theory/types';
import { generateRound, scoreAttempt, type AttemptResult } from '../engine/round';
import { pickClipExercise } from './clips';
import { pickSongExercise } from './songs';
import type { PracticeSettings } from './settings';

export type Phase = 'idle' | 'answering' | 'revealed';

// Leading slots revealed as free anchors so the listener has a tonal foothold.
export const GIVEN_SLOT_COUNT = 1;

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
    // Clip mode falls back to synth generation while the library is missing
    // or still loading.
    const mediaExercise =
      settings.soundSource === 'clips'
        ? pickClipExercise()
        : settings.soundSource === 'songs'
          ? pickSongExercise(settings.songDifficulty)
          : null;
    const exercise = mediaExercise ?? generateRound(settings);
    const chords = exercise.progression.chords;
    const answers: (Chord | null)[] = chords.map((chord, i) =>
      i < GIVEN_SLOT_COUNT ? chord : null,
    );
    const firstEmpty = answers.findIndex((a) => a === null);
    set({
      exercise,
      answers,
      activeSlot: firstEmpty === -1 ? 0 : firstEmpty,
      result: null,
      phase: 'answering',
      playingIndex: null,
    });
  },

  setActiveSlot: (slot) => {
    if (slot < GIVEN_SLOT_COUNT) return;
    set({ activeSlot: slot });
  },

  selectChord: (chord) => {
    const { phase, answers, activeSlot } = get();
    if (phase !== 'answering' || activeSlot < GIVEN_SLOT_COUNT) return;
    const next = [...answers];
    next[activeSlot] = chord;
    const nextEmpty = next.findIndex((a) => a === null);
    set({ answers: next, activeSlot: nextEmpty === -1 ? activeSlot : nextEmpty });
  },

  clearSlot: (slot) => {
    const { phase, answers } = get();
    if (phase !== 'answering' || slot < GIVEN_SLOT_COUNT) return;
    const next = [...answers];
    next[slot] = null;
    set({ answers: next, activeSlot: slot });
  },

  submit: () => {
    const { exercise, answers, phase } = get();
    if (!exercise || phase !== 'answering') return;
    if (answers.some((a) => a === null)) return;
    set({
      result: scoreAttempt(answers, exercise.progression, GIVEN_SLOT_COUNT),
      phase: 'revealed',
    });
  },

  setPlayingIndex: (index) => set({ playingIndex: index }),
}));
