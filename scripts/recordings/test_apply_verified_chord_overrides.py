import unittest

from apply_verified_chord_overrides import apply_overrides


class ApplyVerifiedChordOverridesTests(unittest.TestCase):
    def setUp(self):
        self.manifest = {
            "version": "audio-version",
            "totalBytes": 123,
            "clips": [
                {
                    "id": "example-m041",
                    "artist": "Example Artist",
                    "title": "Example Song",
                    "startMeasure": 41,
                    "endMeasure": 44,
                    "key": "A",
                    "measureChordCounts": [2, 2, 1, 2],
                    "chords": [
                        {"rootPc": 2, "quality": "min"},
                        {"rootPc": 5, "quality": "maj"},
                        {"rootPc": 0, "quality": "maj"},
                        {"rootPc": 7, "quality": "maj"},
                        {"rootPc": 7, "quality": "maj"},
                        {"rootPc": 0, "quality": "maj"},
                        {"rootPc": 3, "quality": "maj"},
                    ],
                    "cueTimesSec": [0, 1, 2, 3, 4, 5, 6],
                    "file": "example-m041.mp3",
                }
            ],
        }

    def test_updates_only_the_requested_chord_positions(self):
        sidecar = {
            "artist": "Example Artist",
            "title": "Example Song",
            "chordOverrides": [
                {"measure": 43, "chordPosition": 1, "label": "B:min"},
                {"measure": 44, "chordPosition": 2, "label": "A:min"},
            ],
        }

        updated, changed = apply_overrides(self.manifest, [sidecar])

        self.assertEqual(changed, 2)
        self.assertEqual(updated["clips"][0]["chords"][4], {"rootPc": 2, "quality": "min"})
        self.assertEqual(updated["clips"][0]["chords"][6], {"rootPc": 0, "quality": "min"})
        self.assertEqual(updated["clips"][0]["cueTimesSec"], self.manifest["clips"][0]["cueTimesSec"])
        self.assertEqual(updated["version"], self.manifest["version"])
        self.assertEqual(self.manifest["clips"][0]["chords"][4], {"rootPc": 7, "quality": "maj"})

    def test_rejects_an_override_outside_the_measures_chord_count(self):
        sidecar = {
            "artist": "Example Artist",
            "title": "Example Song",
            "chordOverrides": [
                {"measure": 43, "chordPosition": 2, "label": "B:min"}
            ],
        }

        with self.assertRaisesRegex(ValueError, "outside measure"):
            apply_overrides(self.manifest, [sidecar])


if __name__ == "__main__":
    unittest.main()
