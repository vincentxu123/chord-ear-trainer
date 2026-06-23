"""Read/append the static clip database at public/clips.json."""
import json
import re
import shutil
from pathlib import Path

import config

PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def load() -> list:
    if config.CLIPS_JSON.exists():
        return json.loads(config.CLIPS_JSON.read_text(encoding="utf-8"))
    return []


def _next_id(records: list) -> str:
    nums = [
        int(m.group(1))
        for r in records
        if (m := re.match(r"clip-(\d+)", str(r.get("id", ""))))
    ]
    return f"clip-{(max(nums) + 1 if nums else 1):03d}"


def add_clip(
    src_audio: Path,
    key_pc: int,
    mode: str,
    chords: list,
    chord_times_sec: list,
    duration_sec: float,
    start_sec: float,
    end_sec: float,
    instrumental: bool,
) -> dict:
    records = load()
    clip_id = _next_id(records)

    config.CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    dest = config.CLIPS_DIR / f"{clip_id}{src_audio.suffix or '.mp3'}"
    shutil.copyfile(src_audio, dest)

    record = {
        "id": clip_id,
        "title": f"Generated {clip_id}",
        "source": "generated",
        "licenseNote": "suno-third-party-api",
        "audioPath": f"/clips/{dest.name}",
        "key": PITCH_NAMES[key_pc % 12],
        "mode": mode,
        "chords": chords,
        "chordTimesSec": chord_times_sec,
        "durationSec": round(duration_sec, 3),
        "startSec": round(start_sec, 3),
        "endSec": round(end_sec, 3),
        "verified": True,
        "autoLabeled": True,
        "instrumental": instrumental,
    }
    records.append(record)
    config.CLIPS_JSON.write_text(
        json.dumps(records, indent=2) + "\n", encoding="utf-8"
    )
    return record
