"""One-command clip generator: generate -> download -> detect -> gate -> save.

Usage (from the repo root, with the venv active):
    python tools/clipgen/main.py --count 5
    python tools/clipgen/main.py --count 3 --vocals      # allow vocals

Or via npm:  npm run gen-clip -- --count 5

Loops until COUNT clips pass the acceptance gate (or --max-tries is hit), writing
each accepted clip's mp3 to public/clips/ and appending a record to
public/clips.json. Auto-accepts anything that passes the gate.
"""
import argparse
import os
import sys
import tempfile
from pathlib import Path

# Allow running as a plain script: make sibling modules importable.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config  # noqa: E402
import generate  # noqa: E402
import download  # noqa: E402
import detect  # noqa: E402
import segment  # noqa: E402
import normalize  # noqa: E402
import gate  # noqa: E402
import clips_db  # noqa: E402

CFG = config.CFG

DEFAULT_PROMPT = (
    "An upbeat, simple pop song built on a repeating four-chord loop. "
    "Clear diatonic harmony, steady tempo, no key changes."
)

_QUAL_SUFFIX = {"maj": "", "min": "m", "dim": "dim"}

# Note name -> pitch class, accepting sharps and flats.
_NAME_TO_PC = {
    "C": 0, "C#": 1, "DB": 1, "D": 2, "D#": 3, "EB": 3, "E": 4, "FB": 4,
    "E#": 5, "F": 5, "F#": 6, "GB": 6, "G": 7, "G#": 8, "AB": 8, "A": 9,
    "A#": 10, "BB": 10, "B": 11, "CB": 11,
}


def parse_key(name: str) -> int:
    pc = _NAME_TO_PC.get(name.strip().replace("FLAT", "B").upper())
    if pc is None:
        raise ValueError(f"Unrecognized key '{name}' (try e.g. Ab, C#, F)")
    return pc


def _chord_name(root_pc: int, quality: str) -> str:
    return detect.PITCH_NAMES[root_pc % 12] + _QUAL_SUFFIX.get(quality, "")


def _run_detect(path: str):
    return detect.detect(
        path,
        include_dim=CFG.include_dim,
        min_seg_sec=CFG.min_seg_sec,
        use_nn_filter=CFG.use_nn_filter,
        median_frames=CFG.median_frames,
    )


def label_file(
    path: str, save: bool = False, instrumental: bool = True, key_override: int | None = None
) -> None:
    """Run detection on a local file and print a report (no API key needed)."""
    print(f"Analyzing {path}")
    result = _run_detect(path)
    key_pc = key_override if key_override is not None else result["key_pc"]
    mode = result["mode"]
    tag = " (overridden)" if key_override is not None else ""
    print(f"\nDetected key: {detect.PITCH_NAMES[result['key_pc'] % 12]} {mode}")
    print(f"Using key:    {detect.PITCH_NAMES[key_pc % 12]}{tag}  "
          f"(duration {result['duration']:.1f}s)\n")

    print("Full chord timeline (absolute):")
    for seg in result["segments"]:
        print(f"  {seg['start']:6.2f}s  {_chord_name(seg['root'], seg['quality']):>5}"
              f"  conf={seg['conf']:.2f}")

    window = segment.choose_window(result["segments"], result["duration"], CFG)
    if not window:
        print("\nNo stable 3-4 chord window found -> would be REJECTED.")
        return

    chords, times = normalize.to_relative(window, key_pc)
    conf = normalize.mean_confidence(window)
    ok, reason = gate.passes(chords, conf, CFG)

    print(f"\nChosen window: {window['start']:.2f}s -> {window['end']:.2f}s")
    print("Progression (absolute / relative):")
    for c, t in zip(chords, times):
        abs_name = _chord_name((c["rootPc"] + key_pc) % 12, c["quality"])
        print(f"  {t:6.2f}s  {abs_name:>5}   rootPc={c['rootPc']:>2} {c['quality']}")
    print(f"\nMean confidence: {conf:.2f}")
    print(f"Gate: {'ACCEPT' if ok else 'REJECT'} ({reason})")

    if save and ok:
        from pathlib import Path

        record = clips_db.add_clip(
            src_audio=Path(path),
            key_pc=key_pc,
            mode=mode,
            chords=chords,
            chord_times_sec=times,
            duration_sec=result["duration"],
            start_sec=window["start"],
            end_sec=window["end"],
            instrumental=instrumental,
        )
        print(f"Saved {record['id']} to public/clips.json")


def make_one(prompt: str, instrumental: bool) -> dict | None:
    print("  - generating (this can take 30-90s)...")
    audio_url = generate.generate(prompt, instrumental=instrumental)

    with tempfile.TemporaryDirectory() as tmp:
        local = download.download(audio_url, Path(tmp) / "clip.mp3")
        print("  - detecting chords + key...")
        result = _run_detect(str(local))

        window = segment.choose_window(result["segments"], result["duration"], CFG)
        if not window:
            print("  x rejected: no stable 3-4 chord window found")
            return None

        chords, times = normalize.to_relative(window, result["key_pc"])
        conf = normalize.mean_confidence(window)
        ok, reason = gate.passes(chords, conf, CFG)
        if not ok:
            print(f"  x rejected: {reason}")
            return None

        record = clips_db.add_clip(
            src_audio=local,
            key_pc=result["key_pc"],
            mode=result["mode"],
            chords=chords,
            chord_times_sec=times,
            duration_sec=result["duration"],
            start_sec=window["start"],
            end_sec=window["end"],
            instrumental=instrumental,
        )
        roman = " ".join(f"{c['rootPc']}:{c['quality']}" for c in chords)
        print(f"  + accepted {record['id']} [{record['key']} {record['mode']}] {roman}")
        return record


def main():
    ap = argparse.ArgumentParser(description="Generate + label chord-trainer clips.")
    ap.add_argument("--count", type=int, default=1, help="number of accepted clips to produce")
    ap.add_argument("--vocals", action="store_true", help="allow vocals (default: instrumental)")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT, help="generation prompt")
    ap.add_argument("--max-tries", type=int, default=0, help="cap total attempts (0 = count*4)")
    ap.add_argument("--label-file", help="analyze a local audio file (no API key needed)")
    ap.add_argument("--key", help="override detected key/tonic, e.g. Ab, C#, F")
    ap.add_argument("--save", action="store_true", help="with --label-file: append result to clips.json")
    args = ap.parse_args()

    instrumental = not args.vocals

    if args.label_file:
        key_override = parse_key(args.key) if args.key else None
        label_file(args.label_file, save=args.save, instrumental=instrumental, key_override=key_override)
        return
    max_tries = args.max_tries or args.count * 4
    accepted = 0
    tries = 0

    print(
        f"Target: {args.count} clip(s) | {'instrumental' if instrumental else 'with vocals'} "
        f"| provider {CFG.base_url}"
    )
    while accepted < args.count and tries < max_tries:
        tries += 1
        print(f"[try {tries}/{max_tries}] (accepted {accepted}/{args.count})")
        try:
            if make_one(args.prompt, instrumental):
                accepted += 1
        except Exception as exc:  # keep the loop alive on transient failures
            print(f"  ! error: {exc}")

    print(f"\nDone: {accepted}/{args.count} accepted in {tries} tries.")
    if accepted < args.count:
        sys.exit(1)


if __name__ == "__main__":
    main()
