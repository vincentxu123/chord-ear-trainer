# Recording analysis spike

This tooling is deliberately separate from the app's generated-clip pipeline.
It reads a local recording, detects beats/downbeats and chords, resolves
half-time/double-time tracker changes into one fixed 4/4 tempo grid, proposes
four-measure exercises, and writes a local static review report.

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
.venv-recordings/bin/python -m pip install "setuptools<81" Cython
.venv-recordings/bin/python -m pip install --no-build-isolation madmom==0.16.1
```

The timing ensemble compares Beat This with madmom constrained to 4/4. If one
model produces a well-supported 2:1 half-bar grid, the slower full-bar grid
wins. Same-level grids are averaged; incompatible grids remain visible in the
analysis metadata.

## Analyze a song

```bash
.venv-recordings/bin/python scripts/recordings/analyze_song.py \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title"
```

The command prints the location of `review.html`. Open that file locally to
listen to each proposed window while inspecting its measure and chord labels.
The first run downloads model weights. Use `--device mps` on a compatible Mac
if CPU inference is too slow.

`lv-chordia` remains the default detector. To compare it with the independent
BTC transformer model, install the optional dependencies and select both:

```bash
.venv-recordings/bin/python -m pip install -r scripts/recordings/requirements-btc.txt
.venv-recordings/bin/python scripts/recordings/analyze_song.py \
  --audio ".recordings/imports/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title" \
  --chord-models lv-chordia,btc
```

Each detector writes a separate cached timeline. The report aligns them to the
fixed measure grid and shows ordered-sequence, root, and simplified-quality
agreement. A candidate is green only when both models agree on the complete
ordered chord sequence in all four measures. The unofficial BTC packaging is
pinned to the tested integration revision in `chord_models.py`; review its
custom code and update that hash deliberately when testing a new release.
Model agreement is evidence for review, not ground truth.

## Export eligible candidates to the app

After reviewing the reports, export only green candidate rows:

```bash
npm run songs:export
```

This creates short MP3s and an exact-cue manifest under `public/song-clips/`.
The catalog in `export_candidates.py` contains the reviewed tonal center for
each song so absolute model labels can be converted to the app's relative
Roman-numeral representation. Model agreement is deliberately conservative,
but chords, bar lines, keys, and modes still benefit from human review.
