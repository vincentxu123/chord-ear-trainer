#!/usr/bin/env python3
"""Refresh the separate RELEASED exercise pack from YouTube Music.

Each source video goes through download_youtube.py and the unchanged two-model
song pipeline. The published pack is replaced only after the entire playlist
has been attempted and at least one excerpt has passed validation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from analyze_song import DEFAULT_WORK_ROOT
from download_youtube import YOUTUBE_ACCESS_BLOCKED_EXIT_CODE
from export_candidates import library_metadata


ROOT = Path(__file__).resolve().parents[2]
PLAYLIST_ID = "RDCLAK5uy_k5n4srrEB1wgvIjPNTXS9G1ufE9WQxhnA"
PLAYLIST_URL = f"https://music.youtube.com/playlist?list={PLAYLIST_ID}"
OUTPUT = ROOT / "public" / "rotation-clips"
ANCHOR_SUNDAY = date(2026, 10, 4)


def due_today(today: date) -> bool:
    return today.weekday() == 6 and (today - ANCHOR_SUNDAY).days % 14 == 0


def enough_sources_processed(report: dict[str, Any], source_count: int) -> bool:
    completed = sum(song.get("status") == "completed" for song in report["songs"].values())
    return completed >= math.ceil(source_count * 0.8)


def should_process_song(report: dict[str, Any], video_id: str) -> bool:
    return video_id not in report["songs"]


def playlist_videos() -> list[dict[str, str]]:
    from yt_dlp import YoutubeDL

    with YoutubeDL({
        "extract_flat": "in_playlist",
        "skip_download": True,
        "noplaylist": False,
        "ignoreerrors": True,
        "quiet": True,
        "js_runtimes": {"deno": {}, "node": {}},
    }) as downloader:
        playlist = downloader.extract_info(PLAYLIST_URL, download=False)
    if not isinstance(playlist, dict) or playlist.get("_type") != "playlist":
        raise RuntimeError("RELEASED did not resolve to a playlist")
    videos: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in playlist.get("entries") or []:
        if not isinstance(item, dict):
            continue
        video_id = item.get("id")
        if not isinstance(video_id, str) or not video_id or video_id in seen:
            continue
        seen.add(video_id)
        videos.append({
            "id": video_id,
            "title": str(item.get("title") or video_id),
            "url": f"https://www.youtube.com/watch?v={video_id}",
        })
    if not videos:
        raise RuntimeError("RELEASED returned no usable YouTube videos")
    return videos


def publish(staging: Path, output: Path, source_count: int, refreshed_at: str, verify_audio: bool = True) -> int:
    source_manifest = staging / "manifest.json"
    if not source_manifest.is_file():
        return 0
    entries = json.loads(source_manifest.read_text(encoding="utf-8")).get("clips", [])
    if not entries:
        return 0
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.fromisoformat(refreshed_at).strftime("%Y%m%dT%H%M%SZ")
    published: list[dict[str, Any]] = []
    for entry in entries:
        if len(entry.get("measureChordCounts", [])) != 4 or len(entry.get("cueTimesSec", [])) != len(entry.get("chords", [])):
            raise RuntimeError(f"Invalid chord cues in {entry['id']}")
        updated = {**entry, "id": f"{stamp}-{entry['id']}"}
        for field in ("file", "instrumentalFile"):
            filename = entry.get(field)
            if not filename:
                raise RuntimeError(f"Missing {field} for {entry['id']}")
            source = staging / filename
            if not source.is_file():
                raise RuntimeError(f"Missing staged audio: {source}")
            target_name = f"{stamp}-{filename}"
            shutil.copy2(source, output / target_name)
            if verify_audio:
                probe = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", str(output / target_name)],
                    check=True, capture_output=True, text=True,
                )
                if float(probe.stdout.strip()) + 0.25 < float(entry["durationSec"]):
                    raise RuntimeError(f"Audio is shorter than the excerpt: {target_name}")
            updated[field] = target_name
        published.append(updated)

    metadata = library_metadata(output, published)
    manifest = {
        **metadata,
        "refreshedAt": refreshed_at,
        "sourceCount": source_count,
        "playlistUrl": PLAYLIST_URL,
        "clips": published,
    }
    temporary = output / "manifest.json.tmp"
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(output / "manifest.json")

    current_files = {entry[field] for entry in published for field in ("file", "instrumentalFile")}
    for old_file in output.glob("*.mp3"):
        if old_file.name not in current_files:
            old_file.unlink()
    return len(published)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cpu", "cuda", "mps"), default="cpu")
    parser.add_argument("--scheduled", action="store_true", help="Run only on the alternating Sunday schedule")
    parser.add_argument("--list-only", action="store_true", help="List candidates without downloading audio")
    parser.add_argument("--max-songs", type=int, help="Limit a local trial to the first N songs")
    parser.add_argument("--work-root", type=Path, default=DEFAULT_WORK_ROOT / "rotation")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()

    today = datetime.now().astimezone().date()
    if args.scheduled and not due_today(today):
        print(f"Not a rotation Sunday: {today}")
        return 0

    work_root = args.work_root.expanduser().resolve()
    videos = playlist_videos()
    print(f"RELEASED contains {len(videos)} distinct videos", flush=True)
    if not args.list_only and args.max_songs is None and len(videos) < 50:
        raise RuntimeError("Playlist returned fewer than 50 videos; keeping the current rotation")
    if args.max_songs is not None:
        if args.max_songs < 1:
            raise SystemExit("--max-songs must be positive")
        videos = videos[: args.max_songs]
    if args.list_only:
        for index, video in enumerate(videos, 1):
            print(f"{index:02d}. {video['title']} — {video['url']}")
        return 0

    source_ids = [video["id"] for video in videos]
    batch_key = hashlib.sha256("\n".join(source_ids).encode("utf-8")).hexdigest()[:10]
    staging = work_root / f"staging-{today.isoformat()}-{batch_key}"
    staging.mkdir(parents=True, exist_ok=True)
    log_path = work_root / f"run-report-{today.isoformat()}-{batch_key}.json"
    report = {
        "playlistUrl": PLAYLIST_URL,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "sourceCount": len(videos),
        "sourceVideos": videos,
        "songs": {},
    }
    if log_path.is_file():
        previous = json.loads(log_path.read_text(encoding="utf-8"))
        if previous.get("sourceIds") == source_ids:
            if previous.get("finishedAt"):
                print("This playlist batch already finished today; leaving its result in place.")
                return 0 if previous.get("publishedExcerpts", 0) > 0 else 1
            report = previous
    report["sourceIds"] = source_ids

    for index, video in enumerate(videos, 1):
        if not should_process_song(report, video["id"]):
            print(f"[{index}/{len(videos)}] Already attempted: {video['title']}", flush=True)
            continue
        print(f"[{index}/{len(videos)}] Processing: {video['title']}", flush=True)
        command = [
            sys.executable, str(Path(__file__).with_name("download_youtube.py")),
            "--url", video["url"], "--device", args.device,
            "--work-root", str(work_root), "--output", str(staging),
        ]
        result = subprocess.run(command, check=False)
        report["songs"][video["id"]] = {
            "title": video["title"], "url": video["url"],
            "status": "completed" if result.returncode == 0 else "failed",
            "exitCode": result.returncode,
        }
        log_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if result.returncode == YOUTUBE_ACCESS_BLOCKED_EXIT_CODE:
            report["blockedReason"] = "YouTube denied audio access from this runner"
            report["finishedAt"] = datetime.now(timezone.utc).isoformat()
            report["publishedExcerpts"] = 0
            log_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print("YouTube denied audio access. Stopping before attempting more songs; existing rotation remains in place.", flush=True)
            return 1

    if not enough_sources_processed(report, len(videos)):
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        report["publishedExcerpts"] = 0
        log_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("Fewer than 80% of playlist videos processed successfully; keeping the current rotation.")
        return 1

    count = publish(staging, args.output.expanduser().resolve(), len(videos), datetime.now(timezone.utc).isoformat())
    report["publishedExcerpts"] = count
    report["finishedAt"] = datetime.now(timezone.utc).isoformat()
    log_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if not count:
        print("No excerpts passed. Existing rotation remains in place.")
        return 1
    print(f"Published {count} rotating excerpts from {len(videos)} source videos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
