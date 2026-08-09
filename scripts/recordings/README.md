# Recording analysis spike

This tooling is deliberately separate from the app's generated-clip pipeline.
It reads a local recording, detects beats/downbeats and chords, resolves
half-time/double-time tracker changes into one fixed 4/4 tempo grid, proposes
four-measure exercises, and writes a local static review report.

Source recordings and every derived file live under `.recordings/`, which is
gitignored. Do not commit or distribute commercial recordings or derived clips
without the necessary rights.

## Setup

Requires FFmpeg and Python 3.11+.

```bash
python3.11 -m venv .venv-recordings
.venv-recordings/bin/python -m pip install -r scripts/recordings/requirements.txt
```

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

This is proposal tooling, not an automatic publishing gate. Chords, bar lines,
key, and mode must be human-reviewed before a clip becomes an exercise.
