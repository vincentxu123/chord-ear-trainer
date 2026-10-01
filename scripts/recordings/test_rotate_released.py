import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch

from download_youtube import YOUTUBE_ACCESS_BLOCKED_EXIT_CODE
from rotate_released import due_today, enough_sources_processed, main, publish, should_process_song
from verify_rotation_pack import verify_pack


class RotationTests(unittest.TestCase):
    def test_alternating_sundays(self):
        self.assertTrue(due_today(date(2026, 10, 4)))
        self.assertFalse(due_today(date(2026, 10, 11)))
        self.assertTrue(due_today(date(2026, 10, 18)))

    def test_partial_source_failure_does_not_replace_rotation(self):
        report = {"songs": {str(index): {"status": "completed" if index < 59 else "failed"} for index in range(75)}}
        self.assertFalse(enough_sources_processed(report, 75))
        report["songs"]["59"]["status"] = "completed"
        self.assertTrue(enough_sources_processed(report, 75))

    def test_resume_skips_failed_and_completed_sources(self):
        report = {"songs": {"one": {"status": "failed"}, "two": {"status": "completed"}}}
        self.assertFalse(should_process_song(report, "one"))
        self.assertFalse(should_process_song(report, "two"))
        self.assertTrue(should_process_song(report, "three"))

    def test_publish_replaces_only_rotation_audio_after_staging_is_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging = root / "staging"
            output = root / "output"
            staging.mkdir()
            output.mkdir()
            (output / "old.mp3").write_bytes(b"old")
            (output / "manifest.json").write_text('{"clips": []}', encoding="utf-8")
            (staging / "new.mp3").write_bytes(b"original")
            (staging / "new-instrumental.mp3").write_bytes(b"instrumental")
            (staging / "manifest.json").write_text(json.dumps({"clips": [{
                "id": "new", "file": "new.mp3", "instrumentalFile": "new-instrumental.mp3",
                "measureChordCounts": [1, 1, 1, 1], "chords": [{"rootPc": 0, "quality": "maj"}],
                "cueTimesSec": [0], "durationSec": 1,
            }]}), encoding="utf-8")

            count = publish(staging, output, 75, "2026-10-04T09:00:00+00:00", verify_audio=False)
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(count, 1)
            self.assertEqual(manifest["sourceCount"], 75)
            self.assertTrue((output / manifest["clips"][0]["file"]).is_file())
            self.assertTrue((output / manifest["clips"][0]["instrumentalFile"]).is_file())
            self.assertFalse((output / "old.mp3").exists())
            self.assertEqual(verify_pack(output), (1, len(b"original") + len(b"instrumental")))
            (output / manifest["clips"][0]["file"]).write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "version or totalBytes"):
                verify_pack(output)

    def test_empty_staging_keeps_current_rotation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staging = root / "staging"
            output = root / "output"
            staging.mkdir()
            output.mkdir()
            (output / "old.mp3").write_bytes(b"old")
            self.assertEqual(publish(staging, output, 75, "2026-10-04T09:00:00+00:00"), 0)
            self.assertTrue((output / "old.mp3").exists())

    def test_youtube_access_block_stops_batch_without_retrying(self):
        videos = [
            {"id": "first", "title": "First", "url": "https://www.youtube.com/watch?v=first"},
            {"id": "second", "title": "Second", "url": "https://www.youtube.com/watch?v=second"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "output"
            output.mkdir()
            (output / "manifest.json").write_text('{"clips": []}', encoding="utf-8")
            argv = ["rotate_released.py", "--max-songs", "2", "--work-root", str(root / "work"), "--output", str(output)]
            with patch("rotate_released.playlist_videos", return_value=videos), \
                 patch("rotate_released.subprocess.run", return_value=Mock(returncode=YOUTUBE_ACCESS_BLOCKED_EXIT_CODE)) as run, \
                 patch("sys.argv", argv):
                self.assertEqual(main(), 1)
                self.assertEqual(main(), 1)
            self.assertEqual(run.call_count, 1)
            report = json.loads(next((root / "work").glob("run-report-*.json")).read_text(encoding="utf-8"))
            self.assertEqual(list(report["songs"]), ["first"])
            self.assertEqual(report["publishedExcerpts"], 0)
            self.assertEqual((output / "manifest.json").read_text(encoding="utf-8"), '{"clips": []}')


if __name__ == "__main__":
    unittest.main()
