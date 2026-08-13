#!/usr/bin/env python3
"""Download one permitted YouTube recording, then run the song pipeline.

Forwards --chord-audio to process_song.py. Mix remains the default.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from analyze_song import CHORD_AUDIO_CHOICES, DEFAULT_WORK_ROOT, KEY_NAMES
from export_candidates import DEFAULT_OUTPUT


SCRIPT_DIR = Path(__file__).resolve().parent
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
TITLE_SEPARATOR = re.compile(r"\s+[-–—]\s+", re.UNICODE)
TITLE_SUFFIXES = (
    re.compile(r"\s+lyrics?(?:\s+\([^)]*\))?\s*$", re.IGNORECASE),
    re.compile(r"\s+[\[(](?:official\s+)?(?:audio|video|music\s+video|lyric\s+video|lyrics?)[^\])]*[\])]\s*$", re.IGNORECASE),
)


def validate_youtube_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in YOUTUBE_HOSTS:
        raise argparse.ArgumentTypeError("Provide a valid youtube.com or youtu.be URL")
    return value


def clean_title(value: str) -> str:
    cleaned = value.strip()
    for pattern in TITLE_SUFFIXES:
        cleaned = pattern.sub("", cleaned)
    return cleaned.strip()


def derive_song_metadata(info: dict[str, Any], artist: str | None, title: str | None) -> tuple[str, str]:
    metadata_title = info.get("track") or info.get("title")
    inferred_artist = None
    inferred_title = str(metadata_title).strip() if metadata_title else None
    if inferred_title:
        separated = TITLE_SEPARATOR.split(inferred_title, maxsplit=1)
        if len(separated) == 2:
            inferred_artist, inferred_title = separated
        inferred_title = clean_title(inferred_title)

    resolved_title = title or inferred_title
    resolved_artist = (
        artist
        or info.get("artist")
        or info.get("creator")
        or inferred_artist
        or info.get("uploader")
        or info.get("channel")
    )
    if not resolved_title or not resolved_artist:
        raise SystemExit("Could not derive artist/title; provide --artist and --title explicitly")
    return str(resolved_artist).strip(), str(resolved_title).strip()


def download_audio(url: str, imports_dir: Path) -> tuple[Path, dict[str, Any]]:
    try:
        from yt_dlp import YoutubeDL
    except ImportError as exc:
        raise SystemExit(
            "yt-dlp is not installed. Reinstall scripts/recordings/requirements.txt "
            "into .venv-recordings."
        ) from exc

    imports_dir.mkdir(parents=True, exist_ok=True)
    options = {
        "format": "bestaudio/best",
        "noplaylist": True,
        "outtmpl": str(imports_dir / "%(id)s.%(ext)s"),
        "continuedl": True,
        "overwrites": False,
        "js_runtimes": {"node": {}},
    }
    with YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
        if not isinstance(info, dict) or info.get("_type") == "playlist":
            raise SystemExit("Expected one YouTube video, but received a playlist")
        downloaded = Path(downloader.prepare_filename(info)).resolve()

    if not downloaded.is_file():
        requested = info.get("requested_downloads") or []
        candidates = [item.get("filepath") for item in requested if isinstance(item, dict)]
        downloaded = next(
            (Path(candidate).resolve() for candidate in candidates if candidate and Path(candidate).is_file()),
            downloaded,
        )
    if not downloaded.is_file():
        raise SystemExit(f"yt-dlp completed but the downloaded audio was not found: {downloaded}")
    return downloaded, info


def write_provenance(imports_dir: Path, downloaded: Path, requested_url: str, info: dict[str, Any]) -> Path:
    provenance = {
        "downloadedAt": datetime.now(timezone.utc).isoformat(),
        "requestedUrl": requested_url,
        "webpageUrl": info.get("webpage_url"),
        "extractor": info.get("extractor_key") or info.get("extractor"),
        "videoId": info.get("id"),
        "title": info.get("title"),
        "track": info.get("track"),
        "artist": info.get("artist"),
        "creator": info.get("creator"),
        "uploader": info.get("uploader"),
        "channel": info.get("channel"),
        "durationSec": info.get("duration"),
        "downloadedFile": str(downloaded),
    }
    path = imports_dir / f"{info.get('id') or downloaded.stem}.source.json"
    path.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def build_process_command(args: argparse.Namespace, downloaded: Path, artist: str, title: str) -> list[str]:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "process_song.py"),
        "--audio",
        str(downloaded),
        "--artist",
        artist,
        "--title",
        title,
        "--work-root",
        str(args.work_root.expanduser().resolve()),
        "--output",
        str(args.output.expanduser().resolve()),
        "--device",
        args.device,
        "--timing-checkpoint",
        args.timing_checkpoint,
        "--chord-audio",
        args.chord_audio,
    ]
    if args.key and args.mode:
        command.extend(["--key", args.key, "--mode", args.mode])
    if args.reuse_analysis:
        command.append("--reuse-analysis")
    if args.metadata:
        command.extend(["--metadata", str(args.metadata.expanduser().resolve())])
    return command


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", type=validate_youtube_url, required=True)
    parser.add_argument("--artist", help="Override artist metadata derived by yt-dlp")
    parser.add_argument("--title", help="Override title metadata derived by yt-dlp")
    parser.add_argument("--key", choices=KEY_NAMES)
    parser.add_argument("--mode", choices=("major", "minor"))
    parser.add_argument("--work-root", type=Path, default=DEFAULT_WORK_ROOT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps", "cuda"))
    parser.add_argument("--timing-checkpoint", default="final0")
    parser.add_argument("--reuse-analysis", action="store_true")
    parser.add_argument(
        "--chord-audio",
        choices=CHORD_AUDIO_CHOICES,
        default="mix",
        help="Audio fed to chord recognizers: mixed recording (default) or Demucs instrumental",
    )
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--download-only", action="store_true")
    args = parser.parse_args()

    if (args.key is None) != (args.mode is None):
        raise SystemExit("Provide both --key and --mode, or omit both for automatic estimation")

    imports_dir = args.work_root.expanduser().resolve() / "imports"
    downloaded, info = download_audio(args.url, imports_dir)
    artist, title = derive_song_metadata(info, args.artist, args.title)
    provenance_path = write_provenance(imports_dir, downloaded, args.url, info)
    print(f"Downloaded audio: {downloaded}", flush=True)
    print(f"Source metadata: {provenance_path}", flush=True)
    print(f"Song metadata: {artist} — {title}", flush=True)

    if args.download_only:
        return 0

    subprocess.run(build_process_command(args, downloaded, artist, title), check=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Pipeline step failed with exit code {exc.returncode}") from exc
