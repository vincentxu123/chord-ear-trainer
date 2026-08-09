#!/usr/bin/env python3
"""Analyze one local recording and generate a static four-bar review report."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import shutil
import statistics
import subprocess
import sys
import wave
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WORK_ROOT = REPO_ROOT / ".recordings"
SUPPORTED_FAMILIES = {"maj", "min", "dim"}
TWO_CHORD_PRIMARY_MAX = 0.75
TWO_CHORD_SECONDARY_MIN = 0.20


@dataclass(frozen=True)
class ChordVote:
    label: str
    family: str | None
    seconds: float


@dataclass(frozen=True)
class ChordSlice:
    label: str
    family: str | None
    start: float
    end: float
    occupancy: float


@dataclass(frozen=True)
class BarAnalysis:
    index: int
    start: float
    end: float
    chord: str
    family: str | None
    dominance: float
    votes: tuple[ChordVote, ...]
    chord_sequence: tuple[ChordSlice, ...]


@dataclass(frozen=True)
class Candidate:
    index: int
    start: float
    end: float
    score: float
    local_bpm: float
    bars: tuple[BarAnalysis, ...]
    eligible: bool
    reasons: tuple[str, ...]


@dataclass(frozen=True)
class SongTiming:
    bpm: float
    bar_duration: float
    downbeats: tuple[float, ...]
    detected_downbeats: tuple[float, ...]


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def require_command(name: str) -> str:
    found = shutil.which(name)
    if not found:
        raise SystemExit(f"Required command not found: {name}")
    return found


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def slug(value: str) -> str:
    safe = "".join(c.lower() if c.isalnum() else "-" for c in value)
    return "-".join(part for part in safe.split("-") if part)[:80] or "song"


def normalize_audio(source: Path, destination: Path) -> None:
    ffmpeg = require_command("ffmpeg")
    destination.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "22050",
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def make_preview_audio(source: Path, destination: Path) -> None:
    """Create a compact, seek-friendly copy for the static HTML report."""
    ffmpeg = require_command("ffmpeg")
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(destination),
        ]
    )


def analyze_timing(audio: Path, device: str, checkpoint: str) -> tuple[list[float], list[float]]:
    try:
        from beat_this.inference import File2Beats
    except ImportError as exc:
        raise SystemExit(
            "beat-this is not installed. See scripts/recordings/README.md"
        ) from exc

    tracker = File2Beats(checkpoint_path=checkpoint, device=device, dbn=False)
    beats, downbeats = tracker(str(audio))
    return sorted(float(x) for x in beats), sorted(float(x) for x in downbeats)


def normalize_song_timing(downbeats: list[float], duration: float) -> SongTiming:
    """Resolve half/double-time changes into one fixed 4/4 grid for the song.

    Beat trackers can alternate between emitting a downbeat every two musical
    beats and every four. We choose the prominent interval that accounts for
    the largest span of the recording, find the phase supported by the whole
    song, and fit one tempo across the matching downbeats.
    """
    detected = sorted(time for time in downbeats if 0.0 <= time <= duration)
    intervals = [
        end - start
        for start, end in zip(detected, detected[1:])
        if 0.75 <= end - start <= 12.0
    ]
    if len(detected) < 2 or not intervals:
        raise ValueError("At least two usable downbeats are required to infer song tempo")

    tolerance = 0.12
    minimum_support = max(3, math.ceil(len(intervals) * 0.08))
    candidates: list[tuple[float, float, int]] = []
    for seed in intervals:
        direct = [value for value in intervals if abs(value / seed - 1.0) <= tolerance]
        if len(direct) < minimum_support:
            continue
        candidate = statistics.median(direct)
        covered_duration = sum(direct) / sum(intervals)
        candidates.append((covered_duration, candidate, len(direct)))
    if not candidates:
        seed = statistics.median(intervals)
    else:
        # Weight support by elapsed time, not event count: a run of false
        # half-bar markers otherwise outvotes a longer run of correct bars.
        seed = max(candidates, key=lambda item: (item[0], item[2]))[1]

    # Try every detected marker as a phase anchor. Correct full-song phase has
    # more support than the alternating half-bar phase in a double-time region.
    phase_options: list[tuple[int, float, list[tuple[int, float]]]] = []
    for anchor in detected:
        matches: dict[int, tuple[float, float]] = {}
        for time in detected:
            index = round((time - anchor) / seed)
            residual = abs(time - (anchor + index * seed))
            if residual <= tolerance * seed:
                previous = matches.get(index)
                if previous is None or residual < previous[0]:
                    matches[index] = (residual, time)
        observations = [(index, value[1]) for index, value in matches.items()]
        phase_options.append((len(observations), -sum(value[0] for value in matches.values()), observations))
    _, _, observations = max(phase_options, key=lambda item: (item[0], item[1]))
    indices = [item[0] for item in observations]
    fitted_times = [item[1] for item in observations]

    mean_index = statistics.fmean(indices)
    mean_time = statistics.fmean(fitted_times)
    denominator = sum((index - mean_index) ** 2 for index in indices)
    bar_duration = (
        sum((index - mean_index) * (time - mean_time) for index, time in zip(indices, fitted_times))
        / denominator
    )
    phase = mean_time - bar_duration * mean_index
    # The winning anchor may be in the middle of the song, so its fitted index
    # zero can have a positive phase. Extend the grid backward to time zero.
    first_index = math.ceil(-phase / bar_duration)
    normalized = []
    index = first_index
    while phase + index * bar_duration <= duration:
        normalized.append(phase + index * bar_duration)
        index += 1
    return SongTiming(
        bpm=240.0 / bar_duration,
        bar_duration=bar_duration,
        downbeats=tuple(normalized),
        detected_downbeats=tuple(detected),
    )


def analyze_chords(audio: Path) -> list[dict[str, Any]]:
    try:
        from lv_chordia.chord_recognition import chord_recognition
    except ImportError as exc:
        raise SystemExit(
            "lv-chordia is not installed. See scripts/recordings/README.md"
        ) from exc
    return chord_recognition(audio_path=str(audio), chord_dict_name="ismir2017")


def chord_family(label: str) -> str | None:
    if not label or label in {"N", "X", "NC", "None"}:
        return None
    _, separator, quality = label.partition(":")
    quality = (quality if separator else "maj").lower()
    if "dim" in quality:
        return "dim"
    if quality.startswith("min") or quality in {"m", "m6", "m7", "m9", "minor"}:
        return "min"
    if quality.startswith(("maj", "7", "sus", "aug")) or quality == "":
        return "maj"
    return None


def simplified_label(label: str) -> tuple[str, str | None]:
    family = chord_family(label)
    if family is None:
        return ("N" if label in {"N", "X", "NC", "None", ""} else label, None)
    root = label.partition(":")[0]
    return f"{root}:{family}", family


def analyze_bar(index: int, start: float, end: float, chords: Iterable[dict[str, Any]]) -> BarAnalysis:
    weights: Counter[str] = Counter()
    events: list[tuple[float, float, str]] = []
    for segment in chords:
        overlap_start = max(start, float(segment["start_time"]))
        overlap_end = min(end, float(segment["end_time"]))
        if overlap_end > overlap_start:
            label, _ = simplified_label(str(segment["chord"]))
            weights[label] += overlap_end - overlap_start
            events.append((overlap_start, overlap_end, label))

    duration = max(end - start, 1e-9)
    if not weights:
        return BarAnalysis(index, start, end, "N", None, 0.0, (), ())
    ordered = weights.most_common()
    winner = ordered[0][0]
    family = chord_family(winner)
    votes = tuple(ChordVote(label, chord_family(label), seconds) for label, seconds in ordered)
    selected = [winner]
    dominance = ordered[0][1] / duration
    if dominance < TWO_CHORD_PRIMARY_MAX and len(ordered) > 1:
        runner_up, runner_up_seconds = ordered[1]
        if runner_up_seconds / duration >= TWO_CHORD_SECONDARY_MIN:
            selected.append(runner_up)

    # Preserve musical order even when the second chord occupies more time.
    selected.sort(key=lambda label: min(a for a, _, event_label in events if event_label == label))
    chord_sequence = tuple(
        ChordSlice(
            label=label,
            family=chord_family(label),
            start=min(a for a, _, event_label in events if event_label == label),
            end=max(b for _, b, event_label in events if event_label == label),
            occupancy=weights[label] / duration,
        )
        for label in selected
    )
    return BarAnalysis(index, start, end, winner, family, dominance, votes, chord_sequence)


def build_bars(downbeats: list[float], chords: list[dict[str, Any]]) -> list[BarAnalysis]:
    return [
        analyze_bar(index + 1, start, end, chords)
        for index, (start, end) in enumerate(zip(downbeats, downbeats[1:]))
        if end > start
    ]


def build_candidates(bars: list[BarAnalysis]) -> list[Candidate]:
    candidates: list[Candidate] = []
    for offset in range(0, max(0, len(bars) - 3)):
        window = tuple(bars[offset : offset + 4])
        reasons: list[str] = []
        if any(
            not bar.chord_sequence
            or any(chord.family not in SUPPORTED_FAMILIES for chord in bar.chord_sequence)
            for bar in window
        ):
            reasons.append("contains no-chord or unsupported harmony")
        explained = [sum(chord.occupancy for chord in bar.chord_sequence) for bar in window]
        if any(coverage < 0.80 for coverage in explained):
            reasons.append("one or more measures have an ambiguous chord")
        lengths = [bar.end - bar.start for bar in window]
        if min(lengths) <= 0 or max(lengths) / min(lengths) > 1.35:
            reasons.append("measure lengths vary unusually")
        score = statistics.fmean(explained)
        local_bpm = 240.0 / statistics.fmean(lengths)
        candidates.append(
            Candidate(
                index=offset + 1,
                start=window[0].start,
                end=window[-1].end,
                score=score,
                local_bpm=local_bpm,
                bars=window,
                eligible=not reasons,
                reasons=tuple(reasons),
            )
        )
    return candidates


def select_candidates(candidates: list[Candidate], limit: int) -> list[Candidate]:
    """Prefer high-confidence eligible windows without overlapping each other."""
    selected: list[Candidate] = []
    for candidate in sorted(candidates, key=lambda c: (c.eligible, c.score), reverse=True):
        if any(candidate.start < other.end and other.start < candidate.end for other in selected):
            continue
        selected.append(candidate)
        if len(selected) >= limit:
            break
    return sorted(selected, key=lambda c: c.start)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / float(wav.getframerate())


def waveform_points(path: Path, width: int = 1200) -> list[float]:
    """Return normalized peak amplitudes for a compact SVG overview."""
    with wave.open(str(path), "rb") as wav:
        frames = wav.getnframes()
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        if sample_width != 2:
            return [0.0] * width
        block = max(1, frames // width)
        points: list[float] = []
        for _ in range(width):
            raw = wav.readframes(block)
            if not raw:
                points.append(0.0)
                continue
            peak = 0
            step = sample_width * channels
            for position in range(0, len(raw) - 1, step):
                value = int.from_bytes(raw[position : position + 2], "little", signed=True)
                peak = max(peak, abs(value))
            points.append(peak / 32768.0)
        return points


def format_time(seconds: float) -> str:
    minutes, secs = divmod(seconds, 60)
    return f"{int(minutes)}:{secs:05.2f}"


def report_html(
    title: str,
    artist: str,
    audio_name: str,
    duration: float,
    bpm: float | None,
    downbeats: list[float],
    candidates: list[Candidate],
    waveform: list[float],
    source_hash: str,
    timing_model: str,
) -> str:
    width, height, mid = 1200, 180, 90
    polygon: list[str] = ["0,90"]
    for index, amplitude in enumerate(waveform):
        x = index * width / max(1, len(waveform) - 1)
        polygon.append(f"{x:.1f},{mid - amplitude * 75:.1f}")
    for index, amplitude in reversed(list(enumerate(waveform))):
        x = index * width / max(1, len(waveform) - 1)
        polygon.append(f"{x:.1f},{mid + amplitude * 75:.1f}")
    downbeat_lines = "".join(
        f'<line x1="{time / duration * width:.2f}" x2="{time / duration * width:.2f}" y1="0" y2="{height}" />'
        for time in downbeats
        if 0 <= time <= duration
    )

    def render_measure(bar: BarAnalysis) -> str:
        chord_markup = '<span class="arrow">→</span>'.join(
            f'<span class="chord-piece">{html.escape(chord.label)}'
            f'<small>{chord.occupancy:.0%}</small></span>'
            for chord in bar.chord_sequence
        )
        description = (
            f"{len(bar.chord_sequence)} detected chords · "
            f"{sum(chord.occupancy for chord in bar.chord_sequence):.0%} explained occupancy"
            if len(bar.chord_sequence) > 1
            else f"{bar.dominance:.0%} occupancy"
        )
        return f"""
            <div class="measure">
              <div class="measure-number">Measure {bar.index} · {bar.end - bar.start:.2f}s</div>
              <div class="chord">{chord_markup}</div>
              <div class="confidence">{description}</div>
            </div>
        """

    cards: list[str] = []
    for candidate in candidates:
        measures = "".join(render_measure(bar) for bar in candidate.bars)
        status = "candidate" if candidate.eligible else "needs review"
        reasons = "" if not candidate.reasons else f'<p class="warning">{html.escape("; ".join(candidate.reasons))}</p>'
        cards.append(
            f"""
            <article class="card {'eligible' if candidate.eligible else 'flagged'}">
              <header>
                <div><strong>{format_time(candidate.start)}–{format_time(candidate.end)}</strong>
                <span class="pill">{status}</span></div>
                <button data-start="{candidate.start:.6f}" data-end="{candidate.end:.6f}">Play 4 measures</button>
              </header>
              <div class="measures">{measures}</div>
              <p class="score">Mean explained occupancy: {candidate.score:.0%} · fixed song tempo: {candidate.local_bpm:.1f} BPM</p>
              {reasons}
            </article>
            """
        )

    bpm_text = "unknown" if bpm is None else f"{bpm:.1f}"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Recording review — {html.escape(title)}</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
    body {{ margin: 0; background: #0b0d12; color: #eceff4; }}
    main {{ width: min(1180px, calc(100% - 40px)); margin: 42px auto 80px; }}
    h1 {{ font-size: clamp(30px, 5vw, 58px); margin: 0; letter-spacing: -0.04em; }}
    .artist {{ color: #aeb6c7; font-size: 20px; margin: 8px 0 24px; }}
    .notice {{ border-left: 3px solid #d9a441; padding: 12px 16px; background: #17140d; color: #e4cf9c; }}
    audio {{ width: 100%; margin: 24px 0; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 30px; }}
    .stats span, .pill {{ background: #1d2230; border: 1px solid #303747; border-radius: 999px; padding: 6px 10px; color: #c7cede; }}
    .overview {{ overflow-x: auto; padding: 14px; background: #11151d; border: 1px solid #252b38; border-radius: 12px; }}
    svg {{ display: block; width: 100%; min-width: 760px; }}
    polygon {{ fill: #5f7adb; opacity: .62; }}
    line {{ stroke: #f2c14e; stroke-width: 1; opacity: .45; }}
    h2 {{ margin-top: 42px; }}
    .cards {{ display: grid; gap: 16px; }}
    .card {{ background: #121722; border: 1px solid #2b3342; border-radius: 14px; padding: 18px; }}
    .card.eligible {{ border-color: #365f4a; }}
    .card header {{ display: flex; justify-content: space-between; gap: 18px; align-items: center; }}
    button {{ cursor: pointer; border: 0; border-radius: 9px; padding: 10px 14px; background: #6e89ef; color: #081020; font-weight: 700; }}
    button.active {{ background: #f2c14e; }}
    .pill {{ margin-left: 8px; font-size: 12px; }}
    .measures {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }}
    .measure {{ padding: 12px; border-radius: 9px; background: #1a202c; }}
    .measure-number, .confidence, .score {{ color: #98a3b8; font-size: 13px; }}
    .chord {{ display: flex; align-items: center; gap: 7px; font-size: 22px; font-weight: 750; margin: 6px 0; }}
    .chord-piece {{ display: grid; }}
    .chord-piece small {{ color: #8f9bb0; font-size: 10px; font-weight: 600; }}
    .arrow {{ color: #f2c14e; font-size: 15px; }}
    .warning {{ color: #f0b7a4; margin-bottom: 0; }}
    footer {{ margin-top: 40px; color: #7f899d; font: 12px ui-monospace, monospace; overflow-wrap: anywhere; }}
    @media (max-width: 700px) {{ .measures {{ grid-template-columns: repeat(2, 1fr); }} .card header {{ align-items: flex-start; flex-direction: column; }} }}
  </style>
</head>
<body>
<main>
  <h1>{html.escape(title)}</h1>
  <p class="artist">{html.escape(artist)}</p>
  <p class="notice">Model output is a proposal, not an answer key. Confirm the downbeats, tonic/mode, and every chord by ear before exporting an exercise.</p>
  <audio id="player" controls preload="metadata" src="{html.escape(audio_name)}"></audio>
  <div class="stats"><span>{format_time(duration)}</span><span>{bpm_text} BPM · fixed song tempo</span><span>{len(downbeats)} normalized downbeats</span><span>{len(candidates)} displayed windows</span></div>
  <div class="overview"><svg viewBox="0 0 {width} {height}" role="img" aria-label="Waveform with detected downbeats"><polygon points="{' '.join(polygon)}"/><g>{downbeat_lines}</g></svg></div>
  <h2>Proposed four-measure windows</h2>
  <div class="cards">{''.join(cards) if cards else '<p>No complete four-measure windows were detected.</p>'}</div>
  <footer>Timing: {html.escape(timing_model)} · Chords: lv-chordia/ismir2017 · Source SHA-256: {source_hash}</footer>
</main>
<script>
  const player = document.querySelector('#player');
  let stopAt = null;
  let active = null;
  const playerReady = (async () => {{
    // A minimal static server may not implement HTTP byte ranges. Buffer the
    // small report preview into a Blob so candidate seeking still works.
    if (location.protocol === 'http:' || location.protocol === 'https:') {{
      const response = await fetch(player.getAttribute('src'));
      if (response.ok) {{
        player.src = URL.createObjectURL(await response.blob());
        player.load();
      }}
    }}
    if (player.readyState === 0) {{
      await new Promise(resolve => player.addEventListener('loadedmetadata', resolve, {{ once: true }}));
    }}
  }})().catch(error => console.warn('Could not buffer report audio preview', error));
  document.querySelectorAll('button[data-start]').forEach(button => {{
    button.addEventListener('click', async () => {{
      if (active) active.classList.remove('active');
      active = button; active.classList.add('active');
      await playerReady;
      player.pause();
      const start = Number(button.dataset.start);
      stopAt = Number(button.dataset.end);
      await new Promise(resolve => {{
        let settled = false;
        const done = () => {{ if (!settled) {{ settled = true; resolve(); }} }};
        player.addEventListener('seeked', done, {{ once: true }});
        player.currentTime = start;
        setTimeout(done, 750);
      }});
      await player.play();
    }});
  }});
  player.addEventListener('timeupdate', () => {{
    if (stopAt !== null && player.currentTime >= stopAt) {{
      player.pause(); stopAt = null;
      if (active) active.classList.remove('active');
    }}
  }});
</script>
</body>
</html>"""


def median_bpm(beats: list[float]) -> float | None:
    intervals = [b - a for a, b in zip(beats, beats[1:]) if 0.2 <= b - a <= 2.0]
    return None if not intervals else 60.0 / statistics.median(intervals)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--artist", default="Jay Chou")
    parser.add_argument("--title")
    parser.add_argument("--work-root", type=Path, default=DEFAULT_WORK_ROOT)
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps", "cuda"))
    parser.add_argument("--timing-checkpoint", default="final0")
    parser.add_argument("--candidate-limit", type=int, default=16)
    parser.add_argument("--reuse-analysis", action="store_true")
    args = parser.parse_args()

    source = args.audio.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Audio file not found: {source}")
    title = args.title or source.stem
    work_dir = args.work_root.resolve() / slug(f"{args.artist}-{title}")
    work_dir.mkdir(parents=True, exist_ok=True)
    normalized = work_dir / "audio.wav"
    preview = work_dir / "audio-preview.mp3"
    timing_path = work_dir / "timing.json"
    chords_path = work_dir / "chords.json"

    if not normalized.exists():
        print("Normalizing audio...", flush=True)
        normalize_audio(source, normalized)
    if not preview.exists():
        print("Creating report preview...", flush=True)
        make_preview_audio(normalized, preview)

    if args.reuse_analysis and timing_path.exists():
        timing = json.loads(timing_path.read_text(encoding="utf-8"))
        beats, downbeats = timing["beats"], timing["downbeats"]
    else:
        print("Detecting beats and downbeats...", flush=True)
        beats, downbeats = analyze_timing(normalized, args.device, args.timing_checkpoint)
        timing_path.write_text(
            json.dumps({"beats": beats, "downbeats": downbeats}, indent=2) + "\n",
            encoding="utf-8",
        )

    if args.reuse_analysis and chords_path.exists():
        chords = json.loads(chords_path.read_text(encoding="utf-8"))
    else:
        print("Recognizing chords...", flush=True)
        chords = analyze_chords(normalized)
        chords_path.write_text(json.dumps(chords, indent=2) + "\n", encoding="utf-8")

    duration = wav_duration(normalized)
    song_timing = normalize_song_timing(downbeats, duration)
    normalized_downbeats = list(song_timing.downbeats)
    bars = build_bars(normalized_downbeats, chords)
    all_candidates = build_candidates(bars)
    candidates = select_candidates(all_candidates, max(1, args.candidate_limit))
    source_hash = sha256_file(source)
    analysis = {
        "source": {"path": str(source), "sha256": source_hash, "artist": args.artist, "title": title},
        "audio": {
            "normalized": normalized.name,
            "preview": preview.name,
            "durationSec": duration,
        },
        "timing": {
            "model": f"beat-this/{args.timing_checkpoint}",
            "beats": beats,
            "rawDownbeats": downbeats,
            "downbeats": normalized_downbeats,
            "rawMedianBpm": median_bpm(beats),
            "medianBpm": song_timing.bpm,
            "fixedBpm": song_timing.bpm,
            "barDurationSec": song_timing.bar_duration,
            "meter": "4/4",
        },
        "chordModel": "lv-chordia/ismir2017",
        "bars": [asdict(bar) for bar in bars],
        "candidates": [asdict(candidate) for candidate in candidates],
    }
    (work_dir / "analysis.json").write_text(
        json.dumps(analysis, indent=2) + "\n", encoding="utf-8"
    )
    (work_dir / "review.html").write_text(
        report_html(
            title,
            args.artist,
            preview.name,
            duration,
            song_timing.bpm,
            normalized_downbeats,
            candidates,
            waveform_points(normalized),
            source_hash,
            f"beat-this/{args.timing_checkpoint}",
        ),
        encoding="utf-8",
    )
    print(f"Review report: {work_dir / 'review.html'}")
    print(f"Analysis JSON: {work_dir / 'analysis.json'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Command failed with exit code {exc.returncode}") from exc
