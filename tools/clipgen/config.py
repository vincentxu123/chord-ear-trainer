"""Configuration, loaded from environment / .env.

All provider-specific details (API key, base URL) live here so the pipeline is
swappable: point SUNO_API_BASE at a different reseller and adjust generate.py's
request/response mapping.
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:  # python-dotenv is optional; env vars still work without it
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
CLIPS_JSON = REPO_ROOT / "public" / "clips.json"
CLIPS_DIR = REPO_ROOT / "public" / "clips"


@dataclass
class Config:
    # --- provider (default: kie.ai) ---
    api_key: str = os.environ.get("SUNO_API_KEY", "")
    base_url: str = os.environ.get("SUNO_API_BASE", "https://api.kie.ai").rstrip("/")
    model: str = os.environ.get("SUNO_MODEL", "V4")
    poll_interval: float = float(os.environ.get("SUNO_POLL_INTERVAL", "5"))
    poll_max: int = int(os.environ.get("SUNO_POLL_MAX", "60"))

    # --- detection / gating ---
    include_dim: bool = os.environ.get("CLIPGEN_INCLUDE_DIM", "0") == "1"
    want_chords_min: int = int(os.environ.get("CLIPGEN_CHORDS_MIN", "3"))
    want_chords_max: int = int(os.environ.get("CLIPGEN_CHORDS_MAX", "4"))
    conf_min: float = float(os.environ.get("CLIPGEN_CONF_MIN", "0.55"))
    min_seg_sec: float = float(os.environ.get("CLIPGEN_MIN_SEG_SEC", "1.0"))
    use_nn_filter: bool = os.environ.get("CLIPGEN_NN_FILTER", "1") == "1"
    median_frames: int = int(os.environ.get("CLIPGEN_MEDIAN_FRAMES", "9"))
    window_min_sec: float = float(os.environ.get("CLIPGEN_WINDOW_MIN", "8"))
    window_max_sec: float = float(os.environ.get("CLIPGEN_WINDOW_MAX", "18"))
    min_chord_sec: float = float(os.environ.get("CLIPGEN_MIN_CHORD_SEC", "0.6"))

    # default style hint for generation
    style: str = field(
        default=os.environ.get(
            "CLIPGEN_STYLE",
            "simple pop, clean diatonic harmony, steady tempo, no key change, "
            "repeating 4-chord loop, piano and light drums",
        )
    )


CFG = Config()
