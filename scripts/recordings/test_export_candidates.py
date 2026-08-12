import unittest

from export_candidates import (
    candidate_exclusion_reasons,
    candidate_is_included,
    chord_to_relative,
    deduplicate_entries,
    derive_song_metadata,
    tonality_for_measure,
)


class ExportCandidateTests(unittest.TestCase):
    def setUp(self):
        self.analysis = {
            "source": {"title": "擱淺 / Ge Qian", "artist": "Jay Chou"},
            "tonality": {"key": "F", "mode": "major", "method": "automatic"},
            "chordModels": ["lv-chordia", "btc"],
        }
        self.candidate = {
            "index": 1,
            "eligible": True,
            "reasons": [],
            "bars": [
                {
                    "sequence_agreement": 1.0,
                    "model_predictions": [
                        {"model": "lv-chordia"},
                        {"model": "btc"},
                    ],
                }
                for _ in range(4)
            ],
        }

    def test_derives_metadata_without_a_hard_coded_catalog(self):
        metadata = derive_song_metadata(self.analysis)

        self.assertEqual(metadata["slug"], "ge-qian")
        self.assertEqual((metadata["key"], metadata["mode"]), ("F", "major"))

    def test_includes_only_candidates_with_two_complete_agreeing_models(self):
        self.assertTrue(candidate_is_included(self.analysis, self.candidate))

        single_model_analysis = {**self.analysis, "chordModels": ["lv-chordia"]}
        self.assertFalse(candidate_is_included(single_model_analysis, self.candidate))
        self.assertIn(
            "fewer than two chord models were run",
            candidate_exclusion_reasons(single_model_analysis, self.candidate),
        )

        disagreement = {
            **self.candidate,
            "eligible": False,
            "reasons": ["chord models disagree on an ordered chord sequence"],
        }
        self.assertFalse(candidate_is_included(self.analysis, disagreement))

    def test_converts_absolute_chords_using_estimated_key(self):
        self.assertEqual(
            chord_to_relative("Bb:maj", "F"),
            {"rootPc": 5, "quality": "maj"},
        )

    def test_uses_measure_specific_tonality_metadata(self):
        self.analysis["songMetadata"] = {
            "tonalities": [
                {"startMeasure": 1, "key": "Eb", "mode": "major"},
                {"startMeasure": 43, "key": "F", "mode": "major"},
            ]
        }

        self.assertEqual(
            tonality_for_measure(self.analysis, 42, {"key": "C", "mode": "minor"}),
            {"key": "Eb", "mode": "major"},
        )
        self.assertEqual(
            tonality_for_measure(self.analysis, 43, {"key": "C", "mode": "minor"}),
            {"key": "F", "mode": "major"},
        )

    def test_excludes_windows_that_cross_a_tonality_change(self):
        self.analysis["songMetadata"] = {
            "tonalities": [
                {"startMeasure": 1, "key": "Eb", "mode": "major"},
                {"startMeasure": 43, "key": "F", "mode": "major"},
            ]
        }
        self.candidate["index"] = 42

        self.assertFalse(candidate_is_included(self.analysis, self.candidate))
        self.assertIn(
            "window crosses a configured tonality change",
            candidate_exclusion_reasons(self.analysis, self.candidate),
        )

    def test_keeps_only_the_earliest_exact_chord_sequence(self):
        entries = [
            {
                "id": "song-m002",
                "startMeasure": 2,
                "endMeasure": 5,
                "chords": [
                    {"rootPc": 0, "quality": "maj"},
                    {"rootPc": 9, "quality": "min"},
                ],
            },
            {
                "id": "song-m018",
                "startMeasure": 18,
                "endMeasure": 21,
                "chords": [
                    {"rootPc": 0, "quality": "maj"},
                    {"rootPc": 9, "quality": "min"},
                ],
            },
            {
                "id": "song-m022",
                "startMeasure": 22,
                "endMeasure": 25,
                "chords": [
                    {"rootPc": 0, "quality": "maj"},
                    {"rootPc": 7, "quality": "maj"},
                ],
            },
        ]

        unique, reasons = deduplicate_entries(entries)

        self.assertEqual([entry["id"] for entry in unique], ["song-m002", "song-m022"])
        self.assertEqual(
            reasons["song-m018"],
            "duplicates the chord sequence from measures 2–5",
        )


if __name__ == "__main__":
    unittest.main()
