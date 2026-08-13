#!/usr/bin/env python3
"""Create and cache an instrumental stem with Demucs."""

from __future__ import annotations

import argparse
import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPT_DIR = Path(__file__).resolve().parent


def separate_vocals(source: Path, destination: Path, device: str = "cpu") -> None:
    """Write Demucs' no-vocals stem, reusing an existing cached result."""
    source = source.expanduser().resolve()
    destination = destination.expanduser().resolve()
    if destination.is_file():
        return
    if not source.is_file():
        raise FileNotFoundError(f"Audio file not found: {source}")
    if importlib.util.find_spec("demucs") is None:
        raise RuntimeError(
            "Demucs is not installed. Reinstall scripts/recordings/requirements.txt "
            "in .venv-recordings."
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="demucs-", dir=destination.parent) as directory:
        output_root = Path(directory)
        subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "run_demucs.py"),
                "--two-stems",
                "vocals",
                "--device",
                device,
                "--out",
                str(output_root),
                str(source),
            ],
            check=True,
        )
        stems = list(output_root.rglob("no_vocals.wav"))
        if len(stems) != 1:
            raise RuntimeError(
                f"Demucs produced {len(stems)} no-vocals stems; expected exactly one"
            )
        temporary = destination.with_suffix(f"{destination.suffix}.tmp")
        shutil.copyfile(stems[0], temporary)
        temporary.replace(destination)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps", "cuda"))
    args = parser.parse_args()
    separate_vocals(args.audio, args.output, args.device)
    print(f"Instrumental stem: {args.output.expanduser().resolve()}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"Demucs failed with exit code {exc.returncode}") from exc
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
