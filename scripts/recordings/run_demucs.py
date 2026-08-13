#!/usr/bin/env python3
"""Run Demucs while writing WAV stems through SoundFile.

Recent Torchaudio releases require TorchCodec for saving, but TorchCodec's
supported FFmpeg matrix can lag system packages. Demucs already depends on
SoundFile through the recording environment, so use it for portable WAV output.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import soundfile
import torch
from demucs import separate
from demucs.audio import prevent_clip


def save_wav(
    wav: torch.Tensor,
    path: str | Path,
    samplerate: int,
    bitrate: int = 320,
    clip: Literal["rescale", "clamp", "tanh", "none"] = "rescale",
    bits_per_sample: Literal[16, 24, 32] = 16,
    as_float: bool = False,
    preset: Literal[2, 3, 4, 5, 6, 7] = 2,
) -> None:
    del bitrate, preset
    destination = Path(path)
    if destination.suffix.lower() != ".wav":
        raise ValueError("The recording pipeline expects Demucs WAV output")
    audio = prevent_clip(wav, mode=clip).detach().cpu().numpy().T
    subtype = "FLOAT" if as_float else f"PCM_{bits_per_sample}"
    soundfile.write(destination, audio, samplerate, subtype=subtype)


def main() -> None:
    separate.save_audio = save_wav
    separate.main()


if __name__ == "__main__":
    main()
