# Proposal: Real-Music Practice Mode (Suno + open-source chord detection)

> Extends the trainer beyond synthesized piano so the user practices identifying
> chord progressions from **realistic musical snippets** (e.g. a pop/R&B chorus).
> This is the "Path 2" approach: **Suno-generated audio we own + an offline
> open-source chord-detection pipeline with a human verify step.** It reuses the
> existing engine almost entirely via the `AudioSource` abstraction
> (see `ARCHITECTURE.md` §7).

Status: **proposal / not yet built.** Reference doc for implementation.

---

## 1. Why this approach

The hard part of real-music practice is not playback - it is obtaining
**accurate chord labels with timing** to score the user against. We compared
options (Spotify, YouTube, Suno, Creative-Commons, commercial APIs); Path 2 wins
on effort-to-control:

- **Spotify** - not viable: analysis API deprecated (2024, still gone 2026),
  DRM black box, Premium-only, no chord ground truth.
- **YouTube** - free but perpetual link-rot + timing drift; black-box audio.
- **Suno (chosen)** - we **own** the file (no DRM, storable, analyzable), we
  control snippet length (generate a chorus directly), and labels come from
  open-source detection + a one-time human check.
- **Creative Commons** - viable but high sourcing labor; good pop/R&B is scarce.

### Locked decisions
| Topic | Decision |
|-------|----------|
| Audio source | **Suno** (AI-generated, owned) |
| Labels | **Open-source detection + human verify** (offline) |
| Answer mode | **Establish/give the tonic up front**, then reuse Roman-numeral UI |
| Pipeline language | **Python** (best ACR ecosystem) |
| Detectors to calibrate | **autochord** (easy) + **Chordino** via `chord-extractor` (accuracy ref); madmom only if needed |
| First clip storage | **Static `clips.json` + `public/clips/`** (Supabase later) |
| Build order | **One-clip manual proof in the app first**, then the pipeline |

### Cost to maintain (personal scale)
- Suno: **$0** (free tier, personal) → $10/mo (Pro, commercial + ownership).
- Detection: **$0** (open-source, runs locally).
- Hosting + storage: **$0** on free tiers (~1 MB/clip; ~1,000 clips ≈ 1 GB).
- Dominant cost is **labor** (generate + verify per clip), kept low by short snippets.
- Caveat for any public launch: Suno has active label lawsuits/deals in 2026, so
  commercial terms may shift. Personal use is unaffected. Record per-clip
  licensing in `license_note`.

---

## 2. End-to-end flow

```
[Suno chorus] -> [trim] -> [chord + key detection] -> [human verify] -> clip record (JSON + audio)
       ( offline pipeline, Python, run on your machine )                       |
                                                                               v
   app reads clips.json -> GeneratedAudioSource plays clip + highlights chords -> existing guess/score UI
```

The runtime stays "frontend + Supabase only"; all generation/detection happens
**offline**, never at runtime.

---

## 3. Data contract (pipeline output ⇄ app input)

A clip record is the single contract between the offline pipeline and the app.
It is forward-compatible with `media_assets` / `exercises` in `ARCHITECTURE.md` §7.

```jsonc
{
  "id": "clip-001",
  "title": "Sunset Chorus",
  "source": "generated",
  "license_note": "suno-free-personal",
  "audioPath": "clips/clip-001.mp3",   // under public/ for the static prototype
  "key": "C",                          // absolute tonic (fixed - real audio can't transpose)
  "mode": "major",                     // 'major' | 'minor'
  "chords": [                          // RELATIVE progression (rootPc + quality)
    { "rootPc": 0, "quality": "maj" }, // I
    { "rootPc": 7, "quality": "maj" }, // V
    { "rootPc": 9, "quality": "min" }, // vi
    { "rootPc": 5, "quality": "maj" }  // IV
  ],
  "chordTimesSec": [0.0, 3.8, 7.6, 11.4], // onset of each chord (drives highlighting)
  "durationSec": 15.2,
  "startSec": 0.0,                     // optional playback window
  "endSec": 15.2,
  "verified": true                     // gate: only verified clips enter the pool
}
```

Notes:
- `chords` is **relative** (`rootPc + quality`), exactly the engine's existing
  model, so scoring (`(rootPc, quality)` identity) is unchanged.
- Timing lives in `chordTimesSec` because real/AI audio is not a clean
  `beatsPerChord` grid.
- Extensions are **reduced to triads** for v1 vocabulary (Cmaj7 → maj); only
  `maj` / `min` / `dim` are supported.

---

## 4. Offline pipeline (Python)

Run on the local machine; produces audio files + `clips.json` entries.

1. **Generate (manual to start).** Create a short, simple chorus in the Suno web
   app. Example prompt: *"pop chorus, C major, chords C-G-Am-F, 90 bpm, ~15s,
   female vocal."* Download the mp3. Suno **does not guarantee** it follows the
   chord prompt - that is why step 4 (verify) exists; regenerate if it is off.
   *(Later: optionally automate via the Suno API.)*
2. **Trim** to a clean chorus loop with `ffmpeg` (≈8-16s, ideally a whole phrase).
3. **Detect chords + key** with open-source ACR:
   - **autochord** (pip) - simplest, returns labeled chords with timestamps.
   - **Chordino / NNLS-Chroma** via `chord-extractor` (Docker) - reliable accuracy reference.
   - **madmom** - most accurate DNN chord recognition; add only if the above fall short.
   - Key: `madmom` / `essentia` key detector, or confirm the prompted key by ear.
   - Output: `(startSec, chordLabel)` list + detected key/mode.
4. **Normalize → relative model.** Convert absolute labels to `rootPc + quality`
   against the tonic, merge consecutive duplicates, drop blips, collapse
   extensions to triads.
5. **Human verify.** Listen once with detected chords shown; fix errors (expect
   ~70-85% accuracy on pop, worse with 7ths/slash chords); set `verified: true`.
6. **Emit** the audio file + a `clips.json` record.

### Detector calibration
On the first hand-labeled clip, run each detector and compare its output to the
human labels. Pick the tool (or ensemble) with the best chord + timing accuracy
on Suno pop, and standardize the pipeline on it.

---

## 5. Runtime integration (app)

Minimal, additive changes - the engine/scoring loop is reused.

- **`GeneratedAudioSource`** implementing the existing `AudioSource` interface:
  loads the file (`Tone.Player`), plays the `[startSec, endSec]` window, and
  fires the existing `onChord(i)` callback at `chordTimesSec` for UI highlighting.
- **Exercise construction** from a clip record: relative `chords`, fixed `key`,
  `mode`, `source: 'generated'`, `chordTimesSec`.
- **Given tonic:** show "Key: C major" and/or play the I chord before the clip,
  so the user can answer Roman numerals against a known tonic.
- **Reuse** `Slots`, `AnswerPad`, scoring unchanged (scoring keys on
  `(rootPc, quality)`).
- **Clip list:** read `clips.json`; audio served from `public/clips/`. A small UI
  affordance switches between **synth practice** and **clip practice** and
  advances clips.

### Design considerations / gotchas
- **Variable timing** → use `chordTimesSec`, not `beatsPerChord`, for playback +
  highlighting. Sequence scoring is unaffected.
- **Slot count** = verified progression length; decide whether to reveal the count.
- **Vocabulary** = maj/min/(dim) only; prefer clips that reduce cleanly to triads.
- **Bad Suno output** → regenerate rather than annotate wrong chords.
- **Replay** should re-window the same clip at the same times.

---

## 6. Milestones

1. **One-clip manual proof (runtime first).** Generate 1 Suno chorus, hand-label
   key/chords/times, add a single `clips.json` entry, build
   `GeneratedAudioSource`, and confirm the full play → guess → score loop in-app.
   *De-risks the runtime before any Python.*
2. **Detection script.** Build the Python pipeline; calibrate detectors against
   the Milestone-1 hand labels.
3. **Verify step + schema.** Add the human verify pass; batch 5-10 clips into
   `clips.json`.
4. **App reads the list.** Clip picker / advance UI; polish given-tonic UX.
5. **Later.** Move list + audio to Supabase Storage (zero engine change);
   optionally automate Suno generation; optional section/chorus auto-detection.

### Division of labor
- **Manual (user):** generate Suno clips, drop files in `public/clips/`,
  hand-label the first clip, run the verify pass.
- **Code (assistant):** `clips.json` schema + type, `GeneratedAudioSource`,
  exercise wiring, clip-practice UI, and (Milestone 2+) the Python pipeline.

---

## 7. Open questions

1. Reveal the number of chords (slot count) to the user, or hide it?
2. How to "give the tonic": show the label only, play the I chord, or both?
3. Per-chord replay (audition each chord region) in addition to full-clip replay?
4. Ensemble vs single detector after calibration?
5. When to migrate `clips.json` + audio to Supabase Storage.
6. Eventually support 7ths/extensions (vocabulary expansion) for richer R&B?
