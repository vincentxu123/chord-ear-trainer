#!/usr/bin/env python3
"""Reject an incomplete rotation pack before deploying it."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from export_candidates import library_metadata
from rotate_released import OUTPUT, PLAYLIST_URL


def verify_pack(output: Path) -> tuple[int, int]:
    manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    entries = manifest.get("clips")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Rotation manifest has no excerpts")
    if manifest.get("playlistUrl") != PLAYLIST_URL or manifest.get("sourceCount", 0) < 50:
        raise ValueError("Rotation manifest has an invalid playlist or source count")
    if not manifest.get("refreshedAt"):
        raise ValueError("Rotation manifest has no refresh timestamp")

    identifiers: set[str] = set()
    filenames: set[str] = set()
    for entry in entries:
        if entry.get("id") in identifiers or not entry.get("id"):
            raise ValueError("Rotation manifest has a duplicate or empty excerpt ID")
        identifiers.add(entry["id"])
        if len(entry.get("measureChordCounts", [])) != 4:
            raise ValueError(f"Invalid measure count in {entry['id']}")
        if len(entry.get("cueTimesSec", [])) != len(entry.get("chords", [])):
            raise ValueError(f"Invalid chord cue count in {entry['id']}")
        for field in ("file", "instrumentalFile"):
            filename = entry.get(field)
            if not isinstance(filename, str) or Path(filename).name != filename or not filename.endswith(".mp3"):
                raise ValueError(f"Invalid {field} in {entry['id']}")
            if filename in filenames or not (output / filename).is_file():
                raise ValueError(f"Duplicate or missing audio file: {filename}")
            filenames.add(filename)

    actual_files = {path.name for path in output.glob("*.mp3")}
    if actual_files != filenames:
        raise ValueError("Rotation directory has unreferenced or missing audio")
    metadata = library_metadata(output, entries)
    if any(manifest.get(key) != value for key, value in metadata.items()):
        raise ValueError("Rotation manifest version or totalBytes does not match its audio")
    return len(entries), metadata["totalBytes"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    count, total_bytes = verify_pack(args.output)
    print(f"Verified {count} rotation excerpts and {total_bytes} audio bytes")


if __name__ == "__main__":
    main()
