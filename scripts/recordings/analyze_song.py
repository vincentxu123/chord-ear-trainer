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
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, Iterable

from chord_models import ChordModelUnavailable, analyze_chords, available_models


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WORK_ROOT = REPO_ROOT / ".recordings"
SUPPORTED_FAMILIES = {"maj", "min", "dim"}
BEATS_PER_BAR = 4
MAX_CHORDS_PER_BAR = BEATS_PER_BAR
# Allow for imperfect chord-change timestamps while rejecting very brief
# fragments which usually belong to the neighboring measure. Half a beat is
# a useful lower bound for a chord worth showing in a four-beat measure.
MIN_CHORD_OCCUPANCY = 1 / (BEATS_PER_BAR * 2)

KEY_NAMES = ("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
MAJOR_KEY_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
MINOR_KEY_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)

# Chord-quality profiles used for structural key segmentation. Secondary
# dominants get partial credit in major keys so common progressions such as
# I-vi-II-V are not mislabeled as the relative minor merely because of V/vi.
HARMONIC_KEY_PROFILES = {
    "major": {
        (0, "maj"): 1.0,
        (2, "min"): 0.8,
        (2, "maj"): 0.35,
        (4, "min"): 0.7,
        (4, "maj"): 0.45,
        (5, "maj"): 0.9,
        (7, "maj"): 1.0,
        (9, "min"): 0.8,
        (9, "maj"): 0.35,
        (11, "dim"): 0.7,
    },
    "minor": {
        (0, "min"): 1.0,
        (2, "dim"): 0.7,
        (3, "maj"): 0.9,
        (5, "min"): 0.8,
        (7, "maj"): 1.0,
        (7, "min"): 0.5,
        (8, "maj"): 0.9,
        (10, "maj"): 0.7,
    },
}
MIN_TONALITY_SEGMENT_BARS = 12
MIN_TONALITY_GAIN_PER_BAR = 0.12
TONALITY_BOUNDARY_LOOKAHEAD = 4


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
class ModelBarPrediction:
    model: str
    chord: str
    family: str | None
    dominance: float
    chord_sequence: tuple[ChordSlice, ...]


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
    model_predictions: tuple[ModelBarPrediction, ...] = ()
    root_agreement: float = 1.0
    family_agreement: float = 1.0
    sequence_agreement: float = 1.0


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
    playback_start: float


@dataclass(frozen=True)
class SongTiming:
    bpm: float
    bar_duration: float
    downbeats: tuple[float, ...]
    detected_downbeats: tuple[float, ...]


def _correlation(left: Iterable[float], right: Iterable[float]) -> float:
    left_values = list(left)
    right_values = list(right)
    left_mean = statistics.fmean(left_values)
    right_mean = statistics.fmean(right_values)
    numerator = sum(
        (left_value - left_mean) * (right_value - right_mean)
        for left_value, right_value in zip(left_values, right_values)
    )
    left_scale = math.sqrt(sum((value - left_mean) ** 2 for value in left_values))
    right_scale = math.sqrt(sum((value - right_mean) ** 2 for value in right_values))
    return numerator / max(left_scale * right_scale, 1e-12)


def estimate_key_from_chroma(chroma: Iterable[float]) -> dict[str, Any]:
    """Estimate tonic and mode with rotated Krumhansl-Schmuckler profiles."""
    chroma_values = tuple(float(value) for value in chroma)
    if len(chroma_values) != 12:
        raise ValueError("Key estimation needs exactly 12 chroma bins")

    scores: list[tuple[float, int, str]] = []
    for tonic in range(12):
        for mode, profile in (
            ("major", MAJOR_KEY_PROFILE),
            ("minor", MINOR_KEY_PROFILE),
        ):
            rotated = [0.0] * 12
            for pitch_class, value in enumerate(profile):
                rotated[(pitch_class + tonic) % 12] = value
            scores.append((_correlation(chroma_values, rotated), tonic, mode))

    scores.sort(reverse=True)
    best_score, tonic, mode = scores[0]
    runner_up = scores[1][0]
    return {
        "key": KEY_NAMES[tonic],
        "mode": mode,
        "method": "chroma-cqt-krumhansl-schmuckler",
        "score": best_score,
        "margin": best_score - runner_up,
    }


def estimate_tonality(audio: Path) -> dict[str, Any]:
    try:
        import librosa
    except ImportError as exc:
        raise SystemExit(
            "librosa is required for automatic key estimation. Reinstall the "
            "recording-analysis requirements."
        ) from exc

    samples, sample_rate = librosa.load(str(audio), sr=11025, mono=True)
    chroma = librosa.feature.chroma_cqt(y=samples, sr=sample_rate)
    return estimate_key_from_chroma(chroma.mean(axis=1))


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


def analyze_timing_madmom(audio: Path) -> tuple[list[float], list[float]]:
    """Run madmom RNN+DBN downbeat tracking, constrained to 4/4."""
    import collections
    import collections.abc

    import numpy as np

    # madmom 0.16 predates Python 3.11 and NumPy 2. These aliases and the
    # object-array fallback preserve its published inference behavior without
    # modifying the installed dependency. They must exist before madmom imports.
    collections.MutableSequence = collections.abc.MutableSequence
    if not hasattr(np, "float"):
        np.float = float
    if not hasattr(np, "int"):
        np.int = int

    try:
        from madmom.features.downbeats import (
            DBNDownBeatTrackingProcessor,
            RNNDownBeatProcessor,
        )
    except ImportError as exc:
        raise SystemExit(
            "madmom timing is not installed. See scripts/recordings/README.md"
        ) from exc

    activations = RNNDownBeatProcessor()(str(audio))
    original_asarray = np.asarray

    def compatible_asarray(value: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return original_asarray(value, *args, **kwargs)
        except ValueError:
            if not (
                isinstance(value, list)
                and value
                and all(isinstance(item, tuple) and len(item) == 2 for item in value)
            ):
                raise
            result = np.empty((len(value), 2), dtype=object)
            for index, (path, score) in enumerate(value):
                result[index] = [path, score]
            return result

    np.asarray = compatible_asarray
    try:
        events = DBNDownBeatTrackingProcessor(
            beats_per_bar=[4], fps=100
        )(activations)
    finally:
        np.asarray = original_asarray

    beats = sorted(float(value) for value in events[:, 0])
    downbeats = sorted(float(value) for value in events[events[:, 1] == 1, 0])
    return beats, downbeats


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


def timing_grid_agreement(
    reference: SongTiming, other: SongTiming, tolerance_ratio: float = 0.12
) -> float:
    """Fraction of reference bars supported by the other timing grid."""
    tolerance = tolerance_ratio * reference.bar_duration
    matches = [
        time
        for time in reference.downbeats
        if other.downbeats and min(abs(time - value) for value in other.downbeats) <= tolerance
    ]
    return len(matches) / max(1, len(reference.downbeats))


def select_song_timing(
    model_downbeats: dict[str, list[float]], duration: float
) -> tuple[SongTiming, str, str, dict[str, SongTiming]]:
    """Select full-bar timing and fuse models only at the same metric level."""
    normalized = {
        model: normalize_song_timing(downbeats, duration)
        for model, downbeats in model_downbeats.items()
    }
    selected_model = next(iter(normalized))
    selected = normalized[selected_model]
    reason = f"{selected_model} is the primary timing model"

    for model, candidate in list(normalized.items())[1:]:
        ratio = candidate.bar_duration / selected.bar_duration
        support = timing_grid_agreement(candidate, selected)
        if 1.8 <= ratio <= 2.2 and support >= 0.65:
            selected_model = model
            selected = candidate
            reason = (
                f"selected {model} full bars; the previous grid was half-bar "
                f"timing ({support:.0%} boundary support)"
            )
            continue

        if 0.95 <= ratio <= 1.05 and support >= 0.65:
            averaged = []
            tolerance = 0.12 * selected.bar_duration
            for time in selected.downbeats:
                nearest = min(candidate.downbeats, key=lambda value: abs(value - time))
                if abs(nearest - time) <= tolerance:
                    averaged.append((time + nearest) / 2.0)
            if len(averaged) >= 3:
                previous_model = selected_model
                selected = normalize_song_timing(averaged, duration)
                selected_model = f"{previous_model}+{model}"
                reason = (
                    f"averaged same-level grids from {previous_model} and {model} "
                    f"({support:.0%} boundary support)"
                )

    return selected, selected_model, reason, normalized


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


NOTE_TO_PITCH_CLASS = {
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


def chord_root(label: str) -> int | None:
    if chord_family(label) is None:
        return None
    root = (
        label.partition(":")[0]
        .partition("/")[0]
        .upper()
        .replace("♯", "#")
        .replace("♭", "B")
    )
    return NOTE_TO_PITCH_CLASS.get(root)


def supported_chord_coverage(bar: BarAnalysis) -> float:
    return sum(
        chord.occupancy
        for chord in bar.chord_sequence
        if chord.family in SUPPORTED_FAMILIES
    )


def infer_phrase_start_measure(bars: list[BarAnalysis]) -> dict[str, Any]:
    """Conservatively skip a single sparse pickup/lead-in measure.

    Phrase phase is not identifiable from every recording. We only move the
    grid when measure one is mostly silence/unsupported harmony and the next
    four measures are well covered. This catches a one-measure pickup without
    guessing from ordinary harmonic repetition.
    """
    default = {
        "measure": 1,
        "method": "default-first-measure",
        "confidence": 0.0,
    }
    if len(bars) < 5:
        return default
    first_coverage = supported_chord_coverage(bars[0])
    following = [supported_chord_coverage(bar) for bar in bars[1:5]]
    if first_coverage <= 0.5 and min(following) >= 0.8:
        return {
            "measure": 2,
            "method": "sparse-leading-measure",
            "confidence": min(1.0, statistics.fmean(following) - first_coverage),
        }
    return default


def _tonality_score(
    bars: list[BarAnalysis], start: int, end: int, tonic: int, mode: str
) -> tuple[float, float]:
    score = 0.0
    weight = 0.0
    profile = HARMONIC_KEY_PROFILES[mode]
    for bar in bars[start:end]:
        for chord in bar.chord_sequence:
            root = chord_root(chord.label)
            if root is None or chord.family not in SUPPORTED_FAMILIES:
                continue
            score += chord.occupancy * profile.get(
                ((root - tonic) % 12, chord.family), -0.7
            )
            weight += chord.occupancy
    return score, weight


def _best_harmonic_tonality(
    bars: list[BarAnalysis], start: int, end: int
) -> dict[str, Any]:
    scored: list[tuple[float, float, int, str]] = []
    for tonic in range(12):
        for mode in HARMONIC_KEY_PROFILES:
            score, weight = _tonality_score(bars, start, end, tonic, mode)
            scored.append((score, weight, tonic, mode))
    scored.sort(reverse=True)
    score, weight, tonic, mode = scored[0]
    runner_up = scored[1][0]
    return {
        "key": KEY_NAMES[tonic],
        "mode": mode,
        "score": score / max(weight, 1e-9),
        "margin": (score - runner_up) / max(weight, 1e-9),
        "rawScore": score,
    }


def _find_tonality_segments(
    bars: list[BarAnalysis], start: int, end: int
) -> list[tuple[int, int]]:
    base = _best_harmonic_tonality(bars, start, end)
    choices: list[tuple[float, int, dict[str, Any], dict[str, Any]]] = []
    for split in range(
        start + MIN_TONALITY_SEGMENT_BARS,
        end - MIN_TONALITY_SEGMENT_BARS + 1,
    ):
        left = _best_harmonic_tonality(bars, start, split)
        right = _best_harmonic_tonality(bars, split, end)
        choices.append(
            (
                left["rawScore"] + right["rawScore"] - base["rawScore"],
                split,
                left,
                right,
            )
        )
    if not choices:
        return [(start, end)]
    gain, split, left, right = max(choices, key=lambda item: item[0])
    same_tonality = (left["key"], left["mode"]) == (right["key"], right["mode"])
    if same_tonality or gain / max(1, end - start) < MIN_TONALITY_GAIN_PER_BAR:
        return [(start, end)]
    return _find_tonality_segments(bars, start, split) + _find_tonality_segments(
        bars, split, end
    )


def _refine_tonality_boundary(
    bars: list[BarAnalysis],
    rough: int,
    previous: dict[str, Any],
    following: dict[str, Any],
) -> int:
    previous_tonic = KEY_NAMES.index(previous["key"])
    following_tonic = KEY_NAMES.index(following["key"])
    start = max(1, rough - MIN_TONALITY_SEGMENT_BARS)
    end = min(
        len(bars) - TONALITY_BOUNDARY_LOOKAHEAD + 1,
        rough + MIN_TONALITY_SEGMENT_BARS,
    )
    for boundary in range(start, end + 1):
        window_end = boundary + TONALITY_BOUNDARY_LOOKAHEAD
        new_score, new_weight = _tonality_score(
            bars, boundary, window_end, following_tonic, following["mode"]
        )
        old_score, old_weight = _tonality_score(
            bars, boundary, window_end, previous_tonic, previous["mode"]
        )
        new_fit = new_score / max(new_weight, 1e-9)
        old_fit = old_score / max(old_weight, 1e-9)
        boundary_new_score, boundary_new_weight = _tonality_score(
            bars, boundary, boundary + 1, following_tonic, following["mode"]
        )
        boundary_old_score, boundary_old_weight = _tonality_score(
            bars, boundary, boundary + 1, previous_tonic, previous["mode"]
        )
        boundary_new_fit = boundary_new_score / max(boundary_new_weight, 1e-9)
        boundary_old_fit = boundary_old_score / max(boundary_old_weight, 1e-9)
        if (
            new_fit >= 0.75
            and new_fit - old_fit >= 0.45
            and boundary_new_fit - boundary_old_fit >= 0.2
        ):
            return boundary
    return rough


def infer_tonalities(bars: list[BarAnalysis]) -> list[dict[str, Any]]:
    """Infer sustained key regions from duration-weighted chord sequences."""
    if not bars:
        return []
    segments = _find_tonality_segments(bars, 0, len(bars))
    tonalities = [_best_harmonic_tonality(bars, start, end) for start, end in segments]
    boundaries = [0]
    for index, (_, rough_end) in enumerate(segments[:-1]):
        boundaries.append(
            _refine_tonality_boundary(
                bars, rough_end, tonalities[index], tonalities[index + 1]
            )
        )
    boundaries.append(len(bars))

    result: list[dict[str, Any]] = []
    for index, (start, end) in enumerate(zip(boundaries, boundaries[1:])):
        tonality = _best_harmonic_tonality(bars, start, end)
        result.append(
            {
                "startMeasure": bars[start].index,
                "key": tonality["key"],
                "mode": tonality["mode"],
                "score": tonality["score"],
                "margin": tonality["margin"],
            }
        )
    return result


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
    dominance = ordered[0][1] / duration
    selected = [
        label
        for label, seconds in ordered
        if seconds / duration >= MIN_CHORD_OCCUPANCY
    ][:MAX_CHORDS_PER_BAR]

    # The candidates above are ranked by duration; restore musical order for
    # display so a bar reads from its first chord to its last chord.
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


def _agreement(values: list[Any]) -> float:
    return 0.0 if not values else Counter(values).most_common(1)[0][1] / len(values)


def _sequence_signature(prediction: ModelBarPrediction) -> tuple[tuple[int | None, str | None], ...]:
    return tuple(
        (chord_root(piece.label), piece.family) for piece in prediction.chord_sequence
    )


def build_ensemble_bars(
    downbeats: list[float],
    model_chords: dict[str, list[dict[str, Any]]],
    primary_model: str,
) -> list[BarAnalysis]:
    """Align detector outputs to bars and attach transparent agreement data.

    The primary model wins ties, preserving the historical single-model
    behavior when two detectors disagree. Agreement is evaluated separately
    for enharmonic root pitch class and simplified chord family.
    """
    per_model = {
        model: build_bars(downbeats, chords)
        for model, chords in model_chords.items()
    }
    primary_bars = per_model[primary_model]
    combined: list[BarAnalysis] = []
    for bar_index, primary in enumerate(primary_bars):
        predictions = tuple(
            ModelBarPrediction(
                model=model,
                chord=bars[bar_index].chord,
                family=bars[bar_index].family,
                dominance=bars[bar_index].dominance,
                chord_sequence=bars[bar_index].chord_sequence,
            )
            for model, bars in per_model.items()
            if bar_index < len(bars)
        )
        label_counts = Counter(prediction.chord for prediction in predictions)
        most_votes = max(label_counts.values(), default=0)
        consensus_labels = {
            label for label, count in label_counts.items() if count == most_votes
        }
        consensus = (
            primary.chord
            if primary.chord in consensus_labels
            else next(iter(consensus_labels), primary.chord)
        )
        combined.append(
            replace(
                primary,
                chord=consensus,
                family=chord_family(consensus),
                model_predictions=predictions,
                root_agreement=_agreement(
                    [chord_root(item.chord) for item in predictions]
                ),
                family_agreement=_agreement([item.family for item in predictions]),
                sequence_agreement=_agreement(
                    [_sequence_signature(item) for item in predictions]
                ),
            )
        )
    return combined


def build_candidates(
    bars: list[BarAnalysis], phrase_start_measure: int = 1
) -> list[Candidate]:
    """Build non-overlapping four-bar blocks on the song's phrase grid.

    Once measure one has been established, sliding windows such as 8-11 are
    awkward exercise excerpts even when their model confidence is high. Keep
    every proposal on one configured four-measure grid instead.
    """
    candidates: list[Candidate] = []
    first_offset = next(
        (offset for offset, bar in enumerate(bars) if bar.index == phrase_start_measure),
        len(bars),
    )
    for offset in range(first_offset, max(first_offset, len(bars) - 3), 4):
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
        if any(bar.sequence_agreement < 1.0 for bar in window):
            reasons.append("chord models disagree on an ordered chord sequence")
        lengths = [bar.end - bar.start for bar in window]
        if min(lengths) <= 0 or max(lengths) / min(lengths) > 1.35:
            reasons.append("measure lengths vary unusually")
        score = statistics.fmean(explained)
        local_bpm = 240.0 / statistics.fmean(lengths)
        candidates.append(
            Candidate(
                index=window[0].index,
                start=window[0].start,
                end=window[-1].end,
                score=score,
                local_bpm=local_bpm,
                bars=window,
                eligible=not reasons,
                reasons=tuple(reasons),
                playback_start=window[0].start,
            )
        )
    return candidates


def select_candidates(candidates: list[Candidate], limit: int) -> list[Candidate]:
    """Prefer confident phrase-aligned blocks and return them chronologically."""
    ranked = sorted(
        candidates,
        key=lambda candidate: (candidate.eligible, candidate.score),
        reverse=True,
    )
    return sorted(ranked[:limit], key=lambda candidate: candidate.start)


def detect_onsets(audio: Path) -> list[float]:
    """Return transient times used only to refine report playback cues."""
    try:
        import librosa
    except ImportError:
        return []

    samples, sample_rate = librosa.load(str(audio), sr=None, mono=True)
    hop_length = 256
    envelope = librosa.onset.onset_strength(
        y=samples, sr=sample_rate, hop_length=hop_length
    )
    frames = librosa.onset.onset_detect(
        onset_envelope=envelope,
        sr=sample_rate,
        hop_length=hop_length,
        backtrack=False,
    )
    return [
        float(value)
        for value in librosa.frames_to_time(
            frames, sr=sample_rate, hop_length=hop_length
        )
    ]


def snap_playback_starts(
    candidates: list[Candidate],
    onsets: list[float],
    max_delay: float = 0.12,
) -> list[Candidate]:
    """Move playback forward to a nearby onset, never before the boundary."""
    snapped: list[Candidate] = []
    for candidate in candidates:
        nearby = [
            onset
            for onset in onsets
            if candidate.start <= onset <= candidate.start + max_delay
        ]
        playback_start = min(nearby, default=candidate.start)
        snapped.append(replace(candidate, playback_start=playback_start))
    return snapped


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
    chord_models: list[str],
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
        model_rows = ""
        agreement = ""
        if len(bar.model_predictions) > 1:
            model_rows = (
                '<div class="model-votes">'
                + "".join(
                    f'<div><span>{html.escape(prediction.model)}</span>'
                    f'<strong>{html.escape(" → ".join(piece.label for piece in prediction.chord_sequence) or prediction.chord)}</strong>'
                    f'<small>{prediction.dominance:.0%}</small></div>'
                    for prediction in bar.model_predictions
                )
                + "</div>"
            )
            agreement = (
                f'<div class="agreement">Sequence agreement {bar.sequence_agreement:.0%} · '
                f'root agreement {bar.root_agreement:.0%} · '
                f'quality agreement {bar.family_agreement:.0%}</div>'
            )
        return f"""
            <div class="measure">
              <div class="measure-number">Measure {bar.index} · {bar.end - bar.start:.2f}s</div>
              <div class="chord">{chord_markup}</div>
              <div class="confidence">{description}</div>
              {agreement}
              {model_rows}
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
                <button data-start="{candidate.playback_start:.6f}" data-end="{candidate.end:.6f}">Play 4 measures</button>
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
    .agreement {{ color: #d6bb70; font-size: 11px; margin-top: 8px; }}
    .model-votes {{ display: grid; gap: 4px; border-top: 1px solid #303747; margin-top: 8px; padding-top: 8px; }}
    .model-votes div {{ display: grid; grid-template-columns: 72px 1fr auto; align-items: baseline; gap: 6px; font-size: 11px; }}
    .model-votes span, .model-votes small {{ color: #8f9bb0; }}
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
  <h2>Phrase-aligned four-measure windows</h2>
  <div class="cards">{''.join(cards) if cards else '<p>No complete four-measure windows were detected.</p>'}</div>
  <footer>Timing: {html.escape(timing_model)} · Chords: {html.escape(', '.join(chord_models))} · Source SHA-256: {source_hash}</footer>
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
    parser.add_argument(
        "--timing-models",
        default="beat-this,madmom",
        help="Comma-separated timing detectors (beat-this,madmom)",
    )
    parser.add_argument(
        "--candidate-limit",
        type=int,
        default=0,
        help="Maximum windows to retain; 0 keeps every phrase-aligned window",
    )
    parser.add_argument(
        "--chord-models",
        default="lv-chordia,btc",
        help=f"Comma-separated chord detectors ({', '.join(available_models())})",
    )
    parser.add_argument("--key", choices=KEY_NAMES)
    parser.add_argument("--mode", choices=("major", "minor"))
    parser.add_argument("--reuse-analysis", action="store_true")
    parser.add_argument("--skip-report", action="store_true")
    parser.add_argument("--song-metadata", type=Path)
    args = parser.parse_args()

    if (args.key is None) != (args.mode is None):
        raise SystemExit("Provide both --key and --mode, or omit both for automatic estimation")

    timing_models = list(
        dict.fromkeys(
            part.strip() for part in args.timing_models.split(",") if part.strip()
        )
    )
    if not timing_models or set(timing_models) - {"beat-this", "madmom"}:
        raise SystemExit("Choose timing models from: beat-this, madmom")

    chord_models = list(
        dict.fromkeys(
            part.strip() for part in args.chord_models.split(",") if part.strip()
        )
    )
    unknown_models = set(chord_models) - set(available_models())
    if not chord_models or unknown_models:
        choices = ", ".join(available_models())
        raise SystemExit(f"Choose one or more chord models from: {choices}")

    source = args.audio.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Audio file not found: {source}")
    title = args.title or source.stem
    work_dir = args.work_root.resolve() / slug(f"{args.artist}-{title}")
    work_dir.mkdir(parents=True, exist_ok=True)
    normalized = work_dir / "audio.wav"
    preview = work_dir / "audio-preview.mp3"

    if not normalized.exists():
        print("Normalizing audio...", flush=True)
        normalize_audio(source, normalized)
    if not preview.exists():
        print("Creating report preview...", flush=True)
        make_preview_audio(normalized, preview)

    timing_outputs: dict[str, tuple[list[float], list[float]]] = {}
    for model in timing_models:
        timing_path = work_dir / (
            "timing.json" if model == "beat-this" else f"timing.{model}.json"
        )
        if args.reuse_analysis and timing_path.exists():
            cached = json.loads(timing_path.read_text(encoding="utf-8"))
            timing_outputs[model] = (cached["beats"], cached["downbeats"])
            continue

        print(f"Detecting beats and downbeats with {model}...", flush=True)
        if model == "beat-this":
            result = analyze_timing(normalized, args.device, args.timing_checkpoint)
        else:
            result = analyze_timing_madmom(normalized)
        timing_outputs[model] = result
        timing_path.write_text(
            json.dumps({"beats": result[0], "downbeats": result[1]}, indent=2)
            + "\n",
            encoding="utf-8",
        )

    model_chords: dict[str, list[dict[str, Any]]] = {}
    for model in chord_models:
        chords_path = work_dir / (
            "chords.json" if model == "lv-chordia" else f"chords.{model}.json"
        )
        if args.reuse_analysis and chords_path.exists():
            model_chords[model] = json.loads(chords_path.read_text(encoding="utf-8"))
            continue
        print(f"Recognizing chords with {model}...", flush=True)
        try:
            model_chords[model] = analyze_chords(model, normalized, args.device)
        except ChordModelUnavailable as exc:
            raise SystemExit(str(exc)) from exc
        chords_path.write_text(
            json.dumps(model_chords[model], indent=2) + "\n", encoding="utf-8"
        )

    duration = wav_duration(normalized)
    song_timing, selected_timing_model, timing_reason, model_timings = (
        select_song_timing(
            {model: output[1] for model, output in timing_outputs.items()}, duration
        )
    )
    normalized_downbeats = list(song_timing.downbeats)
    selected_beats = timing_outputs.get(
        selected_timing_model, next(iter(timing_outputs.values()))
    )[0]
    song_metadata = None
    if args.song_metadata:
        song_metadata = json.loads(
            args.song_metadata.expanduser().resolve().read_text(encoding="utf-8")
        )
        if song_metadata.get("artist") != args.artist or song_metadata.get("title") != title:
            raise SystemExit("Song metadata artist/title does not match the requested song")
    bars = build_ensemble_bars(normalized_downbeats, model_chords, chord_models[0])
    automatic_phrase_start = infer_phrase_start_measure(bars)
    phrase_start_measure = int(
        (song_metadata or {}).get("phraseStartMeasure", automatic_phrase_start["measure"])
    )
    all_candidates = build_candidates(bars, phrase_start_measure)
    candidates = (
        all_candidates
        if args.candidate_limit <= 0
        else select_candidates(all_candidates, args.candidate_limit)
    )
    candidates = snap_playback_starts(candidates, detect_onsets(normalized))
    chroma_tonality = (
        {
            "key": args.key,
            "mode": args.mode,
            "method": "provided-override",
            "score": None,
            "margin": None,
        }
        if args.key and args.mode
        else estimate_tonality(normalized)
    )
    automatic_tonalities = infer_tonalities(bars)
    configured_tonalities = list((song_metadata or {}).get("tonalities", []))
    if configured_tonalities:
        tonalities = configured_tonalities
        tonality_method = "song-metadata"
    elif args.key and args.mode:
        tonalities = [{"startMeasure": 1, "key": args.key, "mode": args.mode}]
        tonality_method = "provided-override"
    else:
        tonalities = automatic_tonalities
        tonality_method = "harmonic-segmentation"
    first_tonality = tonalities[0] if tonalities else chroma_tonality
    tonality = {
        "key": first_tonality["key"],
        "mode": first_tonality["mode"],
        "method": tonality_method,
        "score": first_tonality.get("score"),
        "margin": first_tonality.get("margin"),
        "chromaEstimate": chroma_tonality,
    }
    source_hash = sha256_file(source)
    analysis = {
        "source": {"path": str(source), "sha256": source_hash, "artist": args.artist, "title": title},
        "audio": {
            "normalized": normalized.name,
            "preview": preview.name,
            "durationSec": duration,
        },
        "timing": {
            "model": selected_timing_model,
            "models": {
                model: {
                    "beats": output[0],
                    "rawDownbeats": output[1],
                    "normalizedBpm": model_timings[model].bpm,
                    "barDurationSec": model_timings[model].bar_duration,
                }
                for model, output in timing_outputs.items()
            },
            "decision": timing_reason,
            "beats": selected_beats,
            "rawDownbeats": list(song_timing.detected_downbeats),
            "downbeats": normalized_downbeats,
            "rawMedianBpm": median_bpm(selected_beats),
            "medianBpm": song_timing.bpm,
            "fixedBpm": song_timing.bpm,
            "barDurationSec": song_timing.bar_duration,
            "meter": "4/4",
        },
        "chordModel": chord_models[0],
        "chordModels": chord_models,
        "tonality": tonality,
        "tonalities": tonalities,
        "structure": {
            "phraseStartMeasure": phrase_start_measure,
            "phraseStartMethod": (
                "song-metadata"
                if (song_metadata or {}).get("phraseStartMeasure") is not None
                else automatic_phrase_start["method"]
            ),
            "phraseStartConfidence": automatic_phrase_start["confidence"],
            "automaticPhraseStart": automatic_phrase_start,
            "automaticTonalities": automatic_tonalities,
        },
        "songMetadata": song_metadata,
        "bars": [asdict(bar) for bar in bars],
        "candidates": [asdict(candidate) for candidate in candidates],
    }
    (work_dir / "analysis.json").write_text(
        json.dumps(analysis, indent=2) + "\n", encoding="utf-8"
    )
    if not args.skip_report:
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
                f"{selected_timing_model}: {timing_reason}",
                chord_models,
            ),
            encoding="utf-8",
        )
        print(f"Analysis report: {work_dir / 'review.html'}")
    print(f"Analysis JSON: {work_dir / 'analysis.json'}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Command failed with exit code {exc.returncode}") from exc
