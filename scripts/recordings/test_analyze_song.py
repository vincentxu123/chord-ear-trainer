import unittest

from analyze_song import (
    MAJOR_KEY_PROFILE,
    MINOR_KEY_PROFILE,
    analyze_bar,
    build_bars,
    build_candidates,
    build_ensemble_bars,
    chord_family,
    chord_root,
    estimate_key_from_chroma,
    normalize_song_timing,
    select_song_timing,
    snap_playback_starts,
)


class AnalyzeSongTests(unittest.TestCase):
    def test_key_estimation_recovers_rotated_major_and_minor_profiles(self):
        d_major = MAJOR_KEY_PROFILE[-2:] + MAJOR_KEY_PROFILE[:-2]
        a_minor = MINOR_KEY_PROFILE[-9:] + MINOR_KEY_PROFILE[:-9]

        self.assertEqual(
            (estimate_key_from_chroma(d_major)["key"], estimate_key_from_chroma(d_major)["mode"]),
            ("D", "major"),
        )
        self.assertEqual(
            (estimate_key_from_chroma(a_minor)["key"], estimate_key_from_chroma(a_minor)["mode"]),
            ("A", "minor"),
        )

    def test_chord_family_reduces_supported_labels(self):
        self.assertEqual(chord_family("C:maj7"), "maj")
        self.assertEqual(chord_family("A:min7"), "min")
        self.assertEqual(chord_family("B:dim"), "dim")
        self.assertIsNone(chord_family("N"))

    def test_chord_root_treats_enharmonic_spellings_as_equal(self):
        self.assertEqual(chord_root("A#:maj"), chord_root("Bb:maj7"))
        self.assertIsNone(chord_root("N"))

    def test_bar_uses_duration_weighted_majority_and_preserves_other_beats(self):
        bar = analyze_bar(
            1,
            0.0,
            4.0,
            [
                {"start_time": 0.0, "end_time": 1.0, "chord": "G:maj"},
                {"start_time": 1.0, "end_time": 4.0, "chord": "C:maj7"},
            ],
        )
        self.assertEqual(bar.chord, "C:maj")
        self.assertAlmostEqual(bar.dominance, 0.75)
        self.assertEqual([chord.label for chord in bar.chord_sequence], ["G:maj", "C:maj"])

    def test_bar_allows_one_chord_per_beat_and_rejects_boundary_jitter(self):
        bar = analyze_bar(
            1,
            0.0,
            4.0,
            [
                {"start_time": 0.0, "end_time": 2.0, "chord": "G:maj"},
                {"start_time": 2.0, "end_time": 3.0, "chord": "F#:min"},
                {"start_time": 3.0, "end_time": 3.9, "chord": "B:min"},
                {"start_time": 3.9, "end_time": 4.0, "chord": "E:min"},
            ],
        )
        self.assertEqual(bar.chord, "G:maj")
        self.assertEqual(
            [chord.label for chord in bar.chord_sequence],
            ["G:maj", "F#:min", "B:min"],
        )
        self.assertAlmostEqual(sum(chord.occupancy for chord in bar.chord_sequence), 0.975)

    def test_candidate_requires_four_supported_unambiguous_bars(self):
        chords = [
            {"start_time": float(i), "end_time": float(i + 1), "chord": "C:maj"}
            for i in range(4)
        ]
        bars = build_bars([0.0, 1.0, 2.0, 3.0, 4.0], chords)
        candidates = build_candidates(bars)
        self.assertEqual(len(candidates), 1)
        self.assertTrue(candidates[0].eligible)
        self.assertAlmostEqual(candidates[0].local_bpm, 240.0)

    def test_candidates_stay_on_four_measure_phrase_grid(self):
        chords = [
            {"start_time": float(i), "end_time": float(i + 1), "chord": "C:maj"}
            for i in range(12)
        ]
        bars = build_bars([float(i) for i in range(13)], chords)

        candidates = build_candidates(bars)

        self.assertEqual([candidate.index for candidate in candidates], [1, 5, 9])
        self.assertEqual(
            [[bar.index for bar in candidate.bars] for candidate in candidates],
            [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
        )

    def test_playback_cue_only_snaps_forward_to_nearby_onset(self):
        bars = build_bars(
            [0.0, 1.0, 2.0, 3.0, 4.0],
            [{"start_time": 0.0, "end_time": 4.0, "chord": "C:maj"}],
        )
        candidate = build_candidates(bars)[0]

        [snapped] = snap_playback_starts([candidate], [-0.1, 0.04, 0.2])

        self.assertEqual(snapped.start, 0.0)
        self.assertEqual(snapped.playback_start, 0.04)

    def test_ensemble_reports_root_and_quality_agreement(self):
        bars = build_ensemble_bars(
            [0.0, 4.0],
            {
                "lv-chordia": [{"start_time": 0.0, "end_time": 4.0, "chord": "Bb:maj7"}],
                "btc": [{"start_time": 0.0, "end_time": 4.0, "chord": "A#"}],
            },
            "lv-chordia",
        )
        self.assertEqual(len(bars[0].model_predictions), 2)
        self.assertEqual(bars[0].root_agreement, 1.0)
        self.assertEqual(bars[0].family_agreement, 1.0)
        self.assertEqual(bars[0].sequence_agreement, 1.0)

    def test_candidate_rejects_sequence_disagreement_even_when_winner_agrees(self):
        model_chords = {
            "lv-chordia": [
                {"start_time": 0.0, "end_time": 3.0, "chord": "C:maj"},
                {"start_time": 3.0, "end_time": 4.0, "chord": "G:maj"},
                {"start_time": 4.0, "end_time": 16.0, "chord": "C:maj"},
            ],
            "btc": [{"start_time": 0.0, "end_time": 16.0, "chord": "C:maj"}],
        }
        bars = build_ensemble_bars(
            [0.0, 4.0, 8.0, 12.0, 16.0], model_chords, "lv-chordia"
        )

        candidate = build_candidates(bars)[0]

        self.assertEqual(bars[0].root_agreement, 1.0)
        self.assertEqual(bars[0].sequence_agreement, 0.5)
        self.assertFalse(candidate.eligible)
        self.assertIn("ordered chord sequence", candidate.reasons[0])

    def test_timing_ensemble_prefers_supported_full_bars(self):
        timing, model, reason, _ = select_song_timing(
            {
                "beat-this": [float(i) for i in range(0, 21, 2)],
                "madmom": [float(i) for i in range(0, 21, 4)],
            },
            duration=20.5,
        )

        self.assertEqual(model, "madmom")
        self.assertAlmostEqual(timing.bar_duration, 4.0)
        self.assertIn("half-bar", reason)

    def test_timing_ensemble_averages_same_level_grids(self):
        timing, model, _, _ = select_song_timing(
            {
                "beat-this": [0.0, 4.0, 8.0, 12.0, 16.0],
                "madmom": [0.1, 4.1, 8.1, 12.1, 16.1],
            },
            duration=16.5,
        )

        self.assertEqual(model, "beat-this+madmom")
        self.assertAlmostEqual(timing.downbeats[0], 0.05)

    def test_song_timing_rejects_extra_half_bar_markers(self):
        # The tracker emits half-bar markers at first, then proper full bars.
        detected = [0.3, 2.3, 4.3, 6.3, 10.3, 14.3, 18.3]
        timing = normalize_song_timing(detected, duration=20.5)

        self.assertAlmostEqual(timing.bpm, 60.0)
        self.assertEqual(len(timing.downbeats), 5)
        self.assertEqual(
            [round(value, 1) for value in timing.downbeats],
            [2.3, 6.3, 10.3, 14.3, 18.3],
        )


if __name__ == "__main__":
    unittest.main()
