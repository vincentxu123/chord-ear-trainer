# Real-Music Clips - Phase Status & Handoff

Status as of 2026-06-23. This document is written for a future agent (or future
self) picking up the "real music" track of the chord ear-trainer. It records
what shipped, what's scaffolded, what we proved, what's blocking us, and the
open decisions. Read `REAL_MUSIC_PROPOSAL.md` for the original plan and this
file for the current reality.

---

## 1. Goal of this track

Phase 1 (synth ear-training) is shipped. This track adds a second practice
source: **real music snippets** so users practice recognizing chord
progressions by ear on actual audio, not just synthesized chords.

Two automation goals drove the work:

1. **Generation** - one command that produces a short (~3-4 chord) instrumental
   clip with Suno and adds it to our clip database.
2. **Labeling** - an automated pipeline that detects the key + chord progression
   of a clip so we don't hand-label, and can trust the answer key.

The progression is always stored **relative** (`rootPc` + `quality` against the
clip's tonic) so scoring reuses the exact same engine as synth mode. The app
**gives the tonic up front** ("Key: X" + "Hear tonic") because real audio can't
be transposed the way synth can.

---

## 2. Locked decisions (do not relitigate without reason)

- **Path 2**: Suno-generated audio + open-source chord detection (detection is
  the source of truth, not the prompt).
- **Tonic is established/given** to the user before they guess.
- **Storage**: static `public/clips.json` + mp3s in `public/clips/`. Supabase
  migration is deferred.
- **Suno access**: paid third-party API, targeting **kie.ai**, but kept
  config-driven (base URL + key in `.env`) so it's swappable.
- **Instrumental now**, vocals later via a `--vocals` toggle (vocals/percussion
  hurt chord detection).
- **Orchestration**: all-Python pipeline, exposed via `npm run gen-clip`.
- **Acceptance**: auto-accept clips that pass the gate. **(See the warning in
  §6 - this needs revisiting.)**
- **Detector**: started with a pip-only **librosa** detector (Windows-friendly).
  Chordino-via-Docker is the planned accuracy upgrade if needed.

---

## 3. What shipped (runtime / frontend) - DONE & verified

All of this is built, typechecks, and passes the 27-test suite + production
build.

- `src/theory/types.ts`
  - `ClipRecord` type (id, title, source, audioPath, key, mode, chords,
    chordTimesSec, durationSec, startSec/endSec, verified, optional
    `autoLabeled` + `instrumental`).
  - `Exercise` extended with optional media fields: `audioPath`,
    `chordTimesSec`, `startSec`, `endSec`.
- `src/audio/generated.ts` - `GeneratedAudioSource` (+ `generated` singleton).
  Loads an mp3 via `Tone.Player`, plays the `[startSec, endSec]` window, and
  fires `onChord(i)` at each `chordTimesSec` (absolute file seconds; it
  subtracts `startSec` itself). Same callback contract as the synth source.
- `src/data/clips.ts` - `loadClips()` (fetches `/clips.json`) and
  `clipToExercise()` (maps a record to a runtime `Exercise`).
- `src/store/session.ts` - `loadExercise()` action; `newRound()` now delegates
  to it, so synth rounds and clip rounds share the answering/scoring flow.
- `src/components/AnswerPad.tsx` - for generated clips the pad shows the full
  vocabulary UNION the clip's own chords (guarantees every correct answer is
  selectable); amber "out-of-key" legend shows when the pool has chromatic
  chords.
- `src/pages/Practice.tsx` - **Synth / Real clips** toggle, clip loading +
  "Next advances to next clip", play routed to the right audio source, a
  "Key: … / Hear tonic" banner, a right-column clip-info panel, and a graceful
  "add the mp3" error if a clip file is missing.
- `public/clips.json` - currently ONE entry, `clip-001`, an mp3 the user added.
  **Its labels are intentionally wrong** - it was only used to prove the loop.
- `public/clips/clip-001.mp3` (~412 KB, ~10.5s) + `public/clips/README.md`.

**Net result:** the real-clips practice loop works end to end. The only missing
piece is *correct, automatically-produced labels*.

---

## 4. What's scaffolded (pipeline) - `tools/clipgen/`

A Python package that chains: generate -> download -> detect -> choose window ->
normalize -> gate -> append to `public/clips.json`. Files:

| file           | role                                                              | tested? |
|----------------|-------------------------------------------------------------------|---------|
| `config.py`    | env/.env config: API key, base URL, gate + smoothing thresholds   | yes     |
| `generate.py`  | kie.ai request + poll for audio URL (provider-specific bits here)  | **NO** (needs API key) |
| `download.py`  | download the audio file                                           | NO      |
| `detect.py`    | librosa HPSS -> chroma -> smoothing -> beat-sync -> triad templates -> Krumhansl key; merge + coalesce short segments | yes (runs) |
| `segment.py`   | `choose_window`: first stable 3-4 chord run                       | yes     |
| `normalize.py` | absolute -> relative `rootPc`+`quality`; ABSOLUTE `chordTimesSec`; collapse adjacent repeats | yes |
| `gate.py`      | accept iff 3-4 distinct chords AND mean confidence >= `conf_min`  | yes     |
| `clips_db.py`  | next-id allocation, copy mp3 to `public/clips/`, append json      | yes (logic) |
| `main.py`      | CLI orchestrator                                                  | yes     |
| `requirements.txt`, `.env.example`, `README.md` | setup + docs                     | -       |

Also done:
- `npm run gen-clip` script in `package.json`.
- `.gitignore` updated: `.env`, `.venv/`, `__pycache__/`, `*.pyc`.
- A working virtualenv exists at `tools/clipgen/.venv` with deps installed
  (librosa 0.11, numba 0.65, scipy 1.18, soundfile, requests, python-dotenv) on
  **Python 3.13.2 / Windows**. Install took a few minutes but succeeded.

### CLI usage

```powershell
# Analyze a LOCAL file (no API key needed) - this is how we test detection:
tools\clipgen\.venv\Scripts\python tools\clipgen\main.py --label-file public\clips\clip-001.mp3
tools\clipgen\.venv\Scripts\python tools\clipgen\main.py --label-file public\clips\clip-001.mp3 --key C#
# add --save to actually append the result to public/clips.json

# Full generation (NEEDS tools/clipgen/.env with SUNO_API_KEY):
npm run gen-clip -- --count 5
npm run gen-clip -- --count 3 --vocals
```

Tunable detector knobs (env or `.env`): `CLIPGEN_NN_FILTER` (0/1),
`CLIPGEN_MEDIAN_FRAMES`, `CLIPGEN_MIN_SEG_SEC`, `CLIPGEN_CONF_MIN`,
`CLIPGEN_CHORDS_MIN/MAX`, `CLIPGEN_WINDOW_MIN/MAX`, `CLIPGEN_INCLUDE_DIM`.

---

## 5. What we proved about detection accuracy

We tested the librosa detector on the only real clip we have (`clip-001`).
Ground truth from the user: the clip is in **Ab major** (the user later said we
can "assume C# major" - the two readings are a fifth apart, which is itself a
symptom of the key-detection problem).

Sweep results (`--key` was used to remove key-detection error):

| smoothing (nn / median / min_seg) | detected chords          | gate     |
|-----------------------------------|--------------------------|----------|
| on / 9 / 1.0                      | C#m, Fm (2 distinct)     | REJECT   |
| off / 9 / 1.0                     | C#m, Fm                  | REJECT   |
| off / 5 / 0.8                     | E, C#m, Fm (3 distinct)  | ACCEPT   |
| off / 3 / 1.2                     | C#m, Fm                  | REJECT   |

Even the ACCEPTED run is **wrong**: against Ab major it should draw from
Ab/Eb/Fm/Db. It got **Fm right (vi)**, **Db roughly right but mislabeled minor**
(should be Db major / IV), **invented an E major** (out of key), and **never
found the tonic**. Auto key detection guessed **C# major** (a fifth off from Ab).

**Conclusion:** the pip-only librosa chroma+template detector is **not accurate
enough on real, produced audio.** It recovers some roots but misses chords,
confuses major/minor, and mis-detects the key.

---

## 6. Blockers & risks

1. **Detection accuracy (primary blocker).** librosa baseline is too weak on
   real audio (see §5). Candidate fix: **Chordino** (a proper chord-recognition
   Vamp plugin) run via **Docker** - it does not pip-install cleanly on Windows.
   This is the most likely path to trustworthy labels.
2. **"Gate passing" != "labels correct".** The gate only checks *structure*
   (3-4 distinct chords + confidence), not *correctness*. With auto-accept,
   confidently-wrong labels would silently enter the clip DB and corrupt the
   answer key. This must be resolved before auto-generating at scale.
3. **Generation is untested.** `generate.py` targets kie.ai's documented schema
   but has never run - it needs the user's kie.ai account + `SUNO_API_KEY` in
   `tools/clipgen/.env`. Field names may need small tweaks if kie.ai's schema
   drifted (everything provider-specific is isolated in `generate.py`).
4. **Only one clip to evaluate on.** "Try a few clips first" is blocked because
   generation isn't wired and we have a single hand-added mp3.
5. **Key detection unreliable.** Even when chord roots are partly right, the
   Krumhansl key estimate was a fifth off. The app gives the tonic to the user
   regardless, but the pipeline needs the correct tonic to compute relative
   labels.

---

## 7. Open decisions to make next

- **Detector path:** Chordino-via-Docker (recommended for accuracy) vs. keep
  tuning librosa vs. gather more clips before deciding.
- **Auto-accept policy:** keep auto-accept + spot-check by ear in the app; OR
  add a confirmation step that prints labels for approval; OR revisit after a
  better detector. (Current code auto-accepts.)
- **Whether to require a `--key`/known-tonic** for generation rather than
  trusting auto key detection.

---

## 8. Recommended next steps (suggested order)

1. **Stand up Chordino via Docker** as an alternative detector behind the same
   `detect.py` interface (return `{key_pc, mode, duration, segments[]}`), and
   re-run `--label-file` on `clip-001` to compare against §5. Decide librosa vs
   Chordino based on that.
2. **Add a correctness safeguard** so wrong labels can't enter the DB: e.g. a
   confirm/approve step, or only auto-accept when detector confidence is high
   AND the progression is fully diatonic to the detected key.
3. **Wire + smoke-test generation:** user creates a kie.ai key, drops it in
   `tools/clipgen/.env`, run `npm run gen-clip -- --count 1`; fix any schema
   mismatch in `generate.py`.
4. **Generate a handful of clips** and measure label accuracy on real data;
   tune the gate + smoothing, or lean on Chordino.
5. Only then consider scale + the eventual Supabase migration.

---

## 9. Quick reference - key paths

- Runtime: `src/audio/generated.ts`, `src/data/clips.ts`,
  `src/pages/Practice.tsx`, `src/components/AnswerPad.tsx`,
  `src/store/session.ts`, `src/theory/types.ts`.
- Pipeline: `tools/clipgen/` (+ `tools/clipgen/README.md`).
- Data: `public/clips.json`, `public/clips/`.
- Plans: `REAL_MUSIC_PROPOSAL.md` (original), this file (current state),
  `ARCHITECTURE.md` (overall app).
- Env for generation (gitignored, must be created): `tools/clipgen/.env`
  (copy from `.env.example`, add `SUNO_API_KEY`).
