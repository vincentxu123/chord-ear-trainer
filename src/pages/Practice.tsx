import { useEffect, useState } from 'react';
import { synth } from '../audio/synth';
import { clipPlayer } from '../audio/clipPlayer';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import { useClips } from '../store/clips';
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
  const clipStatus = useClips((s) => s.status);
  const loadClips = useClips((s) => s.load);
  const newRound = useSession((s) => s.newRound);
  const setPlayingIndex = useSession((s) => s.setPlayingIndex);
  const exercise = useSession((s) => s.exercise);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void loadClips();
  }, [loadClips]);

  // In clip mode, a round started before the library finished loading fell
  // back to synth; regenerate once clips become available.
  const clipReadiness = soundSource === 'clips' ? clipStatus : null;

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
    clipReadiness,
    newRound,
  ]);

  // Buffer the clip while the user is still looking at the fresh round.
  useEffect(() => {
    if (exercise?.media) clipPlayer.preload(exercise.media.url);
  }, [exercise]);

  const handlePlay = async () => {
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
        await clipPlayer.play(exercise, callbacks);
      } else {
        await synth.play(exercise, useSettings.getState().tempoBpm, callbacks);
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
        <Slots />
        <Controls
          onPlay={handlePlay}
          onStop={handleStop}
          onNext={handleNext}
          isPlaying={isPlaying}
          isLoading={isLoading}
        />
        <Feedback />
        <AnswerPad />
      </div>
      <SettingsPanel />
    </div>
  );
}
