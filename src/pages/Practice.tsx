import { useCallback, useEffect, useState } from 'react';
import { synth } from '../audio/synth';
import { generated } from '../audio/generated';
import { loadClips, clipToExercise } from '../data/clips';
import type { ClipRecord } from '../theory/types';
import { useSettings } from '../store/settings';
import { useSession } from '../store/session';
import { AnswerPad } from '../components/AnswerPad';
import { Slots } from '../components/Slots';
import { Controls } from '../components/Controls';
import { Feedback } from '../components/Feedback';
import { SettingsPanel } from '../components/SettingsPanel';

type Source = 'synth' | 'clip';

// Real-clip practice is parked until the labeling pipeline is accurate
// (see REAL_MUSIC_STATUS.md). Flip to true to re-enable the source toggle.
const SHOW_REAL_CLIPS = false;

export function Practice() {
  const progressionLength = useSettings((s) => s.progressionLength);
  const randomizeKey = useSettings((s) => s.randomizeKey);
  const includeChromatic = useSettings((s) => s.includeChromatic);
  const includeDiminished = useSettings((s) => s.includeDiminished);
  const newRound = useSession((s) => s.newRound);
  const loadExercise = useSession((s) => s.loadExercise);
  const setPlayingIndex = useSession((s) => s.setPlayingIndex);
  const exercise = useSession((s) => s.exercise);

  const [source, setSource] = useState<Source>('synth');
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [clipError, setClipError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const stopAll = useCallback(() => {
    synth.stop();
    generated.stop();
  }, []);

  useEffect(() => {
    loadClips().then(setClips).catch(() => setClips([]));
  }, []);

  // (Re)build the current exercise when the source, selected clip, or
  // round-shape settings change.
  useEffect(() => {
    stopAll();
    setIsPlaying(false);
    setClipError(null);
    if (source === 'synth') {
      newRound(useSettings.getState());
    } else {
      const clip = clips[clipIndex];
      if (clip) loadExercise(clipToExercise(clip));
    }
  }, [
    source,
    clipIndex,
    clips,
    progressionLength,
    randomizeKey,
    includeChromatic,
    includeDiminished,
    newRound,
    loadExercise,
    stopAll,
  ]);

  const handlePlay = async () => {
    if (!exercise) return;
    setIsLoading(true);
    setClipError(null);
    const cb = {
      onChord: setPlayingIndex,
      onEnd: () => {
        setPlayingIndex(null);
        setIsPlaying(false);
      },
    };
    try {
      if (exercise.source === 'generated') {
        await generated.play(exercise, cb);
      } else {
        await synth.play(exercise, useSettings.getState().tempoBpm, cb);
      }
      setIsPlaying(true);
    } catch {
      setClipError(
        'Could not load this clip. Add its mp3 to public/clips/ (see public/clips/README.md).',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    stopAll();
    setIsPlaying(false);
    if (source === 'synth') {
      newRound(useSettings.getState());
    } else {
      setClipIndex((i) => (clips.length ? (i + 1) % clips.length : 0));
    }
  };

  const playTonic = () => {
    if (!exercise) return;
    void synth.playChord(
      { rootPc: 0, quality: exercise.mode === 'minor' ? 'min' : 'maj' },
      exercise.key,
    );
  };

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_22rem]">
      <div className="flex flex-col items-center gap-8">
        {SHOW_REAL_CLIPS && (
          <div className="flex gap-2 rounded-lg bg-slate-800 p-1">
            {(['synth', 'clip'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                  source === s ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {s === 'synth' ? 'Synth' : 'Real clips'}
              </button>
            ))}
          </div>
        )}

        {source === 'clip' &&
          (clips.length === 0 ? (
            <p className="text-sm text-amber-400">
              No clips found. Add entries to <code>public/clips.json</code>.
            </p>
          ) : (
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <span>
                Key: <span className="font-semibold text-slate-100">{exercise?.key} {exercise?.mode}</span>
              </span>
              <button
                onClick={playTonic}
                className="rounded bg-slate-700 px-3 py-1 text-xs font-medium hover:bg-slate-600"
              >
                Hear tonic
              </button>
            </div>
          ))}

        <Slots />
        <Controls
          onPlay={handlePlay}
          onNext={handleNext}
          isPlaying={isPlaying}
          isLoading={isLoading}
        />
        {clipError && <p className="max-w-md text-center text-sm text-red-400">{clipError}</p>}
        <Feedback />
        <AnswerPad />
      </div>

      {source === 'synth' ? (
        <SettingsPanel />
      ) : (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5 text-sm text-slate-300">
          <h3 className="font-semibold text-slate-100">Real-clip practice</h3>
          <p className="mt-2 text-slate-400">
            Identify the chord progression from a music snippet. The key is given above —
            use “Hear tonic” to anchor your relative listening.
          </p>
          {clips.length > 0 && exercise && (
            <p className="mt-3">
              Clip {clipIndex + 1} / {clips.length}:{' '}
              <span className="text-slate-200">
                {exercise.progression.name || exercise.progression.id}
              </span>
            </p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Add clips by editing <code>public/clips.json</code> and dropping mp3s in{' '}
            <code>public/clips/</code>.
          </p>
        </div>
      )}
    </div>
  );
}
