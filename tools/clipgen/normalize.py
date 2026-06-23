"""Convert absolute detected chords into the app's relative rootPc+quality."""


def to_relative(window, key_pc):
    """window: {start, end, segments[]}; key_pc: tonic pitch class.

    Returns (chords, chord_times_sec). Times are ABSOLUTE file seconds (the app's
    GeneratedAudioSource subtracts startSec itself); adjacent duplicates collapse.
    """
    chords = []
    times = []
    for seg in window["segments"]:
        rel = (seg["root"] - key_pc) % 12
        chord = {"rootPc": rel, "quality": seg["quality"]}
        if chords and chords[-1] == chord:
            continue  # collapse adjacent repeats
        chords.append(chord)
        times.append(round(seg["start"], 3))
    return chords, times


def mean_confidence(window) -> float:
    confs = [s["conf"] for s in window["segments"]]
    return sum(confs) / len(confs) if confs else 0.0
