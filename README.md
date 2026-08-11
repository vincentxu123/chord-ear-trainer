# Chord Ear Trainer

A web app for practicing **chord progressions by ear**. Instead of naming exact
notes, you train on *functional movement* — Roman numerals like `I–V–vi–IV` —
the skill that helps you hear songs and follow changes in real time.

Each round plays a short progression. The **first chord is given** as an anchor
(it doesn’t have to be I); you identify the rest, submit, and get per-slot
feedback.

## Sound sources

| Mode | What you hear |
|------|----------------|
| **Piano** | Progressions synthesized on the fly with a sampled piano (Tone.js). Unlimited variety; tempo, length, key, and chromatic options are adjustable. |
| **Generated** | Short instrumental clips generated offline with AI (full-band texture over a known 4-chord loop). Tempo/length come from the recording. |
| **Jay Chou** | Four-measure excerpts from real songs. Only rows where both timing/chord pipelines agree are exported. |

Switch between them in the settings panel. Real music unlocks once
`public/clips/manifest.json` has entries (this repo may already include a small
library).

## Features

- Relative / Roman-numeral answers, independent of absolute key
- First chord pre-filled and locked as a listening anchor
- Piano mode: randomized key, adjustable tempo (100–460 BPM), 2–6 chords, optional chromatic / diminished vocabulary
- Generated mode: AI clips with Stop / Replay and BPM-synced slot highlights
- Jay Chou mode: exact chord-change cues, measure-grouped answers, and absolute chord labels
- Instant per-slot feedback and click-to-audition chords after reveal
- Interactive piano keyboard at the bottom of the screen

## Tech stack

- React + TypeScript + Vite
- Tone.js (piano synthesis) + HTMLAudioElement (clip playback)
- tonal (theory math)
- Zustand (state)
- Tailwind CSS
- Vitest

Offline clip tooling (not required to play the app): Replicate (MusicGen-Chord)
and Python / lv-chordia for label QC — see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Getting started

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Open the local URL Vite prints. Click **Play**, fill the open slots from the
answer pad, then **Submit**. Piano samples load from a CDN on first play (needs
network once).

### Optional: generate more Real music clips

Clip generation is offline and optional. It needs a Replicate API token and a
small Python venv for QC. Full strategy, validation rules, and commands are in
[ARCHITECTURE.md](./ARCHITECTURE.md).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview the production build |
| `npm test` | Unit tests (theory, engine, clip helpers) |
| `npm run typecheck` | Type-check only |
| `npm run clips:generate` | Offline: generate + QC clips into `public/clips/` |
| `npm run clips:qc` | Offline: re-validate the existing clip library |
| `npm run songs:export` | Offline: export strictly agreed recording candidates into `public/song-clips/` |

## Project structure

```
src/
  theory/       Pure music-theory (types, pools, Roman labels, voicing)
  engine/       Round generation + scoring
  audio/        Synth piano + clip player
  clips/        Manifest types, MusicGen chord syntax, clip → Exercise
  store/        Zustand (settings, session, clip library)
  components/   UI (slots, answer pad, controls, settings, keyboard)
  pages/        Practice screen
scripts/
  generateClips.ts   Replicate generation + QC gate
  qcClips.py         lv-chordia label validation
  renumberClips.ts   Sequential clip IDs after curation
public/clips/        MP3 library + manifest.json (curated, ~60 clips)
public/song-clips/   Eligible real-song excerpts + exact cue manifest
```

The commercial-recording pipeline is intended for private research and review.
Do not deploy its audio publicly unless you have the necessary distribution
rights; the analysis code works independently of the bundled examples.

Theory and engine layers are pure (no audio/DOM) and covered by unit tests.
Deeper notes on how Real music clips are produced and validated live in
[ARCHITECTURE.md](./ARCHITECTURE.md).
