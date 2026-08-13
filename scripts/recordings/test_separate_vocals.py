import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from separate_vocals import separate_vocals


class SeparateVocalsTests(unittest.TestCase):
    def test_reuses_a_cached_instrumental(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "audio.wav"
            destination = root / "audio-instrumental.wav"
            source.write_bytes(b"source")
            destination.write_bytes(b"cached")

            with patch("separate_vocals.subprocess.run") as run:
                separate_vocals(source, destination)

            run.assert_not_called()
            self.assertEqual(destination.read_bytes(), b"cached")

    def test_runs_two_stem_demucs_and_moves_the_instrumental_to_cache(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "audio.wav"
            destination = root / "audio-instrumental.wav"
            source.write_bytes(b"source")

            def fake_run(command, check):
                self.assertTrue(check)
                self.assertEqual(Path(command[1]).name, "run_demucs.py")
                self.assertIn("--two-stems", command)
                self.assertEqual(command[command.index("--two-stems") + 1], "vocals")
                self.assertEqual(command[command.index("--device") + 1], "mps")
                output_root = Path(command[command.index("--out") + 1])
                stem = output_root / "htdemucs" / "audio" / "no_vocals.wav"
                stem.parent.mkdir(parents=True)
                stem.write_bytes(b"instrumental")

            with (
                patch("separate_vocals.importlib.util.find_spec", return_value=object()),
                patch("separate_vocals.subprocess.run", side_effect=fake_run),
            ):
                separate_vocals(source, destination, "mps")

            self.assertEqual(destination.read_bytes(), b"instrumental")


if __name__ == "__main__":
    unittest.main()
