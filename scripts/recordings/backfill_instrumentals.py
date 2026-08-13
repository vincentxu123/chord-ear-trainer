#!/usr/bin/env python3
"""Add Demucs instrumental variants to already-published song excerpts."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from export_candidates import DEFAULT_OUTPUT, export_audio, library_metadata
from separate_vocals import separate_vocals


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CACHE = REPO_ROOT / ".recordings" / "instrumental-backfill"


def instrumental_filename(entry: dict[str, Any]) -> str:
    return f"{entry['id']}-instrumental.mp3"


def backfill(
    output: Path,
    cache: Path,
    device: str,
) -> tuple[int, int]:
    manifest_path = output / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Song manifest not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = list(manifest.get("clips", []))
    if not entries:
        raise RuntimeError("Song manifest contains no excerpts")

    cache.mkdir(parents=True, exist_ok=True)
    added = 0
    for entry in entries:
        if entry.get("instrumentalFile"):
            continue
        source = output / str(entry["file"])
        if not source.is_file():
            raise FileNotFoundError(f"Published excerpt not found: {source}")
        stem = cache / f"{entry['id']}.wav"
        filename = instrumental_filename(entry)
        destination = output / filename
        print(f"Separating {entry['id']}...", flush=True)
        separate_vocals(source, stem, device)
        export_audio(stem, destination, 0.0, float(entry["durationSec"]))
        entry["instrumentalFile"] = filename
        added += 1

    metadata = library_metadata(output, entries)
    temporary = manifest_path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps({**manifest, **metadata, "clips": entries}, indent=2, ensure_ascii=False)
        + "\n",
        encoding="utf-8",
    )
    temporary.replace(manifest_path)
    return added, len(entries)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps", "cuda"))
    args = parser.parse_args()
    added, total = backfill(
        args.output.expanduser().resolve(),
        args.cache.expanduser().resolve(),
        args.device,
    )
    print(f"Added {added} instrumental files; {total} excerpts in manifest")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, RuntimeError) as exc:
        raise SystemExit(str(exc)) from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Audio processing failed with exit code {exc.returncode}") from exc
