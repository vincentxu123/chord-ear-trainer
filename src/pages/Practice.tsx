import { useEffect, useState } from 'react';
import { synth } from '../audio/synth';
import { clipPlayer } from '../audio/clipPlayer';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import { useClips } from '../store/clips';
import { useSongs } from '../store/songs';
import { filterSongEntries } from '../songs/selection';
import { useProgress } from '../store/progress';
import { AnswerPad } from '../components/AnswerPad';
import { Slots } from '../components/Slots';
import { Controls } from '../components/Controls';
import { Feedback } from '../components/Feedback';
import { SettingsPanel } from '../components/SettingsPanel';

function stopAll() {
  synth.stop();
  clipPlayer.stop();
}

export function Practice() {
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const soundSource = useSettings((s) => s.soundSource);
  const songDifficulty = useSettings((s) => s.songDifficulty);
  const songProgressFilter = useSettings((s) => s.songProgressFilter);
  const selectedArtists = useSettings((s) => s.selectedArtists);
  const instrumentalSongs = useSettings((s) => s.instrumentalSongs);
  const clipStatus = useClips((s) => s.status);
  const loadClips = useClips((s) => s.load);
  const songStatus = useSongs((s) => s.status);
  const songEntries = useSongs((s) => s.entries);
  const loadSongs = useSongs((s) => s.load);
  const progressRecords = useProgress((s) => s.records);
  const newRound = useSession((s) => s.newRound);
  const setPlayingIndex = useSession((s) => s.setPlayingIndex);
  const exercise = useSession((s) => s.exercise);
  const activeSlot = useSession((s) => s.activeSlot);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hintedExercise, setHintedExercise] = useState<typeof exercise>(null);
  const showChordHint = exercise !== null && hintedExercise === exercise;
  const currentSongOptions = {
    difficulty: songDifficulty,
    selectedArtists,
    progressFilter: songProgressFilter,
    instrumentalOnly: instrumentalSongs,
  } as const;
  const eligibleSongCount = filterSongEntries(
    songEntries,
    { ...currentSongOptions, progressFilter: 'all' },
    progressRecords,
  ).length;
  const learningSongCount = filterSongEntries(
    songEntries,
    currentSongOptions,
    progressRecords,
  ).length;

  useEffect(() => {
    void loadClips();
    void loadSongs();
  }, [loadClips, loadSongs]);

  // In clip mode, a round started before the library finished loading fell
  // back to synth; regenerate once clips become available.
  const mediaReadiness =
    soundSource === 'clips' ? clipStatus : soundSource === 'songs' ? songStatus : null;

  // Start a fresh round on load and whenever round-shape settings change.
  useEffect(() => {
    stopAll();
    setIsPlaying(false);
    newRound(useSettings.getState());
  }, [
    progressionLength,
    randomizeKey,
    includeChromatic,
    includeDiminished,
    soundSource,
    songDifficulty,
    songProgressFilter,
    selectedArtists,
    instrumentalSongs,
    mediaReadiness,
    newRound,
  ]);

  // Buffer the clip while the user is still looking at the fresh round.
  useEffect(() => {
    if (exercise?.media) clipPlayer.preload(exercise.media.url);
  }, [exercise]);

  const handlePlay = async (startIndex: number) => {
    if (!exercise) return;
    setIsLoading(true);
    const callbacks = {
      onChord: setPlayingIndex,
      onEnd: () => {
        setPlayingIndex(null);
        setIsPlaying(false);
      },
    };
    try {
      if (exercise.media) {
        await clipPlayer.play(exercise, callbacks, startIndex);
      } else {
        await synth.play(
          exercise,
          useSettings.getState().tempoBpm,
          callbacks,
          startIndex,
        );
      }
      setIsPlaying(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    stopAll();
    setPlayingIndex(null);
    setIsPlaying(false);
  };

  const handleNext = () => {
    stopAll();
    setPlayingIndex(null);
    setIsPlaying(false);
    newRound(useSettings.getState());
  };

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_22rem]">
      <div className="flex flex-col items-center gap-8">
        {!exercise && soundSource === 'songs' && (
          <div className="w-full rounded-xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-center text-sm text-amber-100">
            {songStatus === 'loading'
              ? 'Loading the song library…'
              : songStatus === 'ready'
                ? eligibleSongCount === 0
                  ? 'No excerpts match the current artist and difficulty filters.'
                  : songProgressFilter === 'learning' && learningSongCount === 0
                  ? 'You have finished every excerpt in this learning queue. Choose All excerpts, another artist, or reset your progress to review them again.'
                  : 'No excerpt is ready yet. Choose another artist or difficulty filter.'
                : 'The song library is unavailable right now.'}
          </div>
        )}
        {exercise?.song && (
          <div className="rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-sm text-amber-100">
            <span className="font-semibold">{exercise.song.title}</span>
            <span className="text-amber-200/70"> · {exercise.song.artist}</span>
            <span className="text-amber-200/70">
              {' '}· measures {exercise.song.startMeasure}–{exercise.song.endMeasure}
            </span>
            <span className="capitalize text-amber-200/70">
              {' '}· {exercise.song.difficulty}
            </span>
            <span className="text-amber-200/70"> · </span>
            <button
              type="button"
              aria-expanded={showChordHint}
              onClick={() =>
                setHintedExercise((hinted) =>
                  hinted === exercise ? null : exercise,
                )
              }
              className="font-semibold text-amber-100 underline decoration-amber-300/50 underline-offset-2 hover:text-white"
            >
              {showChordHint
                ? `${exercise.song.uniqueChordCount} unique chords`
                : 'Hint'}
            </button>
          </div>
        )}
        {exercise && (
          <>
            <Slots />
            <Controls
              onPlay={() => handlePlay(activeSlot)}
              onReplay={() => handlePlay(0)}
              onStop={handleStop}
              onSkip={handleNext}
              isPlaying={isPlaying}
              isLoading={isLoading}
            />
            <Feedback />
            <AnswerPad />
          </>
        )}
      </div>
      <SettingsPanel />
    </div>
  );
}
