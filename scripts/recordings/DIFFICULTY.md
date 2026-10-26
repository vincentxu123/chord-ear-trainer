# Experimental rotation difficulty

This branch uses the October 25 clarity experiment (`clarity-experiment-v2`).
It rates the published excerpts of each song, not the complete source recording.
No recognition models or network requests run during browser practice.

## Reproduce

With the existing recording environment installed, run from the repository root:

```bash
npm run songs:score-rotation
```

The command reads the rotation manifest and original/instrumental MP3s, runs
synthetic checks, and writes:

- `.recordings/difficulty/rotation-scores.json`: detailed local audit report.
- `src/songs/rotation-difficulty.json`: bundled song averages and source identity.

It never modifies audio or manifests. After changing the rotation, regenerate
the scores and run `npm test` and `npm run build`. Only commit the bundled JSON
and intended source changes; audit reports remain gitignored. To rebuild the
bundle from a completed report without recomputing audio:

```bash
npm run songs:score-rotation -- --reuse-report
```

Reuse verifies the manifest hash, every audio hash, model version, record
coverage, and finite component scores. `--output PATH` selects the report;
`--app-output PATH` selects the bundle; `--workers N` controls parallel processes.

## Formula

Adjacent identical chords are merged first. At every real chord change:

1. Decode mono at 22,050 Hz. Compute a C1–B7 magnitude CQT with 12 bins per
   octave and 256-sample hops; emphasize harmonic content using 17×17 HPSS
   with margin 2.
2. Compare up to 650 ms on either side, within the neighboring chord runs,
   with a guard up to 80 ms. Normalize pitch-class frames to unit L2 norm.
3. Let `d` be cosine distance between mean pitch-class vectors, `s` average
   within-window dispersion, and `b` low-register (C1–B2) cosine distance.
   Clarity is `100 * (0.5 * clamp(d / .35) + 0.3 * d / (d + s + .04)
   + 0.2 * clamp(b / .50))`, with clamps to [0, 1]. Near-silent windows score 0.
4. Repeat at cue offsets −80, 0, and +80 ms. Use median clarity, retaining the
   spread for audit. A spread over 15 points flags timing sensitivity.
5. Pace is `100 * clamp(log(3 / secondsAvailable) / log(3 / .4))`. Sustained
   chords of at least three seconds score 0; 0.4 seconds or less scores 100.

Excerpt clarity difficulty (100 minus clarity) and pace each aggregate as
75% mean plus 25% 90th percentile, giving harder transitions extra weight.
Harmonic complexity is `100 * (0.5 * chromaticRunFraction
+ 0.2 * diminishedRunFraction + 0.3 * clamp((uniqueChords - 2) / 4))`.
The diatonic vocabulary matches the app's major/natural-minor sets; major V in
minor counts as chromatic. The first given chord is excluded from pace scoring.

Components are averaged equally across each song's excerpts, separately by mix.
The app computes `0.7 * (100 - clarity) + 0.2 * pace + 0.1 * complexity`.
Beginner is below 15, Medium is 15–<30, and Advanced is 30–100. These are fixed
experimental boundaries, not percentiles or predicted success probabilities.

## Guardrails and limitations

The bundle is precached as app code. Each entry must match the collection's
audio revision and its stored metadata, including chords and cues. A mismatch
is Unrated, available in All only; it does not silently fall back to chord count.
Songbook has not been audio-scored and retains its original ratings.

Changing mix preserves the active round and updates its category, even if that
category now differs from the selected filter. The filter governs future rounds.

The initial rotation has 190 excerpts from 53 songs. Acoustic changes can reflect
melody, production, or stem artifacts rather than clearly identifiable harmony.
80 original excerpts and 69 instrumental excerpts had at least one timing-sensitive
transition. High contrast can saturate the score. One-excerpt songs have limited
coverage. The scores assume the answer keys are correct and do not measure their
confidence. Validate against listener ratings before treating the labels as final.
