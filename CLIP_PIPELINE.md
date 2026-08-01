# Real-Music Clip Pipeline

Plan for evolving the ear trainer from synth-played chords to short, real-sounding
music clips (4-chord progressions, chorus-like) with automatically known chord labels.

Researched July 2026. See "References" at the bottom for sources.

---

## 1. Decision summary

**Chosen approach: generate our own clips with MusicGen-Chord.**

MusicGen-Chord is an open-source variant of Meta's MusicGen that accepts an
explicit chord progression as an input (`text_chords`), plus BPM, time signature,
and a free-text style prompt. Because the progression is an *input* to generation,
the answer key is known by construction — there is no labeling step.

### Alternatives considered and rejected

| Approach | Why rejected |
|---|---|
| Extract choruses from real songs | Copyright: cannot legally host/serve commercial recordings. HookTheory has no data API. Automatic chord recognition plateaus at ~77–82% accuracy, so labels can't be trusted. Fragile acquisition pipeline (YouTube ripping, label alignment). |
| Suno (text prompts) | No official API as of mid-2026 (third-party wrappers only, $0.01–0.11/song, murky licensing). Suno ignores chord names in prompts — it's trained on vibe descriptions, not theory. Every clip would need ~80%-accurate ACR verification, so labels are never fully trustworthy. |
| Suno (audio-upload conditioning) | Works (Suno follows the harmony of uploaded reference audio) but is web-UI-centric and still depends on unofficial wrappers. Kept as optional Phase 2 polish, not the core pipeline. |

### Key properties of the chosen approach

- **Labels are exact** — no chord recognition needed to build the answer key.
- **One-time cost** — the library is generated offline; zero runtime API cost.
- **No licensing risk** — generated instrumental music, nothing derived from commercial recordings.
- **Fits existing architecture** — `AudioSourceKind` already includes `'generated'`; the
  manifest reuses the app's relative `{rootPc, quality}` chord model.

---

## 2. Pipeline overview

```
[Progression spec generator]        (reuse src/engine + src/theory logic)
        │  key, mode, 4 chords, bpm, style prompt
        ▼
[MusicGen-Chord generation]         (Replicate API or local Docker/GPU)
        │  ~16–20s WAV, 32kHz stereo
        ▼
[QC: chord recognition check]       (lv-chordia; regenerate on mismatch)
        │
        ▼
[Post-process]                      (ffmpeg loudnorm → ~96kbps Opus/MP3)
        │
        ▼
[manifest.json + clip files]        (public/clips/ or Supabase Storage / R2)
        │
        ▼
[App: clip playback mode]           (Tone.Player, manifest-driven exercises)
```

---

## 3. Steps in detail

### Step 1 — Progression spec generator (`scripts/`)

Reuse the app's existing theory/engine logic (`src/engine/round.ts`,
`src/theory/chords.ts`) to produce generation specs:

- Pick key, mode (major/minor), and a 4-chord diatonic progression
  (same pools/rules as the current synth exercise generator).
- Convert relative chords to MusicGen-Chord text syntax, one chord per bar:
  - Bare root = major: `C`
  - Qualities after a colon: `A:min`, `B:dim`, `G:7`, `F:maj7`, etc.
  - Example: key of C, I–V–vi–IV → `"C G A:min F"`
- Vary across a style-prompt bank, e.g.:
  - "acoustic pop ballad, warm guitars, soft drums"
  - "80s synthpop chorus, bright synths, punchy drums"
  - "indie rock, driving drums, electric guitar"
  - "neo-soul groove, electric piano, smooth bass"
- Vary BPM (e.g. 70–130) and keys (all 12 tonics).
- Emit a JSON spec per clip: `{ id, key, mode, bpm, timeSig, chords, textChords, stylePrompt }`.

### Step 2 — Generate audio with MusicGen-Chord

Model: `sakemin/musicgen-chord` (Replicate) / `sakemin/cog-musicgen-chord` (GitHub, open source).

- Inputs: `prompt` (style), `text_chords`, `bpm`, `time_sig`, `duration`.
- Request ~16–20 seconds so the 4-bar progression plays through twice.
- Two ways to run:
  1. **Replicate API** — no setup, ~$0.10–0.32 per clip (A100, billed per GPU-second;
     shorter durations cost less). Async: submit, poll, download.
  2. **Local** — free with an NVIDIA GPU (~16GB VRAM) via Docker/cog.
- Output: 32kHz stereo WAV, instrumental full-band texture (no real sung lyrics —
  fine, arguably better for ear training).

### Step 3 — Automatic QC (recommended)

Even chord-conditioned generation occasionally drifts. Since we know the intended
answer, recognition only needs to *confirm*, not discover:

- Run each clip through **lv-chordia** (`pip install lv-chordia`, PyTorch inference-only,
  ~80% accuracy) or **BTC**.
- Map detected chords to relative Roman numerals given the known key; compare
  against the intended progression with a tolerance (e.g. ≥3 of 4 bars matching root).
- On failure: regenerate with a new seed (expect roughly ~20% regeneration rate; verify empirically).

### Step 4 — Post-process

- Loudness-normalize with ffmpeg: `ffmpeg -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 ...`
- Trim silence at head/tail if present.
- Encode to ~96kbps Opus (or 128kbps MP3 for Safari-compat simplicity).
  A 20s clip ≈ 250–320KB → a 300-clip library ≈ 75–95MB.

### Step 5 — Manifest

Emit `manifest.json` with one entry per accepted clip, using the app's existing
relative chord model:

```json
{
  "id": "clip-0042",
  "file": "clips/clip-0042.mp3",
  "key": "G",
  "mode": "major",
  "bpm": 96,
  "beatsPerChord": 4,
  "chords": [
    { "rootPc": 0, "quality": "maj" },
    { "rootPc": 7, "quality": "maj" },
    { "rootPc": 9, "quality": "min" },
    { "rootPc": 5, "quality": "maj" }
  ],
  "style": "acoustic pop ballad"
}
```

Hosting: start with `public/clips/` in the repo (static assets); move to
Supabase Storage or Cloudflare R2 free tier if the library outgrows the repo.

### Step 6 — App changes

- **`src/audio/clipPlayer.ts`** — `ClipAudioSource` using `Tone.Player`
  (or `HTMLAudioElement`), same play/stop interface as `SynthAudioSource`.
- **Manifest loading** — fetch `manifest.json` at startup; pick a clip matching
  current settings and build an `Exercise` with `source: 'generated'`.
  `scoreAttempt` works unchanged (manifest chords use `{rootPc, quality}`).
- **Settings** — "Piano (synth)" vs "Real music (clips)" toggle in
  `SettingsPanel`; disable tempo/length controls in clip mode (fixed by the recording).
- **Preloading** — fetch the next clip while the user answers the current one.
- No backend required; the app stays a static SPA.

---

## 4. Cost estimate

| Item | Cost |
|---|---|
| Library generation (300 clips, Replicate) | ~$30–100 one-time (+ ~20% QC regeneration) |
| Library generation (local GPU) | $0 |
| Hosting (static / Supabase / R2 free tier) | $0 |
| Runtime per-user cost | $0 |

---

## 5. Implementation status & usage

Implemented (July 2026):

- `scripts/generateClips.ts` — generation script (Steps 1, 2, 5). Loudness
  normalization happens inside the model (`normalization_strategy: "loudness"`),
  so the separate ffmpeg pass (Step 4) is skipped for now.
- `src/clips/` — manifest types, MusicGen chord syntax conversion, clip→exercise mapping.
- `src/store/clips.ts` — manifest loader; `src/audio/clipPlayer.ts` — clip playback
  with slot-highlight sync derived from the clip's BPM.
- Settings panel has a "Sound source" toggle (Piano / Real music). Real music is
  disabled until a clip library exists; clip rounds fall back to synth if the
  library is missing.

Not yet implemented: automatic QC via chord recognition (Step 3) — for now,
listen to each generated clip and delete bad ones (remove the file and its
manifest entry); batch post-processing (Step 4); remote hosting (clips live in
`public/clips/`).

### Generating clips

```powershell
# One-time: get a token at https://replicate.com/account/api-tokens and put it
# in .env at the repo root (copy .env.example). .env is gitignored.

# Preview specs without spending money
npm run clips:generate -- --count 3 --dry-run

# Generate for real (~$0.10-0.32/clip, a few minutes each; cold boots add delay)
npm run clips:generate -- --count 3

# Optional: fix the style prompt instead of randomizing it
npm run clips:generate -- --count 2 --style "piano pop ballad, expressive piano"
```

Clips and `manifest.json` land in `public/clips/`. The app picks them up on
next load; the "Real music" toggle enables itself once the manifest has entries.
Listen to each new clip once and delete any whose harmony sounds wrong.

---

## 6. Optional Phase 2 — Suno polish via audio upload

For richer "radio-like" production (including vocals):

- Render the known progression to audio (existing Tone.js synth, or the MusicGen clip itself).
- Upload it as reference audio to Suno (web UI, or a third-party wrapper exposing the
  upload endpoint); Suno follows the harmony of the reference while restyling it.
- Labels remain trustworthy because the reference's chords are ours; still run the
  Step-3 QC check on results.
- Cost via wrappers: ~$0.02–0.11 per clip. Treat as an upgrade path, not a dependency.

---

## References

- MusicGen-Chord (Replicate): https://replicate.com/sakemin/musicgen-chord
- MusicGen-Chord (source): https://github.com/sakemin/cog-musicgen-chord
- lv-chordia (chord recognition): https://github.com/openmirlab/lv-chordia
- BTC chord recognition: https://github.com/jayg996/BTC-ISMIR19
- ACR accuracy plateau (~77–82%): https://github.com/marcusfkelley/btc-hcqt
- Suno API status (no official API, mid-2026): https://gptproto.com/blog/suno-api
- Suno chord-prompt limitations: https://www.solfej.io/blog/suno-ai-chord-progressions/
- Music structure analysis (rejected real-song path): https://github.com/mir-aidj/all-in-one
- HookTheory API limits (no TheoryTab dump): https://www.hooktheory.com/api/trends/docs
