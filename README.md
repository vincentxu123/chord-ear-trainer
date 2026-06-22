# Chord Ear Trainer

A web app for practicing recognition of **chord progressions by ear**. Instead of
naming exact notes, you train on the *functional movement* of a progression
(Roman numerals like `I-V-vi-IV`), which is the skill that lets you play songs by
ear and follow chord changes in real time.

Each round plays a short progression on a sampled piano in a (randomized) key.
The first chord is always given as the tonic (**I**) to anchor your relative
listening; you identify the remaining chords, submit, and get per-chord feedback.

## Features

- **Relative / functional training** — answer in Roman numerals, independent of key.
- **Given tonic anchor** — every progression starts on I (pre-filled and locked).
- **Randomized key each round** — forces true relative listening (or lock it to C major).
- **Adjustable tempo** — 100-460 BPM (default 280), changing speed without changing pitch.
- **Configurable length** — 2 to 6 chords (default 4).
- **Diatonic or chromatic vocabulary** — start with the 6 diatonic major/minor
  triads, or enable chromatic chords (`II, bIII, III, iv, bVI, VI, bVII`) for a harder set.
- **Instant feedback** — per-slot correct/incorrect with the right answer revealed, plus replay.

## Tech stack

- **React + TypeScript + Vite**
- **Tone.js** — sampled-piano synthesis and tempo-driven scheduling
- **tonal** — music-theory note/interval math
- **Zustand** — state management
- **Tailwind CSS** — styling
- **Vitest** — unit tests for the theory and scoring logic

## Getting started

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Then open the printed local URL. Click **Play** to hear the progression (the piano
samples load on first play, so an internet connection is needed initially), pick a
chord for each open slot from the answer pad, then **Submit**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Type-check without emitting |

## Project structure

```
src/
  theory/      pure music-theory logic (types, chord pools, voicing, Roman labels)
  data/        curated seed progressions
  engine/      round generation + answer scoring
  audio/       Tone.js synth audio source
  store/       Zustand stores (settings, session)
  components/  UI (controls, slots, answer pad, feedback, settings)
  pages/       Practice screen
```

The music-theory and engine layers are pure (no audio or DOM) and unit-tested.
