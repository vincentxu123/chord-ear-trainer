"""Download the pinned GuitarSet pilot subset and create a performer split."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2] / ".recordings" / "training"
FILES = {
    "annotation.zip": "b39b78e63d3446f2e54ddb7a54df9b10",
    "audio_mono-mic.zip": "275966d6610ac34999b58426beb119c3",
}
# Published timing defects: https://github.com/marl/GuitarSet/issues/5
EXCLUDED = {"04_BN3-154-E_comp", "04_Jazz1-200-B_comp"}


def file_hash(path: Path, algorithm: str = "sha256") -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_and_extract(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for name, checksum in FILES.items():
        archive = root / name
        if not archive.exists() or file_hash(archive, "md5") != checksum:
            url = f"https://zenodo.org/records/3371780/files/{name}?download=1"
            print(f"Downloading {name}...", flush=True)
            temporary = archive.with_suffix(".partial")
            request = urllib.request.Request(url, headers={"User-Agent": "chord-ear-trainer-research/1.0"})
            with urllib.request.urlopen(request, timeout=120) as source, temporary.open("wb") as dest:
                count = 0
                while block := source.read(1024 * 1024):
                    dest.write(block)
                    count += len(block)
                    if count % (64 * 1024 * 1024) == 0:
                        print(f"  {count // (1024 * 1024)} MiB", flush=True)
            if file_hash(temporary, "md5") != checksum:
                raise ValueError(f"Checksum mismatch for {name}")
            temporary.replace(archive)
        target = root / archive.stem
        if not (target / ".extracted").exists():
            target.mkdir(exist_ok=True)
            with zipfile.ZipFile(archive) as source:
                for member in source.infolist():
                    resolved = (target / member.filename).resolve()
                    if not resolved.is_relative_to(target.resolve()):
                        raise ValueError("Unsafe archive path")
                source.extractall(target)
            (target / ".extracted").write_text(checksum)


def build_index(root: Path) -> list[dict]:
    labels = root / "labels"
    labels.mkdir(exist_ok=True)
    wavs = {p.stem: p for p in (root / "audio_mono-mic").rglob("*.wav")}
    rows = []
    for path in sorted((root / "annotation").rglob("*.jams")):
        if "__MACOSX" in path.parts or path.name.startswith("._"):
            continue
        parts = path.stem.split("_")
        if len(parts) < 3 or parts[2] != "comp":
            continue
        if path.stem in EXCLUDED:
            continue
        audio = wavs.get(path.stem + "_mic")
        if audio is None:
            raise FileNotFoundError(f"No microphone audio for {path.stem}")
        content = json.loads(path.read_text(encoding="utf-8"))
        chords = [a for a in content["annotations"] if a["namespace"] == "chord"]
        if len(chords) != 2:
            raise ValueError(f"Expected instructed and inferred chords: {path}")
        # GuitarSet v1.1.0: second chord annotation is inferred/performed.
        intervals = chords[1]["data"]
        lab = labels / f"{path.stem}.lab"
        lab.write_text("".join(
            f"{e['time']:.9f} {e['time'] + e['duration']:.9f} {e['value']}\n"
            for e in intervals), encoding="utf-8")
        player = parts[0]
        rows.append(dict(id=path.stem, group=f"player-{player}",
                         split={"04": "val", "05": "test"}.get(player, "train"),
                         audio=str(audio.resolve()), lab=str(lab.resolve()),
                         annotation_sha256=file_hash(path), license="CC-BY-4.0",
                         dataset="GuitarSet-1.1.0", annotation="inferred"))
    if len(rows) != 178:
        raise ValueError(f"Expected 178 comping recordings after exclusions, got {len(rows)}")
    (root / "index.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    return rows


if __name__ == "__main__":
    data = ROOT / "guitarset"
    download_and_extract(data)
    rows = build_index(data)
    print({s: sum(r["split"] == s for r in rows) for s in ("train", "val", "test")}, flush=True)
