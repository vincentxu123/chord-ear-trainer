import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import soundfile
import torch

from run_demucs import save_wav


class RunDemucsTests(unittest.TestCase):
    def test_writes_channel_last_pcm_wav_without_torchcodec(self):
        with TemporaryDirectory() as directory:
            destination = Path(directory) / "stem.wav"
            audio = torch.tensor([[0.25, -0.25], [0.5, -0.5]])

            save_wav(audio, destination, 44_100, bits_per_sample=24)

            written, sample_rate = soundfile.read(destination, always_2d=True)
            self.assertEqual(sample_rate, 44_100)
            self.assertEqual(written.shape, (2, 2))
            self.assertAlmostEqual(written[0, 0], 0.25, places=5)
            self.assertAlmostEqual(written[0, 1], 0.5, places=5)


if __name__ == "__main__":
    unittest.main()
