// Listening aid for recorded clips: emphasize or isolate the bass register so
// root motion is easier to follow. Filtering runs in the browser on the same
// MP3 the player already uses; no extra audio is published or downloaded.
export type BassEmphasis = 'off' | 'boost' | 'solo';

export const BASS_EMPHASIS_ORDER: readonly BassEmphasis[] = ['off', 'boost', 'solo'];

export function nextBassEmphasis(mode: BassEmphasis): BassEmphasis {
  const index = BASS_EMPHASIS_ORDER.indexOf(mode);
  return BASS_EMPHASIS_ORDER[(index + 1) % BASS_EMPHASIS_ORDER.length]!;
}

export interface BassFilterParams {
  // Low-shelf boost applied below SHELF_HZ.
  shelfGainDb: number;
  // Cutoff of the two cascaded low-pass stages. OPEN_HZ leaves them inaudible.
  lowpassHz: number;
  // Linear gain after the filters: headroom for the boost, make-up for solo.
  outputGain: number;
}

export const SHELF_HZ = 200;
export const OPEN_HZ = 20000;
export const SOLO_HZ = 250;

const PARAMS: Record<BassEmphasis, BassFilterParams> = {
  off: { shelfGainDb: 0, lowpassHz: OPEN_HZ, outputGain: 1 },
  // +10 dB of bass with 4.4 dB less overall level, so loud masters do not clip.
  boost: { shelfGainDb: 10, lowpassHz: OPEN_HZ, outputGain: 0.6 },
  solo: { shelfGainDb: 0, lowpassHz: SOLO_HZ, outputGain: 1.6 },
};

export function bassFilterParams(mode: BassEmphasis): BassFilterParams {
  return PARAMS[mode] ?? PARAMS.off;
}

type AudioContextConstructor = typeof AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as typeof window & { webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

// Web Audio lowpass Q is in decibels; -3 dB is the flat (Butterworth) setting.
const LOWPASS_Q_DB = -3;
const RAMP_SEC = 0.03;

// source -> low shelf -> low-pass x2 -> gain -> limiter -> speakers.
//
// The chain is only built once an emphasis is first requested. Until then
// clips keep playing straight from their <audio> element, so listeners who
// never use the control are unaffected by Web Audio autoplay rules.
export class BassFilterChain {
  private mode: BassEmphasis = 'off';
  private context: AudioContext | null = null;
  private shelf: BiquadFilterNode | null = null;
  private lowpasses: BiquadFilterNode[] = [];
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private readonly sources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();
  private unavailable = false;

  get emphasis(): BassEmphasis {
    return this.mode;
  }

  // True once any element may be routed through the chain.
  get engaged(): boolean {
    return this.context !== null;
  }

  setMode(mode: BassEmphasis): void {
    this.mode = mode;
    this.applyParams();
  }

  // Route an element through the chain. Returns false when it keeps playing
  // directly (emphasis never requested, or Web Audio is unavailable).
  attach(audio: HTMLAudioElement): boolean {
    if (this.mode === 'off' && !this.engaged) return false;
    const context = this.ensureContext();
    if (!context || !this.shelf) return false;

    let source = this.sources.get(audio);
    if (!source) {
      try {
        source = context.createMediaElementSource(audio);
      } catch {
        return false;
      }
      this.sources.set(audio, source);
    }
    if (this.source !== source) {
      this.source?.disconnect();
      source.connect(this.shelf);
      this.source = source;
    }
    // An element captured by a suspended context is silent, so wake it here.
    // This is not awaited: attach() runs inside a tap, and waiting could cost
    // the element's own permission to start playback on mobile browsers.
    if (context.state !== 'running') void context.resume().catch(() => undefined);
    return true;
  }

  private ensureContext(): AudioContext | null {
    if (this.context || this.unavailable) return this.context;
    const Constructor = audioContextConstructor();
    if (!Constructor) {
      this.unavailable = true;
      return null;
    }
    try {
      const context = new Constructor();
      const shelf = context.createBiquadFilter();
      shelf.type = 'lowshelf';
      shelf.frequency.value = SHELF_HZ;
      const lowpasses = [context.createBiquadFilter(), context.createBiquadFilter()];
      for (const lowpass of lowpasses) {
        lowpass.type = 'lowpass';
        lowpass.Q.value = LOWPASS_Q_DB;
      }
      const gain = context.createGain();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;

      shelf.connect(lowpasses[0]!);
      lowpasses[0]!.connect(lowpasses[1]!);
      lowpasses[1]!.connect(gain);
      gain.connect(limiter);
      limiter.connect(context.destination);

      this.context = context;
      this.shelf = shelf;
      this.lowpasses = lowpasses;
      this.gain = gain;
      this.applyParams(true);
    } catch {
      this.unavailable = true;
      this.context = null;
    }
    return this.context;
  }

  private applyParams(immediate = false): void {
    const { context, shelf, gain } = this;
    if (!context || !shelf || !gain) return;
    const params = bassFilterParams(this.mode);
    const lowpassHz = Math.min(params.lowpassHz, context.sampleRate / 2 - 100);
    const set = (param: AudioParam, value: number) => {
      if (immediate) param.value = value;
      else param.setTargetAtTime(value, context.currentTime, RAMP_SEC);
    };
    set(shelf.gain, params.shelfGainDb);
    for (const lowpass of this.lowpasses) set(lowpass.frequency, lowpassHz);
    set(gain.gain, params.outputGain);
  }
}
