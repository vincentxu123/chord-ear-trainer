"""Pick the playback window: the first stable run of N distinct chords.

Suno returns a full track, so we scan the detected segments for the earliest
contiguous run that holds the target number of distinct triads within the
desired length, skipping ultra-short blips. This is the calibration-heavy part
of the baseline; refine here (e.g. chorus/loop detection) for better windows.
"""


def choose_window(segments, duration, cfg):
    usable = [s for s in segments if (s["end"] - s["start"]) >= cfg.min_chord_sec]
    if not usable:
        return None

    n = len(usable)
    for i in range(n):
        distinct = set()
        run = []
        start = usable[i]["start"]
        for j in range(i, n):
            seg = usable[j]
            run.append(seg)
            distinct.add((seg["root"], seg["quality"]))
            length = seg["end"] - start
            if len(distinct) > cfg.want_chords_max or length > cfg.window_max_sec:
                break
            if (
                cfg.want_chords_min <= len(distinct) <= cfg.want_chords_max
                and length >= cfg.window_min_sec
            ):
                return {"start": start, "end": seg["end"], "segments": list(run)}
    return None
