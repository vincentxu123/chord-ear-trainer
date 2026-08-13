import { create } from 'zustand';
import type { SongDifficulty } from '../songs/difficulty';
import { readStored, writeStored } from './persistence';

// Media modes play static assets; 'clips' are generated and 'songs' are
// validated excerpts from commercial recordings (see ARCHITECTURE.md).
export type SoundSource = 'synth' | 'clips' | 'songs';
export type SongProgressFilter = 'learning' | 'all';

export interface PracticeSettings {
  soundSource: SoundSource;
  tempoBpm: number; // TEMPO_MIN..TEMPO_MAX
  progressionLength: number; // LENGTH_MIN..LENGTH_MAX
  includeChromatic: boolean; // widen the pool with out-of-key chords
  includeDiminished: boolean; // add the diatonic diminished triad (vii° / ii°)
  randomizeKey: boolean;
  songDifficulty: SongDifficulty;
  songProgressFilter: SongProgressFilter;
  selectedArtists: string[] | null;
  playChordOnSelection: boolean;
  instrumentalSongs: boolean;
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
  setSongProgressFilter: (filter: SongProgressFilter) => void;
  setSelectedArtists: (artists: string[] | null) => void;
  setPlayChordOnSelection: (value: boolean) => void;
  setInstrumentalSongs: (value: boolean) => void;
}

const SETTINGS_STORAGE_KEY = 'chord-ear-trainer:settings:v1';

const DEFAULT_SETTINGS: PracticeSettings = {
  soundSource: 'songs',
  tempoBpm: 280,
  progressionLength: 4,
  includeChromatic: false,
  includeDiminished: false,
  randomizeKey: true,
  songDifficulty: 'all',
  songProgressFilter: 'learning',
  selectedArtists: null,
  playChordOnSelection: false,
  instrumentalSongs: false,
};

const STORED_SETTINGS = readStored<Partial<PracticeSettings>>(SETTINGS_STORAGE_KEY, {});
const INITIAL_SETTINGS: PracticeSettings = {
  ...DEFAULT_SETTINGS,
  ...STORED_SETTINGS,
};

function persistSettings(settings: PracticeSettings): void {
  writeStored(SETTINGS_STORAGE_KEY, settings);
}

export const useSettings = create<SettingsStore>((set) => {
  const update = (patch: Partial<PracticeSettings>) => {
    set((state) => {
      const next = { ...state, ...patch };
      persistSettings({
        soundSource: next.soundSource,
        tempoBpm: next.tempoBpm,
        progressionLength: next.progressionLength,
        includeChromatic: next.includeChromatic,
        includeDiminished: next.includeDiminished,
        randomizeKey: next.randomizeKey,
        songDifficulty: next.songDifficulty,
        songProgressFilter: next.songProgressFilter,
        selectedArtists: next.selectedArtists,
        playChordOnSelection: next.playChordOnSelection,
        instrumentalSongs: next.instrumentalSongs,
      });
      return patch;
    });
  };

  return {
    ...INITIAL_SETTINGS,
    setSoundSource: (source) => update({ soundSource: source }),
    setTempo: (bpm) => update({ tempoBpm: clamp(Math.round(bpm), TEMPO_MIN, TEMPO_MAX) }),
    setLength: (length) => update({ progressionLength: clamp(length, LENGTH_MIN, LENGTH_MAX) }),
    setRandomizeKey: (value) => update({ randomizeKey: value }),
    setIncludeChromatic: (value) => update({ includeChromatic: value }),
    setIncludeDiminished: (value) => update({ includeDiminished: value }),
    setSongDifficulty: (difficulty) => update({ songDifficulty: difficulty }),
    setSongProgressFilter: (filter) => update({ songProgressFilter: filter }),
    setSelectedArtists: (artists) => update({ selectedArtists: artists }),
    setPlayChordOnSelection: (value) => update({ playChordOnSelection: value }),
    setInstrumentalSongs: (value) => update({ instrumentalSongs: value }),
  };
});
