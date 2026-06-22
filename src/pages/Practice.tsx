import { useEffect, useState } from 'react';
import { synth } from '../audio/synth';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import { AnswerPad } from '../components/AnswerPad';
import { Slots } from '../components/Slots';
import { Controls } from '../components/Controls';
import { Feedback } from '../components/Feedback';
import { SettingsPanel } from '../components/SettingsPanel';

export function Practice() {
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const newRound = useSession((s) => s.newRound);
  const setPlayingIndex = useSession((s) => s.setPlayingIndex);
  const exercise = useSession((s) => s.exercise);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Start a fresh round on load and whenever round-shape settings change.
  useEffect(() => {
    synth.stop();
    setIsPlaying(false);
    newRound(useSettings.getState());
  }, [progressionLength, randomizeKey, includeChromatic, newRound]);

  const handlePlay = async () => {
    if (!exercise) return;
    setIsLoading(true);
    await synth.play(exercise, useSettings.getState().tempoBpm, {
      onChord: setPlayingIndex,
      onEnd: () => {
        setPlayingIndex(null);
        setIsPlaying(false);
      },
    });
    setIsLoading(false);
    setIsPlaying(true);
  };

  const handleNext = () => {
    synth.stop();
    setIsPlaying(false);
    newRound(useSettings.getState());
  };

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_18rem]">
      <div className="flex flex-col items-center gap-8">
        <Slots />
        <Controls
          onPlay={handlePlay}
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
