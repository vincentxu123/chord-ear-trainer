#!/usr/bin/env python3
"""Export eligible four-measure recording candidates for the web app."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ANALYSIS_ROOT = REPO_ROOT / ".recordings"
DEFAULT_OUTPUT = REPO_ROOT / "public" / "song-clips"

# Tonal centers were reviewed against each song's eligible candidate rows.
# Keeping them explicit makes Roman-numeral answers stable and auditable.
SONG_CATALOG = {
    "借口 / Jie Kou": {"slug": "jie-kou", "key": "D", "mode": "major"},
    "彩虹 / Cai Hong": {"slug": "cai-hong", "key": "C", "mode": "major"},
    "我不配 / Wo Bu Pei": {"slug": "wo-bu-pei", "key": "Bb", "mode": "major"},
    "擱淺 / Ge Qian": {"slug": "ge-qian", "key": "F", "mode": "major"},
}

NOTE_TO_PC = {
    "C": 0,
    "B#": 0,
    "C#": 1,
    "DB": 1,
    "D": 2,
    "D#": 3,
    "EB": 3,
    "E": 4,
    "FB": 4,
    "E#": 5,
    "F": 5,
    "F#": 6,
    "GB": 6,
    "G": 7,
    "G#": 8,
    "AB": 8,
    "A": 9,
    "A#": 10,
    "BB": 10,
    "B": 11,
    "CB": 11,
}


def chord_to_relative(label: str, key: str) -> dict[str, Any]:
    root, _, family = label.partition(":")
    root_pc = NOTE_TO_PC[root.upper().replace("♯", "#").replace("♭", "B")]
    key_pc = NOTE_TO_PC[key.upper().replace("♯", "#").replace("♭", "B")]
    if family not in {"maj", "min", "dim"}:
        raise ValueError(f"Unsupported chord label: {label}")
    return {"rootPc": (root_pc - key_pc) % 12, "quality": family}


def manifest_entry(
    analysis: dict[str, Any], candidate: dict[str, Any], catalog: dict[str, str]
) -> dict[str, Any]:
    playback_start = float(candidate["playback_start"])
    end = float(candidate["end"])
    chords: list[dict[str, Any]] = []
    cue_times: list[float] = []
    measure_counts: list[int] = []
    for bar in candidate["bars"]:
        sequence = bar["chord_sequence"]
        measure_counts.append(len(sequence))
        for piece in sequence:
            chords.append(chord_to_relative(piece["label"], catalog["key"]))
            cue_times.append(max(0.0, float(piece["start"]) - playback_start))

    if cue_times:
        cue_times[0] = 0.0
    start_measure = int(candidate["index"])
    title = analysis["source"]["title"]
    return {
        "id": f"{catalog['slug']}-m{start_measure:03d}",
        "file": f"{catalog['slug']}-m{start_measure:03d}.mp3",
        "title": title,
        "artist": analysis["source"]["artist"],
        "startMeasure": start_measure,
        "endMeasure": start_measure + len(candidate["bars"]) - 1,
        "key": catalog["key"],
        "mode": catalog["mode"],
        "bpm": analysis["timing"]["fixedBpm"],
        "durationSec": end - playback_start,
        "chords": chords,
        "cueTimesSec": cue_times,
        "measureChordCounts": measure_counts,
        "_clipStartSec": playback_start,
    }


def export_audio(source: Path, output: Path, start: float, duration: float) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-ss",
            f"{start:.6f}",
            "-t",
            f"{duration:.6f}",
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "96k",
            str(output),
        ],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--analysis-root", type=Path, default=DEFAULT_ANALYSIS_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    analyses_by_title: dict[str, tuple[dict[str, Any], Path]] = {}
    for path in args.analysis_root.glob("*/analysis.json"):
        analysis = json.loads(path.read_text(encoding="utf-8"))
        title = analysis.get("source", {}).get("title")
        if title in SONG_CATALOG:
            analyses_by_title[title] = (analysis, path.parent)

    missing = set(SONG_CATALOG) - set(analyses_by_title)
    if missing:
        raise SystemExit(f"Missing analyses for: {', '.join(sorted(missing))}")

    entries: list[dict[str, Any]] = []
    for title, catalog in SONG_CATALOG.items():
        analysis, work_dir = analyses_by_title[title]
        preview = work_dir / analysis["audio"]["preview"]
        for candidate in analysis["candidates"]:
            # Website exercises are deliberately limited to green candidate
            # rows: supported harmony, stable measures, and full model agreement.
            if not candidate["eligible"]:
                continue
            entry = manifest_entry(analysis, candidate, catalog)
            start = entry.pop("_clipStartSec")
            output = args.output / entry["file"]
            export_audio(preview, output, start, entry["durationSec"])
            entries.append(entry)

    manifest = {"clips": entries}
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(entries)} eligible song clips to {args.output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FileNotFoundError as exc:
        raise SystemExit("ffmpeg is required to export candidate clips") from exc
