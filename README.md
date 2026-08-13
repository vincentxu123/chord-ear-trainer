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
| **Real Music** | Four-measure excerpts from real songs. Only rows where both timing/chord pipelines agree are exported; a preprocessed instrumental version can be selected when available. |

Switch between them in the settings panel. Real music unlocks once
`public/song-clips/manifest.json` has entries (this repo may already include a
small library).

## Features

- Relative / Roman-numeral answers, independent of absolute key
- First chord pre-filled and locked as a listening anchor
- Piano mode: randomized key, adjustable tempo (100–460 BPM), 2–6 chords, optional chromatic / diminished vocabulary
- Generated mode: AI clips with Stop / Replay and BPM-synced slot highlights
- Real Music mode: exact chord-change cues, measure-grouped answers, optional vocal removal, optional absolute chord labels, and Beginner/Advanced filtering
- Installable phone app with offline Real Music downloads and bundled offline piano samples
- Instant per-slot feedback and click-to-audition chords after reveal
- Interactive piano keyboard at the bottom of the screen

## Project TODOs

- [x] Build the core piano ear-training flow with randomized functional progressions
- [x] Make chord selection uniform across the configured vocabulary
- [x] Add the interactive on-screen piano keyboard
- [x] Add generated full-band clip practice with strict offline quality control
- [x] Add dual-model real-recording analysis and validated Real Music practice
- [x] Automate real-song ingestion, publication, deduplication, and audit reports
- [x] Add permitted single-video YouTube ingestion with source provenance
- [x] Add real-song difficulty filters and relative-only chord display
- [x] Refine the Real Music interface for mobile practice
- [x] Add skip, first-chord anchoring, and chord-position playback controls
- [x] Improve key-change detection with sustained harmonic segmentation
- [x] Detect sparse and partial pickup measures for phrase alignment
- [x] Support verified per-song publication start boundaries
- [x] Let listeners report incorrect real-song answer keys
- [x] Add a song/artist selector for Real Music practice
- [x] Add offline mobile support as an installable PWA with Real Music downloads and offline piano
- [x] Add an option for tapping chords to play them aloud with piano
- [x] Add instrumental mode for song clips, including a vocal-removal processing pipeline
- [x] Track each user's excerpts as unseen, answered correctly, or answered incorrectly
- [ ] Train a more accurate chord-detection model

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
answer pad, then **Submit**. Piano samples are bundled with the app and need no
network connection.

## Use offline on a phone

The production app is an installable Progressive Web App. Serve it over HTTPS,
then open it on the phone once while online:

1. Add it to the Home Screen. On iPhone, use Safari's **Share → Add to Home Screen**.
2. Open the newly installed icon so its storage belongs to the installed app.
3. In **Real Music**, tap **Download** and wait for **Ready offline**.
4. The app shell, piano engine, and piano samples are installed automatically;
   the Real Music pack can be removed or downloaded again from its settings.

Real Music URLs include a library revision. When recordings change, the app
downloads the new revision completely before deleting obsolete cached files.
Browsers may still remove web-app data under severe storage pressure, so the
app verifies the downloaded library whenever it starts.

## Adding a real song

The recording pipeline is automatic: give it one local audio file and its
metadata, and it analyzes the whole song, publishes every eligible
four-measure excerpt, updates the web app manifest, and writes an audit report.
There is no manual approval step. Only windows where both timing/chord
pipelines pass the structural checks and both chord models agree on the full
ordered chord sequence are added. Repeated windows with the same relative chord
sequence are deduplicated within each song, keeping the earliest occurrence,
and windows containing only one unique chord are excluded.

### One-time setup

Install **FFmpeg** and **Python 3.11+**, then create and verify the complete
local analysis environment from the repository root:

```bash
npm run songs:setup
npm run songs:doctor
```

The setup command finds Python 3.11+, creates the gitignored
`.venv-recordings`, and installs every timing, chord, YouTube, and source
separation dependency. Song commands use this environment automatically. To
run Python commands directly, activate it with
`source .venv-recordings/bin/activate` on macOS/Linux or
`.venv-recordings\Scripts\activate` on Windows.

The first analysis downloads model weights and can take a while. On a
compatible Apple Silicon Mac, `--device mps` can speed up inference.

### Process and publish

The source file can live anywhere outside the repository; pass its absolute
path directly. Do not copy commercial source recordings into a tracked folder.

```bash
npm run songs:process -- \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "擱淺 / Ge Qian" \
  --device mps
```

`--device` is optional and defaults to `cpu`. The command:

1. runs Beat This and madmom to establish one fixed 4/4 measure grid;
2. runs lv-chordia and BTC for chord recognition;
3. estimates the key and mode;
4. separates a cached whole-song instrumental stem with Demucs;
5. exports original and instrumental versions of agreed four-measure windows
   to `public/song-clips/`;
6. updates `public/song-clips/manifest.json`; and
7. writes `.recordings/<song-slug>/publish-report.html` with every included and
   excluded window and the reason for each exclusion.

Open the report after processing for a human sanity check, but it does not
control publication. The app automatically derives Beginner (up to 3 unique
chords) or Advanced (4+) difficulty, so no difficulty metadata is needed.
The first vocal-separation pass can be slow; its full-song instrumental WAV is
cached under `.recordings/<song-slug>/` and reused on later exports.

If the automatically estimated tonality is clearly wrong, rerun with both an
explicit key and mode:

```bash
npm run songs:process -- \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "擱淺 / Ge Qian" \
  --key F \
  --mode major \
  --reuse-analysis
```

`--reuse-analysis` reuses cached model output while rebuilding timing
normalization, tonality, eligibility, exports, and the report. Reprocessing the
same artist/title replaces that song's existing manifest entries without
removing other songs.

### Import a permitted YouTube recording

For recordings you own or are authorized to download and use, `yt-dlp` can
feed one YouTube video directly into the same analysis and publication pipeline:

```bash
npm run songs:youtube -- \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --device mps
```

The command ignores playlist and radio parameters, downloads only the selected
video's best audio into gitignored `.recordings/imports/`, derives artist/title
from its metadata, and records a `.source.json` provenance file. Pass `--artist`
and `--title` to override imperfect YouTube metadata. All `songs:process`
tonality, model-agreement, export, and report behavior remains unchanged.

Pickup measures and sustained modulations are inferred automatically from the
agreed chord analysis. The pickup detector is deliberately conservative: it
only shifts the phrase grid when the first measure is sparse or contains a
retained no-chord region, and the following measures are structurally strong.
Tonality segmentation requires a new region to persist for at least 12
measures, and windows crossing a detected change are excluded.

For verified corrections to pickup numbering or modulation boundaries, add a
tracked JSON sidecar under `scripts/recordings/song-metadata/` using the
artist/title slug as its filename.
The pipeline loads it automatically: `phraseStartMeasure` aligns the
four-measure exercise grid after any pickup measures, `publishStartMeasure`
excludes windows that start before a verified reliable boundary,
`excludedStartMeasures` removes individual windows whose answer keys have been
verified as incorrect, and ordered `tonalities` entries set the key and mode
from a given measure onward. Windows that cross a tonality change are excluded
automatically. Sidecar values take precedence over automatic inference.

Finally, run `npm test` and `npm run build`, then commit the changed files under
`public/song-clips/`. Never commit `.recordings/`, `.venv-recordings/`, or the
source recording. For deeper diagnostics and cache/export commands, see
[scripts/recordings/README.md](./scripts/recordings/README.md). The analysis
pipeline is suitable for private research, but publishing audio requires the
necessary distribution rights.

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
| `npm run songs:process` | Offline: analyze one recording, publish agreed windows, then write an audit report |
| `npm run songs:youtube` | Offline: download one permitted YouTube recording, then run `songs:process` |
| `npm run songs:export` | Offline: export strictly agreed recording candidates into `public/song-clips/` |
| `npm run songs:instrumentals` | Offline: add vocal-free variants to already-published song excerpts |
| `npm run songs:setup` | Create or update the complete recording-analysis Python environment |
| `npm run songs:doctor` | Check FFmpeg, Python packages, and the recommended inference device |

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

The bundled piano MP3s are derivatives of Alexander Holm's Salamander Grand
Piano V3, licensed under CC BY 3.0. Full attribution is included in
`public/piano-samples/ATTRIBUTION.txt`.
