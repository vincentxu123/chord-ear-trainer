---
name: add-real-song
description: Ingest an authorized YouTube recording into this repository's Real Music exercise library end to end. Use when the user supplies a youtube.com, music.youtube.com, or youtu.be link and asks to add, import, process, analyze, publish, or create exercises from the song. Downloads one video with provenance, derives or corrects artist/title metadata, detects timing and chords, removes vocals with Demucs, exports validated original and instrumental excerpts, audits the report, verifies the manifest and audio files, runs tests/build, and commits only publishable artifacts.
---

# Add Real Song

Run the repository's automated recording pipeline from download through verified
publication. Never hand-cut excerpts or hand-edit the generated manifest.

## Preconditions

1. Work from the `chord-ear-trainer` repository root and read its `AGENTS.md`.
2. Confirm the user owns the recording or is authorized to download, process,
   and publish it. If the request does not establish permission, ask before
   downloading.
3. Inspect `git status --short`. Preserve unrelated work and stage only the song
   artifacts created by this task.
4. Check the setup in `README.md` and `scripts/recordings/README.md`. Require
   FFmpeg and `.venv-recordings`; install or repair dependencies only with the
   user's approval when downloads are needed.
5. Prefer `--device mps` when PyTorch MPS is available on Apple Silicon,
   `--device cuda` when CUDA is configured, and `--device cpu` otherwise.

## Workflow

### 1. Download once and inspect metadata

Use the wrapper, which rejects non-YouTube hosts, ignores playlist/radio
parameters, downloads only the selected video, and writes provenance under the
gitignored `.recordings/imports/` directory:

```bash
npm run songs:youtube -- \
  --url "YOUTUBE_URL" \
  --device DEVICE \
  --download-only
```

Read the printed `Song metadata` line and the adjacent `.source.json`. Use the
inferred artist/title when they are accurate. Otherwise pass explicit metadata
on the full run. Preserve bilingual titles as `Native title / Romanization`
when reliable metadata supplies both; do not invent translations.

### 2. Run the complete pipeline

Run with inferred metadata:

```bash
npm run songs:youtube -- \
  --url "YOUTUBE_URL" \
  --device DEVICE
```

Or correct metadata at ingestion:

```bash
npm run songs:youtube -- \
  --url "YOUTUBE_URL" \
  --artist "ARTIST" \
  --title "TITLE" \
  --device DEVICE
```

Let key and mode be estimated. Override them only when there is concrete
evidence they are wrong, and always provide both `--key` and `--mode`. Add
`--reuse-analysis` when rerunning cached inference after a tonality override,
verified musical correction, or pipeline-code change.

Allow the command to complete. It must:

- analyze the fixed 4/4 grid with Beat This and madmom;
- recognize chords independently with lv-chordia and BTC;
- estimate tonality and sustained modulations;
- separate and cache `.recordings/<song-slug>/audio-instrumental.wav` with
  Demucs;
- automatically select only structurally valid four-measure windows where both
  chord models agree on every ordered chord sequence;
- exclude one-chord windows and deduplicate repeated ordered progressions;
- export both original and `-instrumental.mp3` excerpts;
- update `public/song-clips/manifest.json`; and
- write `.recordings/<song-slug>/publish-report.html`.

Do not add a human-approval gate and do not weaken an exclusion merely to
publish more excerpts.

### 3. Apply only evidence-backed corrections

Inspect `publish-report.html` as an audit of included/excluded windows and their
reasons. The report does not control publication.

Put verified structural facts in
`scripts/recordings/song-metadata/<artist-title-slug>.json`:

- `phraseStartMeasure` for the four-measure phrase-grid offset;
- `publishStartMeasure` for a known reliable starting boundary;
- `excludedStartMeasures` for individually verified bad windows;
- ordered `tonalities` for measure-specific key/mode changes; and
- `chordOverrides` for a verified chord position.

Rerun the same `songs:youtube` command with `--reuse-analysis`. Never use a
sidecar as guesswork or manually edit `analysis.json`.

If no excerpt passes, retain the report, summarize the dominant exclusion
reasons, and stop. Do not hand-edit the manifest or bypass model agreement.

### 4. Verify publication

Identify entries for the processed artist/title in
`public/song-clips/manifest.json` and verify:

- at least one entry was added or deliberately report that none passed;
- every new entry has both `file` and `instrumentalFile`;
- both referenced MP3 files exist under `public/song-clips/`;
- IDs and filenames are unique;
- cue arrays and measure chord counts are present; and
- no `.recordings/`, source audio, model cache, or report is tracked.

Difficulty is derived by the app from unique chords: Beginner has at most three
and Advanced has four or more. Do not add difficulty fields to the manifest.

Use `ffprobe` when needed to confirm both variants are readable and cover the
manifest duration. Do not judge timing by MP3 file size.

Run:

```bash
python3 -m unittest discover -s scripts/recordings -p 'test_*.py'
npm test
npm run build
git diff --check
```

### 5. Commit the intended result

Review the `Project TODOs` section in `README.md`; adding another song normally
does not change TODO scope. Commit only:

- the intended `public/song-clips/*.mp3` files;
- `public/song-clips/manifest.json`; and
- an evidence-backed song metadata sidecar, if one was required.

Do not commit `.recordings/`, `.venv-recordings/`, downloaded source audio,
model weights, or `publish-report.html`. `songs:process` replaces matching
artist/title entries while preserving other songs. Avoid `npm run songs:export`
unless rebuilding the entire cached library is explicitly intended.

Stage exact filenames with `git add --`; do not use a broad MP3 glob. Inspect
`git diff --cached --stat`, the staged manifest diff, and `git status --short`
before committing.

## Handoff

Report the resolved artist/title, device, number and measure ranges of published
excerpts, whether instrumental counterparts were verified, audit-report path,
tests/build results, and commit. Remind the user that distributing derived
commercial audio requires the necessary rights.
