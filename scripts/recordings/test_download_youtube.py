import argparse
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from download_youtube import (
    YOUTUBE_ACCESS_BLOCKED_EXIT_CODE,
    build_process_command,
    derive_song_metadata,
    download_audio,
    validate_youtube_url,
)


class DownloadYoutubeTests(unittest.TestCase):
    def test_bot_challenge_has_distinct_exit_code_without_trying_other_formats(self):
        from yt_dlp.utils import DownloadError

        with tempfile.TemporaryDirectory() as temporary, patch("yt_dlp.YoutubeDL") as downloader:
            downloader.return_value.__enter__.return_value.extract_info.side_effect = DownloadError(
                "Sign in to confirm you're not a bot"
            )
            with self.assertRaises(SystemExit) as exit_result:
                download_audio("https://www.youtube.com/watch?v=blocked", Path(temporary))
        self.assertEqual(exit_result.exception.code, YOUTUBE_ACCESS_BLOCKED_EXIT_CODE)
        self.assertEqual(downloader.call_count, 1)

    def test_accepts_video_url_with_radio_playlist_parameters(self):
        url = "https://www.youtube.com/watch?v=abc&list=RDabc&start_radio=1"
        self.assertEqual(validate_youtube_url(url), url)

    def test_rejects_non_youtube_url(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            validate_youtube_url("https://example.com/watch?v=abc")

    def test_prefers_track_and_artist_metadata(self):
        info = {
            "title": "Artist - Track (Official Video)",
            "track": "Track",
            "artist": "Artist",
            "uploader": "ArtistVEVO",
        }
        self.assertEqual(derive_song_metadata(info, None, None), ("Artist", "Track"))

    def test_infers_artist_and_cleans_common_youtube_title_suffixes(self):
        info = {
            "title": "YOASOBI - Racing Into The Night Lyrics (JPN_ROM_ENG)",
            "uploader": "rin rin",
        }
        self.assertEqual(
            derive_song_metadata(info, None, None),
            ("YOASOBI", "Racing Into The Night"),
        )

        info = {"title": "Justin Bieber - DAISIES (Audio)", "uploader": "Justin Bieber"}
        self.assertEqual(
            derive_song_metadata(info, None, None),
            ("Justin Bieber", "DAISIES"),
        )

    def test_explicit_metadata_overrides_download_metadata(self):
        info = {"title": "Uploaded title", "uploader": "Uploader"}
        self.assertEqual(
            derive_song_metadata(info, "Chosen Artist", "Chosen Title"),
            ("Chosen Artist", "Chosen Title"),
        )

    def test_process_command_passes_paths_and_pipeline_options_without_a_shell(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            args = argparse.Namespace(
                work_root=root / "work",
                output=root / "output",
                device="mps",
                timing_checkpoint="final0",
                key="F",
                mode="major",
                reuse_analysis=True,
                metadata=root / "song.json",
                chord_audio="mix",
            )
            command = build_process_command(
                args, root / "source.webm", "An Artist", "A Title"
            )

        self.assertIn("An Artist", command)
        self.assertIn("A Title", command)
        self.assertIn("--reuse-analysis", command)
        self.assertEqual(command[command.index("--device") + 1], "mps")
        self.assertEqual(command[command.index("--key") + 1], "F")
        self.assertEqual(command[command.index("--chord-audio") + 1], "mix")

    def test_process_command_forwards_instrumental_chord_audio(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            args = argparse.Namespace(
                work_root=root / "work",
                output=root / "output",
                device="cpu",
                timing_checkpoint="final0",
                key=None,
                mode=None,
                reuse_analysis=False,
                metadata=None,
                chord_audio="instrumental",
            )
            command = build_process_command(
                args, root / "source.webm", "An Artist", "A Title"
            )

        self.assertEqual(command[command.index("--chord-audio") + 1], "instrumental")


if __name__ == "__main__":
    unittest.main()
