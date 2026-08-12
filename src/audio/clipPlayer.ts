import type { Exercise } from '../theory/types';
import { exactClipDurationSec } from '../clips/musicgenChords';

// Must match CLIP_PASSES in src/clips/spec.ts (kept local so the player
// doesn't pull the offline generator into the browser bundle).
const PLAYBACK_PASSES = 2;

interface PlayCallbacks {
  onChord?: (index: number) => void;
  onEnd?: () => void;
}

// Tier-2 AudioSource: plays a pre-rendered clip (exercise.media) with an
// HTMLAudioElement. Slot highlights are derived from playback time using the
// recording's BPM. Generated files are often ~1s longer than exactly two
// passes (MusicGen wants whole seconds), so we stop at the exact two-pass
// boundary instead of waiting for the file to end.
export class ClipAudioSource {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private raf = 0;
  private detach: (() => void) | null = null;

  // Start buffering a clip ahead of the user pressing Play.
  preload(url: string): void {
    if (this.url === url && this.audio) return;
    this.stop();
    this.audio = new Audio(url);
    this.audio.preload = 'auto';
    this.url = url;
  }

  async play(exercise: Exercise, cb: PlayCallbacks = {}, startIndex = 0): Promise<void> {
    const media = exercise.media;
    if (!media) throw new Error('Exercise has no media clip');
    this.preload(media.url);
    const audio = this.audio!;
    this.stopTracking();

    const { chords, beatsPerChord } = exercise.progression;
    const chordSec = beatsPerChord * (60 / media.bpm);
    const cueTimes = media.cueTimesSec;
    const firstChord = Math.max(0, Math.min(startIndex, chords.length - 1));
    audio.currentTime = cueTimes?.[firstChord] ?? firstChord * chordSec;
    const endSec = cueTimes
      ? media.durationSec
      : exactClipDurationSec(chords.length, beatsPerChord, media.bpm, PLAYBACK_PASSES);
    let last = -1;
    let currentCue = firstChord;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      this.stopTracking();
      audio.pause();
      cb.onEnd?.();
    };

    const tick = () => {
      if (audio.currentTime >= endSec) {
        finish();
        return;
      }
      while (
        cueTimes &&
        currentCue + 1 < cueTimes.length &&
        cueTimes[currentCue + 1]! <= audio.currentTime
      ) {
        currentCue += 1;
      }
      const index = cueTimes ? currentCue : Math.floor(audio.currentTime / chordSec) % chords.length;
      if (index !== last) {
        last = index;
        cb.onChord?.(index);
      }
      this.raf = requestAnimationFrame(tick);
    };

    // Fallback if the file is shorter than the theoretical end (shouldn't
    // happen for our generator, but keep the natural ended event).
    const onEnded = () => finish();
    audio.addEventListener('ended', onEnded);
    this.detach = () => audio.removeEventListener('ended', onEnded);

    await audio.play();
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.stopTracking();
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  private stopTracking(): void {
    cancelAnimationFrame(this.raf);
    this.detach?.();
    this.detach = null;
  }
}

export const clipPlayer = new ClipAudioSource();
