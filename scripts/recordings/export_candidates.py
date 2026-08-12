#!/usr/bin/env python3
"""Export automatically eligible four-measure recording candidates."""

from __future__ import annotations

import argparse
import html
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ANALYSIS_ROOT = REPO_ROOT / ".recordings"
DEFAULT_OUTPUT = REPO_ROOT / "public" / "song-clips"

NOTE_TO_PC = {
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


def slug(value: str) -> str:
    safe = "".join(character.lower() if character.isalnum() else "-" for character in value)
    return "-".join(part for part in safe.split("-") if part)[:80] or "song"


def derive_song_metadata(analysis: dict[str, Any]) -> dict[str, str]:
    source = analysis.get("source", {})
    tonality = analysis.get("tonality", {})
    title = str(source.get("title", "")).strip()
    artist = str(source.get("artist", "")).strip()
    key = str(tonality.get("key", "")).strip()
    mode = str(tonality.get("mode", "")).strip()
    if not title or not artist:
        raise ValueError("Analysis is missing source title or artist")
    if key.upper().replace("♯", "#").replace("♭", "B") not in NOTE_TO_PC:
        raise ValueError(f"Analysis has unsupported estimated key: {key!r}")
    if mode not in {"major", "minor"}:
        raise ValueError(f"Analysis has unsupported estimated mode: {mode!r}")

    # Bilingual titles conventionally put the filesystem-friendly romanization
    # after a slash, preserving the existing jie-kou / cai-hong style IDs.
    slug_source = title.rsplit("/", 1)[-1].strip()
    return {"slug": slug(slug_source), "title": title, "artist": artist, "key": key, "mode": mode}


def chord_to_relative(label: str, key: str) -> dict[str, Any]:
    root, _, family = label.partition(":")
    root_pc = NOTE_TO_PC[root.upper().replace("♯", "#").replace("♭", "B")]
    key_pc = NOTE_TO_PC[key.upper().replace("♯", "#").replace("♭", "B")]
    if family not in {"maj", "min", "dim"}:
        raise ValueError(f"Unsupported chord label: {label}")
    return {"rootPc": (root_pc - key_pc) % 12, "quality": family}


def tonality_for_measure(
    analysis: dict[str, Any], measure: int, fallback: dict[str, str]
) -> dict[str, str]:
    tonalities = analysis_tonalities(analysis)
    selected = fallback
    for tonality in sorted(tonalities, key=lambda item: int(item["startMeasure"])):
        if int(tonality["startMeasure"]) > measure:
            break
        selected = {"key": str(tonality["key"]), "mode": str(tonality["mode"])}
    key = selected["key"]
    mode = selected["mode"]
    if key.upper().replace("♯", "#").replace("♭", "B") not in NOTE_TO_PC:
        raise ValueError(f"Song metadata has unsupported key: {key!r}")
    if mode not in {"major", "minor"}:
        raise ValueError(f"Song metadata has unsupported mode: {mode!r}")
    return {"key": key, "mode": mode}


def analysis_tonalities(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    """Return effective regions, retaining compatibility with older analyses."""
    return list(
        analysis.get("tonalities")
        or (analysis.get("songMetadata") or {}).get("tonalities", [])
    )


def candidate_chord_identities(candidate: dict[str, Any]) -> set[tuple[int, str]]:
    """Return unique pitch-class/quality pairs, ignoring enharmonic spelling."""
    identities: set[tuple[int, str]] = set()
    for bar in candidate.get("bars", []):
        for piece in bar.get("chord_sequence", []):
            root, _, family = str(piece.get("label", "")).partition(":")
            normalized_root = root.upper().replace("♯", "#").replace("♭", "B")
            if normalized_root in NOTE_TO_PC and family in {"maj", "min", "dim"}:
                identities.add((NOTE_TO_PC[normalized_root], family))
    return identities


def candidate_exclusion_reasons(
    analysis: dict[str, Any], candidate: dict[str, Any]
) -> list[str]:
    reasons = list(candidate.get("reasons", []))
    start_measure = int(candidate["index"])
    end_measure = start_measure + len(candidate.get("bars", [])) - 1
    tonality_changes = analysis_tonalities(analysis)
    if any(
        start_measure < int(tonality["startMeasure"]) <= end_measure
        for tonality in tonality_changes
    ):
        reasons.append("window crosses a tonality change")
    if len(candidate_chord_identities(candidate)) == 1:
        reasons.append("window contains only one unique chord")
    models = list(dict.fromkeys(analysis.get("chordModels", [])))
    if len(models) < 2:
        reasons.append("fewer than two chord models were run")
    for bar in candidate.get("bars", []):
        if len(bar.get("model_predictions", [])) < 2:
            reasons.append("a measure is missing a second chord-model prediction")
            break
        if float(bar.get("sequence_agreement", 0.0)) < 1.0:
            agreement_reason = "chord models disagree on an ordered chord sequence"
            if agreement_reason not in reasons:
                reasons.append(agreement_reason)
            break
    return reasons


def candidate_is_included(analysis: dict[str, Any], candidate: dict[str, Any]) -> bool:
    return bool(candidate.get("eligible")) and not candidate_exclusion_reasons(
        analysis, candidate
    )


def manifest_entry(
    analysis: dict[str, Any], candidate: dict[str, Any], metadata: dict[str, str]
) -> dict[str, Any]:
    start_measure = int(candidate["index"])
    tonality = tonality_for_measure(analysis, start_measure, metadata)
    playback_start = float(candidate["playback_start"])
    end = float(candidate["end"])
    chords: list[dict[str, Any]] = []
    cue_times: list[float] = []
    measure_counts: list[int] = []
    for bar in candidate["bars"]:
        sequence = bar["chord_sequence"]
        measure_counts.append(len(sequence))
        for piece in sequence:
            chords.append(chord_to_relative(piece["label"], tonality["key"]))
            cue_times.append(max(0.0, float(piece["start"]) - playback_start))

    if cue_times:
        cue_times[0] = 0.0
    clip_id = f"{metadata['slug']}-m{start_measure:03d}"
    return {
        "id": clip_id,
        "file": f"{clip_id}.mp3",
        "title": metadata["title"],
        "artist": metadata["artist"],
        "startMeasure": start_measure,
        "endMeasure": start_measure + len(candidate["bars"]) - 1,
        "key": tonality["key"],
        "mode": tonality["mode"],
        "bpm": analysis["timing"]["fixedBpm"],
        "durationSec": end - playback_start,
        "chords": chords,
        "cueTimesSec": cue_times,
        "measureChordCounts": measure_counts,
        "_clipStartSec": playback_start,
    }


def deduplicate_entries(
    entries: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Keep the earliest occurrence of each relative ordered chord sequence."""
    unique: list[dict[str, Any]] = []
    first_by_sequence: dict[tuple[tuple[int, str], ...], dict[str, Any]] = {}
    duplicate_reasons: dict[str, str] = {}
    for entry in entries:
        signature = tuple(
            (int(chord["rootPc"]), str(chord["quality"]))
            for chord in entry["chords"]
        )
        first = first_by_sequence.get(signature)
        if first is not None:
            duplicate_reasons[entry["id"]] = (
                "duplicates the chord sequence from measures "
                f"{first['startMeasure']}–{first['endMeasure']}"
            )
            continue
        first_by_sequence[signature] = entry
        unique.append(entry)
    return unique, duplicate_reasons


def export_audio(source: Path, output: Path, start: float, duration: float) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-ss",
            f"{start:.6f}",
            "-t",
            f"{duration:.6f}",
            "-vn",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "96k",
            str(output),
        ],
        check=True,
    )


def publish_report_html(
    analysis: dict[str, Any],
    metadata: dict[str, str],
    included_ids: set[str],
    duplicate_reasons: dict[str, str],
) -> str:
    cards: list[str] = []
    for candidate in analysis.get("candidates", []):
        candidate_id = f"{metadata['slug']}-m{int(candidate['index']):03d}"
        included = candidate_id in included_ids
        reasons = candidate_exclusion_reasons(analysis, candidate)
        if candidate_id in duplicate_reasons:
            reasons.append(duplicate_reasons[candidate_id])
        measures: list[str] = []
        for bar in candidate.get("bars", []):
            sequence = " → ".join(piece["label"] for piece in bar.get("chord_sequence", [])) or "N"
            model_rows = "".join(
                f"<li><span>{html.escape(prediction['model'])}</span> "
                f"{html.escape(' → '.join(piece['label'] for piece in prediction.get('chord_sequence', [])) or prediction['chord'])}</li>"
                for prediction in bar.get("model_predictions", [])
            )
            measures.append(
                f"<section class='measure'><small>Measure {int(bar['index'])}</small>"
                f"<strong>{html.escape(sequence)}</strong><ul>{model_rows}</ul></section>"
            )
        reason_markup = (
            ""
            if included
            else "<p class='reason'>" + html.escape("; ".join(reasons) or "excluded by automatic gate") + "</p>"
        )
        cards.append(
            f"<article class='card {'included' if included else 'excluded'}'>"
            f"<header><div><strong>Measures {int(candidate['index'])}–{int(candidate['index']) + 3}</strong> "
            f"<span>{'included' if included else 'excluded'}</span></div>"
            f"<button data-start='{float(candidate['playback_start']):.6f}' data-end='{float(candidate['end']):.6f}'>Play</button></header>"
            f"<div class='measures'>{''.join(measures)}</div>{reason_markup}</article>"
        )

    included_count = len(included_ids)
    excluded_count = len(analysis.get("candidates", [])) - included_count
    preview_name = html.escape(str(analysis["audio"]["preview"]))
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    tonalities = analysis_tonalities(analysis)
    if tonalities:
        tonality_summary = " → ".join(
            f"{item['key']} {item['mode']} from measure {int(item['startMeasure'])}"
            for item in tonalities
        )
        method = str(analysis.get("tonality", {}).get("method", "automatic"))
        tonality_summary += f" ({method})"
    else:
        method = str(analysis.get("tonality", {}).get("method", "unknown"))
        tonality_summary = f"{metadata['key']} {metadata['mode']} ({method})"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Publish audit — {html.escape(metadata['title'])}</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }}
    body {{ margin: 0; background: #0b0d12; color: #edf1f7; }}
    main {{ width: min(1180px, calc(100% - 32px)); margin: 40px auto 80px; }}
    h1 {{ margin-bottom: 4px; }} .meta, small, li span {{ color: #9aa6ba; }}
    .notice {{ border-left: 3px solid #6e89ef; background: #111827; padding: 12px 16px; }}
    audio {{ width: 100%; margin: 20px 0; }} .cards {{ display: grid; gap: 14px; }}
    .card {{ border: 1px solid #3b4455; background: #131923; border-radius: 14px; padding: 16px; }}
    .card.included {{ border-color: #3f8a64; }} .card.excluded {{ opacity: .78; }}
    header {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; }}
    header span {{ border-radius: 999px; padding: 4px 8px; margin-left: 6px; background: #293142; font-size: 12px; }}
    .included header span {{ background: #173e2b; color: #a7e9c2; }}
    button {{ border: 0; border-radius: 8px; padding: 9px 13px; background: #7892ee; color: #07101f; font-weight: 700; cursor: pointer; }}
    button.active {{ background: #f1c65b; }}
    .measures {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }}
    .measure {{ min-width: 0; border-radius: 9px; background: #1a2230; padding: 10px; }}
    .measure strong {{ display: block; margin: 5px 0 8px; overflow-wrap: anywhere; }}
    ul {{ margin: 0; padding-left: 16px; font-size: 11px; }} .reason {{ color: #efb5a3; margin-bottom: 0; }}
    @media (max-width: 700px) {{ .measures {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} }}
  </style>
</head>
<body><main>
  <h1>{html.escape(metadata['title'])}</h1>
  <p class="meta">{html.escape(metadata['artist'])} · {html.escape(tonality_summary)} · generated {generated_at}</p>
  <p class="notice">Automatic publish completed before this report: {included_count} windows included, {excluded_count} excluded. This page is an audit aid; no approval is required.</p>
  <audio id="player" controls preload="metadata" src="{preview_name}"></audio>
  <div class="cards">{''.join(cards) or '<p>No complete four-measure windows were found.</p>'}</div>
</main>
<script>
  const player = document.querySelector('#player'); let stopAt = null; let active = null;
  document.querySelectorAll('button[data-start]').forEach(button => button.addEventListener('click', async () => {{
    if (active) active.classList.remove('active'); active = button; active.classList.add('active');
    player.pause(); player.currentTime = Number(button.dataset.start); stopAt = Number(button.dataset.end); await player.play();
  }}));
  player.addEventListener('timeupdate', () => {{ if (stopAt !== null && player.currentTime >= stopAt) {{ player.pause(); stopAt = null; if (active) active.classList.remove('active'); }} }});
</script></body></html>"""


def load_manifest(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return list(json.loads(path.read_text(encoding="utf-8")).get("clips", []))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--analysis-root", type=Path, default=DEFAULT_ANALYSIS_ROOT)
    parser.add_argument("--analysis", type=Path, action="append")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    analysis_paths = (
        [path.expanduser().resolve() for path in args.analysis]
        if args.analysis
        else sorted(args.analysis_root.glob("*/analysis.json"))
    )
    if not analysis_paths:
        raise SystemExit("No analysis.json files found")

    loaded: list[tuple[dict[str, Any], Path, dict[str, str]]] = []
    seen_slugs: dict[str, str] = {}
    for path in analysis_paths:
        if not path.is_file():
            raise SystemExit(f"Analysis not found: {path}")
        analysis = json.loads(path.read_text(encoding="utf-8"))
        metadata = derive_song_metadata(analysis)
        previous_title = seen_slugs.get(metadata["slug"])
        if previous_title and previous_title != metadata["title"]:
            raise SystemExit(
                f"Song slug collision for {metadata['slug']!r}: {previous_title!r} and {metadata['title']!r}"
            )
        seen_slugs[metadata["slug"]] = metadata["title"]
        loaded.append((analysis, path.parent, metadata))

    args.output.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output / "manifest.json"
    replacing = {(metadata["artist"], metadata["title"]) for _, _, metadata in loaded}
    previous_entries = load_manifest(manifest_path)
    replaced_entries = [
        entry
        for entry in previous_entries
        if (entry.get("artist"), entry.get("title")) in replacing
    ]
    entries = (
        [
            entry
            for entry in previous_entries
            if (entry.get("artist"), entry.get("title")) not in replacing
        ]
        if args.analysis
        else []
    )
    reports: list[
        tuple[dict[str, Any], Path, dict[str, str], set[str], dict[str, str]]
    ] = []

    for analysis, work_dir, metadata in loaded:
        preview = work_dir / analysis["audio"]["preview"]
        eligible_entries = [
            manifest_entry(analysis, candidate, metadata)
            for candidate in analysis.get("candidates", [])
            if candidate_is_included(analysis, candidate)
        ]
        unique_entries, duplicate_reasons = deduplicate_entries(eligible_entries)
        included_ids = {entry["id"] for entry in unique_entries}
        for entry in unique_entries:
            start = entry.pop("_clipStartSec")
            export_audio(preview, args.output / entry["file"], start, entry["durationSec"])
            entries.append(entry)
        reports.append(
            (analysis, work_dir, metadata, included_ids, duplicate_reasons)
        )

    entries.sort(key=lambda entry: (entry["artist"], entry["title"], entry["startMeasure"]))
    temporary_manifest = manifest_path.with_suffix(".json.tmp")
    temporary_manifest.write_text(
        json.dumps({"clips": entries}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    exported_files = {entry["file"] for entry in entries}
    for replaced_entry in replaced_entries:
        stale_file = replaced_entry.get("file")
        if stale_file and stale_file not in exported_files:
            stale_path = args.output / stale_file
            if stale_path.is_file():
                stale_path.unlink()
    temporary_manifest.replace(manifest_path)

    for analysis, work_dir, metadata, included_ids, duplicate_reasons in reports:
        report_path = work_dir / "publish-report.html"
        report_path.write_text(
            publish_report_html(
                analysis, metadata, included_ids, duplicate_reasons
            ),
            encoding="utf-8",
        )
        print(
            f"{metadata['title']}: included {len(included_ids)} of "
            f"{len(analysis.get('candidates', []))} windows"
        )
        print(f"Publish audit: {report_path}")

    print(f"Manifest now contains {len(entries)} clips: {manifest_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except FileNotFoundError as exc:
        raise SystemExit("ffmpeg is required to export candidate clips") from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"ffmpeg failed with exit code {exc.returncode}") from exc
