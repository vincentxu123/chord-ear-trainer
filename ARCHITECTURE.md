# Architecture — audio, generation, and validation

This document explains how practice audio works in Chord Ear Trainer, with the
focus on the **Real music** clip pipeline: how progressions become labeled
instrumental clips, and how we validate those labels before they enter the
library.

For app usage and project layout, see [README.md](./README.md).

---

## 1. Shared pedagogical model

Everything in the app is built around **relative chords**: a chord is
`{ rootPc, quality }` where `rootPc` is semitones above the tonic (0–11) and
`quality` is `maj` | `min` | `dim`. Progressions are stored and scored in that
form; Roman numerals are a display layer (`toRoman`).

At practice time an `Exercise` binds a progression to a concrete key, mode, and
audio source (`synth` | `generated`). The same relative answer key works for
piano synthesis and for pre-rendered clips.

**Gameplay rule (both modes):** the first slot is revealed as a free anchor
(`GIVEN_SLOT_COUNT = 1`). The user guesses the remaining chords; scoring totals
exclude the given slot.

---

## 2. Two runtime audio paths

```
                    ┌─────────────────────┐
 Settings.soundSource│  'synth' | 'clips'  │
                    └──────────┬──────────┘
               ┌───────────────┴───────────────┐
               ▼                               ▼
      generateRound()                   pickClipExercise()
      (random diatonic /                 from public/clips/
       chromatic pool)                   manifest.json
               │                               │
               ▼                               ▼
      SynthAudioSource                  ClipAudioSource
      (Tone.js Sampler)                 (HTMLAudioElement)
```

| | Piano (`synth`) | Real music (`clips`) |
|--|-----------------|----------------------|
| Content | Unlimited random rounds | Finite library of MP3s |
| Tempo / length / key | User settings | Fixed per clip |
| Chromatic / diminished | Settings toggles | Disabled (library is diatonic-only today) |
| Chord highlight | Transport schedule | Derived from clip BPM × bar length |
| Playback end | End of scheduled chords | Exact **two passes** of the progression (file may be ~1s longer) |

If clip mode is selected but the library is missing or still loading, the session
falls back to synth generation.

---

## 3. Why we generate clips (and what we rejected)

Goal: short (~15–25s) instrumental “band” loops over a known 4-chord progression,
with labels trustworthy enough for an ear trainer.

| Approach | Verdict |
|----------|---------|
| **MusicGen-Chord** (chosen) | Open model conditioned on an explicit `text_chords` string + BPM + style prompt. Labels come from the *input*, then we QC the audio. |
| Extract real-song choruses | Copyright risk; HookTheory has no full TheoryTab dump; ACR alone (~77–82%) is too weak as the sole label source. |
| Suno text prompts | No solid official API; prompts don’t reliably follow typed chord progressions. |
| Suno audio-upload restyle | Possible later polish (vocals / radio production) using our clip as harmonic reference — not required for v1. |

**Properties of the chosen path**

- Offline, one-time generation cost; **$0 runtime** API use in the web app
- No commercial recordings hosted
- Instrumental output (clearer harmony for ear training than lyric-heavy mixes)
- Same relative chord model as the piano engine

---

## 4. Offline generation pipeline

Implemented in `scripts/generateClips.ts` (`npm run clips:generate`).

```
 randomClipSpec()          src/clips/spec.ts
   (key, mode, 4 chords,     reuse engine/theory rules:
    bpm, style prompt)       no consecutive repeats, tonic somewhere
        │
        ▼
 MusicGen-Chord            sakemin/musicgen-chord on Replicate
   text_chords + bpm +       stereo-chord-large, chroma_coefficient 1.4
   style + duration          style prompts append bass/harmony clarity cues
        │
        ▼
 Download MP3              public/clips/clip-NNNN.mp3 (temporary until QC)
        │
        ▼
 QC gate                   scripts/qcClips.py + lv-chordia
   root match ≥ 75%?         PASS → keep file + append manifest
                             FAIL → delete file, do not add
        │
        ▼
 manifest.json             consumed by the SPA at runtime
```

### Progression → MusicGen syntax

Relative chords are converted in `src/clips/musicgenChords.ts`:

- Bare root = major (`C`)
- Others use a colon (`A:min`, `B:dim`)
- The 4-bar progression is repeated **twice** in `text_chords` so the model
  plays two full loops
- Duration sent to the model is `ceil` of the exact two-pass length (MusicGen
  wants whole seconds); the **player** stops at the exact two-pass boundary so
  a padded second doesn’t start a third loop

### Style / mix bias

`CLIP_STYLES` in `src/clips/spec.ts` is a bank of ~20 mainstream genres (pop,
rock, R&B/soul/funk, smooth/jazz-pop/bossa, lo-fi/dance/house, country/folk,
reggae/latin, piano pop). Extreme metal / screamed styles are intentionally
omitted. Every prompt is appended with harmony-clarity cues (prominent bass,
clear chord changes, bass-forward mix) so the bed stays easy to hear.

### Hosting

Clips live in `public/clips/` as static assets. For a much larger library, move
audio to object storage and keep the same manifest shape (only the base URL
changes).

---

## 5. Validation (QC)

Labels written to the manifest are “what we asked the model to play.” MusicGen
usually follows but can drift, so every new clip is checked before it enters the
library.

**Tool:** [lv-chordia](https://github.com/openmirlab/lv-chordia) (PyTorch
inference), wrapped by `scripts/qcClips.py`.

**Method**

1. Run chord recognition on the MP3 (`ismir2017` vocabulary).
2. For each expected bar (two passes × four chords), take the majority chord in
   the middle of the bar (slight edge trim).
3. Compare detected root (enharmonics OK, e.g. `Gb` ≡ `F#`) and quality family
   (`maj` / `min` / `dim`) to the absolute chords implied by the manifest key.
4. **Accept** if root match ≥ **75%** across those bars; otherwise **discard**.

**Caveat:** ACR itself is roughly ~80% accurate on real music. QC is a useful
filter (false rejects are fine — we drop the clip), not a mathematical proof.
Spot-listen occasionally, especially clips that sit right on the threshold.

Standalone re-check of the whole library: `npm run clips:qc`.

---

## 6. Generating clips (operator guide)

### One-time setup

1. Node deps: `npm install`
2. Replicate account + token → put in `.env` (gitignored):

   ```
   REPLICATE_API_TOKEN=r8_...
   ```

3. Python QC venv:

   ```powershell
   python -m venv .venv-qc
   .\.venv-qc\Scripts\activate
   pip install lv-chordia
   ```

### Commands

```powershell
# Preview specs only (no API spend)
npm run clips:generate -- --count 3 --dry-run

# Generate; each clip is QC'd before it enters the library
npm run clips:generate -- --count 3

# Optional fixed style prompt
npm run clips:generate -- --count 2 --style "piano pop ballad, expressive piano"

# Escape hatch (not recommended for library growth)
npm run clips:generate -- --count 1 --skip-qc

# Re-validate everything already in public/clips/
npm run clips:qc
```

Rough cost on Replicate: on the order of **$0.10–0.32 per generation attempt**
(GPU-seconds; cold starts add latency). Rejected clips still cost a generation
but are not kept.

---

## 7. Manifest contract

`public/clips/manifest.json`:

```json
{
  "clips": [
    {
      "id": "clip-0007",
      "file": "clip-0007.mp3",
      "key": "A",
      "mode": "major",
      "bpm": 115,
      "beatsPerChord": 4,
      "durationSec": 17,
      "chords": [
        { "rootPc": 2, "quality": "min" },
        { "rootPc": 0, "quality": "maj" },
        { "rootPc": 9, "quality": "min" },
        { "rootPc": 5, "quality": "maj" }
      ],
      "style": "upbeat pop punk, …",
      "seed": 123456789
    }
  ]
}
```

The SPA loads this via `src/store/clips.ts`, maps entries to `Exercise` objects
(`src/clips/exercise.ts`), and plays them with `src/audio/clipPlayer.ts`.

---

## 8. App modules (quick map)

| Path | Role |
|------|------|
| `src/theory/` | Types, diatonic/chromatic pools, Roman labels, voicing |
| `src/engine/round.ts` | Synth round generation + `scoreAttempt` |
| `src/audio/synth.ts` | Tone.js piano source |
| `src/audio/clipPlayer.ts` | Clip playback + bar highlights + two-pass stop |
| `src/clips/` | Spec generation helpers, MusicGen syntax, manifest types |
| `src/store/settings.ts` | Sound source + practice knobs |
| `src/store/session.ts` | Round lifecycle, given first slot, scoring |
| `src/store/clips.ts` | Manifest load + random clip pick |
| `scripts/generateClips.ts` | Replicate + QC gate |
| `scripts/qcClips.py` | lv-chordia validation |

---

## 9. Possible next steps

- Larger clip library; move audio off-repo to object storage when git size hurts
- Optional Suno (or similar) restyle from our clips for vocals / higher production
- Clip libraries that include chromatic / diminished when those settings return
- Stronger QC (stricter thresholds, quality-family gates, or a second ACR model)

---

## References

- [MusicGen-Chord on Replicate](https://replicate.com/sakemin/musicgen-chord)
- [MusicGen-Chord source](https://github.com/sakemin/cog-musicgen-chord)
- [lv-chordia](https://github.com/openmirlab/lv-chordia)
