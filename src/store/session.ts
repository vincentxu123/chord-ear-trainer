import { create } from 'zustand';
import type { Chord, Exercise } from '../theory/types';
import { generateRound, scoreAttempt, type AttemptResult } from '../engine/round';
import { pickClipExercise } from './clips';
import { getSongExerciseById, pickSongExercise } from './songs';
import { useProgress } from './progress';
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
  setSongAudioVariant: (instrumental: boolean) => void;
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
    // Generated clips still fall back to synth while their library is loading.
    // Real Music keeps an explicit empty state when filters exclude everything
    // so a learner never receives an unrelated synthesized exercise.
    const exercise =
      settings.soundSource === 'clips'
        ? pickClipExercise() ?? generateRound(settings)
        : settings.soundSource === 'songs'
          ? pickSongExercise({
              difficulty: settings.songDifficulty,
              selectedArtists: settings.selectedArtists,
              progressFilter: settings.songProgressFilter,
              instrumentalOnly: settings.instrumentalSongs,
            })
          : generateRound(settings);

    if (!exercise) {
      set({
        exercise: null,
        answers: [],
        activeSlot: 0,
        result: null,
        phase: 'idle',
        playingIndex: null,
      });
      return;
    }

    const chords = exercise.progression.chords;
    const answers: (Chord | null)[] = chords.map((chord, i) =>
      i < GIVEN_SLOT_COUNT ? chord : null,
    );
    set({
      exercise,
      answers,
      activeSlot: 0,
      result: null,
      phase: 'answering',
      playingIndex: null,
    });
  },

  setSongAudioVariant: (instrumental) => {
    const { exercise } = get();
    if (exercise?.source !== 'recording') return;
    const variant = getSongExerciseById(exercise.progression.id, instrumental);
    if (!variant?.media) return;
    set({
      exercise: { ...exercise, media: variant.media },
      playingIndex: null,
    });
  },

  setActiveSlot: (slot) => {
    const chordCount = get().exercise?.progression.chords.length ?? 0;
    if (slot < 0 || slot >= chordCount) return;
    set({ activeSlot: slot });
  },

  selectChord: (chord) => {
    const { phase, answers, activeSlot } = get();
    if (phase !== 'answering') return;
    const targetSlot =
      activeSlot < GIVEN_SLOT_COUNT
        ? answers.findIndex((answer) => answer === null)
        : activeSlot;
    if (targetSlot === -1) return;
    const next = [...answers];
    next[targetSlot] = chord;
    const nextEmpty = next.findIndex((a) => a === null);
    set({ answers: next, activeSlot: nextEmpty === -1 ? targetSlot : nextEmpty });
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
    const result = scoreAttempt(answers, exercise.progression, GIVEN_SLOT_COUNT);
    if (exercise.source === 'recording') {
      useProgress.getState().recordAttempt(
        exercise.progression.id,
        result.total > 0 && result.correctCount === result.total,
      );
    }
    set({
      result,
      phase: 'revealed',
    });
  },

  setPlayingIndex: (index) => set({ playingIndex: index }),
}));
