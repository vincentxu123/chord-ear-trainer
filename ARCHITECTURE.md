# Chord Progression Ear Trainer — Architecture & Spec

> A web app for practicing recognition of chord progressions by ear, focused on
> **relative/functional movement (Roman numerals)** rather than naming exact pitches.
> MVP uses **browser-synthesized audio** (Tone.js) so it is fully legal, instant,
> and transposable; real-song playback (YouTube) is a deliberate later phase.

> **Status (Phase 1 shipped).** The playable MVP is complete and has grown past
> the original Phase 1 scope. Beyond the locked v1 decisions below, the build now
> also includes: **random/weighted progression generation** (no JSON seed file),
> **major + minor key mixing**, **opt-in diminished triads**, click-to-hear chord
> auditioning, a **guaranteed tonic** (any slot), and an **interactive piano
> keyboard**. Sections below are annotated where the implementation has moved on
> from the initial spec. No Supabase/accounts yet (that is Phase 2).

---

## 1. Decisions locked for v1

| Area | Decision | Why |
|------|----------|-----|
| Audio source | **Strategy A — synthesized chords (Tone.js)** | Legal, zero licensing, infinite content, random-key transposition = better training, full timing control |
| Training mode | **Roman numeral / scale-degree** (e.g. `I V vi IV`) | Matches the "intervals between chords, not exact notes" goal |
| Backend | **Frontend + Supabase only** (no custom server in v1) | Supabase = Postgres + Auth + RLS + REST. Frontend talks to it directly |
| Stack | React + TypeScript + Vite + Tone.js + Tailwind + Zustand | Small SPA, fast iteration |

Deferred to later phases: real songs via YouTube IFrame, Hooktheory ingestion,
chord-detection pipeline, Spotify Web Playback SDK.

---

## 2. The core pedagogical model

The whole app reduces to one idea: **a progression is a timed sequence of
*relative* chords**, independent of key. The user hears it in some (randomized)
key and must identify the *functional movement*, not the literal notes.

A progression is stored once, abstractly:

```
[I, V, vi, IV]   // major-key diatonic, the "axis of awesome" progression
```

At play time we:
1. Pick a **random key** (e.g. Eb major) — forces relative listening, prevents
   memorizing absolute pitches.
2. Map each Roman numeral → concrete notes in that key.
3. Render with Tone.js.
4. Ask the user to reconstruct the sequence of Roman numerals.
5. Score per-chord and store the attempt.

Because data is stored relative, the *same* progression works in synth mode
(any key) and later in real-song mode (the song's actual key).

### Answer modes (v1 ships mode 1; others are config flags)
- **Roman numeral** — pick the chord per slot from the allowed pool. *(v1)*
- **Root-interval** — "root moved up a 4th / down a 2nd / same" + quality. *(later)*
- **Quality** — major, minor, and **opt-in diminished**; augmented later. *(shipped)*

### Chord vocabulary (current)
- **Qualities:** **major and minor**, plus **diminished as an opt-in toggle**
  (`includeDiminished`); augmented is still deferred.
- **Mode mixing:** each round randomly picks a **major or minor** tonality
  (`Exercise.mode`). The mode determines the diatonic pool, the Roman-numeral
  spelling, and the key label; it does not change the audio engine.
- **Diatonic pools (6 triads each, the diminished degree excluded by default):**
  - Major: `I, ii, iii, IV, V, vi` (omits `vii°`).
  - Minor: `i, III, iv, v, VI, VII` (omits `ii°`).
  - Enabling `includeDiminished` adds the missing diatonic diminished triad
    (`vii°` in major, `ii°` in minor); it is treated as in-key, not chromatic.
- **Chromatic / out-of-key chords are opt-in** (`includeChromatic`). Because
  chords are stored as `rootPc + quality` (see §3), the same root can appear as
  either quality, including roots outside the scale; the extra pool is
  mode-specific (curated secondary-dominant / borrowed chords).
- **Generation rules:** progressions are built by **weighted random** walk over
  the active pool (common roots down-weighted for variety), with **no back-to-back
  duplicates**, the **tonic guaranteed to appear in some slot** (not necessarily
  first), and — when chromatic is on — at least one out-of-key chord guaranteed.

---

## 3. Music-theory engine (pure TypeScript, no audio)

A standalone, fully unit-tested module with **no Tone.js dependency** so the
logic is testable in isolation.

```ts
// theory/types.ts
// Triads: major, minor, and (opt-in) diminished. Augmented still deferred.
type Quality = 'maj' | 'min' | 'dim';

// Tonal context of a round; chosen randomly per round. Affects which chords are
// diatonic, the Roman-numeral spelling, and the key label — not the audio.
type Mode = 'major' | 'minor';

// A chord is defined RELATIVE to the tonic: the number of semitones its root
// sits above the tonic (0-11) + its quality. This single model covers BOTH
// diatonic chords AND chromatic / out-of-key chords, and lets the SAME root
// carry either quality. Example in Eb major (tonic = Eb):
//   D minor = { rootPc: 11, quality: 'min' }  (borrowed / "in-key-ish")
//   D major = { rootPc: 11, quality: 'maj' }  (chromatic, out of key)
interface Chord {
  rootPc: number;    // 0-11 semitones above the tonic
  quality: Quality;  // 'maj' | 'min' | 'dim'
}
interface Progression {
  id: string;
  name: string;            // label; left empty for randomly generated rounds —
                           // the Roman label is derived from chords + mode at display time
  chords: Chord[];         // 2-6 chords (see Practice settings)
  beatsPerChord: number;   // usually 4 (one bar each)
}
// NOTE: tempo (bpm) is no longer a property of the progression — it is a
// user-controlled Practice setting (see §5), so any progression can be
// replayed at any speed.

// The Exercise is the central RUNTIME object the engine + every AudioSource
// share (see §5, §7). A progression is reusable data; an exercise is one
// concrete playable instance of it.
interface Exercise {
  progression: Progression;
  key: string;                 // absolute tonic: randomized for synth, fixed for media
  mode: Mode;                  // 'major' | 'minor' — chosen per round
  source: 'synth' | 'generated' | 'youtube';
  mediaAssetId?: string;       // non-synth tiers
  startSec?: number;           // segment window (non-synth)
  endSec?: number;
  chordTimesSec?: number[];    // onset of each chord — drives UI highlighting for media
  styleId?: string;            // synth arrangement preset (see §4 RenderStyle)
}

// theory/voicing.ts
function chordToNotes(c: Chord, key: string): string[]; // -> ['Eb4','G4','Bb4']
function randomKey(): string;         // random tonic from the 12 keys

// theory/chords.ts (mode-aware display + pool helpers)
function toRoman(c: Chord, mode?: Mode): string;  // 'ii','III','bVI','vii°'... (mode-aware)
function isChromatic(c: Chord, mode?: Mode): boolean;
function chordPool(mode: Mode, includeChromatic: boolean, includeDiminished?: boolean): Chord[];
```

Recommended helper library: **`tonal`** (`@tonaljs/tonal`) for note math,
intervals, and scale-degree → note conversion. It's pure TS, well typed, and
keeps you from hand-rolling pitch arithmetic.

**Why `rootPc + quality` instead of a fixed Roman-numeral enum:** the goal is to
train *chromatic* movement too (a major chord where the key wants a minor one,
or roots that aren't in the scale). Roman-numeral *spelling* of chromatic chords
is ambiguous, so we store the unambiguous relative root + quality and derive a
best-effort Roman label for display. Pure root-interval answer mode (a later
mode) is the most natural fit for chromatic chords.

---

## 4. Audio engine (Tone.js)

This is the body of **`SynthAudioSource`** (the tier-1 implementation of the
`AudioSource` interface in §7). It loads a sampled instrument, takes an
`Exercise` + the current tempo, schedules it on `Tone.Transport`, and exposes
`play()/replay()/stop()` plus a "now-playing chord index" callback for UI
highlighting.

```ts
// audio/SynthAudioSource.ts
const sampler = new Tone.Sampler({
  urls: { C4: 'C4.mp3', 'D#4': 'Ds4.mp3', /* salamander piano subset */ },
  baseUrl: '/samples/piano/',
}).connect(reverb).toDestination();   // reverb/effects chain — see realism section

async function play(ex: Exercise, tempoBpm: number, onChord: (i: number) => void) {
  await Tone.start();                          // must run inside a user gesture
  Tone.Transport.bpm.value = tempoBpm;         // tempo is a Practice setting, not per-progression
  const { chords, beatsPerChord } = ex.progression;
  chords.forEach((chord, i) => {
    const notes = chordToNotes(chord, ex.key);  // {rootPc,quality} + key -> voiced notes
    Tone.Transport.schedule((time) => {
      sampler.triggerAttackRelease(notes, `${beatsPerChord}n`, time);
      Tone.Draw.schedule(() => onChord(i), time);
    }, `${i * beatsPerChord}i`);
  });
  Tone.Transport.start();
}
// A RenderStyle (see realism section) swaps the instrument, voicing, rhythmic
// pattern, and effects without changing this scheduling skeleton.
```

Notes:
- `Tone.start()` **must** run inside a click/tap handler (browser autoplay policy).
- Ship a small piano sample set (e.g. Salamander subset) in `/public/samples`.
- Optional: a pad/strings layer to make root motion easier to hear.

### Playback speed (user-adjustable)
- **Range 100-460 BPM, default 280.** A tempo slider drives
  `transport.bpm.value = settings.tempoBpm`, and chords are scheduled at
  tempo-relative **tick positions** (`i * beatsPerChord * PPQ`) so the slider
  genuinely controls speed. In synth mode this changes speed with **no pitch
  change** (the synth re-renders). Re-playing a round picks up the current tempo.
- **Later tiers (audio file / YouTube):** speed maps to *playback rate* instead.
  A raw `playbackRate` change also shifts pitch (bad for ear training) unless you
  time-stretch — use `Tone.GrainPlayer` / a time-stretch lib for files, and
  YouTube's `setPlaybackRate` (limited to 0.25-2 and it does pitch-correct). Note
  this difference per `AudioSource` implementation.

### Sounding like a real song (synth realism)

Timbre alone won't make synth audio feel like a record — **arrangement matters as
much as the sample**. Realism comes from five independent levers, in rough order
of impact:

1. **Sampled instruments, not oscillators.** Use multi-sampled real recordings.
   `Tone.Sampler` pitch-shifts samples to fill note gaps, so quality follows the
   samples. Best options:
   - **`smplr`** (danigb, actively maintained 2026) — Splendid Grand Piano,
     General-MIDI soundfont instruments, drum machines, Mellotron. Shares an
     `AudioContext` with Tone.js. Highest realism-per-effort.
   - **`tonejs-instruments`** (nbrosowsky) — drop-in `Tone.Sampler` sets
     (piano, acoustic/electric guitar, strings, etc.).
   - **Salamander Grand Piano** samples — solid free piano baseline.
2. **A small effects chain.** `Tone.Reverb` (convolution; ~0.15-0.3 wet) is the
   single biggest "studio" upgrade after good samples. Add gentle `Tone.EQ3` +
   `Tone.Compressor`, and `Tone.Chorus` for EP/pad timbres.
3. **Voicing & voice leading** (don't play root-position block triads stacked in
   one octave):
   - Add a separate **bass note** (root) an octave or two below the chord.
   - Use **inversions** to minimize movement between chords (voice leading) so it
     sounds musical rather than robotic.
   - Use open/spread voicings; **clamp the chord register to a fixed band**
     (e.g. C3-C5) regardless of the randomized key so it never sounds too high/low.
4. **Rhythm & feel.** Instead of one held block per bar, drive notes with a
   pattern (arpeggio, broken chord, guitar strum, piano comping) via
   `Tone.Pattern`/`Tone.Sequence`; **humanize** with small random velocity
   (~0.6-0.9) and ±10-20 ms timing jitter; optional `Tone.Transport.swing`.
5. **Backing layers** for a true "real environment": an optional **drum loop** +
   **bass line** (and a pad) under the chords. Keep these toggleable so beginners
   can isolate the harmony.

**Architecture fit — the `RenderStyle` layer.** Bundle the above into named
presets so realism is configurable and extensible *without touching the theory
or engine layers*. The theory layer stays pure (`rootPc + quality`); a thin
**arrangement layer** turns a chord into actual notes + rhythm + instrument:

```ts
// audio/style.ts
interface RenderStyle {
  id: string;                                   // 'pop-piano','acoustic-guitar','lofi-ep','pad'
  instrument: string;                           // smplr / sampler instrument name
  pattern: 'block' | 'arpeggio' | 'strum' | 'comp';
  voicing: 'close' | 'open' | 'voice-led';
  register: [low: string, high: string];        // clamp band, e.g. ['C3','C5']
  useBass: boolean;
  useDrums: boolean;
  reverbWet: number;                             // 0-1
  humanize: boolean;
}
// SynthAudioSource consumes a RenderStyle; engine/theory never change.
```

Keep a plain **"block chords" style** for clarity and a **"song-like" style** for
realism, and tie the choice to difficulty (more arrangement = harder to hear the
changes). This synth-realism work also **narrows the gap to the Suno tier** and
the voicing/timing concepts are reused when annotating generated clips.

---

## 5. Frontend architecture

```
src/
  theory/        # pure music-theory logic (unit-tested, no DOM, no audio)
  audio/         # Tone.js wrapper
  data/          # seed progressions (JSON) + Supabase client + queries
  engine/        # round lifecycle, scoring, adaptive difficulty
  store/         # Zustand stores (session, settings, auth)
  components/     # UI: Slots, AnswerPad, Controls, Feedback, SettingsPanel, PianoKeyboard
  pages/         # Practice (Stats, Login arrive in Phase 2)
  App.tsx
```

### Round lifecycle (the `engine`)
```
generateRound(settings)        -> { progression, key, exercise }
   -> playProgression()        (audio)
   -> collect user answer      (UI: pick Roman numeral per slot)
   -> scoreAttempt(answer, prog)-> { perSlot[], correctCount, total }
   -> persist attempt (Supabase)
   -> show feedback + replay + "next"
```

### Scoring
- Per-slot correct/incorrect by **chord identity `(rootPc, quality)`** — not the
  Roman string, which is ambiguous for chromatic chords. The derived Roman label
  is for display only.
- Track latency (time from playback end → submit) for adaptive difficulty.
- "Partial credit" view: highlight which slots were right.

### Adaptive difficulty (simple v1)
- Start with 2–3 chord, common diatonic progressions.
- Track per-chord-type accuracy; surface weak chords more often (weighted random).
- Increase progression length, then widen the pool (`includeChromatic`) and add
  a more song-like `RenderStyle` as accuracy climbs. *(No diminished/augmented in
  v1 — those arrive with a later quality expansion.)*

### State management
- **Zustand** stores: `useSession` (current round/answer), `useSettings`
  (tempo, length, chord pool, key randomization), `useAuth` (Supabase user).
- No heavy data lib needed; Supabase JS client + small query helpers in `data/`.

### Practice settings (user-configurable)
```ts
// store/settings.ts
interface PracticeSettings {
  tempoBpm: number;           // speed control — range 100-460, default 280
  progressionLength: number;  // default 4, min 2, max 6
  includeChromatic: boolean;  // default false → diatonic only
  includeDiminished: boolean; // default false → add the diatonic vii° / ii°
  randomizeKey: boolean;      // default true (hidden key → relative listening)
}
// NOTE: there is no `allowedChords` field. The answer-pad pool is DERIVED per
// round from chordPool(exercise.mode, includeChromatic, includeDiminished) — it
// follows the round's randomly chosen major/minor mode (see §2, §3).
```
Constraints enforced in the UI: tempo clamped to 100-460, length clamped to 2-6.

---

## 6. Data model (Supabase / Postgres)

v1 can run with progressions stored as a **local JSON seed file** and only
`profiles` + `attempts` in Supabase. Schema below is the target once everything
is server-stored (also forward-compatible with real-song mode).

```sql
-- relative, key-independent progression
create table progressions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,              -- "I–V–vi–IV"
  chords        jsonb not null,             -- [{rootPc:0,quality:'maj'}, ...]  (matches §3 model)
  beats_per_chord int not null default 4,
  difficulty    int  not null default 1,
  tags          text[] default '{}',        -- ['pop','axis','chorus']
  created_at    timestamptz default now()
);
-- NOTE: no bpm column — tempo is a per-user Practice setting (§5). Real media
-- clips carry their own bpm in media_assets (§7).

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text,
  streak     int default 0,
  created_at timestamptz default now()
);

create table attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete cascade,
  progression_id uuid references progressions(id),
  played_key     text not null,             -- key it was rendered in
  answer         jsonb not null,            -- user's per-slot guesses
  per_slot       jsonb not null,            -- [{correct:true}, ...]
  correct_count  int not null,
  total          int not null,
  latency_ms     int,
  created_at     timestamptz default now()
);

-- aggregate weakness stats — keyed by chord IDENTITY (rootPc+quality), since the
-- Roman label is ambiguous for chromatic chords.
create view chord_accuracy as
  select user_id,
         (slot->>'rootPc')  as root_pc,
         (slot->>'quality') as quality,
         avg((slot->>'correct')::int) as accuracy
  from attempts, jsonb_array_elements(per_slot) as slot
  group by user_id, root_pc, quality;
```

### Row Level Security (important — frontend talks to DB directly)
```sql
alter table attempts enable row level security;
create policy "own attempts" on attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table profiles enable row level security;
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- progressions are public read, no client writes
alter table progressions enable row level security;
create policy "read progressions" on progressions for select using (true);
```

Because there's no custom backend, **RLS is your security boundary** — never
disable it, and only expose the Supabase *anon* key in the frontend.

---

## 7. The `AudioSource` abstraction (scaling to generated + real songs)

The single most important design decision for longevity: **every exercise is
`{ relative progression, key, timing } + an audio source`**. Only the audio
source differs across tiers; the training/scoring engine never changes.

```ts
// audio/AudioSource.ts
interface AudioSource {
  kind: 'synth' | 'generated' | 'youtube';
  prepare(ex: Exercise): Promise<void>;          // load sample/file/iframe
  play(onChord?: (i: number) => void): Promise<void>;
  replay(): Promise<void>;
  stop(): void;
  dispose(): void;
}
```

| Tier | Implementation | Audio storage | Chords known from | Legal |
|------|----------------|---------------|-------------------|-------|
| 1. Synth (v1) | `SynthAudioSource` → Tone.js renders the progression live in `ex.key` | none (in-browser) | you authored it | trivially clean |
| 2. Generated (Suno) | `GeneratedAudioSource` → `Tone.Player`/`<audio>` plays a file, optional start/end | **Supabase Storage** | prompted **+ verified once** | paid plan + labeling |
| 3. Real songs | `YouTubeAudioSource` → IFrame player `start/endSeconds` | YouTube (store only `videoId`) | annotated (McGill / by hand) | official embed only |

Adding tier 2 or 3 = a new `AudioSource` impl + rows in the tables below. The
`engine` (`generateRound → prepare → play → score → persist`) is untouched.

### Schema additions (forward-compatible)
```sql
create table media_assets (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('generated','youtube')),
  storage_path text,         -- supabase storage path (generated audio)
  external_ref text,         -- youtube videoId
  title text, artist text,
  source_key   text,         -- actual key of the recording/clip
  bpm          int,
  duration_sec numeric,
  license_note text,         -- 'suno-pro', 'cc-by', ...
  verified     boolean default false,   -- annotation confirmed by a human
  created_at   timestamptz default now()
);

-- an exercise binds a relative progression to an audio source (+ timing/key)
create table exercises (
  id             uuid primary key default gen_random_uuid(),
  progression_id uuid references progressions(id),
  media_asset_id uuid references media_assets(id),  -- NULL = synth tier
  label          text,          -- 'chorus','bridge','intro' (real/generated)
  start_sec      numeric,       -- segment window (generated/youtube)
  end_sec        numeric,
  chord_times_sec numeric[],    -- onset of each chord within the clip → drives UI highlighting
  key            text,          -- absolute key for media; NULL = randomized (synth)
  style_id       text           -- synth arrangement preset (RenderStyle, §4); NULL for media
);
```

### Tier 2 (Suno / AI-generated) — important caveats
- **Pre-generate offline, never at runtime.** Generation takes ~30s+ and costs
  credits; a live request would block the UI. Build a small **offline tool**
  (Node TS or Python script, run on your machine/CI) that: calls the Suno API →
  downloads the clip → uploads to Supabase Storage → inserts `media_assets` +
  `exercises`. This keeps the *runtime* app "frontend + Supabase only."
- **Suno does not guarantee it follows the prompted progression.** It is
  generative. So treat the prompted chords as a *hypothesis* and require a
  one-time human **verify/annotate** pass (flip `verified = true`) — or run a
  chord-detector to confirm — before a clip enters the practice pool.
- **Licensing (2026):** only paid (Pro/Premier) Suno plans grant
  use/distribution rights; free-tier output is non-commercial. AI-labeling
  rules apply. Record this per-asset in `license_note`. Fine for personal use;
  required for any public deployment.

### Tier 3 (real songs) annotation sources
McGill Billboard dataset (timed chord+section annotations, ~1000 songs),
Hooktheory API (Roman-numeral data, no timing), or chord detection
(Moises / Chord.ai / open-source ChordMiniApp). Decided in Phase 4.

---

## 8. Tech stack summary

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **React + TypeScript + Vite** | Or Next.js if SSR/Vercel desired |
| Audio | **Tone.js** | Synthesis + transport/clock |
| Theory math | **@tonaljs/tonal** | Note/interval/scale-degree helpers |
| State | **Zustand** | Lightweight |
| Styling | **Tailwind CSS** | Fast UI |
| DB/Auth | **Supabase** (Postgres + Auth + RLS) | Frontend talks directly via anon key |
| Audio assets | **Supabase Storage** (Phase 3+) | `snippets/` bucket for generated clips |
| Gen tooling | **Offline Node-TS or Python script** (Phase 3+) | Suno API → Storage → DB; not a live server |
| Tests | **Vitest** | Heavily test `theory/` and `engine/scoring` |
| Hosting | **Vercel / Netlify** (frontend) + Supabase cloud | |

---

## 9. Phased roadmap

**Phase 1 — Playable MVP (no DB required) — ✅ shipped (and extended)**
- `theory/` engine (`rootPc + quality` model) + `tonal`, fully unit-tested.
- **Random/weighted progression generation** (replaced the planned JSON seed
  file), with **major/minor mode mixing**, guaranteed tonic, and no adjacent dupes.
- Tone.js player (Salamander sampler + reverb), random-key rendering, replay.
- Roman-numeral answer UI + per-slot scoring + feedback (shows the solution).
- **Click-to-hear** chord auditioning after answering; **interactive piano keyboard**.
- Settings: **tempo slider (100-460 BPM, default 280)**, **progression length
  (default 4, min 2, max 6)**, key-randomization toggle, **`includeChromatic`**
  and **`includeDiminished`** toggles (both shipped). Pool is derived from the
  round's mode rather than a static `allowedChords` list.

**Phase 2 — Accounts & progress (Supabase)**
- Supabase Auth (email/OAuth), `profiles` + `attempts` + RLS.
- Stats page: accuracy by chord type, streak, history.
- Adaptive difficulty (weight weak chords; grow length).

**Phase 3 — Generated music (Suno) — the "real environment" step**
- Introduce the `AudioSource` abstraction; refactor v1 into `SynthAudioSource`.
- Add `media_assets` + `exercises` tables + Supabase Storage `snippets/` bucket.
- Offline generation tool: Suno API → download → upload to Storage → insert rows.
- Human verify/annotate pass (`verified` flag) before clips enter the pool.
- `GeneratedAudioSource` plays clips with full-instrument timbre — real-feel
  practice, copyright-clean (paid plan + labeling).

**Phase 4 — Real songs (YouTube)**
- `YouTubeAudioSource` (IFrame `start/endSeconds`), `media_assets.kind='youtube'`.
- Seed annotations from McGill Billboard / hand-entered favorites.
- "Identify the chorus progression" mode reusing the same engine.

**Phase 5 — Scale & polish**
- Optional Supabase Edge Function (TS) to proxy Hooktheory / hide keys.
- Optional chord-detection ingestion (Python service) to auto-verify clips.
- Optional Spotify Web Playback SDK mode for Premium users.

---

## 10. Open questions — status

1. Voicing style — block triads only, or add inversions early? **Open.** Still
   block triads in a clamped register; voice-leading/inversions not yet built.
2. Rhythm — strict one-bar-per-chord, or varied rhythms? **Open** (still one
   block per bar). *(tempo is a user setting, now 100-460 BPM.)*
3. Answer UX — Roman-numeral buttons vs. clickable piano keyboard? **Resolved:**
   answers are Roman-numeral buttons (pool derived from the round's mode); a
   separate interactive piano keyboard was added as an **auditioning aid**, not
   the answer mechanism.
4. Key **hidden** by default (`randomizeKey = true`) for relative listening —
   **confirmed/kept.**
5. Minor-key support in v1 or major-only first? **Resolved:** rounds randomly
   mix **major and minor** modes.
6. When `includeChromatic` is on, which exact out-of-key chords enter the pool?
   **Resolved (initial set):** mode-specific curated chords — major adds
   `II, bIII, III, iv, bVI, VI, bVII`; minor adds `I, bII, II, IV, V`.
   Difficulty-tiering of the chromatic pool is still open.
7. Diminished triads — deferred in the original spec, now **shipped** as the
   opt-in `includeDiminished` toggle (`vii°` / `ii°`). Augmented still deferred.
```
```
