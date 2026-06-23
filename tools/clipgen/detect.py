"""Chord + key detection with librosa (pip-only, Windows-friendly baseline).

Approach: harmonic-percussive separation -> beat-synchronous CQT chromagram ->
match each beat against major/minor(/dim) triad templates -> merge consecutive
equal labels into timed segments. Key is estimated with Krumhansl-Schmugler
profiles. This is intentionally simple; calibrate thresholds in config, or swap
in Chordino (Docker) later if accuracy on real generations disappoints.
"""
import librosa
import numpy as np
import scipy.ndimage

PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmugler key profiles.
_KS_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_KS_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)

_TRIADS = {"maj": (0, 4, 7), "min": (0, 3, 7), "dim": (0, 3, 6)}


def _triad_templates(include_dim: bool):
    quals = ["maj", "min"] + (["dim"] if include_dim else [])
    templates = []
    for q in quals:
        for root in range(12):
            vec = np.zeros(12)
            for iv in _TRIADS[q]:
                vec[(root + iv) % 12] = 1.0
            templates.append((root, q, vec / np.linalg.norm(vec)))
    return templates


def detect_key(chroma_mean: np.ndarray):
    best = None
    for tonic in range(12):
        for mode, profile in (("major", _KS_MAJOR), ("minor", _KS_MINOR)):
            score = np.corrcoef(np.roll(profile, tonic), chroma_mean)[0, 1]
            if best is None or score > best[2]:
                best = (tonic, mode, score)
    return best[0], best[1]


def _merge_equal(frames, duration):
    """Collapse consecutive equal-label frames into timed segments."""
    merged = []
    for f in frames:
        if merged and merged[-1]["root"] == f["root"] and merged[-1]["quality"] == f["quality"]:
            merged[-1]["confs"].append(f["conf"])
        else:
            merged.append(
                {"start": f["start"], "root": f["root"], "quality": f["quality"], "confs": [f["conf"]]}
            )
    for i, seg in enumerate(merged):
        seg["end"] = merged[i + 1]["start"] if i + 1 < len(merged) else duration
        seg["conf"] = float(np.mean(seg.get("confs", [seg.get("conf", 0.0)])))
        seg.pop("confs", None)
    return merged


def _coalesce(segments, duration, min_seg_sec):
    """Absorb sub-min_seg_sec segments into their longer neighbor, then re-merge.

    Real chords are held for ~a bar; raw beat labels flicker, so we suppress the
    short flickers before deciding the progression.
    """
    segs = [dict(s) for s in segments]
    while len(segs) > 1:
        idx = next(
            (i for i, s in enumerate(segs) if (s["end"] - s["start"]) < min_seg_sec),
            None,
        )
        if idx is None:
            break
        left = segs[idx - 1] if idx > 0 else None
        right = segs[idx + 1] if idx + 1 < len(segs) else None
        if left and (not right or (left["end"] - left["start"]) >= (right["end"] - right["start"])):
            left["end"] = segs[idx]["end"]
        elif right:
            right["start"] = segs[idx]["start"]
        else:
            break
        segs.pop(idx)
    as_frames = [
        {"start": s["start"], "root": s["root"], "quality": s["quality"], "conf": s["conf"]}
        for s in segs
    ]
    return _merge_equal(as_frames, duration)


def detect(
    path,
    include_dim: bool = False,
    min_seg_sec: float = 1.0,
    use_nn_filter: bool = True,
    median_frames: int = 9,
) -> dict:
    y, sr = librosa.load(path, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    y_harm, _ = librosa.effects.hpss(y)

    chroma = librosa.feature.chroma_cqt(y=y_harm, sr=sr)
    # Smoothing to stabilize sustained harmony before labeling. nn_filter is
    # strong (great for repeats, can over-merge); median_frames is gentler.
    if use_nn_filter:
        chroma = np.minimum(
            chroma,
            librosa.decompose.nn_filter(chroma, aggregate=np.median, metric="cosine"),
        )
    if median_frames > 1:
        chroma = scipy.ndimage.median_filter(chroma, size=(1, median_frames))

    key_pc, mode = detect_key(chroma.mean(axis=1))

    _, beats = librosa.beat.beat_track(y=y, sr=sr)
    beat_times = librosa.frames_to_time(beats, sr=sr)
    beat_chroma = librosa.util.sync(chroma, beats, aggregate=np.median)

    templates = _triad_templates(include_dim)
    frames = []
    n = beat_chroma.shape[1]
    for i in range(n):
        vec = beat_chroma[:, i]
        norm = np.linalg.norm(vec)
        if norm < 1e-6:
            continue
        vecn = vec / norm
        root, qual, conf = max(
            ((r, q, float(np.dot(t, vecn))) for r, q, t in templates),
            key=lambda x: x[2],
        )
        start = float(beat_times[i]) if i < len(beat_times) else duration
        frames.append({"start": start, "root": root, "quality": qual, "conf": conf})

    segments = _coalesce(_merge_equal(frames, duration), duration, min_seg_sec)
    return {
        "key_pc": key_pc,
        "mode": mode,
        "duration": duration,
        "segments": segments,
    }
