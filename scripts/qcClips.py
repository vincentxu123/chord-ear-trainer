"""
Validate generated clips against their manifest labels using lv-chordia.

Usage (from repo root, with the QC venv active):
  .venv-qc\\Scripts\\activate
  python scripts/qcClips.py
  python scripts/qcClips.py --min-root-match 0.75
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLIPS_DIR = ROOT / "public" / "clips"
MANIFEST_PATH = CLIPS_DIR / "manifest.json"

PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
# Enharmonic map so Gb and F# compare equal, etc.
PC_ALIASES = {
    "B#": 0,
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "Fb": 4,
    "E#": 5,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
    "Cb": 11,
}

KEY_PC = {name: i for i, name in enumerate(PC_NAMES)}


def parse_chord_label(label: str) -> tuple[int | None, str]:
    """Return (pitch_class, quality_family) from labels like 'Bb:min7' or 'N'."""
    if not label or label in {"N", "X", "NC", "None"}:
        return None, "none"
    root_part, _, qual_part = label.partition(":")
    root_part = root_part.strip().replace("♯", "#").replace("♭", "b")
    qual_part = (qual_part or "maj").strip().lower()
    pc = PC_ALIASES.get(root_part)
    if "dim" in qual_part or qual_part in {"o", "°"}:
        family = "dim"
    elif qual_part.startswith("min") or qual_part in {"m", "m6", "m7", "m9", "minor"}:
        family = "min"
    else:
        # maj / 7 / maj7 / sus / aug → treat as major-family for our triad labels
        family = "maj"
    return pc, family


def expected_absolute(entry: dict) -> list[tuple[int, str, str]]:
    key_pc = KEY_PC[entry["key"]]
    out = []
    for chord in entry["chords"]:
        pc = (key_pc + chord["rootPc"]) % 12
        quality = chord["quality"]
        label = f"{PC_NAMES[pc]}{'' if quality == 'maj' else ':' + quality}"
        out.append((pc, quality, label))
    return out


def chord_at_time(segments: list[dict], t: float) -> str:
    for seg in segments:
        if seg["start_time"] <= t < seg["end_time"]:
            return seg["chord"]
    if segments and t >= segments[-1]["end_time"]:
        return segments[-1]["chord"]
    return "N"


def majority_chord_in_window(segments: list[dict], start: float, end: float) -> str:
    """Pick the chord covering the most time inside [start, end)."""
    weights: Counter[str] = Counter()
    for seg in segments:
        a = max(start, seg["start_time"])
        b = min(end, seg["end_time"])
        if b > a:
            weights[seg["chord"]] += b - a
    if not weights:
        return chord_at_time(segments, (start + end) / 2)
    return weights.most_common(1)[0][0]


def evaluate_clip(entry: dict, segments: list[dict], passes: int = 2) -> dict:
    bpm = entry["bpm"]
    bpc = entry["beatsPerChord"]
    bar_sec = bpc * (60.0 / bpm)
    expected = expected_absolute(entry)
    n = len(expected)

    root_hits = 0
    quality_hits = 0
    details = []
    total = n * passes

    for p in range(passes):
        for i, (exp_pc, exp_qual, exp_label) in enumerate(expected):
            start = (p * n + i) * bar_sec
            end = start + bar_sec
            # Ignore a little attack/release at the edges of each bar.
            det_label = majority_chord_in_window(segments, start + bar_sec * 0.15, end - bar_sec * 0.1)
            det_pc, det_qual = parse_chord_label(det_label)
            root_ok = det_pc == exp_pc
            qual_ok = root_ok and det_qual == exp_qual
            if root_ok:
                root_hits += 1
            if qual_ok:
                quality_hits += 1
            details.append(
                {
                    "bar": p * n + i + 1,
                    "expected": exp_label,
                    "detected": det_label,
                    "root_ok": root_ok,
                    "quality_ok": qual_ok,
                }
            )

    return {
        "id": entry["id"],
        "root_match": root_hits / total,
        "quality_match": quality_hits / total,
        "root_hits": root_hits,
        "quality_hits": quality_hits,
        "total_bars": total,
        "details": details,
    }


def load_chord_recognition():
    try:
        from lv_chordia.chord_recognition import chord_recognition
    except ImportError as exc:
        raise SystemExit(
            "lv-chordia is not installed. From the repo root:\n"
            "  python -m venv .venv-qc\n"
            "  .venv-qc\\Scripts\\activate\n"
            "  pip install lv-chordia\n"
            "  python scripts/qcClips.py"
        ) from exc
    return chord_recognition


def check_one(audio: Path, entry: dict, min_root_match: float) -> dict:
    chord_recognition = load_chord_recognition()
    segments = chord_recognition(audio_path=str(audio), chord_dict_name="ismir2017")
    result = evaluate_clip(entry, segments)
    result["pass"] = result["root_match"] >= min_root_match
    result["min_root_match"] = min_root_match
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="QC clip labels with lv-chordia")
    parser.add_argument(
        "--min-root-match",
        type=float,
        default=0.75,
        help="Pass threshold for root accuracy across all bars (default 0.75)",
    )
    parser.add_argument("--clip", action="append", help="Only check this clip id (repeatable)")
    # Single-clip machine-readable mode used by scripts/generateClips.ts
    parser.add_argument("--audio", help="Path to one audio file to check")
    parser.add_argument(
        "--entry-json",
        help="JSON for one ClipManifestEntry (required with --audio)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="With --audio, print a single JSON result object on stdout",
    )
    args = parser.parse_args()

    if args.audio:
        if not args.entry_json:
            print("--entry-json is required with --audio", file=sys.stderr)
            return 2
        # lv-chordia resolves relative paths oddly — always pass absolute.
        audio = Path(args.audio).resolve()
        entry = json.loads(args.entry_json)
        result = check_one(audio, entry, args.min_root_match)
        if args.json:
            print(json.dumps(result))
        else:
            status = "PASS" if result["pass"] else "FAIL"
            print(
                f"{status}  root {result['root_hits']}/{result['total_bars']} "
                f"({result['root_match']:.0%})"
            )
        return 0 if result["pass"] else 1

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    clips = manifest.get("clips", [])
    if args.clip:
        wanted = set(args.clip)
        clips = [c for c in clips if c["id"] in wanted]

    if not clips:
        print("No clips to check.")
        return 1

    print(f"Checking {len(clips)} clip(s) with lv-chordia (threshold root>={args.min_root_match:.0%})...\n")

    failures = 0
    for entry in clips:
        path = CLIPS_DIR / entry["file"]
        print(f"{entry['id']}  expected key={entry['key']} {entry['mode']}  bpm={entry['bpm']}")
        if not path.exists():
            print(f"  MISSING FILE: {path}")
            failures += 1
            continue

        result = check_one(path, entry, args.min_root_match)
        status = "PASS" if result["pass"] else "FAIL"
        if not result["pass"]:
            failures += 1

        print(
            f"  {status}  root {result['root_hits']}/{result['total_bars']} "
            f"({result['root_match']:.0%})  "
            f"quality {result['quality_hits']}/{result['total_bars']} "
            f"({result['quality_match']:.0%})"
        )
        for d in result["details"]:
            mark = "OK" if d["root_ok"] else "no"
            qmark = "OK" if d["quality_ok"] else "--"
            print(
                f"    bar {d['bar']}: expect {d['expected']:<8}  "
                f"heard {d['detected']:<10}  root {mark}  qual {qmark}"
            )
        print()

    print(f"Done: {len(clips) - failures} passed, {failures} failed (root threshold {args.min_root_match:.0%}).")
    print(
        "Note: ACR is ~80% accurate, so a FAIL is a signal to listen — not proof the label is wrong."
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
