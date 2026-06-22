import { create } from 'zustand';
import type { Chord } from '../theory/types';
import { DIATONIC_MAJOR, CHROMATIC_POOL } from '../theory/chords';

export interface PracticeSettings {
  tempoBpm: number; // 60-160
  progressionLength: number; // 2-6
  includeChromatic: boolean; // reserved for a later phase
  allowedChords: Chord[];
  randomizeKey: boolean;
}

export const TEMPO_MIN = 100;
export const TEMPO_MAX = 460;
export const LENGTH_MIN = 2;
export const LENGTH_MAX = 6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface SettingsStore extends PracticeSettings {
  setTempo: (bpm: number) => void;
  setLength: (length: number) => void;
  setRandomizeKey: (value: boolean) => void;
  setIncludeChromatic: (value: boolean) => void;
}

export const useSettings = create<SettingsStore>((set) => ({
  tempoBpm: 280,
  progressionLength: 4,
  includeChromatic: false,
  allowedChords: DIATONIC_MAJOR,
  randomizeKey: true,
  setTempo: (bpm) => set({ tempoBpm: clamp(Math.round(bpm), TEMPO_MIN, TEMPO_MAX) }),
  setLength: (length) => set({ progressionLength: clamp(length, LENGTH_MIN, LENGTH_MAX) }),
  setRandomizeKey: (value) => set({ randomizeKey: value }),
  setIncludeChromatic: (value) =>
    set({ includeChromatic: value, allowedChords: value ? CHROMATIC_POOL : DIATONIC_MAJOR }),
}));
