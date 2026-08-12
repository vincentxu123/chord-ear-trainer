import unittest

from export_candidates import (
    candidate_exclusion_reasons,
    candidate_is_included,
    chord_to_relative,
    derive_song_metadata,
)


class ExportCandidateTests(unittest.TestCase):
    def setUp(self):
        self.analysis = {
            "source": {"title": "擱淺 / Ge Qian", "artist": "Jay Chou"},
            "tonality": {"key": "F", "mode": "major", "method": "automatic"},
            "chordModels": ["lv-chordia", "btc"],
        }
        self.candidate = {
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


if __name__ == "__main__":
    unittest.main()
