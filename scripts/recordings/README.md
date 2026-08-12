# Recording analysis spike

This tooling is deliberately separate from the app's generated-clip pipeline.
It reads a local recording, detects beats/downbeats and chords, resolves
half-time/double-time tracker changes into one fixed 4/4 tempo grid, and
automatically publishes every eligible four-measure exercise. A static audit
report is written after publication so a human can double-check the result,
but approval is not part of the gate.

Eligible windows are deduplicated within each song by their exact relative
ordered chord sequence. The earliest occurrence is exported and later repeats
remain visible in the audit report with their duplicate reason.

Exercise proposals stay on a non-overlapping four-measure phrase grid:
measures 1-4, 5-8, 9-12, and so on. Confidence ranking can omit a weaker
block from a limited report, but it never shifts a window off that grid.
Playback cues may move forward by up to 120 ms to a nearby transient so a
clip does not include the tiny lead-in before the detected measure attack. This
does not change the fixed analysis grid or chord boundaries.

Source recordings and every derived file live under `.recordings/`, which is
gitignored. Do not commit or distribute commercial recordings or derived clips
without the necessary rights.

## Setup

Requires FFmpeg and Python 3.11+.

```bash
python3.11 -m venv .venv-recordings
.venv-recordings/bin/python -m pip install -r scripts/recordings/requirements.txt
.venv-recordings/bin/python -m pip install -r scripts/recordings/requirements-btc.txt
.venv-recordings/bin/python -m pip install "setuptools<81" Cython
.venv-recordings/bin/python -m pip install --no-build-isolation madmom==0.16.1
```

The timing ensemble compares Beat This with madmom constrained to 4/4. If one
model produces a well-supported 2:1 half-bar grid, the slower full-bar grid
wins. Same-level grids are averaged; incompatible grids remain visible in the
analysis metadata.

## Process and add a song (recommended)

One command runs both timing models and both chord models, estimates key/mode,
publishes every automatically eligible window, updates the app manifest, and
then writes `publish-report.html`:

```bash
npm run songs:process -- \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title"
```

Use `--device mps` on a compatible Mac if CPU inference is too slow. Model
outputs are cached under `.recordings/`; `--reuse-analysis` reuses them while
rebuilding timing normalization, automatic tonality, candidate gates, exports,
and the audit report. Key estimation uses an audio chromagram and standard key
profiles. `--key F --mode major` remains available as an optional correction,
not a required approval step.

Song-specific musical facts that cannot be inferred reliably, such as pickup
measure numbering or modulations, live in tracked JSON sidecars under
`scripts/recordings/song-metadata/`. The pipeline automatically loads a sidecar
whose filename matches the artist/title slug. `phraseStartMeasure` aligns the
four-measure exercise grid after any pickup measures, while ordered `tonalities`
entries assign key and mode from each `startMeasure` onward.

## Analyze without publishing

```bash
.venv-recordings/bin/python scripts/recordings/analyze_song.py \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title"
```

The command prints the location of `review.html`. This standalone diagnostic
does not update the app. The first run downloads model weights.

The automatic default runs `lv-chordia` and the independent BTC transformer.
To run a deliberately reduced diagnostic, select a model explicitly:

```bash
.venv-recordings/bin/python -m pip install -r scripts/recordings/requirements-btc.txt
.venv-recordings/bin/python scripts/recordings/analyze_song.py \
  --audio ".recordings/imports/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title" \
  --chord-models lv-chordia
```

Each detector writes a separate cached timeline. The pipeline aligns them to
the fixed measure grid and compares ordered sequences, roots, and simplified
qualities. Export requires at least two predictions and complete ordered chord
sequence agreement in all four measures, in addition to the structural timing,
coverage, and supported-harmony gates. The unofficial BTC packaging is pinned
to the tested integration revision in `chord_models.py`; review its custom code
and update that hash deliberately when testing a new release.

## Rebuild exports from cached analyses

```bash
npm run songs:export
```

This rebuilds short MP3s and the exact-cue manifest under
`public/song-clips/` from every cached analysis. There is no hard-coded song
catalog: artist/title come from the analysis and key/mode come from automatic
estimation or an optional override. The generated `publish-report.html` in
each song's `.recordings` directory lists every included and excluded window,
its model predictions, and exclusion reasons.
