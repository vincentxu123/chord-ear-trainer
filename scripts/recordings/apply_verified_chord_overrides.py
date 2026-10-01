#!/usr/bin/env python3
"""Apply verified song sidecar chord corrections to already-published clips.

Use this when the full-song analysis is unavailable and published audio/timing
must stay intact. Future song exports read the same sidecars directly.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from export_candidates import DEFAULT_OUTPUT, chord_to_relative, library_metadata


def apply_overrides(
    manifest: dict[str, Any], sidecars: list[dict[str, Any]]
) -> tuple[dict[str, Any], int]:
    updated = deepcopy(manifest)
    clips = updated["clips"]
    seen: set[tuple[str, str, int, int]] = set()
    changed = 0

    for sidecar in sidecars:
        artist, title = str(sidecar["artist"]), str(sidecar["title"])
        for override in sidecar["chordOverrides"]:
            measure = int(override["measure"])
            position = int(override["chordPosition"])
            identity = (artist, title, measure, position)
            if identity in seen:
                raise ValueError(f"Duplicate chord override: {identity}")
            seen.add(identity)

            matches = [
                clip
                for clip in clips
                if clip["artist"] == artist
                and clip["title"] == title
                and int(clip["startMeasure"]) <= measure <= int(clip["endMeasure"])
            ]
            if len(matches) != 1:
                raise ValueError(f"Expected one published excerpt for {identity}, found {len(matches)}")

            clip = matches[0]
            counts = clip["measureChordCounts"]
            expected_measures = int(clip["endMeasure"]) - int(clip["startMeasure"]) + 1
            if (
                len(counts) != expected_measures
                or sum(counts) != len(clip["chords"])
                or len(clip["chords"]) != len(clip["cueTimesSec"])
            ):
                raise ValueError(f"Invalid chord layout for {clip['id']}")
            measure_index = measure - int(clip["startMeasure"])
            if not 1 <= position <= counts[measure_index]:
                raise ValueError(f"Chord position is outside measure {measure}: {identity}")

            chord_index = sum(counts[:measure_index]) + position - 1
            corrected = chord_to_relative(str(override["label"]), str(clip["key"]))
            if clip["chords"][chord_index] != corrected:
                clip["chords"][chord_index] = corrected
                changed += 1

    return updated, changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    output = args.output.expanduser().resolve()
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sidecars = [
        json.loads(path.expanduser().read_text(encoding="utf-8"))
        for path in args.metadata
    ]
    updated, changed = apply_overrides(manifest, sidecars)
    metadata = library_metadata(output, updated["clips"])
    if any(manifest.get(field) != value for field, value in metadata.items()):
        raise ValueError("Published audio metadata does not match the existing manifest")
    updated.update(metadata)

    if changed:
        temporary = manifest_path.with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(updated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        temporary.replace(manifest_path)
    print(f"Applied {changed} chord corrections to {manifest_path}")


if __name__ == "__main__":
    main()
