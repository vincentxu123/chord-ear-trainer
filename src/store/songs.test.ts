import { describe, expect, it } from 'vitest';
import { songClipUrl } from './songs';

describe('offline song URLs', () => {
  it('includes the library revision so updated audio cannot reuse a stale response', () => {
    expect(songClipUrl('example.mp3', 'revision 2')).toContain(
      'song-clips/example.mp3?library=revision%202',
    );
  });
});
