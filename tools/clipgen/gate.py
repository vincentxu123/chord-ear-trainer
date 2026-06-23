"""Acceptance gate: keep a clip only if its detected progression is clean."""


def passes(chords, mean_conf, cfg):
    distinct = {(c["rootPc"], c["quality"]) for c in chords}
    if not (cfg.want_chords_min <= len(distinct) <= cfg.want_chords_max):
        return False, f"distinct chords = {len(distinct)} (want {cfg.want_chords_min}-{cfg.want_chords_max})"
    if mean_conf < cfg.conf_min:
        return False, f"mean confidence {mean_conf:.2f} < {cfg.conf_min}"
    return True, "ok"
