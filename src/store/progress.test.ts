import { describe, expect, it } from 'vitest';
import {
  getExcerptStatus,
  recordExcerptAttempt,
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
});
