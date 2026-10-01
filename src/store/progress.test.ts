import { describe, expect, it } from 'vitest';
import {
  getExcerptStatus,
  recordExcerptAttempt,
  useProgress,
  type ExcerptProgress,
} from './progress';

describe('excerpt progress', () => {
  it('classifies unseen, needs-practice, and mastered excerpts', () => {
    const records: Record<string, ExcerptProgress> = {};
    expect(getExcerptStatus('new', records)).toBe('unseen');

    const afterWrong = recordExcerptAttempt(records, 'new', false, 100);
    expect(getExcerptStatus('new', afterWrong)).toBe('needs-practice');

    const afterCorrect = recordExcerptAttempt(afterWrong, 'new', true, 200);
    expect(getExcerptStatus('new', afterCorrect)).toBe('mastered');
    expect(afterCorrect.new).toEqual({
      attempts: 2,
      correctAttempts: 1,
      incorrectAttempts: 1,
      lastOutcome: 'correct',
      lastAttemptAt: 200,
    });
  });
  it('removes progress for excerpts from past rotations only', () => {
    const progress = { attempts: 1, correctAttempts: 1, incorrectAttempts: 0, lastOutcome: 'correct' as const, lastAttemptAt: 100 };
    useProgress.setState({ records: {
      'manual-m001': progress,
      '20261001T090000Z-old-m001': progress,
      '20261015T090000Z-new-m001': progress,
    } });
    useProgress.getState().pruneRotation(new Set(['20261015T090000Z-new-m001']));
    expect(Object.keys(useProgress.getState().records).sort()).toEqual([
      '20261015T090000Z-new-m001', 'manual-m001',
    ]);
  });
  it('resets only the selected collection', () => {
    const progress = { attempts: 1, correctAttempts: 0, incorrectAttempts: 1, lastOutcome: 'incorrect' as const, lastAttemptAt: 100 };
    useProgress.setState({ records: { manual: progress, rotation: progress } });
    useProgress.getState().resetEntries(new Set(['rotation']));
    expect(useProgress.getState().records).toEqual({ manual: progress });
  });
});
