import { create } from 'zustand';
import { readStored, writeStored } from './persistence';

export type ExcerptOutcome = 'correct' | 'incorrect';

export interface ExcerptProgress {
  attempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  lastOutcome: ExcerptOutcome;
  lastAttemptAt: number;
}

export type ExcerptStatus = 'unseen' | 'needs-practice' | 'mastered';

interface ProgressStore {
  records: Record<string, ExcerptProgress>;
  recordAttempt: (excerptId: string, correct: boolean) => void;
  reset: () => void;
}

export const PROGRESS_STORAGE_KEY = 'chord-ear-trainer:excerpt-progress:v1';

export function getExcerptStatus(
  excerptId: string,
  records: Record<string, ExcerptProgress>,
): ExcerptStatus {
  const record = records[excerptId];
  if (!record) return 'unseen';
  return record.lastOutcome === 'correct' ? 'mastered' : 'needs-practice';
}

export function recordExcerptAttempt(
  records: Record<string, ExcerptProgress>,
  excerptId: string,
  correct: boolean,
  attemptedAt: number,
): Record<string, ExcerptProgress> {
  const previous = records[excerptId];
  const next: ExcerptProgress = {
    attempts: (previous?.attempts ?? 0) + 1,
    correctAttempts: (previous?.correctAttempts ?? 0) + (correct ? 1 : 0),
    incorrectAttempts: (previous?.incorrectAttempts ?? 0) + (correct ? 0 : 1),
    lastOutcome: correct ? 'correct' : 'incorrect',
    lastAttemptAt: attemptedAt,
  };
  return { ...records, [excerptId]: next };
}

const initialRecords = readStored<Record<string, ExcerptProgress>>(
  PROGRESS_STORAGE_KEY,
  {},
);

export const useProgress = create<ProgressStore>((set) => ({
  records: initialRecords,
  recordAttempt: (excerptId, correct) => {
    set((state) => {
      const records = recordExcerptAttempt(state.records, excerptId, correct, Date.now());
      writeStored(PROGRESS_STORAGE_KEY, records);
      return { records };
    });
  },
  reset: () => {
    writeStored(PROGRESS_STORAGE_KEY, {});
    set({ records: {} });
  },
}));
