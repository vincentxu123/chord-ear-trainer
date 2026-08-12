import { create } from 'zustand';
import type { SongDifficulty } from '../songs/difficulty';

// Media modes play static assets; 'clips' are generated and 'songs' are
// validated excerpts from commercial recordings (see ARCHITECTURE.md).
export type SoundSource = 'synth' | 'clips' | 'songs';

export interface PracticeSettings {
  soundSource: SoundSource;
  tempoBpm: number; // TEMPO_MIN..TEMPO_MAX
  progressionLength: number; // LENGTH_MIN..LENGTH_MAX
  includeChromatic: boolean; // widen the pool with out-of-key chords
  includeDiminished: boolean; // add the diatonic diminished triad (vii° / ii°)
  randomizeKey: boolean;
  songDifficulty: SongDifficulty;
  showAbsoluteChordNames: boolean;
}

export const TEMPO_MIN = 100;
export const TEMPO_MAX = 460;
export const LENGTH_MIN = 2;
export const LENGTH_MAX = 6;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

interface SettingsStore extends PracticeSettings {
  setSoundSource: (source: SoundSource) => void;
  setTempo: (bpm: number) => void;
  setLength: (length: number) => void;
  setRandomizeKey: (value: boolean) => void;
  setIncludeChromatic: (value: boolean) => void;
  setIncludeDiminished: (value: boolean) => void;
  setSongDifficulty: (difficulty: SongDifficulty) => void;
  setShowAbsoluteChordNames: (value: boolean) => void;
}

export const useSettings = create<SettingsStore>((set) => ({
  soundSource: 'songs',
  tempoBpm: 280,
  progressionLength: 4,
  includeChromatic: false,
  includeDiminished: false,
  randomizeKey: true,
  songDifficulty: 'all',
  showAbsoluteChordNames: true,
  setSoundSource: (source) => set({ soundSource: source }),
  setTempo: (bpm) => set({ tempoBpm: clamp(Math.round(bpm), TEMPO_MIN, TEMPO_MAX) }),
  setLength: (length) => set({ progressionLength: clamp(length, LENGTH_MIN, LENGTH_MAX) }),
  setRandomizeKey: (value) => set({ randomizeKey: value }),
  setIncludeChromatic: (value) => set({ includeChromatic: value }),
  setIncludeDiminished: (value) => set({ includeDiminished: value }),
  setSongDifficulty: (difficulty) => set({ songDifficulty: difficulty }),
  setShowAbsoluteChordNames: (value) => set({ showAbsoluteChordNames: value }),
}));
