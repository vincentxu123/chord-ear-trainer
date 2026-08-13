import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backfill_instrumentals import backfill, instrumental_filename


class BackfillInstrumentalsTests(unittest.TestCase):
    def test_names_instrumental_after_the_stable_excerpt_id(self):
        self.assertEqual(
            instrumental_filename({"id": "song-m009", "file": "legacy-name.mp3"}),
            "song-m009-instrumental.mp3",
        )

    def test_adds_only_missing_instrumentals_and_rebuilds_metadata(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "song-clips"
            cache = root / "cache"
            output.mkdir()
            entries = [
                {
                    "id": "song-m001",
                    "file": "song-m001.mp3",
                    "durationSec": 10,
                },
                {
                    "id": "song-m005",
                    "file": "song-m005.mp3",
                    "instrumentalFile": "song-m005-instrumental.mp3",
                    "durationSec": 10,
                },
            ]
            (output / "manifest.json").write_text(
                json.dumps({"version": "old", "totalBytes": 0, "clips": entries}),
                encoding="utf-8",
            )
            (output / "song-m001.mp3").write_bytes(b"original-one")
            (output / "song-m005.mp3").write_bytes(b"original-two")
            (output / "song-m005-instrumental.mp3").write_bytes(b"existing")

            def fake_separate(source, destination, device):
                self.assertEqual(source.name, "song-m001.mp3")
                self.assertEqual(device, "mps")
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(b"wav")

            def fake_export(source, destination, start, duration):
                self.assertEqual(source.name, "song-m001.wav")
                self.assertEqual((start, duration), (0.0, 10.0))
                destination.write_bytes(b"new-instrumental")

            with (
                patch("backfill_instrumentals.separate_vocals", side_effect=fake_separate),
                patch("backfill_instrumentals.export_audio", side_effect=fake_export),
            ):
                added, total = backfill(output, cache, "mps")

            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual((added, total), (1, 2))
            self.assertEqual(
                manifest["clips"][0]["instrumentalFile"],
                "song-m001-instrumental.mp3",
            )
            self.assertNotEqual(manifest["version"], "old")
            self.assertEqual(
                manifest["totalBytes"],
                len(b"original-onenew-instrumentaloriginal-twoexisting"),
            )


if __name__ == "__main__":
    unittest.main()
