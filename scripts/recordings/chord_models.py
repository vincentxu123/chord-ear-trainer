"""Optional chord-recognition backends with one common segment format."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable


ChordSegment = dict[str, Any]
DEFAULT_BTC_REPOSITORY = "puar-playground/btc-chord"
DEFAULT_BTC_REVISION = "d436f2f664f5107cd987774279b8ce171846e376"


class ChordModelUnavailable(RuntimeError):
    """Raised when an optional detector or its weights cannot be loaded."""


def _segment(start: Any, end: Any, chord: Any) -> ChordSegment:
    return {
        "start_time": float(start),
        "end_time": float(end),
        "chord": str(chord),
    }


def analyze_lv_chordia(audio: Path, _device: str) -> list[ChordSegment]:
    try:
        from lv_chordia.chord_recognition import chord_recognition
    except ImportError as exc:
        raise ChordModelUnavailable(
            "lv-chordia is not installed. See scripts/recordings/README.md"
        ) from exc

    predictions = chord_recognition(audio_path=str(audio), chord_dict_name="ismir2017")
    return [
        _segment(item["start_time"], item["end_time"], item["chord"])
        for item in predictions
    ]


def analyze_btc(audio: Path, device: str) -> list[ChordSegment]:
    """Run the original BTC weights through their modern HF packaging.

    The model repository contains custom inference code. This integration pins
    the tested revision and deliberately keeps BTC optional instead of adding
    remote-code execution to the default lv-chordia path.
    """
    try:
        from transformers import AutoModel
    except ImportError as exc:
        raise ChordModelUnavailable(
            "BTC needs transformers and huggingface-hub. Install the optional "
            "requirements from scripts/recordings/requirements-btc.txt."
        ) from exc

    try:
        model = AutoModel.from_pretrained(
            DEFAULT_BTC_REPOSITORY,
            revision=DEFAULT_BTC_REVISION,
            trust_remote_code=True,
            device=device,
        )
        predictions = model.predict(str(audio))
    except Exception as exc:
        raise ChordModelUnavailable(f"BTC could not be loaded or run: {exc}") from exc

    return [
        _segment(item["start"], item["end"], item["chord"])
        for item in predictions
    ]


DETECTORS: dict[str, Callable[[Path, str], list[ChordSegment]]] = {
    "lv-chordia": analyze_lv_chordia,
    "btc": analyze_btc,
}


def available_models() -> tuple[str, ...]:
    return tuple(DETECTORS)


def analyze_chords(model: str, audio: Path, device: str) -> list[ChordSegment]:
    try:
        detector = DETECTORS[model]
    except KeyError as exc:
        supported = ", ".join(available_models())
        raise ValueError(f"Unknown chord model {model!r}; choose from {supported}") from exc
    return detector(audio, device)
