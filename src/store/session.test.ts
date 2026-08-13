import { beforeEach, describe, expect, it } from 'vitest';
import type { PracticeSettings } from './settings';
import { GIVEN_SLOT_COUNT, useSession } from './session';
import { useSongs } from './songs';
import { useProgress } from './progress';
import type { SongClipManifestEntry } from '../songs/types';

const settings: PracticeSettings = {
  soundSource: 'synth',
  tempoBpm: 280,
  progressionLength: 4,
  includeChromatic: false,
  includeDiminished: false,
  randomizeKey: false,
  songDifficulty: 'all',
  songProgressFilter: 'learning',
  selectedArtists: null,
  playChordOnSelection: false,
  instrumentalSongs: false,
};

describe('session playback selection', () => {
  beforeEach(() => useSession.getState().newRound(settings));

  it('selects the given first chord without blocking answer entry', () => {
    expect(useSession.getState().activeSlot).toBe(0);

    const answer = { rootPc: 7, quality: 'maj' as const };
    useSession.getState().selectChord(answer);

    const state = useSession.getState();
    expect(state.answers[GIVEN_SLOT_COUNT]).toEqual(answer);
    expect(state.activeSlot).toBe(GIVEN_SLOT_COUNT + 1);
  });

  it('leaves Real Music empty when no excerpt matches instead of using synth', () => {
    useSongs.setState({ entries: [] });
    useSession.getState().newRound({ ...settings, soundSource: 'songs' });

    const state = useSession.getState();
    expect(state.exercise).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('records a submitted recording result in excerpt progress', () => {
    const chord = { rootPc: 0, quality: 'maj' as const };
    useProgress.getState().reset();
    useSession.setState({
      exercise: {
        progression: {
          id: 'song-excerpt-1',
          name: 'Test excerpt',
          chords: [chord, { rootPc: 5, quality: 'maj' }],
          beatsPerChord: 1,
        },
        key: 'C',
        mode: 'major',
        source: 'recording',
      },
      answers: [chord, { rootPc: 5, quality: 'maj' }],
      phase: 'answering',
      result: null,
    });

    useSession.getState().submit();

    expect(useProgress.getState().records['song-excerpt-1']?.lastOutcome).toBe('correct');
  });

  it('switches a song audio variant without resetting the round or progress', () => {
    const entry: SongClipManifestEntry = {
      id: 'song-excerpt-1',
      file: 'song-excerpt-1.mp3',
      instrumentalFile: 'song-excerpt-1-instrumental.mp3',
      title: 'Test Song',
      artist: 'Test Artist',
      startMeasure: 1,
      endMeasure: 2,
      key: 'C',
      mode: 'major',
      bpm: 120,
      durationSec: 4,
      chords: [
        { rootPc: 0, quality: 'maj' },
        { rootPc: 5, quality: 'maj' },
      ],
      cueTimesSec: [0, 2],
      measureChordCounts: [1, 1],
    };
    useSongs.setState({ entries: [entry], status: 'ready' });
    useProgress.setState({
      records: {
        [entry.id]: {
          attempts: 1,
          correctAttempts: 0,
          incorrectAttempts: 1,
          lastOutcome: 'incorrect',
          lastAttemptAt: 123,
        },
      },
    });
    useSession.getState().newRound({ ...settings, soundSource: 'songs' });
    useSession.getState().selectChord(entry.chords[1]!);

    const before = useSession.getState();
    const progressBefore = useProgress.getState().records;
    useSession.getState().setSongAudioVariant(true);
    const after = useSession.getState();

    expect(after.exercise?.progression).toBe(before.exercise?.progression);
    expect(after.exercise?.media?.url).toBe(
      '/song-clips/song-excerpt-1-instrumental.mp3',
    );
    expect(after.answers).toBe(before.answers);
    expect(after.activeSlot).toBe(before.activeSlot);
    expect(after.phase).toBe(before.phase);
    expect(after.result).toBe(before.result);
    expect(useProgress.getState().records).toBe(progressBefore);
  });
});
