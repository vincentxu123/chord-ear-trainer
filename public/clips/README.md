# Clip audio files

Drop the generated music snippets (mp3) referenced by `public/clips.json` here.

## Milestone 1 — add your first clip

1. Generate a short, simple pop chorus in Suno (e.g. C major, chords C–G–Am–F,
   ~90 bpm, ~12–16s). Download the mp3.
2. Save it here as the filename used in `clips.json`, e.g. `clip-001.mp3`
   (the placeholder entry expects `/clips/clip-001.mp3`).
3. Hand-label that entry in `public/clips.json`:
   - `key` + `mode` — the tonic the clip is in.
   - `chords` — the **relative** progression as `{ rootPc, quality }` (semitones
     above the tonic; `maj` / `min` / `dim`). For C major: `I = {0,maj}`,
     `V = {7,maj}`, `vi = {9,min}`, `IV = {5,maj}`.
   - `chordTimesSec` — the start time (seconds) of each chord.
   - `durationSec` / `startSec` / `endSec` — the playback window.
   - set `verified` to `true` once you've confirmed it by ear.
4. In the app, switch to **Real clips**, press **Play**, and identify the chords.

The progression is stored relative, so scoring reuses the same engine as synth
mode. See `REAL_MUSIC_PROPOSAL.md` for the full plan.
