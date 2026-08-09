import unittest

from analyze_song import (
    analyze_bar,
    build_bars,
    build_candidates,
    chord_family,
    normalize_song_timing,
)


class AnalyzeSongTests(unittest.TestCase):
    def test_chord_family_reduces_supported_labels(self):
        self.assertEqual(chord_family("C:maj7"), "maj")
        self.assertEqual(chord_family("A:min7"), "min")
        self.assertEqual(chord_family("B:dim"), "dim")
        self.assertIsNone(chord_family("N"))

    def test_bar_uses_duration_weighted_majority(self):
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
        self.assertEqual([chord.label for chord in bar.chord_sequence], ["C:maj"])

    def test_low_occupancy_bar_preserves_two_chords_in_time_order(self):
        bar = analyze_bar(
            1,
            0.0,
            4.0,
            [
                {"start_time": 0.0, "end_time": 1.75, "chord": "G:maj"},
                {"start_time": 1.75, "end_time": 4.0, "chord": "C:maj"},
            ],
        )
        self.assertEqual(bar.chord, "C:maj")
        self.assertEqual([chord.label for chord in bar.chord_sequence], ["G:maj", "C:maj"])
        self.assertAlmostEqual(sum(chord.occupancy for chord in bar.chord_sequence), 1.0)

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
