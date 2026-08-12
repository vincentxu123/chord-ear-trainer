#!/usr/bin/env python3
"""Analyze one song, publish every eligible window, then write an audit report."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from analyze_song import DEFAULT_WORK_ROOT, KEY_NAMES, slug
from export_candidates import DEFAULT_OUTPUT


SCRIPT_DIR = Path(__file__).resolve().parent


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--artist", default="Jay Chou")
    parser.add_argument("--title")
    parser.add_argument("--key", choices=KEY_NAMES)
    parser.add_argument("--mode", choices=("major", "minor"))
    parser.add_argument("--work-root", type=Path, default=DEFAULT_WORK_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps", "cuda"))
    parser.add_argument("--timing-checkpoint", default="final0")
    parser.add_argument("--reuse-analysis", action="store_true")
    parser.add_argument("--metadata", type=Path)
    args = parser.parse_args()

    if (args.key is None) != (args.mode is None):
        raise SystemExit("Provide both --key and --mode, or omit both for automatic estimation")

    source = args.audio.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Audio file not found: {source}")
    title = args.title or source.stem
    work_root = args.work_root.expanduser().resolve()
    output = args.output.expanduser().resolve()
    work_dir = work_root / slug(f"{args.artist}-{title}")
    metadata = args.metadata
    if metadata is None:
        conventional_metadata = (
            SCRIPT_DIR / "song-metadata" / f"{slug(f'{args.artist}-{title}')}.json"
        )
        if conventional_metadata.is_file():
            metadata = conventional_metadata

    analyze_command = [
        sys.executable,
        str(SCRIPT_DIR / "analyze_song.py"),
        "--audio",
        str(source),
        "--artist",
        args.artist,
        "--title",
        title,
        "--work-root",
        str(work_root),
        "--device",
        args.device,
        "--timing-checkpoint",
        args.timing_checkpoint,
        "--timing-models",
        "beat-this,madmom",
        "--chord-models",
        "lv-chordia,btc",
        "--candidate-limit",
        "0",
        "--skip-report",
    ]
    if args.key and args.mode:
        analyze_command.extend(["--key", args.key, "--mode", args.mode])
    if metadata:
        analyze_command.extend(["--song-metadata", str(metadata.expanduser().resolve())])
    if args.reuse_analysis:
        analyze_command.append("--reuse-analysis")

    print("Analyzing with two timing models and two chord models...", flush=True)
    run(analyze_command)
    analysis_path = work_dir / "analysis.json"

    print("Publishing automatically eligible windows...", flush=True)
    run(
        [
            sys.executable,
            str(SCRIPT_DIR / "export_candidates.py"),
            "--analysis",
            str(analysis_path),
            "--output",
            str(output),
        ]
    )
    print(f"Done. Audit report: {work_dir / 'publish-report.html'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Pipeline step failed with exit code {exc.returncode}") from exc
