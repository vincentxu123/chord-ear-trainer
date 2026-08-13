# Recording analysis spike

This tooling is deliberately separate from the app's generated-clip pipeline.
It reads a local recording, detects beats/downbeats and chords, resolves
half-time/double-time tracker changes into one fixed 4/4 tempo grid, and
automatically publishes every eligible four-measure exercise. A static audit
report is written after publication so a human can double-check the result,
but approval is not part of the gate.

Before excerpt export, Demucs separates the normalized full recording into
vocals and accompaniment. The cached `audio-instrumental.wav` is cut at the
same boundaries as the original, and each manifest entry points to both MP3s.
The web app can therefore switch versions without processing audio at runtime
or changing chord cue times. Chord recognition still defaults to the mixed
recording; `--chord-audio instrumental` is an optional alternative described
below.

Eligible windows are deduplicated within each song by their exact relative
ordered chord sequence. The earliest occurrence is exported and later repeats
remain visible in the audit report with their duplicate reason. A window with
only one unique chord across all four measures is also excluded automatically.

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

Requires FFmpeg and Python 3.11+. From the repository root, run:

```bash
npm run songs:setup
npm run songs:doctor
```

The setup script finds Python 3.11+, creates or reuses `.venv-recordings`, and
installs the full pipeline. It works with Unix and Windows virtualenv layouts;
the `songs:*` commands select the interpreter automatically. For an interactive
shell, activate with `source .venv-recordings/bin/activate` on macOS/Linux or
`.venv-recordings\Scripts\activate` on Windows, then run `deactivate` when done.

FFmpeg remains a system prerequisite because its installation is
platform-specific. Examples: `brew install ffmpeg python@3.11` on macOS,
`sudo apt install ffmpeg python3.11-venv` on compatible Debian/Ubuntu releases,
or the official FFmpeg and Python installers on Windows.

PyTorch is shared by the timing/chord and separation stages. Demucs itself is
listed separately in `requirements-separation.txt` to make its incremental
dependency explicit. Model weights are downloaded lazily on first use and live
in user caches, not in the repository.

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
outputs are cached under `.recordings/`; `--reuse-analysis` reuses timing and
the selected `--chord-audio` chord JSON while rebuilding timing normalization,
automatic tonality, candidate gates, exports, and the audit report. Key
estimation uses an audio chromagram and standard key profiles.
`--key F --mode major` remains available as an optional correction, not a
required approval step.

### Chord-audio strategy

Timing models always run on the mixed recording. Chord recognition defaults to
the same mix (`--chord-audio mix`). Pass `--chord-audio instrumental` to run
lv-chordia and BTC on the Demucs accompaniment stem instead:

```bash
npm run songs:process -- \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title" \
  --chord-audio instrumental
```

The two strategies keep separate chord caches, so they can be compared without
overwriting each other:

| `--chord-audio` | Chord JSON |
| --- | --- |
| `mix` (default) | `chords.json`, `chords.btc.json` |
| `instrumental` | `chords.instrumental.json`, `chords.btc.instrumental.json` |

`analysis.json`, `publish-report.html`, and published excerpts always reflect
the last analyze/export run. To compare acceptance, run the default mix path,
inspect the report, then rerun with `--chord-audio instrumental --reuse-analysis`.

Demucs still runs once per song and caches `audio-instrumental.wav` for excerpt
export (and for instrumental chord recognition when that strategy is selected).
Reprocessing the same song reuses that stem. For a pipeline diagnostic that
intentionally skips writing instrumental MP3s, run:

```bash
npm run songs:export -- --skip-instrumental
```

The pipeline conservatively detects a sparse one-measure pickup, including a
first bar that contains a retained no-chord region, and segments sustained
harmonic key regions of at least 12 measures. Detected modulation boundaries
are refined using the first four measures that strongly fit the new key, and
crossing exercise windows are excluded automatically.

Verified song-specific corrections to pickup measure numbering or modulations
live in tracked JSON sidecars under `scripts/recordings/song-metadata/`. The
pipeline automatically loads a sidecar whose filename matches the artist/title
slug. `phraseStartMeasure` aligns the four-measure exercise grid after any
pickup measures, `publishStartMeasure` excludes windows that begin before a
verified reliable boundary, `excludedStartMeasures` removes specific verified
bad windows, and ordered `tonalities` entries assign key and mode from each
`startMeasure` onward. A verified `chordOverrides` entry can correct one
one-based `chordPosition` within a specific `measure` while preserving its
detected timing.
Sidecar values override the corresponding automatic inference.

## Download and process one YouTube video

For a recording you own or have permission to download and use, install the
normal requirements above and run:

```bash
npm run songs:youtube -- \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --device mps
```

`--no-playlist` behavior is always enabled, so playlist and radio parameters in
the URL do not expand the import beyond that video. The best audio stream is
kept under gitignored `.recordings/imports/`, alongside a `.source.json` file
containing its URL and YouTube metadata. Artist and title are inferred using
yt-dlp metadata; use explicit `--artist` and `--title` overrides if needed.
`--key`/`--mode`, `--reuse-analysis`, `--chord-audio`, `--metadata`, and device
options are forwarded to the standard pipeline. Use `--download-only` to stop
before analysis.

YouTube extractors change frequently. If an otherwise valid video stops
working, update yt-dlp before debugging the recording models:

```bash
.venv-recordings/bin/python -m pip install -U --pre "yt-dlp[default]"
```

## Analyze without publishing

```bash
.venv-recordings/bin/python scripts/recordings/analyze_song.py \
  --audio "/absolute/path/to/song.mp3" \
  --artist "Jay Chou" \
  --title "Song title"
```

The command prints the location of `review.html`. This standalone diagnostic
does not update the app. The first run downloads model weights.

The automatic default runs `lv-chordia` and the independent BTC transformer on
the mixed recording. Pass `--chord-audio instrumental` to run them on the
Demucs stem instead; that writes `chords.instrumental.json` rather than
overwriting the mix caches.

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

This rebuilds original and instrumental short MP3s plus the exact-cue manifest
under `public/song-clips/` from every cached `analysis.json`. That file records
the last `--chord-audio` strategy in `audio.chordAudio`. There is no hard-coded
song catalog: artist/title come from the analysis and key/mode come from
automatic estimation or an optional override. The generated
`publish-report.html` in each song's `.recordings` directory lists every
included and excluded window, its model predictions, and exclusion reasons.

## Backfill existing published excerpts

When a checkout contains published song excerpts but not their original
full-song analysis cache, add instrumental variants directly from those short
MP3s:

```bash
npm run songs:instrumentals -- --device mps
```

The command skips entries that already have `instrumentalFile`, caches Demucs
WAV output under `.recordings/instrumental-backfill/`, writes matching
`-instrumental.mp3` files, and atomically rebuilds the manifest metadata.
