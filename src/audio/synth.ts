import { SynthAudioSource } from './synthSource';

// Keep the audio source initialized before a tap. Loading it dynamically inside
// a click handler can lose the browser's user-gesture permission before
// Tone.start() runs, which leaves chord previews silent on mobile.
export const synth = new SynthAudioSource();
