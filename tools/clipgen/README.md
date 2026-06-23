# clipgen - automated clip generation + chord labeling

A Python pipeline that generates a short instrumental clip with Suno (via a
third-party API), detects its key and chord progression, and appends a labeled
record to `public/clips.json` for the app's "Real clips" mode.

```
generate (Suno) -> download mp3 -> detect chords+key (librosa)
  -> choose 3-4 chord window -> normalize to relative rootPc+quality
  -> acceptance gate -> append public/clips.json + copy mp3 to public/clips/
```

## Reality check

- **There is no official Suno API.** This targets a third-party reseller
  (default **kie.ai**); everything provider-specific is in `generate.py` +
  `config.py`, so you can point `SUNO_API_BASE` elsewhere and tweak the field
  mapping if the schema differs.
- **Suno won't obey a chord prompt.** The prompt only biases it toward simple
  loops; **detection is the source of truth**, and the gate rejects anything
  that isn't a clean 3-4 chord progression.
- **Detection is a librosa baseline.** Good on simple instrumental loops; tune
  thresholds in `.env`, or swap in Chordino (Docker) later for accuracy.

## Setup (Windows / PowerShell)

```powershell
cd tools\clipgen
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env       # then edit .env and add SUNO_API_KEY
```

Sign up at your chosen provider (kie.ai by default), create an API key, and put
it in `tools/clipgen/.env`. If mp3 decoding fails, install ffmpeg and re-run.

## Run

From the repo root:

```powershell
# uses the venv python directly (no activation needed)
tools\clipgen\.venv\Scripts\python tools\clipgen\main.py --count 5

# or, with the venv active / deps on system python:
npm run gen-clip -- --count 5
npm run gen-clip -- --count 3 --vocals     # allow vocals
```

Each accepted clip is written to `public/clips/clip-NNN.mp3` and appended to
`public/clips.json` with `verified: true` and `autoLabeled: true`.

## Files

| file           | role                                                        |
|----------------|-------------------------------------------------------------|
| `config.py`    | env-driven config (API key, base URL, gate thresholds)      |
| `generate.py`  | provider request/poll (kie.ai schema)                       |
| `download.py`  | fetch the audio file                                        |
| `detect.py`    | librosa chroma -> triad templates + Krumhansl key           |
| `segment.py`   | choose the 3-4 chord playback window                        |
| `normalize.py` | absolute -> relative rootPc+quality, collapse repeats       |
| `gate.py`      | accept/reject heuristic                                     |
| `clips_db.py`  | id allocation + append to public/clips.json                 |
| `main.py`      | CLI orchestrator (loops until N accepted)                   |
